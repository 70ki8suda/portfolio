import {test,expect} from '@playwright/test';
import {handleMusic} from '../src/music/http.server';
const origin='https://70ki8suda.com';
const env:any={MUSIC_ORIGIN:origin,SPOTIFY_CLIENT_ID:'synthetic-client',MUSIC_TOKEN_KEY:'synthetic',MUSIC_ACCESS_ISSUER:'https://fixture.cloudflareaccess.com',MUSIC_ACCESS_AUD:'fixture',MUSIC_OWNER_SUB:'owner',MUSIC_ADMIN_PRIVACY_READY:'1',MUSIC_STORE:{idFromName:()=>0,get:()=>({fetch:async(req:Request)=>Response.json(new URL(req.url).pathname==='/begin'?{state:'A'.repeat(43),challenge:'B'.repeat(43)}:{version:1,status:'disconnected'})})}};

for(const legacy of [true,false])test(`owner form CSP navigation (legacy=${legacy})`,async({browser})=>{
 const context=await browser.newContext({extraHTTPHeaders:{'X-Site-QA':'1'}});let reached=false;const p=await context.newPage();const cdp=await context.newCDPSession(p);await cdp.send('Fetch.enable',{patterns:[{urlPattern:'https://accounts.spotify.com/*',requestStage:'Request'}]});cdp.on('Fetch.requestPaused',async e=>{reached=true;await cdp.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/html'}],body:Buffer.from('Synthetic authorization destination').toString('base64')});});
 await p.route('**/*',async route=>{
  const q=route.request(),u=new URL(q.url());
  if(u.origin==='https://accounts.spotify.com'){reached=true;return route.fulfill({status:200,body:'Synthetic authorization destination'});}
  if(u.origin!==origin)return route.abort();
  const r=(await handleMusic(new Request(q.url(),{method:q.method(),headers:await q.allHeaders(),body:q.postData()??undefined}),env,async()=>'owner'))!;
  const headers=Object.fromEntries(r.headers);if(legacy)headers['content-security-policy']=headers['content-security-policy'].replace(' https://accounts.spotify.com/authorize','');
  await route.fulfill({status:r.status,headers,body:await r.text()});
 });
 await p.goto(origin+'/admin/music');await p.getByRole('checkbox').check();await p.getByRole('button',{name:'Spotifyに接続・再接続'}).click();await p.waitForTimeout(400);
 expect(reached).toBe(!legacy);await context.close();
});
