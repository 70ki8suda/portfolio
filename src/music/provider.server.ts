import {projectPlays} from './model';
export type PlayPage=ReturnType<typeof projectPlays>;
export interface Credentials {access:string;refresh:string;expires:number}
export class ProviderFailure extends Error {
 constructor(public kind:'reauthorize'|'unavailable'|'rate_limited'|'access_expired',public stop=false,public retryAt?:number){super('Music provider unavailable');}
}
/** Limit allocation before parsing and keep the deadline active through the last body byte. */
export async function boundedJson(fetcher:typeof fetch,url:string,init:RequestInit={},limit=524288,timeout=10000):Promise<{response:Response;data:unknown}>{
 const controller=new AbortController();let received:Response|undefined;let reader:ReadableStreamDefaultReader<Uint8Array>|undefined,timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();void reader?.cancel().catch(()=>{});reject(new ProviderFailure('unavailable'));},timeout);});
 try{return await Promise.race([deadline,(async()=>{
  const response=await fetcher(url,{...init,redirect:'manual',signal:controller.signal});received=response;
  if(Number(response.headers.get('Content-Length'))>limit)throw new ProviderFailure('unavailable');
  reader=response.body?.getReader();if(!reader)throw new ProviderFailure('unavailable');
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new ProviderFailure('unavailable');chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ProviderFailure('unavailable');}
  return {response,data};
 })()]);}catch(error){if(received&&!received.ok)return {response:received,data:undefined};throw error;}finally{if(timer)clearTimeout(timer);controller.abort();void reader?.cancel().catch(()=>{});}
}
const scope='user-read-recently-played';
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
export class MusicProvider {
 constructor(private clientId:string,private fetcher:typeof fetch=fetch,private now=Date.now){}
 private async request(url:string,init:RequestInit,token=false){
  let result:{response:Response;data:unknown};try{result=await boundedJson(this.fetcher,url,init,token?16384:524288);}catch{throw new ProviderFailure('unavailable');}
  const {response,data}=result,body=object(data);
  if(token&&body.error==='invalid_grant')throw new ProviderFailure('reauthorize',true);
  if(token&&['invalid_client','invalid_scope','unauthorized_client','unsupported_grant_type'].includes(String(body.error)))throw new ProviderFailure('unavailable',true);
  if(response.status===429){
   const retry=response.headers.get('Retry-After');if(retry!==null&&!/^[0-9]+$/.test(retry))throw new ProviderFailure('rate_limited',true);const seconds=retry===null?(object(body.error).reason==='QUOTA_EXCEEDED'?86400:3600):Number(retry);
   if(!Number.isSafeInteger(seconds)||seconds<0||seconds>2592000)throw new ProviderFailure('rate_limited',true);
   throw new ProviderFailure('rate_limited',false,this.now()+Math.max(3600,seconds)*1000);
  }
  if(response.status===401)throw new ProviderFailure(token?'reauthorize':'access_expired',token);
  if(response.status===403)throw new ProviderFailure('unavailable',true);
  if(!response.ok)throw new ProviderFailure('unavailable',token&&response.status<500);
  return data;
 }
 private async token(fields:Record<string,string>,oldRefresh?:string):Promise<Credentials>{
  const raw=object(await this.request('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...fields,client_id:this.clientId})},true));
  const valid=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<8192;
  if(raw.token_type!=='Bearer'||!valid(raw.access_token)||(!oldRefresh&&raw.scope!==scope)||(raw.scope!==undefined&&raw.scope!==scope)||typeof raw.expires_in!=='number'||!Number.isSafeInteger(raw.expires_in)||raw.expires_in<1||raw.expires_in>86400||(raw.refresh_token!==undefined&&!valid(raw.refresh_token))||(!oldRefresh&&!valid(raw.refresh_token)))throw new ProviderFailure('unavailable',true);
  return {access:raw.access_token as string,refresh:(raw.refresh_token??oldRefresh) as string,expires:this.now()+raw.expires_in*1000};
 }
 exchange(code:string,verifier:string,redirectUri:string){return this.token({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:redirectUri});}
 refresh(refresh:string){return this.token({grant_type:'refresh_token',refresh_token:refresh},refresh);}
 /** One page of recently played tracks, newest first; `before` (ms) asks for the page preceding a cursor. Malformed pages fail closed. */
 async recent(access:string,before?:number):Promise<PlayPage>{
  const data=await this.request('https://api.spotify.com/v1/me/player/recently-played?limit=50'+(before===undefined?'':'&before='+before),{headers:{Authorization:'Bearer '+access}});
  try{return projectPlays(data);}catch{throw new ProviderFailure('unavailable');}
 }
}
