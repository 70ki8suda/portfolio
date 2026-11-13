import {retrievalHash,indexReviewTarget,requireReview,validateIndex,type RetrievalInput,type RetrievalIndex,type ReviewReceipt} from './retrieval-gate';
import {unified} from 'unified';
import remarkParse from 'remark-parse';
import {toString} from 'mdast-util-to-string';
import packageLock from '../package-lock.json';

// Conservatively bind the full resolved lock so transitive AST parser updates cannot
// silently reuse coverage judgments. Unrelated lock changes may require new coverage.
export function dependencyExtractionRecipe(lock:unknown):string {
  return retrievalHash({algorithm:'raw-heading-subtree-path-v1',plugins:[],
    path:'toString; strip explicit anchor; slash-joined ancestors; reject duplicates',
    slice:'start offset through next depth<=current; intro through first heading',
    dependencyLockHash:retrievalHash(lock)});
}
export const DEPENDENCY_RECIPE=dependencyExtractionRecipe(packageLock);
export type IndexCacheRecipes={indexRecipe:string;indexReviewRecipe:string;coverageRecipe:string;impactRecipe:string};
export type IndexCacheEntry={version:1;origin:RetrievalInput;index:RetrievalIndex;recipe:string;review?:ReviewReceipt;coverage?:{sections:string[];review:ReviewReceipt};impact?:ReviewReceipt};
export type IndexWork={kind:'index'|'index-review'|'coverage'|'impact'|'reuse';reason:string;targetHash?:string};
/** Return entire raw sections, including descendants, tables, code and excluded prose. */
export function sectionDependencies(body:string,sections:string[]):{key:string;text:string}[] {
  if(!sections.length || new Set(sections).size!==sections.length)throw new Error('Empty or duplicate dependency selection');
  const tree=unified().use(remarkParse).parse(body);
  const stack:{depth:number;text:string}[]=[], headings:{key:string;depth:number;start:number}[]=[];
  for(const node of tree.children)if(node.type==='heading') {
    const start=node.position?.start.offset;if(start===undefined)throw new Error('Heading offset missing');
    while(stack.length && stack.at(-1)!.depth>=node.depth)stack.pop();
    stack.push({depth:node.depth,text:toString(node).replace(/\s+\{#[^}]+\}$/,'')});
    headings.push({key:stack.map(h=>h.text).join(' / '),depth:node.depth,start});
  }
  const names=new Set<string>();
  for(const h of headings){if(!h.key || names.has(h.key))throw new Error('Ambiguous dependency section');names.add(h.key);}
  const available=new Map<string,string>([['',body.slice(0,headings[0]?.start??body.length)]]);
  headings.forEach((h,i)=>{const next=headings.slice(i+1).find(n=>n.depth<=h.depth);available.set(h.key,body.slice(h.start,next?.start??body.length));});
  return [...sections].sort().map(key=>{const text=available.get(key);if(text===undefined)throw new Error('Missing dependency section');return {key,text};});
}
const originTarget=(entry:IndexCacheEntry)=>indexReviewTarget(entry.origin,entry.index,entry.recipe);
function originDependencies(entry:IndexCacheEntry,sections:string[]) {
  if(!sections.includes(entry.origin.section))throw new Error('Own section must be covered');
  const dependencies=sectionDependencies(entry.origin.articleBody,sections);
  if(entry.index.contextSupport && !dependencies.some(d=>d.text.includes(entry.index.contextSupport)))throw new Error('Uncovered context support');
  return dependencies;
}
export function coverageTarget(entry:IndexCacheEntry,sections:string[],recipe:string):string {
  return retrievalHash({kind:'index-dependency-coverage',dependencyRecipe:DEPENDENCY_RECIPE,originInputHash:retrievalHash(entry.origin),indexTarget:originTarget(entry),
    dependencies:originDependencies(entry,sections),covers:['subject','claim','question','speaker','qualifications'],recipe});
}
export function impactTarget(entry:IndexCacheEntry,current:RetrievalInput,recipes:IndexCacheRecipes):string {
  if(!entry.coverage)throw new Error('Coverage required before impact');
  const before=originDependencies(entry,entry.coverage.sections),after=sectionDependencies(current.articleBody,entry.coverage.sections);
  if(retrievalHash(before)!==retrievalHash(after))throw new Error('Changed dependency cannot be overridden');
  const {articleBody:_oldBody,...oldDirect}=entry.origin,{articleBody:_newBody,...newDirect}=current;
  if(retrievalHash(oldDirect)!==retrievalHash(newDirect))throw new Error('Changed direct context cannot be overridden');
  return retrievalHash({kind:'index-origin-to-current-impact',originInputHash:retrievalHash(entry.origin),currentInputHash:retrievalHash(current),
    indexTarget:originTarget(entry),coverageTarget:coverageTarget(entry,entry.coverage.sections,recipes.coverageRecipe),
    dependencyHash:retrievalHash(before),recipe:recipes.impactRecipe});
}
export function indexCacheWork(current:RetrievalInput,entry:IndexCacheEntry|undefined,recipes:IndexCacheRecipes):IndexWork {
  if(!entry || entry.version!==1 || entry.recipe!==recipes.indexRecipe)return {kind:'index',reason:'Missing index or changed author recipe'};
  const {articleBody:_oldBody,...oldDirect}=entry.origin,{articleBody:_newBody,...newDirect}=current;
  if(retrievalHash(oldDirect)!==retrievalHash(newDirect))return {kind:'index',reason:'Changed original text or direct context'};
  try{validateIndex(entry.origin,entry.index);}catch{return {kind:'index',reason:'Invalid original index'};}
  const target=originTarget(entry);
  try{requireReview(target,entry.review,recipes.indexReviewRecipe);}catch{return {kind:'index-review',reason:'Origin fidelity review required',targetHash:target};}
  if(retrievalHash(entry.origin)===retrievalHash(current))return {kind:'reuse',reason:'Exact original input and fidelity receipt'};
  if(!entry.coverage)return {kind:'coverage',reason:'Whole-article dependency: narrowed coverage not reviewed'};
  let coverage:string;
  try{coverage=coverageTarget(entry,entry.coverage.sections,recipes.coverageRecipe);}catch{return {kind:'index',reason:'Dependencies cannot be resolved safely'};}
  if(entry.coverage.review.targetHash===coverage && entry.coverage.review.reviewRecipe===recipes.coverageRecipe && entry.coverage.review.verdict==='fail')return {kind:'index',reason:'Dependency coverage rejected'};
  try{requireReview(coverage,entry.coverage.review,recipes.coverageRecipe);}catch{return {kind:'coverage',reason:'Missing or stale dependency coverage review',targetHash:coverage};}
  let impact:string;
  try{impact=impactTarget(entry,current,recipes);}catch{return {kind:'index',reason:'Selected dependency changed or missing'};}
  if(entry.impact?.targetHash===impact && entry.impact.reviewRecipe===recipes.impactRecipe && entry.impact.verdict==='fail')return {kind:'index',reason:'Current revision impacts the original index'};
  try{requireReview(impact,entry.impact,recipes.impactRecipe);}catch{return {kind:'impact',reason:'Origin-to-current article impact review required',targetHash:impact};}
  return {kind:'reuse',reason:'Original fidelity, dependency coverage and current impact all verified'};
}

export type IndexCacheRequest={version:1;kind:'index-cache';snapshotHash:string;inputs:RetrievalInput[];
  previous:Record<string,IndexCacheEntry>;recipes:IndexCacheRecipes;dependencyRecipe:string;requestHash:string;
  work:Record<string,IndexWork>;removed:string[];instructions:string};
export function createIndexCacheRequest(snapshotHash:string,inputs:RetrievalInput[],previous:Record<string,IndexCacheEntry>,recipes:IndexCacheRecipes):IndexCacheRequest {
  const ids=new Set(inputs.map(i=>i.id));if(ids.size!==inputs.length)throw new Error('Duplicate cache input ID');
  const base={version:1 as const,kind:'index-cache' as const,snapshotHash,inputs,previous,recipes,dependencyRecipe:DEPENDENCY_RECIPE};
  return {...base,requestHash:retrievalHash(base),work:Object.fromEntries(inputs.map(input=>[input.id,indexCacheWork(input,Object.hasOwn(previous,input.id)?previous[input.id]:undefined,recipes)])),
    removed:Object.keys(previous).filter(id=>!ids.has(id)).sort(),
    instructions:'Read full origin and current articles. Generate only changed indices and review their fidelity. Optional dependency narrowing requires all-field coverage plus a direct origin-to-current impact review. Never override changed dependencies. Unknown impact requires a fresh index and review; narrowing is optional. Return all current entries with original evidence intact. Do not generate pair judgments or reasons. Recompute rankings locally after index embedding updates.'};
}
/** Caller must obtain this request under the existing graph snapshot/lock and recheck sources before publication. */
export function applyIndexCacheReply(request:IndexCacheRequest,reply:unknown):Record<string,IndexCacheEntry> {
  const current=createIndexCacheRequest(request.snapshotHash,request.inputs,request.previous,request.recipes);
  if(request.version!==1||request.kind!=='index-cache'||request.dependencyRecipe!==DEPENDENCY_RECIPE||current.requestHash!==request.requestHash)throw new Error('Modified or incompatible index request');
  if(!reply || typeof reply!=='object' || Array.isArray(reply) || !('requestHash' in reply) || reply.requestHash!==request.requestHash || !('entries' in reply)
    || !reply.entries || typeof reply.entries!=='object' || Array.isArray(reply.entries))throw new Error('Missing or stale index cache reply');
  const entries=reply.entries as Record<string,IndexCacheEntry>;
  if(Object.keys(entries).length!==request.inputs.length || request.inputs.some(i=>!Object.hasOwn(entries,i.id)))throw new Error('Incomplete or removed index cache IDs');
  for(const input of request.inputs)if(indexCacheWork(input,entries[input.id],request.recipes).kind!=='reuse')throw new Error(`Unresolved index cache: ${input.id}`);
  return entries;
}
