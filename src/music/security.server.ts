import {boundedJson} from './provider.server';
const encode=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const decode=(s:string)=>{if(!/^[\w-]+$/.test(s)||s.length>24000)throw Error('Invalid encoding');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));};
export const randomToken=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
export const sha256=async(s:string)=>encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))));
export interface Sealed {version:1;iv:string;cipher:string}
async function aes(key:string){const bytes=decode(key);if(bytes.length!==32)throw Error('Invalid encryption configuration');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
const aad=new TextEncoder().encode('knowdes-music-credentials-v1');
export async function seal(key:string,value:unknown):Promise<Sealed>{const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},await aes(key),new TextEncoder().encode(JSON.stringify(value)));return {version:1,iv:encode(iv),cipher:encode(new Uint8Array(cipher))};}
export async function unseal(key:string,box:Sealed):Promise<unknown>{if(box.version!==1)throw Error('Unsupported encrypted data');const bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(box.iv),additionalData:aad},await aes(key),decode(box.cipher));return JSON.parse(new TextDecoder().decode(bytes));}

/** An edge header is not authentication until its signature and exact owner are verified. */
export function createOwnerVerifier(config:{issuer?:string;audience?:string;subject?:string},fetcher:typeof fetch=fetch,now=Date.now){
 let keys:(JsonWebKey&{kid?:string;alg?:string})[]=[];let expires=0,lastRefresh=-Infinity;
 return async(token:string|null):Promise<string|null>=>{
  try{
   if(!config.issuer||!/^https:\/\/[a-zA-Z0-9-]+\.cloudflareaccess\.com$/.test(config.issuer)||!config.audience||!config.subject||!token||token.length>16000)return null;
   const parts=token.split('.');if(parts.length!==3)return null;
   const head=JSON.parse(new TextDecoder().decode(decode(parts[0])));const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
   if(head.alg!=='RS256'||typeof head.kid!=='string'||head.kid.length>200||head.crit!==undefined)return null;
   let key=keys.find(k=>k.kid===head.kid);
   if(now()>=expires||!key){
    if(now()-lastRefresh<60000)return null;lastRefresh=now();
    const {response,data}=await boundedJson(fetcher,config.issuer+'/cdn-cgi/access/certs',{},64000,5000);
    if(!response.ok||!data||typeof data!=='object')return null;const json=data as {keys:unknown};
    if(!Array.isArray(json.keys)||json.keys.length>10)return null;keys=json.keys;expires=now()+300000;key=keys.find(k=>k.kid===head.kid);
   }
   if(!key||key.kty!=='RSA'||(key.alg!==undefined&&key.alg!=='RS256'))return null;
   const publicKey=await crypto.subtle.importKey('jwk',key,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
   if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))return null;
   const seconds=now()/1000;
   if(claims.iss!==config.issuer||claims.sub!==config.subject||!Array.isArray(claims.aud)||!claims.aud.includes(config.audience)||!Number.isFinite(claims.exp)||claims.exp<=seconds||!Number.isFinite(claims.iat)||claims.iat>seconds||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>seconds)))return null;
   return config.subject;
  }catch{return null;}
 };
}
