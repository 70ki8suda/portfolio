import {createOwnerVerifier,randomToken} from './security.server';
import {readMusic,readView} from './model';
export interface MusicEnv {
 SPOTIFY_CLIENT_ID?:string;MUSIC_TOKEN_KEY?:string;MUSIC_ORIGIN?:string;MUSIC_ACCESS_ISSUER?:string;MUSIC_ACCESS_AUD?:string;MUSIC_OWNER_SUB?:string;MUSIC_ADMIN_PRIVACY_READY?:string;
 MUSIC_STORE?:{idFromName(name:string):unknown;get(id:unknown):{fetch(request:Request):Promise<Response>}};
}
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://accounts.spotify.com/authorize; frame-ancestors 'none'; base-uri 'none'"};
const response=(body:string,status=200,extra:Record<string,string>={})=>new Response(body,{status,headers:{...headers,...extra}});
const json=(data:unknown)=>response(JSON.stringify(data),200,{'Content-Type':'application/json'});
const configured=(e:MusicEnv)=>!!(e.MUSIC_STORE&&e.MUSIC_TOKEN_KEY&&e.SPOTIFY_CLIENT_ID&&e.MUSIC_ORIGIN==='https://70ki8suda.com'&&e.MUSIC_ACCESS_ISSUER&&e.MUSIC_ACCESS_AUD&&e.MUSIC_OWNER_SUB&&e.MUSIC_ADMIN_PRIVACY_READY==='1');
const page=(title:string,body:string)=>`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font:16px/1.8 system-ui;margin:40px auto;padding:0 20px;max-width:660px;background:#efede6;color:#22312b}button,a{display:inline-block;min-height:44px}button{padding:10px 18px;cursor:pointer}p{overflow-wrap:anywhere}</style><h1>${title}</h1>${body}</html>`;
export const musicPrivacy=page('音楽データについて',`<p>このサイトの所有者がSpotifyで最近聴いた音楽の一部を、曲・アルバム・アーティストのつながりとして紹介します。再生機能、再生回数の集計、AIによる分析はありません。</p><p>所有者の許可を受け、Spotifyに接続した後に聴いた曲を、おおむね1時間ごとに確認して蓄積します。接続したときは、Spotifyがその時点で返す直近の再生も、決めた回数の範囲で取り込みます。それより前の履歴はさかのぼって集めません。Spotifyが返すのは直近の再生だけなので、短い時間にたくさん聴いたときや、更新が止まっていた間の曲は記録されないことがあります。</p><p>蓄積するのは曲・アルバム・アーティストの名前、ジャケット画像の場所、Spotifyへのリンクと、その曲を最後に聴いた時刻です。同じ曲は1件にまとめ、最後に聴いてから180日を過ぎたものと、240曲を超えた古いものは削除します。180日という長さはこのサイトが決めた運用上の上限です。曲名やジャケットはSpotify提供で、聴き直したときにSpotifyの最新の内容へ置き換え、Spotifyの該当ページへリンクします。</p><p>画面には、蓄積している直近180日以内の音楽を、アーティスト・アルバム・曲のいずれかの粒度で表示します。一度に描く数には上限があり（アーティスト96、アルバム60、曲36）、超えた分は新しく聴いたものを優先して、全体の件数とともに示します。線は、Spotifyに記載された収録とクレジットの関係だけです。アーティスト同士は、同じ曲か同じアルバムに一緒にクレジットされているときだけ結び、聴き方や曲調の近さは表しません。正確な聴取時刻、再生回数、アカウント情報は公開しません。ただし、掲載された音楽を所有者がその期間に聴いたことは分かります。閲覧者が変化を記録する可能性もあります。更新を1日以上確認できないときは表示を止めます。</p><p>認証情報はサーバー側に暗号化して保存します。所有者は管理画面からいつでも接続を解除でき、同期を止め、蓄積した履歴を含む運用中の保存データと公開表示を削除できます。接続し直した場合も、それまでの蓄積は消してから始めます。すでに閲覧者が保存したコピーは回収できません。Cloudflareの災害復旧用コピーは最大30日保持される場合があり、運用データの即時削除とは異なります。この接続の過去データは復元しません。</p><p>Spotify側の許可も取り消す場合は<a href="https://www.spotify.com/account/apps/">Spotifyのアプリ管理</a>をご利用ください。</p><p><a href="/knowdes?media=music">音楽へ戻る</a></p>`);
const verifierCache=new WeakMap<object,ReturnType<typeof createOwnerVerifier>>();
export async function handleMusic(request:Request,env:MusicEnv,verifyOverride?:(token:string|null)=>Promise<string|null>):Promise<Response|null>{
 const url=new URL(request.url),admin=url.pathname==='/admin/music'||url.pathname.startsWith('/admin/music/');
 if(!admin&&url.pathname!=='/api/music'&&url.pathname!=='/music-privacy')return null;
 if(url.pathname==='/music-privacy')return request.method==='GET'?response(musicPrivacy,200,{'Content-Type':'text/html;charset=utf-8'}):response('Method not allowed',405);
 if(!admin){
  if(request.method!=='GET')return response('Method not allowed',405);
  if(!configured(env))return json({version:1,status:'unconfigured'});
  try{const r=await env.MUSIC_STORE!.get(env.MUSIC_STORE!.idFromName('owner-music-v1')).fetch(new Request('https://music.internal/public?view='+readView(url.searchParams.get('view'))));return json(readMusic(await r.json()));}catch{return json({version:1,status:'unavailable'});}
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
   // Counts only; the page is owner-only and never lists titles or times.
   const stats=(await (await call('/stats')).json() as {stats:Record<string,unknown>|null}).stats;const n=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)?String(v):'-';
   const last=stats?`<p>直近の同期: Spotifyへの取得 ${n(stats.requests)} 回（1回ごとの件数 ${Array.isArray(stats.items)?stats.items.map(n).join('・'):'-'}）、表示できる再生 ${n(stats.plays)} 件、そのうち別々の曲 ${n(stats.distinct)} 曲、新しく加わった再生 ${n(stats.fresh)} 件、保存中 ${n(stats.library)} 曲。返ってきた再生のうち24時間以内 ${n(stats.day)} 件、7日以内 ${n(stats.week)} 件。さらに古いページ: ${stats.olderCursor===true?'あり':'なし'}。</p>`:'';
   return response(page('音楽の接続管理',`<p>状態: ${status}</p>${last}<p>接続するSpotifyアカウントで今後聴く曲・アルバム・アーティストと、接続時にSpotifyが返す直近の再生が蓄積され、一般に公開されます。最後に聴いてから180日を過ぎた曲は削除します。正確な時刻や再生回数は出しませんが、直近180日以内に聴いた音楽が分かります。再接続すると、それまでの蓄積は削除されます。</p><p><a href="/music-privacy">データの利用と削除について</a></p><form method="post" action="/admin/music/connect"><label><input type="checkbox" name="publish" value="yes" required> この音楽情報を公開する</label><p><button>Spotifyに接続・再接続</button></p></form><form method="post" action="/admin/music/disconnect"><button>接続を解除し保存データを削除</button></form><p><a href="/knowdes?media=music">公開表示へ</a></p>`),200,{'Content-Type':'text/html;charset=utf-8','Referrer-Policy':'same-origin'});
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
