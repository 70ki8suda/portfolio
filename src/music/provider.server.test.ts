import {expect,it} from 'vitest';
import {MusicProvider,boundedJson} from './provider.server';
const tokens={access_token:'fake-access',refresh_token:'fake-refresh',expires_in:3600,token_type:'Bearer',scope:'user-read-recently-played'};
it('uses one exact least-scope exchange and rotates or retains refresh tokens',async()=>{
 const calls:{url:string;body:string}[]=[];let response:unknown=tokens;
 const p=new MusicProvider('client',async(url,init)=>{calls.push({url:String(url),body:String(init?.body??'')});return new Response(JSON.stringify(response));},()=>1000);
 const first=await p.exchange('code','verifier','https://70ki8suda.com/admin/music/callback');expect(first).toEqual({access:'fake-access',refresh:'fake-refresh',expires:3601000});
 response={...tokens,refresh_token:undefined};expect((await p.refresh(first.refresh)).refresh).toBe('fake-refresh');
 response={...tokens,refresh_token:'rotated'};expect((await p.refresh(first.refresh)).refresh).toBe('rotated');
 expect(calls[0].url).toBe('https://accounts.spotify.com/api/token');expect(calls[0].body).toContain('code_verifier=verifier');expect(calls).toHaveLength(3);
});
it('separates token invalid_grant/configuration from resource unauthorized and rate limit',async()=>{
 const p=(status:number,body:unknown,headers={})=>new MusicProvider('client',async()=>new Response(JSON.stringify(body),{status,headers}),()=>1000);
 await expect(p(400,{error:'invalid_grant'}).refresh('x')).rejects.toMatchObject({kind:'reauthorize',stop:true});
 await expect(p(401,{error:'invalid_client'}).refresh('x')).rejects.toMatchObject({kind:'unavailable',stop:true});
 await expect(p(401,{}).recent('x')).rejects.toMatchObject({kind:'access_expired',stop:false});
 await expect(p(429,{}, {'Retry-After':'7200'}).recent('x')).rejects.toMatchObject({kind:'rate_limited',retryAt:7201000,stop:false});
 await expect(p(429,{}, {'Retry-After':'99999999999'}).recent('x')).rejects.toMatchObject({kind:'rate_limited',stop:true});
 await expect(p(429,{error:{reason:'QUOTA_EXCEEDED'}}).recent('x')).rejects.toMatchObject({retryAt:86401000});
 await expect(p(200,{...tokens,scope:'user-read-email'}).refresh('x')).rejects.toMatchObject({kind:'unavailable',stop:true});
});
it('bounds streamed bytes and entire body deadline, including stalled response bodies',async()=>{
 await expect(boundedJson(async()=>new Response('x'.repeat(100)), 'https://example.test',{},20,50)).rejects.toThrow();
 await expect(boundedJson(async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}})), 'https://example.test',{},100,20)).rejects.toThrow();
});
it('never fetches pages, artists, images or profiles, and does not return raw upstream errors',async()=>{
 let url='';const p=new MusicProvider('client',async(u)=>{url=String(u);return new Response(JSON.stringify({items:[],cursors:{after:'private'}}));});
 expect(await p.recent('access')).toEqual({version:1,status:'empty'});expect(url).toBe('https://api.spotify.com/v1/me/player/recently-played?limit=50');
 const broken=new MusicProvider('client',async()=>new Response('private-token-in-error',{status:500}));
 await expect(broken.recent('access')).rejects.toMatchObject({message:'Music provider unavailable'});
});
it('honors HTTP status and retry headers even when the error body is not JSON',async()=>{
 for(const body of ['', '<html>temporary</html>','{broken']){
  const p=new MusicProvider('client',async()=>new Response(body,{status:429,headers:{'Retry-After':'7200'}}),()=>1000);
  await expect(p.recent('x')).rejects.toMatchObject({kind:'rate_limited',retryAt:7201000});
 }
 for(const [status,kind,stop] of [[401,'access_expired',false],[403,'unavailable',true]] as const)await expect(new MusicProvider('client',async()=>new Response('',{status})).recent('x')).rejects.toMatchObject({kind,stop});
 await expect(new MusicProvider('client',async()=>new Response('bad',{status:400})).refresh('x')).rejects.toMatchObject({stop:true});
});
it('rejects nondecimal or empty Retry-After rather than shortening the wait',async()=>{
 for(const retry of ['', ' ', '0x10','1e3','+12','1.2','999999999999999999999'])await expect(new MusicProvider('client',async()=>new Response('{}',{status:429,headers:{'Retry-After':retry}})).recent('x')).rejects.toMatchObject({kind:'rate_limited',stop:true});
});
