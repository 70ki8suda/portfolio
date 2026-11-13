import { expect, it } from 'vitest';
import { readRelatedParagraphs, type ReviewedRetrieval } from './relatedParagraphs';
const nodes=[{id:'a:p',slug:'a'},{id:'b:p',slug:'b'}];
const h='a'.repeat(64);
const retrieval: ReviewedRetrieval={version:1,corpusHash:h,recipeHash:h,queries:{'a:p':{candidateFingerprint:h,reviewHash:h,items:[]},'b:p':{candidateFingerprint:h,reviewHash:h,items:[]}}};
it('keeps legacy, reviewed empty and invalid payload distinct',()=>{
 expect(readRelatedParagraphs(undefined,nodes,'a:p')).toEqual({state:'legacy'});
 expect(readRelatedParagraphs(retrieval,nodes,'a:p')).toEqual({state:'reviewed',items:[]});
 for(const invalid of [null,{}, {...retrieval,version:2},{...retrieval,queries:{}}, {...retrieval,queries:{...retrieval.queries,'a:p':null}}]) expect(readRelatedParagraphs(invalid,nodes,'a:p').state).toBe('invalid');
});
it('requires full reference coverage, cross-article distinct targets, hashes and reasons',()=>{
 for(const items of [[{id:'missing',reason:'共有'}],[{id:'a:p',reason:'同記事'}],[{id:'b:p',reason:''}],[{id:'b:p',reason:'共有'},{id:'b:p',reason:'重複'}]]) {
  const value=structuredClone(retrieval);value.queries['a:p'].items=items; expect(readRelatedParagraphs(value,nodes,'a:p').state).toBe('invalid');
 }
 const value=structuredClone(retrieval);value.queries['a:p'].items=[{id:'b:p',reason:'対象の違いを含む共有論点'}];
 expect(readRelatedParagraphs(value,nodes,'a:p')).toEqual({state:'reviewed',items:value.queries['a:p'].items});
 value.queries['b:p'].reviewHash='';expect(readRelatedParagraphs(value,nodes,'a:p').state).toBe('invalid');
});

const summary={subject:'対象',claim:'主張',question:'問い',speaker:'筆者',qualifications:''};
const local=()=>({version:2,mode:'local-index',corpusHash:h,recipeHash:h,
 indices:Object.fromEntries(nodes.map(n=>[n.id,{inputHash:h,indexHash:h,...summary}])),
 queries:Object.fromEntries(nodes.map(n=>[n.id,{rankingHash:h,items:[] as {id:string;score:number}[]}]))});
it('distinguishes local unreviewed relations and valid empty from reviewed or invalid',()=>{
 expect(readRelatedParagraphs(local(),nodes,'a:p')).toEqual({state:'local',items:[],index:summary});
 const value=local();value.queries['a:p'].items=[{id:'b:p',score:1.2}];
 expect(readRelatedParagraphs(value,nodes,'a:p')).toEqual({state:'local',items:[{id:'b:p',score:1.2,index:summary}],index:summary});
});
it('rejects incomplete, misleading or malformed local payloads as a whole',()=>{
 for(const mutate of [
  (v:any)=>delete v.indices['b:p'],
  (v:any)=>v.indices['b:p'].claim='',
  (v:any)=>v.queries['b:p'].rankingHash='old',
  (v:any)=>v.queries['b:p'].items=[{id:'a:p',score:NaN}],
  (v:any)=>v.queries['a:p'].items=[{id:'b:p',score:1,reason:'審査済み'}],
  (v:any)=>v.queries['a:p'].items=[{id:'a:p',score:1}],
  (v:any)=>v.queries['a:p'].reviewHash=h,
  (v:any)=>v.mode='reviewed',
 ]){const value=local();mutate(value);expect(readRelatedParagraphs(value,nodes,'a:p').state).toBe('invalid');}
});
