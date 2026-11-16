import { expect, it, vi } from 'vitest';
import {claimSource} from '../../scripts/claim-source';
import { readFileSync } from 'node:fs';
import { rankClaimCandidates, displayClaimCandidates, CLAIM_PREVIEW_SLUGS, prepareClaims, previewGraph, sha, type ClaimDraft } from '../../scripts/claim-preview-data';
import { claimPreviewServer } from '../../scripts/claim-preview-server';
import type { GraphData } from './graphTypes';
import type { VectorCache } from '../../scripts/graph-pipeline';
const base:GraphData=JSON.parse(readFileSync('public/paragraph-graph.json','utf8'));
const cache:VectorCache=JSON.parse(readFileSync('content/graph-vectors.json','utf8'));
const sources=Object.fromEntries(CLAIM_PREVIEW_SLUGS.map(s=>[s,readFileSync(`content/posts/${s}.md`,'utf8')]));
const fixture=():ClaimDraft=>({version:2,articles:CLAIM_PREVIEW_SLUGS.map(slug=>{
 const n=base.nodes.find(n=>n.slug===slug)!;
 return {slug,sourceHash:sha(sources[slug]),claims:[{key:'example',sectionId:claimSource(sources[slug]).paragraphs.find(p=>p.anchor===n.anchor)!.sectionId,summary:n.text,speaker:'テスト用',stance:'author',conditions:[],evidence:[{anchor:n.anchor,quote:n.text}]}],
 coverage:claimSource(sources[slug]).sections.map(s=>s.id).map(sectionId=>({sectionId,claimKeys:sectionId===claimSource(sources[slug]).paragraphs.find(p=>p.anchor===n.anchor)!.sectionId?['example']:[],note:'synthetic fixture'}))};
})});
it('binds claims to current full source, exact evidence and complete section inventory',()=>{
 const draft=fixture();expect(prepareClaims(draft,sources,base).nodes).toHaveLength(3);
 const stale=structuredClone(draft);stale.articles[0].sourceHash='0'.repeat(64);expect(()=>prepareClaims(stale,sources,base)).toThrow('Stale source');
 const falseQuote=structuredClone(draft);falseQuote.articles[0].claims[0].evidence[0].quote='not in source';expect(()=>prepareClaims(falseQuote,sources,base)).toThrow('Evidence mismatch');
 const missing=structuredClone(draft);missing.articles[0].coverage.pop();expect(()=>prepareClaims(missing,sources,base)).toThrow('Incomplete section inventory');
});
it('retains raw coordinates and creates only in-scope computed cross-article candidates',()=>{
 const nodes=base.nodes.filter(n=>CLAIM_PREVIEW_SLUGS.includes(n.slug));
 const out=previewGraph(base,nodes,cache,'paragraphs');
 expect(out.nodes).toEqual(nodes);expect(out.articles).toEqual(base.articles.filter(a=>CLAIM_PREVIEW_SLUGS.includes(a.slug)));
 for(const [id,list] of Object.entries(out.semanticNeighbors)){expect(list.length).toBeLessThanOrEqual(5);for(const item of list){expect(item.score).toBeGreaterThanOrEqual(.89);expect(out.nodes.find(n=>n.id===item.id)?.slug).not.toBe(out.nodes.find(n=>n.id===id)?.slug);}}
 expect(Object.values(out.conceptNeighbors).every(a=>a.length===0)).toBe(true);
 const invalid=structuredClone(cache);invalid.entries.find(e=>e.id===nodes[0].id)!.x+=10;expect(()=>previewGraph(base,nodes,invalid,'paragraphs')).toThrow('coordinates');
});
it('never serves tmp files with the development switch off or arbitrary paths',async()=>{
 for(const enabled of [false,true]){
 let middleware:Function=()=>{};
 const plugin=claimPreviewServer(enabled);
 (plugin.configureServer as Function)({middlewares:{use:(fn:Function)=>{middleware=fn;}}});
 const response={statusCode:200,end:vi.fn(),setHeader:vi.fn()};
 await middleware({url:enabled?'/__claim-preview/../../private.json':'/__claim-preview/paragraphs.json'},response,vi.fn());
 expect(response.statusCode).toBe(404);
 }
});

