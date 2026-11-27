import {createOwnerVerifier,randomToken} from './security.server';
import {readMusic} from './model';
export interface MusicEnv {
 SPOTIFY_CLIENT_ID?:string;MUSIC_TOKEN_KEY?:string;MUSIC_ORIGIN?:string;MUSIC_ACCESS_ISSUER?:string;MUSIC_ACCESS_AUD?:string;MUSIC_OWNER_SUB?:string;MUSIC_ADMIN_PRIVACY_READY?:string;
 MUSIC_STORE?:{idFromName(name:string):unknown;get(id:unknown):{fetch(request:Request):Promise<Response>}};
}
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.spotify.com/authorize; frame-ancestors 'none'; base-uri 'none'"};
const response=(body:string,status=200,extra:Record<string,string>={})=>new Response(body,{status,headers:{...headers,...extra}});
const json=(data:unknown)=>response(JSON.stringify(data),200,{'Content-Type':'application/json'});
const configured=(e:MusicEnv)=>!!(e.MUSIC_STORE&&e.MUSIC_TOKEN_KEY&&e.SPOTIFY_CLIENT_ID&&e.MUSIC_ORIGIN==='https://70ki8suda.com'&&e.MUSIC_ACCESS_ISSUER&&e.MUSIC_ACCESS_AUD&&e.MUSIC_OWNER_SUB&&e.MUSIC_ADMIN_PRIVACY_READY==='1');
const page=(title:string,body:string)=>`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font:16px/1.8 system-ui;margin:40px auto;padding:0 20px;max-width:660px;background:#efede6;color:#22312b}button,a{display:inline-block;min-height:44px}button{padding:10px 18px;cursor:pointer}p{overflow-wrap:anywhere}</style><h1>${title}</h1>${body}</html>`;
export const musicPrivacy=page('音楽データについて',`<p>このサイトの所有者がSpotifyで最近聴いた音楽の一部を、曲・アルバム・アーティストのつながりとして紹介します。再生機能、再生回数の集計、AIによる分析はありません。</p><p>所有者の許可を受け、最近の最大50履歴から最大12曲のメタデータをおおむね1時間ごとに更新します。全履歴は取得しません。曲名やジャケットはSpotify提供で、Spotifyの該当ページへリンクします。</p><p>正確な聴取時刻やアカウント情報は公開せず、生の履歴は保存しません。ただし、掲載された曲を所有者が最近聴いたことは分かります。閲覧者が変化を記録する可能性もあります。</p><p>認証情報はサーバー側に暗号化して保存します。所有者は管理画面からいつでも接続を解除でき、同期を止め、運用中の保存データと公開表示を削除できます。すでに閲覧者が保存したコピーは回収できません。Cloudflareの災害復旧用コピーは最大30日保持される場合があり、運用データの即時削除とは異なります。この接続の過去データは復元しません。</p><p>Spotify側の許可も取り消す場合は<a href="https://www.spotify.com/account/apps/">Spotifyのアプリ管理</a>をご利用ください。</p><p><a href="/knowdes?media=music">音楽へ戻る</a></p>`);
const verifierCache=new WeakMap<object,ReturnType<typeof createOwnerVerifier>>();
export async function handleMusic(request:Request,env:MusicEnv,verifyOverride?:(token:string|null)=>Promise<string|null>):Promise<Response|null>{
 const url=new URL(request.url),admin=url.pathname==='/admin/music'||url.pathname.startsWith('/admin/music/');
 if(!admin&&url.pathname!=='/api/music'&&url.pathname!=='/music-privacy')return null;
 if(url.pathname==='/music-privacy')return request.method==='GET'?response(musicPrivacy,200,{'Content-Type':'text/html;charset=utf-8'}):response('Method not allowed',405);
 if(!admin){
  if(request.method!=='GET')return response('Method not allowed',405);
  if(!configured(env))return json({version:1,status:'unconfigured'});
  try{const r=await env.MUSIC_STORE!.get(env.MUSIC_STORE!.idFromName('owner-music-v1')).fetch(new Request('https://music.internal/public'));return json(readMusic(await r.json()));}catch{return json({version:1,status:'unavailable'});}
 }
 if(!configured(env))return response('Music connection is not configured.',503);
 if(url.origin!==env.MUSIC_ORIGIN)return response('Forbidden',403);
 let verify=verifyOverride??verifierCache.get(env);if(!verify){verify=createOwnerVerifier({issuer:env.MUSIC_ACCESS_ISSUER,audience:env.MUSIC_ACCESS_AUD,subject:env.MUSIC_OWNER_SUB});verifierCache.set(env,verify);}
 const owner=await verify(request.headers.get('Cf-Access-Jwt-Assertion'));if(!owner||owner!==env.MUSIC_OWNER_SUB)return response('Forbidden',403);
 if(request.method==='POST'&&request.headers.get('Origin')!==env.MUSIC_ORIGIN)return response('Forbidden',403);
 const call=async(path:string,body?:unknown)=>{const r=await env.MUSIC_STORE!.get(env.MUSIC_STORE!.idFromName('owner-music-v1')).fetch(new Request('https://music.internal'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}));if(!r.ok)throw Error('Storage unavailable');return r;};
 const redirect=()=>response('',303,{Location:'/admin/music','Set-Cookie':'__Host-music_oauth=; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'});
 try{
  if(url.pathname==='/admin/music'&&request.method==='GET'){
   const status=readMusic(await (await call('/public')).json()).status;
   return response(page('音楽の接続管理',`<p>状態: ${status}</p><p>接続するSpotifyアカウントの最近の曲・アルバム・アーティストが一般に公開されます。正確な時刻は出しませんが、掲載曲の変化から聴いた音楽が分かることがあります。</p><p><a href="/music-privacy">データの利用と削除について</a></p><form method="post" action="/admin/music/connect"><label><input type="checkbox" name="publish" value="yes" required> この音楽情報を公開する</label><p><button>Spotifyに接続・再接続</button></p></form><form method="post" action="/admin/music/disconnect"><button>接続を解除し保存データを削除</button></form><p><a href="/knowdes?media=music">公開表示へ</a></p>`),200,{'Content-Type':'text/html;charset=utf-8','Referrer-Policy':'same-origin'});
  }
  if(url.pathname==='/admin/music/connect'&&request.method==='POST'){
   if(Number(request.headers.get('Content-Length'))>512)return response('Invalid request',400);
   const body=await request.text();if(body.length>512||new URLSearchParams(body).get('publish')!=='yes')return response('Publication consent is required.',400);
   const browser=randomToken();const pending=await (await call('/begin',{owner,browser})).json() as {state:string;challenge:string};
   const authorize=new URL('https://accounts.spotify.com/authorize');authorize.search=new URLSearchParams({client_id:env.SPOTIFY_CLIENT_ID!,response_type:'code',redirect_uri:env.MUSIC_ORIGIN+'/admin/music/callback',scope:'user-read-recently-played',state:pending.state,code_challenge_method:'S256',code_challenge:pending.challenge}).toString();
   return response('',303,{Location:authorize.toString(),'Set-Cookie':`__Host-music_oauth=${browser}; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`});
  }
  if(url.pathname==='/admin/music/callback'&&request.method==='GET'){
   if(url.search.length>4096||['state','code','error'].some(k=>url.searchParams.getAll(k).length>1))return response('Invalid callback',400);
   const state=url.searchParams.get('state'),code=url.searchParams.get('code'),denied=url.searchParams.has('error');
   const cookies=(request.headers.get('Cookie')??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('__Host-music_oauth='));
   if(!state||cookies.length!==1||(!code&&!denied)||(code&&denied))return redirect();
   const browser=cookies[0].slice('__Host-music_oauth='.length);
   if(!/^[\w-]{43}$/.test(state)||!/^[\w-]{43}$/.test(browser))return redirect();
   await call('/complete',{owner,browser,state,code:code??undefined,uri:env.MUSIC_ORIGIN+'/admin/music/callback'});return redirect();
  }
  if(url.pathname==='/admin/music/disconnect'&&request.method==='POST'){await call('/disconnect',{});return redirect();}
  return response('Not found',404);
 }catch{return response('Music connection is temporarily unavailable.',503);}
}
