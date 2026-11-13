import {applyIndexCacheReply,createIndexCacheRequest,indexCacheWork,type IndexCacheRequest,type IndexCacheEntry} from './retrieval-index-cache';
import {indexReviewTarget,retrievalHash,validateIndex,type RetrievalIndex,type ReviewReceipt} from './retrieval-gate';
export type IndexGenerate=(kind:'index'|'index-review',packet:Record<string,unknown>)=>Promise<unknown>;
function rows(value:unknown,key:string,ids:string[]):Record<string,unknown>[] {
 if(!value||typeof value!=='object'||!Array.isArray((value as Record<string,unknown>)[key]))throw Error('Invalid index author response');
 const rows=(value as Record<string,unknown>)[key] as Record<string,unknown>[];
 if(rows.length!==ids.length||rows.some(r=>!r||typeof r.id!=='string'||!ids.includes(r.id))||new Set(rows.map(r=>r.id)).size!==ids.length)throw Error('Invalid author ID coverage');return rows;
}
/** No pair generation API exists here. Optional narrowing decisions use structured replies. */
export async function completeIndexEntries(request:IndexCacheRequest,generate:IndexGenerate,reviewer:string) {
 const rebuilt=createIndexCacheRequest(request.snapshotHash,request.inputs,request.previous,request.recipes);
 if(rebuilt.requestHash!==request.requestHash)throw Error('Stale author request');
 const entries:Record<string,IndexCacheEntry>={};
 for(const input of request.inputs){const prior=request.previous[input.id];if(prior)entries[input.id]=structuredClone(prior);}
 for(const slug of new Set(request.inputs.map(i=>i.slug))){
  const article=request.inputs.filter(i=>i.slug===slug);
  // Uncertain impact is resolved by fresh full-context indexing, never silently waived.
  const needed=article.filter(i=>{const kind=indexCacheWork(i,entries[i.id],request.recipes).kind;return kind!=='reuse'&&(kind!=='index-review'||entries[i.id].origin.articleBody!==i.articleBody);});
  for(let offset=0;offset<needed.length;offset+=20){
   const batch=needed.slice(offset,offset+20),targets=batch.map(({articleBody:_,textHash:__,slug:___,...rest})=>rest);
   const generated=rows(await generate('index',{articleBody:article[0].articleBody,targets}),'entries',batch.map(i=>i.id));
   for(const input of batch){const {id:_,...fields}=generated.find(r=>r.id===input.id)!;const index=fields as unknown as RetrievalIndex;validateIndex(input,index);entries[input.id]={version:1,origin:input,index,recipe:request.recipes.indexRecipe};}
  }
  const unchecked=article.filter(i=>indexCacheWork(i,entries[i.id],request.recipes).kind!=='reuse');
  for(let offset=0;offset<unchecked.length;offset+=20){
   const batch=unchecked.slice(offset,offset+20),tasks=batch.map(i=>{const e=entries[i.id];return {id:i.id,targetHash:indexReviewTarget(e.origin,e.index,e.recipe),input:(({articleBody:_,...rest})=>rest)(e.origin),index:e.index};});
   // All origins in a batch must share their original full article, even on a review-only retry.
   for(const bodyHash of new Set(tasks.map(t=>retrievalHash(entries[t.id].origin.articleBody)))) {
    const group=tasks.filter(t=>retrievalHash(entries[t.id].origin.articleBody)===bodyHash);
    const reviews=rows(await generate('index-review',{articleBody:entries[group[0].id].origin.articleBody,tasks:group}),'reviews',group.map(t=>t.id));
    for(const task of group){const e=entries[task.id],review=reviews.find(r=>r.id===task.id)!;
    if(review.targetHash!==task.targetHash||!['pass','fail'].includes(review.verdict as string)||typeof review.note!=='string'||!review.note.trim())throw Error('Invalid index fidelity response');
    e.review={targetHash:task.targetHash,reviewRecipe:request.recipes.indexReviewRecipe,reviewer,verdict:review.verdict as ReviewReceipt['verdict'],note:review.note};
    if(indexCacheWork(batch.find(i=>i.id===task.id)!,e,request.recipes).kind!=='reuse')throw Error('Index fidelity failed; preserve response and review source');
    }
   }
  }
 }
 return {requestHash:request.requestHash,entries:applyIndexCacheReply(request,{requestHash:request.requestHash,entries})};
}
