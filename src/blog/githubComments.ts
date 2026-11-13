import { annotationHash, canonicalAnnotation, encodeAnnotation, type CommentAnnotation } from './commentAnnotations';
export const GISCUS_ORIGIN='https://giscus.app';
export const COMMENT_REPO='70ki8suda/portfolio';
const SITE='https://70ki8suda.com';
const SESSION_KEY='giscus-session';
export type CommentTarget={term:string;revision:string;backLink:string;description:string;searchUrl:string;key:string;number?:number};
export type SessionEnvironment={href:string;state:unknown;replace:(state:unknown,url:string)=>void;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>};
async function hash(text:string,algorithm:'SHA-1'|'SHA-256') {
  const bytes=await crypto.subtle.digest(algorithm,new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
function escapeMarkdown(text:string) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/[\\`*_{}\[\]()#+.!|~-]/g,'\\$&');
}
export async function commentTarget(post:{slug:string;title:string;body:string},paragraph?:{anchor:string;section:string;text:string}): Promise<CommentTarget> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug)) throw new Error('Invalid comment slug');
  if (paragraph && !/^p-[a-f0-9]{16}(?:-\d+)?(?:-p)*$/.test(paragraph.anchor)) throw new Error('Invalid comment anchor');
  const revision=await hash(post.body,'SHA-256');
  const key=paragraph?`${revision}:${paragraph.anchor}`:'article';
  const term=paragraph?`paragraph:${post.slug}:${key}`:`article:${post.slug}`;
  const url=new URL(`/blog/${post.slug}`,SITE);url.searchParams.set('comment',key);if(paragraph)url.hash=paragraph.anchor;
  const backLink=url.toString();
  const description=[escapeMarkdown(post.title),paragraph?`節: ${escapeMarkdown(paragraph.section)}\n\n本文版: ${revision}`:'記事全体へのコメント',
    paragraph?paragraph.text.split('\n').map(line=>'> '+escapeMarkdown(line)).join('\n'):'',`[${paragraph?'元の段落':'元の記事'}](${backLink})`].filter(Boolean).join('\n\n');
  const search=new URL(`https://github.com/${COMMENT_REPO}/discussions`);search.searchParams.set('discussions_q',`category:Announcements ${await hash(term,'SHA-1')}`);
  return {term,revision,backLink,description,searchUrl:search.toString(),key};
}
export function widgetUrl(target:CommentTarget,session:string,originUrl:string) {
  const origin=new URL(originUrl);origin.searchParams.delete('giscus');
  const params=new URLSearchParams({origin:origin.toString(),session,theme:'light',reactionsEnabled:'0',emitMetadata:'1',inputPosition:'top',repo:COMMENT_REPO,repoId:'R_kgDOUZpL2g',category:'Announcements',categoryId:'DIC_kwDOUZpL2s4DLB2i',strict:'1',term:target.term,description:target.description,backLink:target.backLink});
  if(target.number!==undefined){if(!Number.isSafeInteger(target.number)||target.number<1)throw new Error('Invalid discussion number');params.set('number',String(target.number));}
  const src=`${GISCUS_ORIGIN}/ja/widget?${params}`;
  if(new TextEncoder().encode(src).length>8000)throw new Error('引用の情報が長すぎます。短い範囲を選んでください。');
  return src;
}
export function discussionUrl(value:unknown):string|null {
  return typeof value==='string' && /^https:\/\/github\.com\/70ki8suda\/portfolio\/discussions\/[1-9]\d*$/.test(value)?value:null;
}
/** Capture before the router can normalize search params; never log the session. */
export function captureCommentSession(env:SessionEnvironment):string {
  const url=new URL(env.href), incoming=url.searchParams.get('giscus');
  if (url.searchParams.has('giscus')) { url.searchParams.delete('giscus');env.replace(env.state,url.toString()); }
  if (incoming) { try { env.storage.setItem(SESSION_KEY,JSON.stringify(incoming)); } catch { /* In-memory session remains usable for this page. */ } return incoming; }
  try {
    const saved=env.storage.getItem(SESSION_KEY);
    if (!saved) return '';
    const value:unknown=JSON.parse(saved);
    if (typeof value==='string') return value;
    env.storage.removeItem(SESSION_KEY);
  } catch { /* Invalid or inaccessible storage is not an authenticated session. */ }
  return '';
}

let currentSession='';
export function initializeCommentSession() {
  if(typeof window==='undefined')return;
  currentSession=captureCommentSession({href:location.href,state:history.state,replace:(s,u)=>history.replaceState(s,'',u),storage:{getItem:k=>window.localStorage.getItem(k),setItem:(k,v)=>window.localStorage.setItem(k,v),removeItem:k=>window.localStorage.removeItem(k)}})||currentSession;
}
export function getCommentSession(){return currentSession;}
export function clearCommentSession(){currentSession='';try{window.localStorage.removeItem(SESSION_KEY);}catch{/* Memory was cleared too. */}}

export async function rangeCommentTarget(post:{slug:string;title:string;body:string},annotation:CommentAnnotation):Promise<CommentTarget> {
  const revision=await annotationHash(post.body);
  if(annotation.slug!==post.slug||annotation.bodyRevision!==revision)throw new Error('引用の本文版が一致しません。');
  const encoded=encodeAnnotation(annotation), selectorHash=await annotationHash(canonicalAnnotation(annotation));
  const term=`range:${post.slug}:${revision}:${selectorHash}`;
  const url=new URL(`/blog/${post.slug}`,SITE);url.searchParams.set('annotation',encoded);url.hash=annotation.segments[0].anchor;
  const backLink=url.toString();
  if(new TextEncoder().encode(backLink).length>6000)throw new Error('引用リンクが長すぎます。');
  const description=[escapeMarkdown(post.title),annotation.quote.split('\n').map(line=>'> '+escapeMarkdown(line)).join('\n'),`本文版: ${revision}`,`[元の引用](${backLink})`,`<!-- portfolio-annotation-v1:${encoded} -->`].join('\n\n');
  const search=new URL(`https://github.com/${COMMENT_REPO}/discussions`);search.searchParams.set('discussions_q',`category:Announcements ${await hash(term,'SHA-1')}`);
  return {term,revision,backLink,description,searchUrl:search.toString(),key:selectorHash};
}
