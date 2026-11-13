import {expect,it,vi} from 'vitest';
import packageLock from '../../package-lock.json';
import {coverageTarget,impactTarget,indexCacheWork,sectionDependencies,type IndexCacheEntry} from '../../scripts/retrieval-index-cache';
import {indexReviewTarget,type RetrievalInput,type ReviewReceipt} from '../../scripts/retrieval-gate';
const recipes={indexRecipe:'index',indexReviewRecipe:'fidelity',coverageRecipe:'coverage',impactRecipe:'impact'};
const origin:RetrievalInput={id:'a:p',slug:'a',text:'主張です。',textHash:'hash',title:'記事',section:'主題',previous:'',next:'',articleBody:'導入\n\n## 主題\n\n主張です。\n\n## 別の節\n\n旧文。\n',stance:'author',context:'筆者'};
const index={subject:'主題',claim:'主張です。',question:'問い',speaker:'筆者',qualifications:'',support:'主張です。',contextSupport:''};
const review=(targetHash:string,reviewRecipe:string):ReviewReceipt=>({targetHash,reviewRecipe,reviewer:'independent',verdict:'pass',note:'原文と全fieldを照合'});
function entry():IndexCacheEntry{return {version:1,origin,index,recipe:recipes.indexRecipe,review:review(indexReviewTarget(origin,index,recipes.indexRecipe),recipes.indexReviewRecipe)};}
const changed=(suffix:string)=>({...origin,articleBody:origin.articleBody.replace('旧文。',suffix)});
function covered(){const e=entry();e.coverage={sections:['主題'],review:review(coverageTarget(e,['主題'],recipes.coverageRecipe),recipes.coverageRecipe)};return e;}
it('requires fresh indices for changed direct context and never silently accepts absent review',()=>{
 expect(indexCacheWork(origin,undefined,recipes).kind).toBe('index');
 expect(indexCacheWork(origin,entry(),recipes).kind).toBe('reuse');
 expect(indexCacheWork({...origin,previous:'新しい留保'},entry(),recipes).kind).toBe('index');
 const e=entry();delete e.review;expect(indexCacheWork(origin,e,recipes).kind).toBe('index-review');
});
it('uses raw AST sections including tables and ignores headings inside fenced code',()=>{
 const body='冒頭\n\n## 主題\n\n|表|\n|-|\n|値|\n\n```md\n## 偽見出し\n```\n\n### 子節\n\n条件\n\n## 別の節\n\n別文';
 expect(sectionDependencies(body,['主題'])[0].text).toContain('## 偽見出し');
 expect(sectionDependencies(body,['主題'])[0].text).toContain('条件');
 expect(sectionDependencies(body,['主題'])[0].text).not.toContain('別文');
 expect(()=>sectionDependencies('## 同名\nA\n## 同名\nB',['同名'])).toThrow();
});
it('defaults body changes to coverage then origin-to-current impact, not automatic reuse',()=>{
 const current=changed('新文。');expect(indexCacheWork(current,entry(),recipes).kind).toBe('coverage');
 const e=covered();expect(indexCacheWork(current,e,recipes).kind).toBe('impact');
 e.impact=review(impactTarget(e,current,recipes),recipes.impactRecipe);
 expect(indexCacheWork(current,e,recipes).kind).toBe('reuse');
 // B0→B1 evidence must not certify B0→B2, even if selected sections still match.
 expect(indexCacheWork(changed('さらに新文。'),e,recipes).kind).toBe('impact');
 expect(e.origin.articleBody).toBe(origin.articleBody);
});
it('cannot override a changed dependency, dropped own section or unsupported context with impact',()=>{
 const e=covered();const current={...origin,articleBody:origin.articleBody.replace('主張です。','主張と条件です。')};
 expect(indexCacheWork(current,e,recipes).kind).toBe('index');
 expect(()=>coverageTarget(e,['別の節'],recipes.coverageRecipe)).toThrow();
 const dependent=entry();dependent.index={...index,contextSupport:'旧文。'};
 expect(()=>coverageTarget(dependent,['主題'],recipes.coverageRecipe)).toThrow();
});
it('binds coverage and impact to original index, recipes and current full input',()=>{
 const e=covered(),current=changed('新文。');e.impact=review(impactTarget(e,current,recipes),recipes.impactRecipe);
 const changedIndex={...e,index:{...e.index,question:'別の問い'}};
 expect(indexCacheWork(current,changedIndex,recipes).kind).not.toBe('reuse');
 expect(indexCacheWork(current,e,{...recipes,impactRecipe:'new-impact'}).kind).toBe('impact');
 e.impact.verdict='fail';expect(indexCacheWork(current,e,recipes).kind).toBe('index');
});

