import {expect,it} from 'vitest';
import {handleMusic,type MusicEnv} from './http.server';
const origin='https://70ki8suda.com';
const env:MusicEnv={MUSIC_ORIGIN:origin,SPOTIFY_CLIENT_ID:'client',MUSIC_TOKEN_KEY:'fixture',MUSIC_ACCESS_ISSUER:'https://test.cloudflareaccess.com',MUSIC_ACCESS_AUD:'aud',MUSIC_OWNER_SUB:'owner',MUSIC_ADMIN_PRIVACY_READY:'1'};
it('unconfigured is not empty, nonmusic paths delegate, admin fails closed',async()=>{
 expect(await handleMusic(new Request(origin+'/knowdes'),{})).toBeNull();
 const r=await handleMusic(new Request(origin+'/api/music'),{});expect(await r!.json()).toEqual({version:1,status:'unconfigured'});expect(r!.headers.get('cache-control')).toBe('no-store');
 expect((await handleMusic(new Request(origin+'/admin/music'),{}))!.status).toBe(503);
});
it('rejects unauthenticated/foreign-origin mutation before accessing storage',async()=>{
 let calls=0;const configured={...env,MUSIC_STORE:{idFromName:()=>({}),get:()=>({fetch:async()=>{calls++;return Response.json({version:1,status:'disconnected'});}})}} as unknown as MusicEnv;
 for(const path of ['/admin/music','/admin/music/connect','/admin/music/disconnect','/admin/music/callback?code=secret&state=x'])expect((await handleMusic(new Request(origin+path),configured,async()=>null))!.status).toBe(403);
 expect((await handleMusic(new Request(origin+'/admin/music/disconnect',{method:'POST',headers:{Origin:'https://evil.test'}}),configured,async()=>'owner'))!.status).toBe(403);
 expect((await handleMusic(new Request('https://other.test/admin/music'),configured,async()=>'owner'))!.status).toBe(403);expect(calls).toBe(0);
});
it('admin errors and callback redirects remove analytics/referrer and never echo incoming secrets',async()=>{
 const configured={...env,MUSIC_STORE:{idFromName:()=>({}),get:()=>({fetch:async()=>Response.json({ok:false})})}} as unknown as MusicEnv;
 const bad=await handleMusic(new Request(origin+'/admin/music/callback?code=private&code=again&state=x'),configured,async()=>'owner');expect(bad!.status).toBe(400);expect(await bad!.text()).not.toContain('private');
 const r=await handleMusic(new Request(origin+'/admin/music/callback?code=private&state=x',{headers:{Cookie:'__Host-music_oauth=nonce'}}),configured,async()=>'owner');expect(r!.status).toBe(303);expect(r!.headers.get('location')).toBe('/admin/music');expect(r!.headers.get('referrer-policy')).toBe('no-referrer');expect(r!.headers.get('cache-control')).toBe('no-store');
});
it('storage failure is not shown as successful disconnect',async()=>{
 const configured={...env,MUSIC_STORE:{idFromName:()=>({}),get:()=>({fetch:async()=>new Response('private failure',{status:500})})}} as unknown as MusicEnv;
 const r=await handleMusic(new Request(origin+'/admin/music/disconnect',{method:'POST',headers:{Origin:origin}}),configured,async()=>'owner');expect(r!.status).toBe(503);expect(await r!.text()).not.toContain('private');
});
it('forwards only a known granularity, artists otherwise, and shows the owner sync counts without content',async()=>{
 const seen:string[]=[];const graph={version:1,status:'ready',view:'artist',total:1,graph:{nodes:[{id:'artist:'+'0'.repeat(22),kind:'artist',name:'合成',url:'https://open.spotify.com/artist/'+'0'.repeat(22)}],edges:[]}};
 const configured={...env,MUSIC_STORE:{idFromName:()=>({}),get:()=>({fetch:async(r:Request)=>{const u=new URL(r.url);seen.push(u.pathname+u.search);return Response.json(u.pathname==='/stats'?{stats:{requests:2,items:[50,7],plays:57,distinct:9,fresh:3,library:9,deep:true,olderCursor:false,leak:'合成の題名'}}:graph);}})}} as unknown as MusicEnv;
 for(const q of ['?view=album','?view=track','?view=180','?period=30',''])await handleMusic(new Request(origin+'/api/music'+q),configured);
 expect(seen).toEqual(['/public?view=album','/public?view=track','/public?view=artist','/public?view=artist','/public?view=artist']);
 const r=await handleMusic(new Request(origin+'/api/music'),configured);expect(await r!.json()).toEqual(graph);
 const admin=await (await handleMusic(new Request(origin+'/admin/music'),configured,async()=>'owner'))!.text();
 expect(admin).toContain('取得 2 回（1回ごとの件数 50・7）');expect(admin).toContain('別々の曲 9 曲');expect(admin).toContain('さらに古いページ: なし');expect(admin).not.toContain('合成の題名');
});
