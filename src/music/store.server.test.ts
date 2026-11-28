import {expect,it,vi} from 'vitest';
import {MusicService,type Repository,type MusicState,initialState} from './store.server';
import {ProviderFailure,type Credentials,type PlayPage} from './provider.server';
const emptyPage:PlayPage={plays:[],items:0,full:false};
import {randomToken} from './security.server';
class MemoryRepo implements Repository {
 state=initialState();alarm:number|null=null;
 async mutate<T>(fn:(s:MusicState)=>T):Promise<T>{const s=structuredClone(this.state);const result=fn(s);this.state=s;this.alarm=[s.pending?.expires,s.enabled?s.due:undefined].filter((v):v is number=>v!==undefined).sort((a,b)=>a-b)[0]??null;return result;}
 async read(){return structuredClone(this.state);}
}
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
const credential:Credentials={access:'test-access',refresh:'test-refresh',expires:9999999};
function fixture(){let clock=1000,history=0,refresh=0;const repo=new MemoryRepo();const provider={exchange:async()=>credential,refresh:async()=>{refresh++;return credential;},recent:async()=>{history++;return emptyPage;}};const key=randomToken();const service=()=>new MusicService(repo,provider,key,()=>clock);return {repo,provider,service,advance:(n:number)=>clock+=n,counts:()=>({history,refresh})};}
async function connect(f:ReturnType<typeof fixture>){const p=await f.service().begin('owner','browser');expect(await f.service().complete('owner','browser',p.state,'code','uri')).toBe(true);}
it('persists a future alarm before external I/O; duplicate and restarted handlers cannot double-fetch',async()=>{
 const f=fixture();await connect(f);const pending=deferred<PlayPage>();f.provider.recent=()=>pending.promise;
 const job=f.service().sync();await new Promise(r=>setTimeout(r,5));expect(f.repo.alarm).toBe(3601000);expect(f.repo.state.reservation).toBeTruthy();
 await f.service().sync();expect(f.repo.alarm).toBe(3601000);pending.resolve(emptyPage);await job;expect((await f.service().public()).status).toBe('empty');
});
it('disconnect during network prevents resurrection and removes all active private state and alarm',async()=>{
 const f=fixture();await connect(f);const p=deferred<PlayPage>();f.provider.recent=()=>p.promise;const job=f.service().sync();await new Promise(r=>setTimeout(r,5));
 await f.service().disconnect();p.resolve(emptyPage);await job;expect(await f.service().public()).toEqual({version:1,status:'disconnected'});expect(f.repo.alarm).toBeNull();expect(f.repo.state.credentials).toBeUndefined();expect(f.repo.state.pending).toBeUndefined();
});
it('new authorization attempt fences consumed callbacks, and new credentials fence old sync',async()=>{
 const f=fixture();const a=await f.service().begin('owner','A');const first=deferred<Credentials>();f.provider.exchange=()=>first.promise;
 const old=f.service().complete('owner','A',a.state,'code','uri');await new Promise(r=>setTimeout(r,5));const b=await f.service().begin('owner','B');f.provider.exchange=async()=>credential;
 expect(await f.service().complete('owner','B',b.state,'code','uri')).toBe(true);first.resolve(credential);expect(await old).toBe(false);
 const pending=deferred<PlayPage>();f.provider.recent=()=>pending.promise;const sync=f.service().sync();await new Promise(r=>setTimeout(r,5));await connect(f);pending.resolve(emptyPage);await sync;expect((await f.service().public()).status).toBe('syncing');
});
it('rejects wrong owner/browser/state, consumes one callback, and cleans abandoned pending auth',async()=>{
 const f=fixture(),s=f.service(),p=await s.begin('owner','B');expect(await s.complete('other','B',p.state,'code','uri')).toBe(false);expect(await s.complete('owner','wrong',p.state,'code','uri')).toBe(false);expect(await s.complete('owner','B','wrong','code','uri')).toBe(false);
 expect(await s.complete('owner','B',p.state,'code','uri')).toBe(true);expect(await s.complete('owner','B',p.state,'code','uri')).toBe(false);
 await s.disconnect();await s.begin('owner','B');f.advance(600001);await s.sync();expect(f.repo.state.pending).toBeUndefined();expect(f.repo.alarm).toBeNull();expect(f.counts().history).toBe(0);
});
it('rate limit is persistent across restarts and reauthorization; invalid grant clears and stops',async()=>{
 const f=fixture();await connect(f);f.provider.recent=async()=>{throw new ProviderFailure('rate_limited',false,7201000);};await f.service().sync();expect(f.repo.alarm).toBe(7201000);await connect(f);expect(f.repo.alarm).toBe(7201000);
 f.advance(7200000);f.provider.recent=async()=>{throw new ProviderFailure('access_expired');};await f.service().sync();f.advance(3600000);f.provider.refresh=async()=>{throw new ProviderFailure('reauthorize',true);};await f.service().sync();expect((await f.service().public()).status).toBe('reauthorize');expect(f.repo.alarm).toBeNull();expect(f.repo.state.credentials).toBeUndefined();
});
it('corrupt encryption or expired display cannot masquerade as valid empty',async()=>{
 const f=fixture();await connect(f);await f.service().sync();f.advance(86400001);expect((await f.service().public()).status).toBe('unavailable');
 const bad=new MusicService(f.repo,f.provider,randomToken(),()=>100000000);await bad.sync();expect((await bad.public()).status).toBe('reauthorize');expect(f.repo.state.credentials).toBeUndefined();
});

