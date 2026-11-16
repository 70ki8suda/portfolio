import {readFileSync} from 'node:fs';
import {sha} from './claim-preview-data';
import {checkClaimCache,type ClaimCache} from './claim-cache';
import {claimCandidatePool,rankClaimPairs,type ClaimPairScore} from './claim-candidates';
import {MODEL,ALGORITHM,type VectorCache} from './graph-pipeline';
import {referenceProjector,validateReference,validateCoordinates} from './semantic-cache';
import {isGraphPayload} from '../src/blog/graphRefresh';
import type {GraphData} from '../src/blog/graphTypes';
import {digest} from './graph-corpus';
export const CLAIM_PATHS=['content/graph-claims.json','content/graph-claim-review-proofs.json','content/graph-claim-vectors.json','content/graph-claim-relations.json','content/graph-view.json','public/claim-graph.json','public/graph-view.json'] as const;
export const extractionRecipeHash=()=>sha(readFileSync(new URL('./claim-extraction-recipe.json',import.meta.url),'utf8'));
export const rankingRecipeHash=()=>sha(readFileSync(new URL('./claim-ranking-recipe.json',import.meta.url),'utf8'));
export interface PairProof {ids:string[];textHashes:string[];directions:number[];tokenHashes:string[];recipeHash:string;manifestHash:string;acceptedHash:string}
export interface ClaimRelations {version:1;recipeHash:string;scores:ClaimPairScore[];proofs:Record<string,PairProof>}
const require=(value:unknown,message:string)=>{if(!value)throw Error(message);};
export function checkReviewProofs(cache:ClaimCache,proofs:Record<string,string>){
 for(const review of cache.reviews){
  const bytes=proofs[review.reportHash];require(typeof bytes==='string'&&sha(bytes)===review.reportHash,'Claim review proof hash');
  const proof=JSON.parse(bytes);require(proof.version===1&&proof.required===0&&proof.reviewer===review.reviewer&&Array.isArray(proof.auditReportHashes)&&proof.auditReportHashes.length&&proof.auditReportHashes.every((h:unknown)=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h)),'Claim review proof format');
  require(Array.isArray(proof.targets)&&new Set(proof.targets.map((t:{slug:string})=>t.slug)).size===proof.targets.length,'Claim review proof targets');
  require(proof.targets.some((t:{slug:string;targetHash:string})=>t.slug===review.slug&&t.targetHash===review.targetHash),'Claim review proof target');
 }
}
export function checkRelationProofs(relations:ClaimRelations,expectedRecipe:string){
 require(relations.version===1&&relations.recipeHash===expectedRecipe,'Claim ranking recipe');
 for(const row of relations.scores){
  const proof=relations.proofs[row.proofHash];require(proof&&digest(proof)===row.proofHash,'Claim pair proof hash');
  require(proof.recipeHash===row.recipeHash&&JSON.stringify(proof.ids)===JSON.stringify(row.ids)&&JSON.stringify(proof.textHashes)===JSON.stringify(row.textHashes)&&JSON.stringify(proof.directions)===JSON.stringify(row.directions),'Claim pair proof values');
  require(proof.tokenHashes.length===2&&[...proof.tokenHashes,proof.manifestHash,proof.acceptedHash].every(h=>/^[a-f0-9]{64}$/.test(h)),'Claim pair proof provenance');
 }
}
export function prepareReviewedClaims(cache:ClaimCache,proofs:Record<string,string>,sources:Record<string,string>,base:GraphData){
 checkReviewProofs(cache,proofs);
 return checkClaimCache(cache,sources,base,base.articles.map(a=>a.slug),proofs,extractionRecipeHash());
}
/** Complete staging datasets can be previewed; active membership must still equal current editorial inclusion. */
export function assembleClaimGraph(cache:ClaimCache,proofs:Record<string,string>,sources:Record<string,string>,base:GraphData,vectors:VectorCache,relations:ClaimRelations):GraphData{
 const {prepared}=prepareReviewedClaims(cache,proofs,sources,base);
 require(JSON.stringify(vectors.model)===JSON.stringify(MODEL)&&vectors.algorithm===ALGORITHM,'Claim embedding recipe');
 validateReference(vectors.reference,MODEL.dim);require(vectors.reference.id===base.projection.id,'Claim projection basis');
 const project=referenceProjector(vectors.reference),entries=new Map(vectors.entries.map(e=>[e.id,e]));
 require(entries.size===vectors.entries.length&&entries.size===prepared.nodes.length,'Claim vector set');
 const nodes=prepared.nodes.map(({textHash,embeddingText:_text,...n})=>{
  const v=entries.get(n.id);require(v&&v.textHash===textHash&&v.vector.length===MODEL.dim&&v.vector.every(Number.isFinite)&&Math.abs(Math.hypot(...v.vector)-1)<.001,'Claim vector freshness');validateCoordinates(v!,project);return{...n,x:v!.x,y:v!.y};
 });
 const candidates=prepared.nodes.map(n=>({id:n.id,slug:n.slug,textHash:n.textHash,vector:entries.get(n.id)!.vector}));
 checkRelationProofs(relations,rankingRecipeHash());const pool=claimCandidatePool(candidates,relations.scores,rankingRecipeHash());
 const neighbors=rankClaimPairs(candidates,pool,relations.scores,rankingRecipeHash());
 const slugs=new Set(cache.articles.map(a=>a.slug)),articles=base.articles.filter(a=>slugs.has(a.slug));
 const cosine=Object.fromEntries(candidates.map(a=>[a.id,candidates.filter(b=>b.slug!==a.slug).map(b=>({id:b.id,score:Math.max(-1,Math.min(1,a.vector.reduce((sum,x,i)=>sum+x*b.vector[i],0)))})).sort((a,b)=>b.score-a.score||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,5)]));
 const graph:GraphData={...base,version:4,preview:undefined,retrieval:undefined,fingerprint:'',articles,nodes,
  concepts:base.concepts.filter(c=>nodes.some(n=>n.tags.includes(c.id))),semanticNeighbors:cosine,conceptNeighbors:Object.fromEntries(nodes.map(n=>[n.id,[]])),
  articleNeighbors:Object.fromEntries(Object.entries(base.articleNeighbors).filter(([id])=>slugs.has(id.slice(8))).map(([id,ns])=>[id,ns.filter(n=>slugs.has(n.id.slice(8)))])),
  claims:{version:1,sources:Object.fromEntries(cache.articles.map(a=>[a.slug,a.sourceHash])),summaries:prepared.claims,baselineCount:base.nodes.filter(n=>slugs.has(n.slug)).length,links:{model:'bge-reranker-v2-m3',revision:'953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e',recipeHash:rankingRecipeHash(),poolHash:pool.hash,threshold:-3.8601101636886597,queryIds:nodes.map(n=>n.id),neighbors}},
  edges:Object.entries(neighbors).flatMap(([source,ns])=>ns.map(n=>({source,target:n.id,score:n.score,kind:'semantic' as const})))};
 graph.fingerprint=digest(graph);require(isGraphPayload(graph),'Invalid assembled claim graph');return graph;
}
