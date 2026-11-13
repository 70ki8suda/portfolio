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
