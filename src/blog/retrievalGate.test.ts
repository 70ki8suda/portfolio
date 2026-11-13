import {CANDIDATE_RECIPE} from '../../scripts/retrieval-gate';
import { describe, expect, it } from 'vitest';
import { readRelatedParagraphs } from './relatedParagraphs';
import { indexReviewTarget, pairReviewTarget, requireReview, candidateLists, selectRelated, retrievalHash, type RetrievalInput, type RetrievalIndex, type ReviewReceipt } from '../../scripts/retrieval-gate';
const input: RetrievalInput = { id:'a:p', slug:'a', text:'資源を共有するなら負担も分ける。', textHash:'text', title:'共有', section:'条件', previous:'', next:'', articleBody:'資源を共有するなら負担も分ける。', stance:'author', context:'条件付きの筆者仮説' };
const index: RetrievalIndex = { subject:'資源の共有', claim:'資源を共有するなら負担も分ける。', question:'共有には何が必要か', speaker:'筆者', qualifications:'条件付き', support:'資源を共有するなら負担も分ける。', contextSupport:'' };
const recipe='generation-v1', reviewRecipe='independent-fidelity-v1';
function receipt(targetHash:string): ReviewReceipt { return {targetHash, reviewRecipe, reviewer:'independent-reviewer', verdict:'pass', note:'原段落と条件・帰属を照合'}; }
describe('retrieval publication fidelity gate',()=>{
 it('binds index approval to full input, index and recipe',()=>{
  const target=indexReviewTarget(input,index,recipe), audit=receipt(target);
  expect(()=>requireReview(target,audit,reviewRecipe)).not.toThrow();
  for(const changed of [{...input,next:'新しい留保'}, {...input,stance:'critic'}, {...input,articleBody:'別の本文'}]) expect(()=>requireReview(indexReviewTarget(changed,index,recipe),audit,reviewRecipe)).toThrow(/review/i);
  expect(()=>requireReview(indexReviewTarget(input,{...index,claim:'負担は必ず分かれる。'},recipe),audit,reviewRecipe)).toThrow(/review/i);
  expect(()=>requireReview(indexReviewTarget(input,index,'v2'),audit,reviewRecipe)).toThrow(/review/i);
 });
 it('requires an explicit passing review with the expected review recipe',()=>{
  const target=indexReviewTarget(input,index,recipe);
  for(const r of [undefined,{...receipt(target),verdict:'fail' as const},{...receipt(target),reviewer:''},{...receipt(target),reviewRecipe:'obsolete'}]) expect(()=>requireReview(target,r,reviewRecipe)).toThrow(/review/i);
 });
 it('binds pair review to direction, both index targets, grade and exact reason',()=>{
  const pair={query:'a:p',candidate:'b:p',queryTarget:'qa',candidateTarget:'cb',grade:2,reason:'共有を論じるが対象は異なる。',recipe};
  const target=pairReviewTarget(pair), audit=receipt(target);
  expect(()=>requireReview(target,audit,reviewRecipe)).not.toThrow();
  for(const change of [{query:'b:p',candidate:'a:p'},{queryTarget:'new'},{candidateTarget:'new'},{grade:3},{reason:'同じ結論である。'},{recipe:'new'}]) expect(()=>requireReview(pairReviewTarget({...pair,...change}),audit,reviewRecipe)).toThrow(/review/i);
 });
});
describe('all-query candidate reconstruction',()=>{
 const row=(id:string,slug:string,v:number[])=>({id,slug,indexVector:v,rawVector:v});
 it('recomputes untouched queries after another article adds a candidate',()=>{
  const old=[row('a:p','a',[1,0]),row('b:p','b',[0,1])];
  const before=candidateLists(old,1,1), after=candidateLists([...old,row('c:p','c',[1,0])],1,1);
  expect(before['a:p'].candidates.map(c=>c.id)).toEqual(['b:p']);
  expect(after['a:p'].candidates.map(c=>c.id)).toEqual(['c:p']);
  expect(after['a:p'].fingerprint).not.toBe(before['a:p'].fingerprint);
 });
 it('fingerprints exact scores even if membership and ordering stay the same',()=>{
  const a=candidateLists([row('a:p','a',[1,0]),row('b:p','b',[0,1])]);
  const b=candidateLists([row('a:p','a',[1,0]),row('b:p','b',[0.1,Math.sqrt(.99)])]);
  expect(a['a:p'].candidates.map(c=>c.id)).toEqual(b['a:p'].candidates.map(c=>c.id));
  expect(a['a:p'].fingerprint).not.toBe(b['a:p'].fingerprint);
 });
 it('excludes same article, drops removed IDs and rejects invalid vectors',()=>{
  const lists=candidateLists([row('a:p','a',[1,0]),row('a:q','a',[1,0])]);
  expect(Object.keys(lists)).toEqual(['a:p','a:q']); expect(lists['a:p'].candidates).toEqual([]);
  expect(()=>candidateLists([row('a:p','a',[NaN,0])])).toThrow();
  expect(()=>candidateLists([row('a:p','a',[1,0]),row('b:p','b',[1])])).toThrow();
 });
 it('allows reviewed empty results and sorts grade before cosine without padding',()=>{
  const cs=[{id:'b:p',indexScore:.99,rawScore:.98},{id:'c:p',indexScore:.7,rawScore:.8}];
  expect(selectRelated(cs,[{id:'b:p',grade:1,reason:'弱い'},{id:'c:p',grade:0,reason:'別主題'}])).toEqual([]);
  expect(selectRelated(cs,[{id:'b:p',grade:2,reason:'部分共有'},{id:'c:p',grade:3,reason:'直接共有'}]).map(x=>x.id)).toEqual(['c:p','b:p']);
  expect(()=>selectRelated(cs,[{id:'b:p',grade:2,reason:'部分共有'}])).toThrow(/coverage/i);
 });
 it('hashes object keys canonically without losing array order',()=>{
  expect(retrievalHash({b:2,a:1})).toBe(retrievalHash({a:1,b:2}));
  expect(retrievalHash(['a','b'])).not.toBe(retrievalHash(['b','a']));
 });
});