it('uses all bundle members, a single five-slot limit and an inclusive unrounded cutoff',()=>{
 const ranked=rankClaimCandidates([[1,0],[0,1]],Array.from({length:8},(_,i)=>({id:`candidate-${i}`,slug:'other',vector:i===0?[.8899999,0]:[0,.9+i/1000]})),'origin');
 const display=displayClaimCandidates(ranked);expect(display).toHaveLength(5);expect(display[0].id).toBe('candidate-7');
 expect(displayClaimCandidates([{id:'under',score:.889999999},{id:'boundary',score:.89}])).toEqual([{id:'boundary',score:.89}]);
 expect(()=>rankClaimCandidates([],[],'origin')).toThrow('Missing query bundle');
});
it('locates tables/lists by exact UTF8 source bytes and gives anonymous headings separate identities',()=>{
 const raw='---\ntitle: 日本語\n---\n## 本文 {#body}\n\n導入です。\n\n- 一つ目\n- 二つ目\n\n## まとめ\n\nまとめです。\n\n| 軸 | 値 |\n| --- | --- |\n| 条件 | 二つ |\n';
 const source=claimSource(raw);expect(source.sections).toHaveLength(3);
 expect(source.sections[2].id).toMatch(/^heading-/);expect(source.sections[2].anchor).toMatch(/^p-/);
 for(const b of source.blocks){expect(Buffer.from(raw).subarray(b.startByte,b.endByte).toString()).toBe(b.markdown);expect(b.sourceHash).toBe(sha(raw));}
 expect(source.blocks[0].text).toBe('一つ目\n二つ目');expect(source.blocks[0].anchor).toBe('body');
 expect(source.blocks[1].text).toBe('軸 | 値\n条件 | 二つ');
});
it('keeps supplementary arguments outside embedding input and preserves their exact source links',()=>{
 const draft=fixture(),before=prepareClaims(draft,sources,base);
 draft.articles[0].claims[0].relatedPoints=[{text:'補足の論点',speaker:'筆者',conditions:['条件'],evidence:draft.articles[0].claims[0].evidence}];
 const after=prepareClaims(draft,sources,base);
 expect(after.nodes).toEqual(before.nodes);
 expect(after.claims[after.nodes[0].id].relatedPoints?.[0].evidence[0].anchor).toBe(before.claims[before.nodes[0].id].evidence[0].anchor);
 draft.articles[0].claims[0].relatedPoints![0].evidence=[{anchor:'p-0000000000000000',quote:'ない引用'}];
 expect(()=>prepareClaims(draft,sources,base)).toThrow('Evidence mismatch');
});

it('selects a separate local exploratory artifact without exposing it when disabled',async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'claim-preview-'));
 try{
  const file=join(dir,'selected.json');writeFileSync(file,'{"selected":true}');
  vi.stubEnv('CLAIM_EXPLORATORY_DATA',file);vi.stubEnv('CLAIM_ROLLOUT_DATA',file);
  for(const enabled of [false,true])for(const mode of ['exploratory','rollout']){
   let middleware:Function=()=>{};
   (claimPreviewServer(enabled).configureServer as Function)({middlewares:{use:(fn:Function)=>{middleware=fn;}}});
   const response={statusCode:200,end:vi.fn(),setHeader:vi.fn()};
   await middleware({url:`/__claim-preview/${mode}.json`},response,vi.fn());
   expect(response.statusCode).toBe(enabled?200:404);
   if(enabled){expect(response.end.mock.calls[0][0].toString()).toBe('{"selected":true}');expect(response.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');}
  }
 }finally{vi.unstubAllEnvs();rmSync(dir,{recursive:true});}
});
