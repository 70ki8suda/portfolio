import {createHash} from 'node:crypto';
import {annotationHash,canonicalAnnotation,parseAnnotation} from '../src/blog/commentAnnotations';
import type {IndexedComment} from '../src/blog/commentIndex';
export type DiscussionRecord={id:string;number:number;url:string;title:string;body:string;updatedAt:string;author:{id:string;__typename:string}|null;category:{id:string};comments:number;replies:number};
const category='DIC_kwDOUZpL2s4DLB2i';
// Public GitHub Bot identity, independently resolved via users/giscus[bot].
const author='MDM6Qm90ODEwMjY4OTU=';
export async function indexDiscussion(d:DiscussionRecord):Promise<IndexedComment|null>{
 if(!d.title.startsWith('range:')||d.category.id!==category||d.author?.__typename!=='Bot'||d.author.id!==author)return null;
 const markers=[...d.body.matchAll(/<!-- portfolio-annotation-v1:([A-Za-z0-9_-]+) -->/g)];
 if(markers.length!==1)throw new Error(`Invalid annotation marker in discussion ${d.number}`);
 const annotation=parseAnnotation(markers[0][1]);
 if(!annotation)throw new Error(`Invalid annotation selector in discussion ${d.number}`);
 const term=`range:${annotation.slug}:${annotation.bodyRevision}:${await annotationHash(canonicalAnnotation(annotation))}`;
 const strict=`<!-- sha1: ${createHash('sha1').update(term).digest('hex')} -->`;
 if(d.title!==term||!d.body.startsWith(`# ${term}\n`)||d.body.split(strict).length!==2)throw new Error(`Invalid annotation identity in discussion ${d.number}`);
 if(d.url!==`https://github.com/70ki8suda/portfolio/discussions/${d.number}`||!d.id||!Number.isSafeInteger(d.number)||d.number<1||!Number.isSafeInteger(d.comments)||d.comments<0||!Number.isSafeInteger(d.replies)||d.replies<0)throw new Error('Invalid discussion record');
 return {id:d.id,number:d.number,url:d.url,updatedAt:d.updatedAt,term,annotation,comments:d.comments,replies:d.replies};
}