it('invalidates changed expected recipes even with identical input; stale scope reviews cannot authorize reuse',()=>{
 const e=covered();
 expect(indexCacheWork(origin,e,{...recipes,indexRecipe:'new-index'}).kind).toBe('index');
 expect(indexCacheWork(origin,e,{...recipes,indexReviewRecipe:'new-fidelity'}).kind).toBe('index-review');
 expect(indexCacheWork(changed('新文。'),e,{...recipes,coverageRecipe:'new-coverage'}).kind).toBe('coverage');
 e.coverage!.review.targetHash='old-extraction-target';
 expect(indexCacheWork(changed('新文。'),e,recipes).kind).toBe('coverage');
});
it('covers heading-free and Setext bodies, and refuses renamed or missing dependency paths',()=>{
 expect(sectionDependencies('見出しなし。',[''])).toEqual([{key:'',text:'見出しなし。'}]);
 expect(sectionDependencies('導入\n\n主題\n----\n\n本文\n',['主題'])[0].text).toContain('本文');
 const e=covered();
 expect(indexCacheWork({...origin,articleBody:origin.articleBody.replace('## 主題','## 改名')},e,recipes).kind).toBe('index');
});

import {createIndexCacheRequest,applyIndexCacheReply} from '../../scripts/retrieval-index-cache';
it('plans deleted IDs separately and accepts only complete current cache replies',()=>{
 const previous={'a:p':entry(),'removed:p':{...entry(),origin:{...origin,id:'removed:p',slug:'removed'}}};
 const request=createIndexCacheRequest('snapshot',[origin],previous,recipes);
 expect(request.removed).toEqual(['removed:p']);expect(request.work['a:p'].kind).toBe('reuse');
 expect(applyIndexCacheReply(request,{requestHash:request.requestHash,entries:{'a:p':entry()}})).toEqual({'a:p':entry()});
 expect(()=>applyIndexCacheReply(request,{requestHash:request.requestHash,entries:previous})).toThrow();
 expect(()=>applyIndexCacheReply(request,{requestHash:request.requestHash,entries:{}})).toThrow();
});
it('binds replies to current input, previous evidence and the external graph snapshot',()=>{
 const request=createIndexCacheRequest('snapshot',[origin],{'a:p':entry()},recipes);
 const reply={requestHash:request.requestHash,entries:{'a:p':entry()}};
 const next=createIndexCacheRequest('new-snapshot',[origin],{'a:p':entry()},recipes);
 expect(()=>applyIndexCacheReply(next,reply)).toThrow();
 expect(()=>applyIndexCacheReply({...request,inputs:[changed('新文。')]},reply)).toThrow();
 const failed=entry();failed.review!.verdict='fail';
 expect(()=>applyIndexCacheReply(request,{...reply,entries:{'a:p':failed}})).toThrow();
});

import {dependencyExtractionRecipe} from '../../scripts/retrieval-index-cache';
it('binds transitive parser dependency updates even when direct package versions stay unchanged',()=>{
 const lock={packages:{'node_modules/remark-parse':{version:'11.0.0'},'node_modules/micromark':{version:'4.0.1',integrity:'old'}}};
 const next=structuredClone(lock);next.packages['node_modules/micromark']={version:'4.0.2',integrity:'new'};
 expect(dependencyExtractionRecipe(next)).not.toBe(dependencyExtractionRecipe(lock));
});

it('rejects old coverage after a transitive parser change without changing the original fidelity evidence',async()=>{
 const old=covered(),current=changed('新文。');old.impact=review(impactTarget(old,current,recipes),recipes.impactRecipe);
 const lock=structuredClone(packageLock);lock.packages['node_modules/micromark'].version+='-changed';
 vi.resetModules();vi.doMock('../../package-lock.json',()=>({default:lock}));
 try {
  const updated=await import('../../scripts/retrieval-index-cache');
  expect(updated.coverageTarget(old,['主題'],recipes.coverageRecipe)).not.toBe(old.coverage!.review.targetHash);
  expect(updated.indexCacheWork(current,old,recipes).kind).toBe('coverage');
  expect(updated.indexCacheWork(origin,old,recipes).kind).toBe('reuse'); // no narrowed dependency judgment used
 } finally {vi.doUnmock('../../package-lock.json');vi.resetModules();}
});
