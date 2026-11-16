import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {claimSource} from '../../scripts/claim-source';
import {prepareClaims,sha,type ClaimDraft} from '../../scripts/claim-preview-data';
import {claimReviewTarget,checkClaimCache,type ClaimCache} from '../../scripts/claim-cache';
import type {GraphData} from './graphTypes';
const base:GraphData=JSON.parse(readFileSync('public/paragraph-graph.json','utf8'));
const slug='amodei-altman-ai-futures',raw=readFileSync(`content/posts/${slug}.md`,'utf8');
const inventory=claimSource(raw),p=inventory.paragraphs[0];
const article:ClaimDraft['articles'][number]={slug,sourceHash:sha(raw),claims:[{key:'a',sectionId:p.sectionId,summary:p.text,speaker:'筆者',stance:'author',conditions:[],evidence:[{anchor:p.anchor,quote:p.text}]}],coverage:inventory.sections.map(s=>({sectionId:s.id,claimKeys:s.id===p.sectionId?['a']:[],note:'synthetic only'}))};
const recipe='1'.repeat(64),report='independent fixture: required 0';
function fixture():ClaimCache {return {version:1,state:'staging',recipeHash:recipe,articles:[structuredClone(article)],reviews:[{slug,targetHash:claimReviewTarget(article,raw,recipe),reportHash:sha(report),required:0,reviewer:'independent-fixture'}],overrides:[]};}
const check=(c:ClaimCache,eligible=[slug,'pending'])=>checkClaimCache(c,{[slug]:raw},base,eligible,{[sha(report)]:report},recipe);
it('accepts an explicit article set without weakening the legacy three-article default',()=>{
 expect(prepareClaims({version:2,articles:[article]},{[slug]:raw},base,[slug]).nodes).toHaveLength(1);
 expect(()=>prepareClaims({version:2,articles:[article]},{[slug]:raw},base)).toThrow();
 expect(()=>prepareClaims({version:2,articles:[article]},{[slug]:raw},base,[slug,slug])).toThrow();
});
it('distinguishes staging pending from active completeness, including later additions and deletions',()=>{
 expect(check(fixture()).pendingSlugs).toEqual(['pending']);
 const c=fixture();c.state='active';expect(()=>check(c)).toThrow('Incomplete active');
 expect(check(c,[slug]).pendingSlugs).toEqual([]);
 expect(()=>check(c,[])).toThrow('Ineligible');
});
it('invalidates review on every semantic or coverage change even with unchanged source',()=>{
 for(const mutate of [
  (c:ClaimCache)=>{c.articles[0].claims[0].summary+='変更';},
  (c:ClaimCache)=>{c.articles[0].claims[0].label='変更';},
  (c:ClaimCache)=>{c.articles[0].claims[0].conditions.push('条件');},
  (c:ClaimCache)=>{c.articles[0].claims[0].relatedPoints=[{text:'補足',speaker:'筆者',conditions:[],evidence:c.articles[0].claims[0].evidence}];},
  (c:ClaimCache)=>{c.articles[0].coverage[0].note+='変更';},
  
 ]){const c=fixture();mutate(c);expect(()=>check(c)).toThrow('Review target');}
});
it('rejects absent, duplicate, failed and altered review reports',()=>{
 const missing=fixture();missing.reviews=[];expect(()=>check(missing)).toThrow();
 const duplicate=fixture();duplicate.reviews.push(duplicate.reviews[0]);expect(()=>check(duplicate)).toThrow();
 const failed=fixture();failed.reviews[0].required=1;expect(()=>check(failed)).toThrow();
 expect(()=>checkClaimCache(fixture(),{[slug]:raw},base,[slug],{[sha(report)]:'altered'},recipe)).toThrow('Review report');
});
it('binds human overrides to the reviewed target and never bypasses source or quote validation',()=>{
 const c=fixture();c.overrides=[{slug,targetHash:c.reviews[0].targetHash,scope:'claim',claimKeys:['a'],reason:'reviewed human decision'}];expect(check(c).prepared.nodes).toHaveLength(1);
 c.overrides[0].claimKeys=['other'];expect(()=>check(c)).toThrow('Override');
 c.overrides[0].claimKeys=['a'];c.overrides[0].targetHash='0'.repeat(64);expect(()=>check(c)).toThrow('Override');
 const bad=fixture();bad.articles[0].claims[0].evidence[0].quote='not in source';bad.reviews[0].targetHash=claimReviewTarget(bad.articles[0],raw,recipe);expect(()=>check(bad)).toThrow('Evidence mismatch');
});
it('rejects an internally consistent obsolete recipe against the current external recipe',()=>{
 expect(()=>checkClaimCache(fixture(),{[slug]:raw},base,[slug],{[sha(report)]:report},'2'.repeat(64))).toThrow('Expected recipe');
});
it('requires primary and additional sections to match central evidence, while supplements may use another section',()=>{
 for(const mutate of [
 (a:typeof article)=>{a.claims[0].additionalSections=['nonexistent'];},
 (a:typeof article)=>{const other=inventory.sections.find(s=>s.id!==p.sectionId)!;a.claims[0].sectionId=other.id;a.coverage.find(c=>c.sectionId===other.id)!.claimKeys=['a'];},
 (a:typeof article)=>{a.claims[0].additionalSections=[p.sectionId];},
 ]){const a=structuredClone(article);mutate(a);expect(()=>prepareClaims({version:2,articles:[a]},{[slug]:raw},base,[slug])).toThrow('Evidence sections');}
});
it('accepts a primary section supported only by a table without inventing a paragraph',()=>{
 const raw='---\ntitle: test\n---\n## Table {#table}\n\n| A | B |\n| --- | --- |\n| C | D |\n';const inv=claimSource(raw),block=inv.blocks[0];
 const a:typeof article={slug,sourceHash:sha(raw),claims:[{key:'table',sectionId:'table',summary:'Table summary',speaker:'author',stance:'author',conditions:[],evidence:[{blockId:block.id,quote:block.text}]}],coverage:inv.sections.map(s=>({sectionId:s.id,claimKeys:s.id==='table'?['table']:[],note:'fixture'}))};
 const result=prepareClaims({version:2,articles:[a]},{[slug]:raw},base,[slug]);expect(result.nodes).toHaveLength(1);expect(result.claims[result.nodes[0].id].evidence[0].anchor).toBe('table');
});