it('disconnect and newer begin invalidate crypto work started earlier',async()=>{
 const f=fixture(),s=f.service(),real=crypto.subtle.encrypt.bind(crypto.subtle);const delayed=deferred<void>();let entered=false;
 const spy=vi.spyOn(crypto.subtle,'encrypt').mockImplementation(async(...args)=>{entered=true;await delayed.promise;return real(...args);});
 const old=s.begin('owner','old').then(v=>v,()=>undefined);
 await vi.waitFor(()=>expect(entered).toBe(true));await s.disconnect();delayed.resolve();await old;spy.mockRestore();
 expect(f.repo.state.pending).toBeUndefined();expect(f.repo.alarm).toBeNull();
 const gate=deferred<void>();let calls=0;const again=vi.spyOn(crypto.subtle,'encrypt').mockImplementation(async(...args)=>{if(++calls===1)await gate.promise;return real(...args);});
 const a=s.begin('owner','A').then(v=>v,()=>undefined);await vi.waitFor(()=>expect(calls).toBe(1));const b=await s.begin('owner','B');gate.resolve();await a;again.mockRestore();
 expect(await s.complete('owner','B',b.state,'code','uri')).toBe(true);
});

// Accumulation
const sid=(n:number)=>String(n).padStart(22,'0');
const node=(kind:'track'|'album'|'artist',n:number)=>({id:kind+':'+sid(n),kind,name:'合成'+kind+n,url:`https://open.spotify.com/${kind}/${sid(n)}`,...(kind==='track'?{artists:['合成演奏者'],explicit:false}:{})});
const play=(n:number,at:number)=>({at,track:node('track',n),album:node('album',1000+n),artists:[node('artist',2000+n)],performers:[node('artist',2000+n)]});
type Page=Omit<PlayPage,'items'>&{items?:number};
const DAY=86400000,T0=200*DAY;
function accumulating(){const f=fixture();f.advance(T0);const requests:(number|undefined)[]=[];let pages:PlayPage[]=[];f.provider.recent=(async(_a:string,before?:number)=>{requests.push(before);return pages.shift()??emptyPage;}) as never;return {...f,requests,serve:(p:Page[])=>{pages=p.map(x=>({items:x.plays.length,...x}));}};}
const tracks=async(f:ReturnType<typeof accumulating>)=>{const v=await f.service().public('track');return v.status==='ready'?v.graph.nodes.filter(n=>n.kind==='track').length:v.status;};
it('accumulates across hourly syncs instead of replacing the view, with one request when nothing older is needed',async()=>{
 const f=accumulating();await connect(f);const now=()=>T0+1000;
 f.serve([{plays:[play(1,now()-5000),play(2,now()-6000)],full:false}]);await f.service().sync();expect(await tracks(f)).toBe(2);expect(f.requests).toEqual([undefined]);
 f.advance(3600000);f.serve([{plays:[play(3,T0+3000000),play(1,T0+2000000)],full:false}]);await f.service().sync();expect(await tracks(f)).toBe(3);expect(f.requests).toEqual([undefined,undefined]);
 expect(f.repo.state.cursor).toBe(T0+3000000);expect(JSON.stringify([await f.service().public('track'),await f.service().public('album'),await f.service().public()])).not.toMatch(/seen|cursor|"at"/);
});
it('pages back only while a full page may hide unseen plays, and never beyond the bounded page count',async()=>{
 const f=accumulating();await connect(f);f.serve([{plays:[play(1,T0)],full:false}]);await f.service().sync();f.requests.length=0;
 const full=(from:number,before:number,newest=T0+3000000):Page=>({plays:Array.from({length:50},(_,i)=>play(from+i,newest-i*1000)),full:true,before});
 f.advance(3600000);f.serve([full(100,T0+2900000),{plays:[play(900,T0+10)],full:false,before:T0+5}]);await f.service().sync();
 expect(f.requests).toEqual([undefined,T0+2900000]);expect(await tracks(f)).toBe(36);expect(Object.keys(f.repo.state.library!.tracks)).toHaveLength(52);
 f.requests.length=0;f.advance(3600000);f.serve([full(200,T0+9e6,T0+9.5e6),full(300,T0+8e6,T0+8.5e6),full(400,T0+7e6,T0+7.5e6),full(500,T0+6.5e6,T0+6.9e6),full(600,T0+6.4e6,T0+6.45e6)]);await f.service().sync();expect(f.requests).toHaveLength(4);
 // A cursor that does not move backwards must not loop.
 f.requests.length=0;f.advance(3600000);f.serve([full(700,T0+2e7,T0+2.1e7),full(750,T0+2e7,T0+1.9e7),full(800,T0+1e7,T0+1.8e7)]);await f.service().sync();expect(f.requests).toHaveLength(2);
});
it('once per connection the bounded paging reads back as far as Spotify returns, then never again',async()=>{
 const page=(from:number,before?:number,size=50):Page=>({plays:Array.from({length:size},(_,i)=>play(from+i,T0-from*1000-i*1000)),full:size===50,before});
 const f=accumulating();await connect(f);f.serve([page(1,T0-60000),page(51,T0-120000),page(101,T0-180000),page(151,T0-240000),page(201,T0-300000)]);
 await f.service().sync();expect(f.requests).toEqual([undefined,T0-60000,T0-120000,T0-180000]);expect(Object.keys(f.repo.state.library!.tracks)).toHaveLength(200);
 expect(f.repo.state.stats).toEqual({requests:4,items:[50,50,50,50],plays:200,distinct:200,fresh:200,library:200,day:200,week:200,deep:true,olderCursor:true});expect(JSON.stringify(f.repo.state.stats)).not.toMatch(/合成|track:|T0/);
 // Later syncs go back only for a full page of unseen plays.
 f.requests.length=0;f.advance(3600000);f.serve([page(1,T0-60000),page(51,T0-120000)]);await f.service().sync();expect(f.requests).toEqual([undefined]);expect(f.repo.state.stats).toMatchObject({requests:1,fresh:0,deep:false,library:200});
 // Spotify ending the history early ends the paging: no request without a cursor, none after a short page.
 const g=accumulating();await connect(g);g.serve([page(1,T0-60000),page(51,undefined,7),page(101)]);await g.service().sync();expect(g.requests).toEqual([undefined,T0-60000]);expect(g.repo.state.stats).toMatchObject({items:[50,7],olderCursor:false});
 // A short page that still carries an older cursor is followed once per connection, until an empty page; an upgrade from the earlier flag repeats it once.
 const m=accumulating();await connect(m);m.serve([page(1,T0-60000,10),page(51,T0-120000,4),{plays:[],full:false,items:0,before:T0-130000},page(101)]);await m.service().sync();
 expect(m.requests).toEqual([undefined,T0-60000,T0-120000]);expect(m.repo.state.stats).toMatchObject({requests:3,items:[10,4,0],deep:true});
 m.requests.length=0;m.advance(3600000);m.serve([page(1,T0-60000,10),page(51)]);await m.service().sync();expect(m.requests).toEqual([undefined]);
 m.repo.state.backfilled=true;m.requests.length=0;m.advance(3600000);m.serve([page(1,T0-60000,10),page(51,undefined,3)]);await m.service().sync();expect(m.requests).toEqual([undefined,T0-60000]);
 const h=accumulating();await connect(h);h.serve([page(1,undefined)]);await h.service().sync();expect(h.requests).toEqual([undefined]);
 // A failed first attempt does not use up the one deep read; reconnecting earns a new one.
 const k=accumulating();await connect(k);k.provider.recent=async()=>{throw new ProviderFailure('rate_limited',false,T0+7200000);};await k.service().sync();expect(k.repo.state.backfilled).toBeUndefined();expect(k.repo.state.stats).toBeUndefined();
 await f.service().disconnect();expect(f.repo.state.backfilled).toBeUndefined();expect(f.repo.state.stats).toBeUndefined();
});
it('counts how many returned plays are within a day and a week',async()=>{
 const f=accumulating();await connect(f);f.serve([{plays:[play(1,T0-3600000),play(2,T0-2*86400000),play(3,T0-9*86400000)],full:false}]);await f.service().sync();
 expect(f.repo.state.stats).toMatchObject({plays:3,day:1,week:2});
});
it('reports sync counts to the log hook without any titles, IDs or times',async()=>{
 const f=accumulating();await connect(f);const seen:unknown[]=[];f.serve([{plays:[play(1,T0),play(1,T0-5),play(2,T0-9)],full:false,items:5}]);
 await new MusicService(f.repo,f.provider as never,(f.service() as unknown as {key:string}).key,()=>T0+1000,s=>seen.push(s)).sync();
 expect(seen).toEqual([{requests:1,items:[5],plays:3,distinct:2,fresh:3,library:2,day:3,week:3,deep:true,olderCursor:false}]);expect(await f.service().stats()).toEqual(seen[0]);
});
it('a transient failure hides the accumulation without losing it; a later success shows it again',async()=>{
 const f=accumulating();await connect(f);f.serve([{plays:[play(1,T0)],full:false}]);await f.service().sync();expect(await tracks(f)).toBe(1);
 f.advance(3600000);f.provider.recent=async()=>{throw new ProviderFailure('unavailable');};await f.service().sync();expect(await f.service().public()).toEqual({version:1,status:'unavailable'});expect(Object.keys(f.repo.state.library!.tracks)).toHaveLength(1);
 f.advance(3600000);f.provider.recent=async()=>emptyPage;await f.service().sync();expect(await tracks(f)).toBe(1);
});
it('disconnect, reconnect and terminal failures delete the accumulation and its cursor',async()=>{
 const f=accumulating();await connect(f);f.serve([{plays:[play(1,T0)],full:false}]);await f.service().sync();
 await f.service().disconnect();expect(f.repo.state.library).toBeUndefined();expect(f.repo.state.cursor).toBeUndefined();expect(JSON.stringify(f.repo.state)).not.toContain(sid(1));
 await connect(f);f.advance(3600000);f.serve([{plays:[play(2,T0)],full:false}]);await f.service().sync();expect(await tracks(f)).toBe(1);await connect(f);expect(f.repo.state.library).toBeUndefined();
 f.advance(3600000);f.serve([{plays:[play(3,T0)],full:false}]);await f.service().sync();expect(await tracks(f)).toBe(1);
 f.advance(3600000);f.provider.recent=async()=>{throw new ProviderFailure('unavailable',true);};await f.service().sync();expect(f.repo.state.library).toBeUndefined();expect(f.repo.state.enabled).toBe(false);
});
it('expires by last play: entries past retention are deleted at the next sync',async()=>{
 const f=accumulating();await connect(f);f.serve([{plays:[play(1,T0-10*DAY),play(2,T0-100*DAY),play(3,T0-170*DAY)],full:false}]);await f.service().sync();
 expect(await tracks(f)).toBe(3);
 f.advance(15*DAY);f.serve([emptyPage]);await f.service().sync();expect(Object.keys(f.repo.state.library!.tracks)).toHaveLength(2);expect(JSON.stringify(f.repo.state.library)).not.toContain(sid(3));
 f.advance(200*DAY);f.serve([emptyPage]);await f.service().sync();expect(await f.service().public()).toEqual({version:1,status:'empty'});expect(f.repo.state.library).toEqual({tracks:{},albums:{},artists:{}});
});
it('a view not confirmed within a day is withheld, and a pre-accumulation snapshot is still readable until the first sync',async()=>{
 const f=accumulating();await connect(f);f.serve([{plays:[play(1,T0)],full:false}]);await f.service().sync();f.advance(86400001);expect((await f.service().public()).status).toBe('unavailable');
 const g=accumulating();await connect(g);await g.repo.mutate(s=>{s.status='ready';s.received=T0+1000;s.snapshot={version:1,status:'ready',graph:{nodes:[node('album',1001),node('artist',2001),node('track',1)],edges:[{source:'album:'+sid(1001),target:'artist:'+sid(2001)},{source:'track:'+sid(1),target:'album:'+sid(1001)}]}};});
 expect(await tracks(g)).toBe(1);g.serve([{plays:[play(5,T0),play(6,T0-1)],full:false}]);g.advance(3600000);await g.service().sync();expect(await tracks(g)).toBe(2);expect(g.repo.state.snapshot).toBeUndefined();
});
