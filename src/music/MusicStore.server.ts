// Structural storage contract keeps this adapter independent of generated global types.
interface StorageTransaction {get<T>(key:string):Promise<T|undefined>;put(key:string,value:unknown):Promise<void>;setAlarm(time:number):Promise<void>;deleteAlarm():Promise<void>}
interface DurableObjectState {storage:StorageTransaction&{transaction<T>(fn:(txn:StorageTransaction)=>Promise<T>):Promise<T>}}
import {initialState,MusicService,type MusicState,type Repository} from './store.server';
import {MusicProvider} from './provider.server';
import {readPeriod} from './model';
import type {MusicEnv} from './http.server';
/** No public namespace URL: only the Worker binding can invoke this object. */
export class MusicStore {
 private service:MusicService;
 constructor(ctx:DurableObjectState,env:MusicEnv){
  const repository:Repository={
   read:async()=>await ctx.storage.get<MusicState>('state')??initialState(),
   mutate:async fn=>ctx.storage.transaction(async txn=>{
    const state=await txn.get<MusicState>('state')??initialState();const result=fn(state);
    await txn.put('state',state);
    const wake=[state.pending?.expires,state.enabled?state.due:undefined].filter((v):v is number=>v!==undefined).sort((a,b)=>a-b)[0];
    if(wake===undefined)await txn.deleteAlarm();else await txn.setAlarm(wake);
    return result;
   }),
  };
  this.service=new MusicService(repository,new MusicProvider(env.SPOTIFY_CLIENT_ID??''),env.MUSIC_TOKEN_KEY??'');
 }
 async fetch(request:Request){
  const path=new URL(request.url).pathname;
  if(path==='/public'&&request.method==='GET')return Response.json(await this.service.public(readPeriod(new URL(request.url).searchParams.get('period'))));
  if(request.method!=='POST')return new Response(null,{status:405});
  const input=await request.json() as Record<string,string>;
  if(path==='/begin')return Response.json(await this.service.begin(input.owner,input.browser));
  if(path==='/complete')return Response.json({ok:await this.service.complete(input.owner,input.browser,input.state,input.code,input.uri)});
  if(path==='/disconnect'){await this.service.disconnect();return Response.json({ok:true});}
  return new Response(null,{status:404});
 }
 async alarm(){await this.service.sync();}
}
