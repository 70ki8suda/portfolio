import {expect,it,vi} from 'vitest';
import {MusicService,type Repository,type MusicState,initialState} from './store.server';
import {ProviderFailure,type Credentials} from './provider.server';
import {randomToken} from './security.server';
class MemoryRepo implements Repository {
 state=initialState();alarm:number|null=null;
 async mutate<T>(fn:(s:MusicState)=>T):Promise<T>{const s=structuredClone(this.state);const result=fn(s);this.state=s;this.alarm=[s.pending?.expires,s.enabled?s.due:undefined].filter((v):v is number=>v!==undefined).sort((a,b)=>a-b)[0]??null;return result;}
 async read(){return structuredClone(this.state);}
}
const deferred=<T>()=>{let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
const credential:Credentials={access:'test-access',refresh:'test-refresh',expires:9999999};
function fixture(){let clock=1000,history=0,refresh=0;const repo=new MemoryRepo();const provider={exchange:async()=>credential,refresh:async()=>{refresh++;return credential;},recent:async()=>{history++;return {version:1 as const,status:'empty' as const};}};const key=randomToken();const service=()=>new MusicService(repo,provider,key,()=>clock);return {repo,provider,service,advance:(n:number)=>clock+=n,counts:()=>({history,refresh})};}
async function connect(f:ReturnType<typeof fixture>){const p=await f.service().begin('owner','browser');expect(await f.service().complete('owner','browser',p.state,'code','uri')).toBe(true);}
it('persists a future alarm before external I/O; duplicate and restarted handlers cannot double-fetch',async()=>{
 const f=fixture();await connect(f);const pending=deferred<{version:1;status:'empty'}>();f.provider.recent=()=>pending.promise;
 const job=f.service().sync();await new Promise(r=>setTimeout(r,5));expect(f.repo.alarm).toBe(3601000);expect(f.repo.state.reservation).toBeTruthy();
 await f.service().sync();expect(f.repo.alarm).toBe(3601000);pending.resolve({version:1,status:'empty'});await job;expect((await f.service().public()).status).toBe('empty');
});
it('disconnect during network prevents resurrection and removes all active private state and alarm',async()=>{
 const f=fixture();await connect(f);const p=deferred<{version:1;status:'empty'}>();f.provider.recent=()=>p.promise;const job=f.service().sync();await new Promise(r=>setTimeout(r,5));
 await f.service().disconnect();p.resolve({version:1,status:'empty'});await job;expect(await f.service().public()).toEqual({version:1,status:'disconnected'});expect(f.repo.alarm).toBeNull();expect(f.repo.state.credentials).toBeUndefined();expect(f.repo.state.pending).toBeUndefined();
});
it('new authorization attempt fences consumed callbacks, and new credentials fence old sync',async()=>{
 const f=fixture();const a=await f.service().begin('owner','A');const first=deferred<Credentials>();f.provider.exchange=()=>first.promise;
 const old=f.service().complete('owner','A',a.state,'code','uri');await new Promise(r=>setTimeout(r,5));const b=await f.service().begin('owner','B');f.provider.exchange=async()=>credential;
 expect(await f.service().complete('owner','B',b.state,'code','uri')).toBe(true);first.resolve(credential);expect(await old).toBe(false);
 const pending=deferred<{version:1;status:'empty'}>();f.provider.recent=()=>pending.promise;const sync=f.service().sync();await new Promise(r=>setTimeout(r,5));await connect(f);pending.resolve({version:1,status:'empty'});await sync;expect((await f.service().public()).status).toBe('syncing');
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