import { validateIndex, publishRetrieval, type ReviewedIndex, type ReviewedPair } from '../../scripts/retrieval-gate';
describe('complete reviewed artifact gate',()=>{
 it('rejects invented evidence and missing or overlong index fields',()=>{
  expect(()=>validateIndex(input,index)).not.toThrow();
  expect(()=>validateIndex(input,{...index,support:'本文にない引用'})).toThrow(/support/i);
  expect(()=>validateIndex(input,{...index,contextSupport:'本文にない文脈'})).toThrow(/support/i);
  expect(()=>validateIndex(input,{...index,claim:'長'.repeat(181)})).toThrow(/claim/i);
  expect(()=>validateIndex(input,{...index,speaker:''})).toThrow(/speaker/i);
 });
 function fixture() {
  const inputs=[input,{...input,id:'b:p',slug:'b'}];
  const indices:ReviewedIndex[]=inputs.map(source=>({input:source,index,recipe,review:receipt(indexReviewTarget(source,index,recipe)),indexVector:[1,0],rawVector:[1,0]}));
  const pairs:ReviewedPair[]=indices.map((q,n)=>{const c=indices[1-n];const decision={query:q.input.id,candidate:c.input.id,queryTarget:indexReviewTarget(q.input,q.index,recipe),candidateTarget:indexReviewTarget(c.input,c.index,recipe),grade:1,reason:'対象は似るが直接の論点共有はない。',recipe:'rerank-v1'};return {...decision,review:receipt(pairReviewTarget(decision))};});
  return {inputs,indices,pairs};
 }
 it('rejects a candidate policy that differs from the installed publication policy',()=>{
  const {inputs,indices,pairs}=fixture();
  const recipes={indexRecipe:recipe,pairRecipe:'rerank-v1',indexReviewRecipe:reviewRecipe,pairReviewRecipe:reviewRecipe,candidateRecipe:'incompatible'};
  expect(()=>publishRetrieval(inputs,indices,pairs,recipes)).toThrow(/candidate/i);
 });
 it('binds index and pair audits to their distinct review recipes',()=>{
  const {inputs,indices,pairs}=fixture();
  for(const row of indices)row.review!.reviewRecipe='index-audit';
  for(const row of pairs)row.review!.reviewRecipe='pair-audit';
  const recipes={candidateRecipe:CANDIDATE_RECIPE,indexRecipe:recipe,pairRecipe:'rerank-v1',indexReviewRecipe:'index-audit',pairReviewRecipe:'pair-audit'};
  expect(()=>publishRetrieval(inputs,indices,pairs,recipes)).not.toThrow();
  pairs[0].review!.reviewRecipe='index-audit';
  expect(()=>publishRetrieval(inputs,indices,pairs,recipes)).toThrow(/review/i);
 });
 it('publishes explicitly reviewed empty arrays for every query',()=>{
  const {inputs,indices,pairs}=fixture(); const result=publishRetrieval(inputs,indices,pairs,{candidateRecipe:CANDIDATE_RECIPE,indexRecipe:recipe,pairRecipe:'rerank-v1',indexReviewRecipe:reviewRecipe,pairReviewRecipe:reviewRecipe});
  expect(readRelatedParagraphs(result,inputs,'a:p').state).toBe('reviewed');
  expect(result.version).toBe(1);expect(result.queries['a:p'].items).toEqual([]);expect(result.queries['b:p'].items).toEqual([]);
 });
 it('blocks absent review, stale original input and incomplete pair coverage',()=>{
  const {inputs,indices,pairs}=fixture(), recipes={candidateRecipe:CANDIDATE_RECIPE,indexRecipe:recipe,pairRecipe:'rerank-v1',indexReviewRecipe:reviewRecipe,pairReviewRecipe:reviewRecipe};
  expect(()=>publishRetrieval(inputs,indices,[pairs[0]],recipes)).toThrow(/pair/i);
  expect(()=>publishRetrieval([{...input,next:'変化'},inputs[1]],indices,pairs,recipes)).toThrow(/input/i);
  expect(()=>publishRetrieval(inputs,[{...indices[0],review:undefined},indices[1]],pairs,recipes)).toThrow(/review/i);
  expect(()=>publishRetrieval(inputs,indices,[{...pairs[0],grade:2},pairs[1]],recipes)).toThrow(/review/i);
 });
});

it('rejects overlong reasons at the publication boundary, including rejected candidates',()=>{
 const candidate=[{id:'b:p',indexScore:.9,rawScore:.9}];
 expect(()=>selectRelated(candidate,[{id:'b:p',grade:2,reason:'長'.repeat(1001)}])).toThrow(/reason/i);
 expect(()=>selectRelated(candidate,[{id:'b:p',grade:0,reason:'長'.repeat(1001)}])).toThrow(/reason/i);
 expect(selectRelated(candidate,[{id:'b:p',grade:2,reason:'長'.repeat(1000)}])).toHaveLength(1);
});
