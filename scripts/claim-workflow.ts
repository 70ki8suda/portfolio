import {graphSourceSet} from '../src/blog/graphDelivery';
import type {GraphData} from '../src/blog/graphTypes';
import {sha} from './claim-preview-data';
import {claimSource} from './claim-source';
import {type ClaimCache} from './claim-cache';
import {CLAIM_PATHS,extractionRecipeHash,rankingRecipeHash,prepareReviewedClaims,assembleClaimGraph,type ClaimRelations} from './claim-pipeline';
import type {VectorCache} from './graph-pipeline';
export interface ClaimBundle {version:1;requestHash:string;cache:ClaimCache;reviewProofs:Record<string,string>;vectors:VectorCache;relations:ClaimRelations}
export type ClaimFiles=Record<string,string|null>;
const parse=(files:ClaimFiles,path:string)=>files[path]==null?undefined:JSON.parse(files[path]!);
export function claimUpdateRequest(files:ClaimFiles,sources:Record<string,string>,base:GraphData){
 const cache=parse(files,CLAIM_PATHS[0]) as ClaimCache|undefined,config=parse(files,CLAIM_PATHS[4]);
 if(files[CLAIM_PATHS[0]]!=null&&(!cache||typeof cache!=='object'||Array.isArray(cache)||!Array.isArray(cache.articles)))throw Error('Invalid present claim cache');
 if(files[CLAIM_PATHS[4]]!=null&&(!config||typeof config!=='object'||Array.isArray(config)||!['raw','claims'].includes(config.mode)))throw Error('Invalid present graph view config');
 const mode=config?.mode??'raw';
 if(!['raw','claims'].includes(mode))throw Error('Invalid graph view mode');
 const eligible=base.articles.map(a=>a.slug).sort();
 const bySlug=Object.fromEntries(Object.entries(sources).map(([filename,raw])=>[filename.replace(/\.md$/,''),raw]));
 for(const slug of eligible)if(typeof bySlug[slug]!=='string')throw Error('Missing eligible claim source: '+slug);
 const changed=eligible.filter(slug=>{const a=cache?.articles.find(a=>a.slug===slug);return !a||a.sourceHash!==sha(bySlug[slug])||cache?.recipeHash!==extractionRecipeHash();});
 const removed=(cache?.articles??[]).filter(a=>!eligible.includes(a.slug)).map(a=>a.slug);
 const snapshot={files,sources,base,extractionRecipe:extractionRecipeHash(),rankingRecipe:rankingRecipeHash()};
 return {version:1,requestHash:sha(JSON.stringify(snapshot)),mode,eligibleSlugs:eligible,changedSlugs:changed,removedSlugs:removed,
  articles:changed.map(slug=>({slug,raw:bySlug[slug],...claimSource(bySlug[slug])})),
  previous:cache??null,contract:'Return reviewed article claims and independent target-bound proofs. Do not change original articles or erase unresolved coverage.'};
}
/** Pure transaction preparation. Never mutates caches, source or public assets. */
export function claimWorkflowOutputs(files:ClaimFiles,sources:Record<string,string>,base:GraphData,bundle?:ClaimBundle){
 const request=claimUpdateRequest(files,sources,base),mode=request.mode;
 if(bundle&&(bundle.version!==1||bundle.requestHash!==request.requestHash))throw Error('Stale claim update reply');
 const cache=bundle?.cache??parse(files,CLAIM_PATHS[0]) as ClaimCache|undefined;
 if(!cache){
  if(mode==='claims')throw Error('Missing active claim cache');
  if(CLAIM_PATHS.slice(1,4).some(p=>files[p]!=null))throw Error('Orphaned claim cache files');
  const explicitRaw=files['content/graph-view.json']!=null;
  if(!explicitRaw&&['public/graph-view.json','public/claim-graph.json'].some(p=>files[p]!=null))throw Error('Orphaned public claim generation');
  return {request,outputs:explicitRaw?{'public/graph-view.json':rawManifest(base)}:{} as Record<string,string>};
 }
 const proofs=bundle?.reviewProofs??parse(files,CLAIM_PATHS[1]),vectors=bundle?.vectors??parse(files,CLAIM_PATHS[2]),relations=bundle?.relations??parse(files,CLAIM_PATHS[3]);
 if(!proofs||!vectors||!relations)throw Error('Incomplete claim bundle');
 if((mode==='claims')!==(cache.state==='active'))throw Error('Claim staging/active mode mismatch');
 const bySlug=Object.fromEntries(Object.entries(sources).map(([name,raw])=>[name.replace(/\.md$/,''),raw]));
 const checked=prepareReviewedClaims(cache,proofs,bySlug,base);
 const graph=assembleClaimGraph(cache,proofs,bySlug,base,vectors,relations),bytes=JSON.stringify(graph)+'\n';
 const outputs:Record<string,string>={'content/graph-claims.json':JSON.stringify(cache,null,2)+'\n','content/graph-claim-review-proofs.json':JSON.stringify(proofs,null,2)+'\n','content/graph-claim-vectors.json':JSON.stringify(vectors)+'\n','content/graph-claim-relations.json':JSON.stringify(relations)+'\n','public/claim-graph.json':bytes};
 // A staging artifact is not a mode switch. The writer explicitly activates only a complete set.
 if(mode==='claims'){
  if(checked.pendingSlugs.length)throw Error('Incomplete active claim graph');
  outputs['public/graph-view.json']=JSON.stringify({version:1,mode:'claims',schema:4,payloadUrl:'/claim-graph.json',payloadHash:sha(bytes),sourceSetHash:sha(graphSourceSet(graph))})+'\n';
 }
 if(mode==='raw'&&files['content/graph-view.json'])outputs['public/graph-view.json']=rawManifest(base);
 return {request,outputs,pendingSlugs:checked.pendingSlugs};
}

function rawManifest(base:GraphData){return JSON.stringify({version:1,mode:'raw',schema:base.version,payloadUrl:'/paragraph-graph.json',payloadHash:sha(JSON.stringify(base)+'\n'),sourceSetHash:sha(graphSourceSet(base))})+'\n';}
