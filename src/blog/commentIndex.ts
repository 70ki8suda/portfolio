import {annotationHash,canonicalAnnotation,encodeAnnotation,parseAnnotation,type CommentAnnotation} from './commentAnnotations';
export const COMMENT_INDEX_URL='https://raw.githubusercontent.com/70ki8suda/portfolio/comment-index/annotations.json';
export const COMMENT_INDEX_MAX_BYTES=5*1024*1024;
export type IndexedComment={id:string;number:number;url:string;updatedAt:string;term:string;annotation:CommentAnnotation;comments:number;replies:number};
export type CommentIndex={version:1;repo:'70ki8suda/portfolio';complete:true;startedAt:string;generatedAt:string;sourceSha:string;generation:string;entries:IndexedComment[]};
export type CommentIndexState={state:'fresh'|'stale'|'unknown';entries:IndexedComment[];generatedAt?:string};
export async function readCommentIndex(value:unknown,now=Date.now()):Promise<CommentIndexState>{
 const unknown:CommentIndexState={state:'unknown',entries:[]};
 try{
  const s=value as CommentIndex;
  if(!s||s.version!==1||s.repo!=='70ki8suda/portfolio'||s.complete!==true||!Array.isArray(s.entries)||s.entries.length>5000||typeof s.sourceSha!=='string'||!/^[a-f0-9]{40}$/.test(s.sourceSha)||typeof s.generation!=='string'||!/^\d+:\d+$/.test(s.generation))return unknown;
  const start=Date.parse(s.startedAt),end=Date.parse(s.generatedAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>now+300000||new TextEncoder().encode(JSON.stringify(s)).length>COMMENT_INDEX_MAX_BYTES)return unknown;
  const ids=new Set<string>(),numbers=new Set<number>();
  for(const e of s.entries){
   if(!e||typeof e.id!=='string'||!e.id||ids.has(e.id)||!Number.isSafeInteger(e.number)||e.number<1||numbers.has(e.number)||e.url!==`https://github.com/70ki8suda/portfolio/discussions/${e.number}`||!Number.isFinite(Date.parse(e.updatedAt)))return unknown;
   if(!Number.isSafeInteger(e.comments)||e.comments<0||!Number.isSafeInteger(e.replies)||e.replies<0)return unknown;
   const a=parseAnnotation(encodeAnnotation(e.annotation));if(!a)return unknown;
   if(e.term!==`range:${a.slug}:${a.bodyRevision}:${await annotationHash(canonicalAnnotation(a))}`)return unknown;
   ids.add(e.id);numbers.add(e.number);
  }
  return {state:now-end>2*3600000?'stale':'fresh',entries:s.entries,generatedAt:s.generatedAt};
 }catch{return unknown;}
}
