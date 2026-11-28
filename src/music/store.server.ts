import {emptyLibrary,mergeLibrary,projectLibrary,pruneLibrary,readMusic,type MusicLibrary,type MusicPlay,type MusicView,type MusicResponse,type MusicStatus} from './model';
import {ProviderFailure,type Credentials,type PlayPage} from './provider.server';
import {randomToken,seal,sha256,unseal,type Sealed} from './security.server';
export interface MusicState {
 epoch:number;attempt?:string;credentialVersion:number;enabled:boolean;status:MusicStatus|'ready';due:number;cooldown:number;rateBlocked?:boolean;
 credentials?:Sealed;reservation?:string;forceRefresh?:boolean;snapshot?:MusicResponse;received?:number;
 /** Accumulated since this connection; `cursor` is the newest play (ms) already merged. Both private. */
 library?:MusicLibrary;cursor?:number;
 /** Set once this connection has read as far back as the bounded paging reaches. */
 backfilled?:boolean;
 /** Counts of the last successful sync only: no titles, IDs or times. Owner-facing diagnostics. */
 stats?:SyncStats;
 pending?:{attempt:string;stateHash:string;browserHash:string;owner:string;expires:number;verifier:Sealed};
}
export interface SyncStats {requests:number;items:number[];plays:number;distinct:number;fresh:number;library:number;deep:boolean;olderCursor:boolean}
export const initialState=():MusicState=>({epoch:0,credentialVersion:0,enabled:false,status:'disconnected',due:0,cooldown:0});
/** Adapter must atomically write state AND the min(pending expiry, enabled due) alarm. No network inside mutate. */
export interface Repository {read():Promise<MusicState>;mutate<T>(fn:(s:MusicState)=>T):Promise<T>}
interface Provider {exchange(code:string,verifier:string,uri:string):Promise<Credentials>;refresh(refresh:string):Promise<Credentials>;recent(access:string,before?:number):Promise<PlayPage>}
/** Bounded paging: at most this many recently-played requests per hourly sync. */
export const SYNC_PAGES=4;
const clear=(s:MusicState)=>{delete s.credentials;delete s.snapshot;delete s.received;delete s.library;delete s.cursor;delete s.backfilled;delete s.stats;delete s.reservation;delete s.forceRefresh;s.enabled=false;};
export class MusicService {
 constructor(private repo:Repository,private provider:Provider,private key:string,private now=Date.now,private log:(stats:SyncStats)=>void=()=>{}){}
 async begin(owner:string,browser:string){
  const state=randomToken(),verifier=randomToken(),attempt=randomToken();
  const epoch=await this.repo.mutate(s=>{s.attempt=attempt;delete s.pending;return s.epoch;});
  const pending={attempt,stateHash:await sha256(state),browserHash:await sha256(browser),owner,expires:this.now()+600000,verifier:await seal(this.key,verifier)};
  const challenge=await sha256(verifier);
  if(!await this.repo.mutate(s=>{if(s.epoch!==epoch||s.attempt!==attempt)return false;s.pending=pending;return true;}))throw Error('Authorization attempt superseded');
  return {state,challenge};
 }
 async complete(owner:string,browser:string,state:string,code:string|undefined,uri:string):Promise<boolean>{
  const hash=await sha256(state),browserHash=await sha256(browser);
  const job=await this.repo.mutate(s=>{
   const p=s.pending;if(!p||p.expires<=this.now()||p.owner!==owner||p.browserHash!==browserHash||p.stateHash!==hash||p.attempt!==s.attempt)return undefined;
   delete s.pending;return {...p,epoch:s.epoch};
  });
  if(!job||!code)return false;
  try{
   const verifier=await unseal(this.key,job.verifier);if(typeof verifier!=='string')return false;
   const credentials=await this.provider.exchange(code,verifier,uri),encrypted=await seal(this.key,credentials);
   return await this.repo.mutate(s=>{
    if(s.epoch!==job.epoch||s.attempt!==job.attempt||job.expires<=this.now())return false;
    clear(s);s.credentialVersion++;s.credentials=encrypted;s.enabled=!s.rateBlocked;s.status=s.rateBlocked?'rate_limited':'syncing';s.due=Math.max(this.now(),s.cooldown);delete s.attempt;return true;
   });
  }catch{return false;}
 }
 async disconnect(){await this.repo.mutate(s=>{s.epoch++;s.credentialVersion++;clear(s);delete s.pending;delete s.attempt;s.status='disconnected';});}
 async stats(){return (await this.repo.read()).stats;}
 async public(view:MusicView='artist'):Promise<MusicResponse>{
  const s=await this.repo.read();
  if(s.status==='ready'||s.status==='empty'){
   // A view that has not been confirmed against Spotify within a day is withheld rather than shown as current.
   if(s.received===undefined||this.now()-s.received>86400000)return {version:1,status:'unavailable'};
   if(s.library)return projectLibrary(s.library,this.now(),view);
   // Written before accumulation existed; replaced by the first sync after the upgrade.
   if(!s.snapshot)return {version:1,status:'unavailable'};
   try{return readMusic(s.snapshot);}catch{return {version:1,status:'unavailable'};}
  }
  return {version:1,status:s.status};
 }
 async sync(){
  const now=this.now();
  const job=await this.repo.mutate(s=>{
   if(s.pending&&s.pending.expires<=now){delete s.pending;delete s.attempt;}
   if(!s.enabled||!s.credentials||s.due>now)return undefined;
   s.reservation=randomToken();s.due=now+3600000;
   return {epoch:s.epoch,version:s.credentialVersion,reservation:s.reservation,credentials:s.credentials,force:s.forceRefresh,cursor:s.cursor,deep:!s.backfilled};
  });
  if(!job)return;
  const current=(s:MusicState)=>s.enabled&&s.epoch===job.epoch&&s.credentialVersion===job.version&&s.reservation===job.reservation;
  let refreshed=false;
  try{
   let credentials:Credentials;
   try{const v=await unseal(this.key,job.credentials) as Credentials;if(!v||typeof v.access!=='string'||typeof v.refresh!=='string'||!Number.isFinite(v.expires))throw Error();credentials=v;}catch{throw new ProviderFailure('reauthorize',true);}
   if(job.force||credentials.expires<=this.now()+60000){
    credentials=await this.provider.refresh(credentials.refresh);refreshed=true;
    const encrypted=await seal(this.key,credentials);
    // Persist rotated refresh credentials before the next external request.
    if(!await this.repo.mutate(s=>{if(!current(s))return false;s.credentials=encrypted;delete s.forceRefresh;return true;}))return;
   }
   // Newest page first. Once per connection the bounded paging runs to its end to take whatever history Spotify
   // still returns; afterwards older pages are read only while they may hold plays newer than what is merged.
   const plays:MusicPlay[]=[],items:number[]=[];let page=await this.provider.recent(credentials.access),oldest=Infinity;
   for(;;){
    plays.push(...page.plays);items.push(page.items);oldest=Math.min(oldest,...page.plays.map(p=>p.at));
    if(items.length>=SYNC_PAGES||!page.full||page.before===undefined)break;
    if(!job.deep&&(job.cursor===undefined||page.before<=job.cursor||oldest<=job.cursor))break;
    const before=page.before;page=await this.provider.recent(credentials.access,before);
    if(page.before!==undefined&&page.before>=before){plays.push(...page.plays);items.push(page.items);break;}
   }
   let stats:SyncStats|undefined;
   await this.repo.mutate(s=>{
    if(!current(s))return;delete s.reservation;delete s.snapshot;const now=this.now();
    s.library=mergeLibrary(s.library??emptyLibrary(),plays,now);const newest=Math.max(-Infinity,...plays.map(p=>p.at).filter(at=>at<=now+86400000));if(Number.isFinite(newest))s.cursor=Math.max(s.cursor??0,newest);
    s.status=Object.keys(s.library.tracks).length?'ready':'empty';s.received=now;s.backfilled=true;
    stats=s.stats={requests:items.length,items,plays:plays.length,distinct:new Set(plays.map(p=>p.track.id)).size,fresh:job.cursor===undefined?plays.length:plays.filter(p=>p.at>job.cursor!).length,library:Object.keys(s.library.tracks).length,deep:job.deep,olderCursor:page.before!==undefined};
   });
   if(stats)this.log(stats);
  }catch(error){
   const failure=error instanceof ProviderFailure?error:new ProviderFailure('unavailable');
   await this.repo.mutate(s=>{
    if(!current(s))return;delete s.snapshot;delete s.received;delete s.reservation;
    // The accumulation survives a transient failure but is hidden until a sync succeeds; expired entries still go.
    if(s.library)pruneLibrary(s.library,this.now());
    if(failure.kind==='access_expired'){
     if(refreshed){clear(s);s.status='reauthorize';}else{s.status='syncing';s.forceRefresh=true;}return;
    }
    s.status=failure.kind;
    if(failure.kind==='rate_limited'){
     if(failure.stop){s.rateBlocked=true;clear(s);}else{s.cooldown=Math.max(s.cooldown,failure.retryAt??this.now()+3600000);s.due=s.cooldown;}
    }else if(failure.stop)clear(s);
   });
  }
 }
}
