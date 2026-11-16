import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {assembleClaimGraph,prepareReviewedClaims,extractionRecipeHash,rankingRecipeHash,checkReviewProofs,checkRelationProofs,type ClaimRelations} from '../../scripts/claim-pipeline';
import {claimReviewTarget,type ClaimCache} from '../../scripts/claim-cache';
import {claimSource} from '../../scripts/claim-source';
import {sha} from '../../scripts/claim-preview-data';
import type {GraphData} from './graphTypes';
import type {VectorCache} from '../../scripts/graph-pipeline';
const rawBase:GraphData=JSON.parse(readFileSync('public/paragraph-graph.json','utf8')),rawVectors:VectorCache=JSON.parse(readFileSync('content/graph-vectors.json','utf8'));
function fixture(){
 const slug=rawBase.articles[0].slug,raw=readFileSync('content/posts/'+slug+'.md','utf8'),source=claimSource(raw),p=source.paragraphs[0];
 const article={slug,sourceHash:sha(raw),claims:[{key:'a',sectionId:p.sectionId,summary:p.text,speaker:'writer',stance:'author' as const,conditions:[],evidence:[{anchor:p.anchor,quote:p.text}]}],coverage:source.sections.map(s=>({sectionId:s.id,claimKeys:s.id===p.sectionId?['a']:[],note:'test fixture'}))};
 const targetHash=claimReviewTarget(article,raw,extractionRecipeHash()),proof=JSON.stringify({version:1,required:0,reviewer:'independent test',auditReportHashes:['a'.repeat(64)],targets:[{slug,targetHash}]}),h=sha(proof);
 const cache:ClaimCache={version:1,state:'active',recipeHash:extractionRecipeHash(),articles:[article],reviews:[{slug,targetHash,reportHash:h,required:0,reviewer:'independent test'}],overrides:[]};
 const proofs={[h]:proof},sources={[slug]:raw},base={...rawBase,articles:rawBase.articles.filter(a=>a.slug===slug)};
 const prepared=prepareReviewedClaims(cache,proofs,sources,base).prepared,n=prepared.nodes[0];
 const vectors={...rawVectors,entries:[{...rawVectors.entries[0],id:n.id,textHash:n.textHash}]};
 const relations:ClaimRelations={version:1,recipeHash:rankingRecipeHash(),scores:[],proofs:{}};
 return{cache,proofs,sources,base,vectors,relations};
}
it('builds a complete schema4 dataset including computed zero and source evidence',()=>{
 const f=fixture(),g=assembleClaimGraph(f.cache,f.proofs,f.sources,f.base,f.vectors,f.relations);
 expect(g.version).toBe(4);expect(g.nodes).toHaveLength(1);expect(g.claims?.links.neighbors[g.nodes[0].id]).toEqual([]);expect(g.preview).toBeUndefined();expect(g.retrieval).toBeUndefined();
});
it('fails on stale embedding, changed coordinates, unsigned target content and incomplete active membership',()=>{
 for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.vectors.entries[0].textHash='0'.repeat(64);},(f:ReturnType<typeof fixture>)=>{f.vectors.entries[0].x+=1;},(f:ReturnType<typeof fixture>)=>{f.cache.articles[0].claims[0].summary+='changed';},(f:ReturnType<typeof fixture>)=>{f.base.articles=rawBase.articles;}]){const f=fixture();mutate(f);expect(()=>assembleClaimGraph(f.cache,f.proofs,f.sources,f.base,f.vectors,f.relations)).toThrow();}
});
it('checks review proof content and pair proof values rather than accepting a supplied digest alone',()=>{
 const f=fixture(),bad=JSON.stringify({version:1,required:0,reviewer:'independent test',auditReportHashes:['a'.repeat(64)],targets:[]}),h=sha(bad);f.cache.reviews[0].reportHash=h;
 expect(()=>checkReviewProofs(f.cache,{[h]:bad})).toThrow('target');
 expect(()=>checkRelationProofs({version:1,recipeHash:rankingRecipeHash(),scores:[{id:'a',ids:['a','b'],textHashes:[],directions:[1,1],recipeHash:rankingRecipeHash(),proofHash:'f'.repeat(64)}],proofs:{}},rankingRecipeHash())).toThrow('proof');
});
it('keeps staging distinct from active and binds transaction replies to all current files',async()=>{
 const {claimWorkflowOutputs,claimUpdateRequest}=await import('../../scripts/claim-workflow');
 const f=fixture(),files:Record<string,string|null>={'content/graph-view.json':'{"mode":"claims"}','content/graph-claims.json':JSON.stringify(f.cache),'content/graph-claim-review-proofs.json':JSON.stringify(f.proofs),'content/graph-claim-vectors.json':JSON.stringify(f.vectors),'content/graph-claim-relations.json':JSON.stringify(f.relations)};
 const result=claimWorkflowOutputs(files,f.sources,f.base);expect(JSON.parse(result.outputs['public/graph-view.json']).schema).toBe(4);
 const request=claimUpdateRequest(files,f.sources,f.base);
 expect(()=>claimWorkflowOutputs(files,{...f.sources,extra:'unrelated new source'},f.base,{version:1,requestHash:request.requestHash,cache:f.cache,reviewProofs:f.proofs,vectors:f.vectors,relations:f.relations})).toThrow('Stale');
 f.cache.state='staging';files['content/graph-view.json']='{"mode":"raw"}';files['content/graph-claims.json']=JSON.stringify(f.cache);
 const allSources=Object.fromEntries(rawBase.articles.map(a=>[a.slug,readFileSync('content/posts/'+a.slug+'.md','utf8')]));
 expect(()=>claimWorkflowOutputs(files,f.sources,rawBase)).toThrow('Missing eligible claim source');
 const staging=claimWorkflowOutputs(files,allSources,rawBase);expect(staging.pendingSlugs!.length).toBe(rawBase.articles.length-1);expect(JSON.parse(staging.outputs['public/graph-view.json']).mode).toBe('raw');
});
it('completes unchanged reviewed claims without spawning an encoder or reranker and preserves resumable evidence',async()=>{
 const {completeClaimUpdate}=await import('../../scripts/claim-local-update');const {claimUpdateRequest}=await import('../../scripts/claim-workflow');
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const f=fixture(),request=claimUpdateRequest({},f.sources,f.base),reply={version:1 as const,requestHash:request.requestHash,cache:f.cache,reviewProofs:f.proofs},dir=mkdtempSync(join(tmpdir(),'claim-local-test-')),work=join(dir,'run');
 try{
  // An invalid executable proves that the unchanged path performs zero process/model calls.
  const a=completeClaimUpdate(request,reply,f.sources,f.base,f.vectors,f.relations,work,'/nonexistent-python');
  const b=completeClaimUpdate(request,reply,f.sources,f.base,f.vectors,f.relations,work,'/nonexistent-python');expect(a).toEqual(b);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
it('distinguishes uninstalled caches from malformed caches and orphaned public generations',async()=>{
 const {claimWorkflowOutputs}=await import('../../scripts/claim-workflow');const f=fixture();
 expect(claimWorkflowOutputs({},f.sources,f.base).outputs).toEqual({});
 const invalid:Record<string,string|null>[]=[{'content/graph-claims.json':'null'},{'content/graph-view.json':'null'},{'public/graph-view.json':'{"mode":"claims"}','public/claim-graph.json':'stale'},{'content/graph-claim-vectors.json':'{}'}];
 for(const files of invalid)expect(()=>claimWorkflowOutputs(files,f.sources,f.base)).toThrow();
 const rollback=claimWorkflowOutputs({'content/graph-view.json':'{"mode":"raw"}','public/graph-view.json':'{"mode":"claims"}','public/claim-graph.json':'stale'},f.sources,f.base);
 expect(JSON.parse(rollback.outputs['public/graph-view.json']).mode).toBe('raw');
});
