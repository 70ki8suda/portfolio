import candidateOrder from './retrieval-recipes/candidate-order.json';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {CANDIDATE_POLICY,CANDIDATE_RECIPE,candidateLists,indexReviewTarget,pairReviewTarget,requireReview,retrievalHash,validateIndex,type ReviewedPair,type ReviewReceipt,type RetrievalRecipes} from './retrieval-gate';
import {retrievalWork,readRetrievalStore,type RetrievalStore} from './retrieval-store';
import {RETRIEVAL_ENCODER,indexEmbeddingText,validateRetrievalEmbeddings,type RetrievalEmbeddingCache} from './retrieval-embeddings';
import type {retrievalRequest} from './graph-retrieval';
export type AuthorKind='index'|'index-review'|'pair'|'pair-review';
const directory=fileURLToPath(new URL('./retrieval-recipes/',import.meta.url));
const read=(file:string)=>readFileSync(directory+file,'utf8');
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
export function authorDefinition(kind:AuthorKind){return {prompt:read(kind+'-prompt.txt'),schema:JSON.parse(read(kind+'-schema.json'))};}
export function authorRecipes():RetrievalRecipes {
 if(CANDIDATE_POLICY.version!==1||![CANDIDATE_POLICY.indexCount,CANDIDATE_POLICY.rawCount].every(n=>Number.isSafeInteger(n)&&n>0)||CANDIDATE_POLICY.indexCount+CANDIDATE_POLICY.rawCount>=candidateOrder.length)throw Error('Unsupported candidate policy for author ordering');
 const index=JSON.parse(read('index.json')),pair=JSON.parse(read('pair.json'));
 for(const definition of [index,pair,JSON.parse(read('index-review.json')),JSON.parse(read('pair-review.json'))])if(definition.model!=='gpt-6.1-sol'||definition.effort!=='medium'||definition.cli!=='0.167.2')throw Error('Unsupported author model/CLI recipe');
 if(index.prompt!==sha(read('index-prompt.txt'))||index.schema!==sha(read('index-schema.json'))||pair.prompt!==sha(read('pair-prompt.txt'))||pair.schema!==retrievalHash(authorDefinition('pair').schema))throw Error('Author prompt/schema recipe mismatch');
 const review=(kind:'index-review'|'pair-review')=>{const d=JSON.parse(read(kind+'.json')),actual=authorDefinition(kind);if(d.prompt!==actual.prompt)throw Error('Review prompt mismatch');return retrievalHash({prompt:actual.prompt,schema:actual.schema,model:d.model,effort:d.effort,cli:d.cli});};
 return {candidateRecipe:CANDIDATE_RECIPE,indexRecipe:sha(read('index.json')),pairRecipe:retrievalHash(pair),indexReviewRecipe:review('index-review'),pairReviewRecipe:review('pair-review')};
}
type Request=ReturnType<typeof retrievalRequest>;
type Packet=Record<string,unknown>;
type Options={generate:(kind:AuthorKind,packet:Packet)=>Promise<unknown>;encode:(entries:{id:string;text:string;textHash:string}[],previous:RetrievalEmbeddingCache)=>Promise<RetrievalEmbeddingCache>;checkpoint?:(store:RetrievalStore)=>void;reviewer?:string};
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function rows(value:unknown,key:string,ids:string[]):Record<string,unknown>[] {
 if(!record(value)||!Array.isArray(value[key]))throw Error(`Missing ${key} reply`);
 const result=value[key];if(result.length!==ids.length||result.some(x=>!record(x)||typeof x.id!=='string'||!ids.includes(x.id))||new Set(result.map(x=>x.id)).size!==ids.length)throw Error(`Invalid ${key} reply coverage`);
 return result;
}
function receipt(value:Record<string,unknown>,targetHash:string,reviewRecipe:string,reviewer:string):ReviewReceipt {
 if(value.targetHash!==targetHash||!['pass','fail'].includes(value.verdict as string)||typeof value.note!=='string'||!value.note.trim())throw Error('Invalid fidelity review reply');
 return {targetHash,reviewRecipe,reviewer,verdict:value.verdict as 'pass'|'fail',note:value.note};
}
function current(target:string,review:ReviewReceipt|undefined,recipe:string){try{requireReview(target,review,recipe);return true;}catch{return false;}}
/** Runs only against a fixed request outside the graph lock. Publication revalidates the complete snapshot. */
export async function completeRetrieval(request:Request,options:Options):Promise<RetrievalStore> {
 const recipes=authorRecipes();if(retrievalHash(request.recipes)!==retrievalHash(recipes))throw Error('Unsupported author recipe; fixed independent evaluation is required before changing models');
 const previous=request.previous,store:RetrievalStore={version:1,recipes,indices:{},embeddings:previous?.embeddings??{recipe:RETRIEVAL_ENCODER,entries:[]},pairs:[]};
 const checkpoint=()=>options.checkpoint?.(store),reviewer=options.reviewer??'codex:gpt-6.1-sol:medium:cli0.167.2';
 const work=retrievalWork(request.inputs,previous,recipes),missing=new Set(work.index);
 for(const input of request.inputs)if(!missing.has(input.id))store.indices[input.id]=structuredClone(previous!.indices[input.id]);
 for(const slug of new Set(request.inputs.map(i=>i.slug))) {
  const article=request.inputs.filter(i=>i.slug===slug),needed=article.filter(i=>missing.has(i.id));
  for(let offset=0;offset<needed.length;offset+=20){
   const batch=needed.slice(offset,offset+20),targets=batch.map(({articleBody:_,textHash:__,slug:___,...rest})=>rest);
   const generated=rows(await options.generate('index',{articleBody:article[0].articleBody,targets}),'entries',batch.map(i=>i.id));
   for(const input of batch){const {id:_,...value}=generated.find(e=>e.id===input.id)!;const index=value as unknown as RetrievalStore['indices'][string]['index'];validateIndex(input,index);store.indices[input.id]={inputHash:retrievalHash(input),text:input.text,textHash:input.textHash,index};}checkpoint();
  }
  const toReview=article.filter(i=>!current(indexReviewTarget(i,store.indices[i.id].index,recipes.indexRecipe),store.indices[i.id].review,recipes.indexReviewRecipe));
  for(let offset=0;offset<toReview.length;offset+=20){
   const batch=toReview.slice(offset,offset+20),tasks=batch.map(input=>({id:input.id,targetHash:indexReviewTarget(input,store.indices[input.id].index,recipes.indexRecipe),input:(({articleBody:_,...rest})=>rest)(input),index:store.indices[input.id].index}));
   const reviews=rows(await options.generate('index-review',{articleBody:article[0].articleBody,tasks}),'reviews',tasks.map(t=>t.id));
   for(const task of tasks)store.indices[task.id].review=receipt(reviews.find(v=>v.id===task.id)!,task.targetHash,recipes.indexReviewRecipe,reviewer);checkpoint();
   for(const task of tasks)requireReview(task.targetHash,store.indices[task.id].review,recipes.indexReviewRecipe);
  }
 }
 const embeddingInput=request.inputs.map(i=>({id:i.id,text:indexEmbeddingText(store.indices[i.id].index)}));
 try{validateRetrievalEmbeddings(embeddingInput,store.embeddings);}catch{store.embeddings=await options.encode(embeddingInput.map(e=>({...e,textHash:retrievalHash(e.text)})),store.embeddings);validateRetrievalEmbeddings(embeddingInput,store.embeddings);}checkpoint();
 const embedded=new Map(store.embeddings.entries.map(e=>[e.id,e])),raw=new Map(request.raw.map(e=>[e.id,e]));
 const candidates=candidateLists(request.inputs.map(i=>{const r=raw.get(i.id);if(!r||r.textHash!==i.textHash)throw Error('Stale raw search input');return {id:i.id,slug:i.slug,indexVector:embedded.get(i.id)!.vector,rawVector:r.vector};}));
 const inputs=new Map(request.inputs.map(i=>[i.id,i])),targets=new Map(request.inputs.map(i=>[i.id,indexReviewTarget(i,store.indices[i.id].index,recipes.indexRecipe)]));
 const pairKey=(q:string,c:string)=>JSON.stringify([q,c]),prior=new Map((previous?.pairs??[]).map(p=>[pairKey(p.query,p.candidate),p]));
 const source=(id:string)=>({...(({articleBody:_,...rest})=>rest)(inputs.get(id)!),index:store.indices[id].index});
 for(const query of request.inputs){
  const list=candidates[query.id].candidates,selected=new Map<string,ReviewedPair>();
  for(const c of list){const p=prior.get(pairKey(query.id,c.id));if(p&&p.recipe===recipes.pairRecipe&&p.queryTarget===targets.get(query.id)&&p.candidateTarget===targets.get(c.id))selected.set(c.id,structuredClone(p));}
  const needed=list.filter(c=>!selected.has(c.id));
  if(needed.length){
   const generated=rows(await options.generate('pair',{query:source(query.id),candidates:candidateOrder[needed.length].map(at=>source(needed[at].id))}),'pairs',needed.map(c=>c.id));
   for(const e of generated){const id=e.id as string,candidate=inputs.get(id)!;if(!['direct','contrast','useful-context','weak','unrelated'].includes(e.relation as string)||(Number(e.grade)>=2&&['weak','unrelated'].includes(e.relation as string))||!Number.isInteger(e.grade)||Number(e.grade)<0||Number(e.grade)>3||typeof e.reason!=='string'||!e.reason.trim()||e.reason.length>150)throw Error('Invalid pair judgment');
    for(const [key,text] of [['querySupport',query.text],['candidateSupport',candidate.text]])if(typeof e[key]!=='string'||(e[key]&&!text.includes(e[key] as string))||(Number(e.grade)>=2&&!e[key]))throw Error('Invented or missing pair support');
    selected.set(id,{query:query.id,candidate:id,queryTarget:targets.get(query.id)!,candidateTarget:targets.get(id)!,grade:Number(e.grade),reason:e.reason,recipe:recipes.pairRecipe});
   }
  }
  const pairs=list.map(c=>selected.get(c.id)!);store.pairs.push(...pairs);checkpoint();
  const unchecked=pairs.filter(({review,...p})=>!current(pairReviewTarget(p),review,recipes.pairReviewRecipe));
  if(unchecked.length){
   const tasks=unchecked.map(({review:_,...p})=>({id:p.candidate,targetHash:pairReviewTarget(p),query:(({index:_,...rest})=>rest)(source(p.query)),candidate:(({index:_,...rest})=>rest)(source(p.candidate)),decision:p}));
   const reviews=rows(await options.generate('pair-review',{tasks}),'reviews',tasks.map(t=>t.id));
   for(const task of tasks)selected.get(task.id)!.review=receipt(reviews.find(v=>v.id===task.id)!,task.targetHash,recipes.pairReviewRecipe,reviewer);checkpoint();
   for(const task of tasks)requireReview(task.targetHash,selected.get(task.id)!.review,recipes.pairReviewRecipe);
  }
 }
 readRetrievalStore(request.inputs,request.raw,store,recipes);return store;
}
