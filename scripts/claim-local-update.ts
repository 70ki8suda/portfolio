import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {sha} from './claim-preview-data';
import {digest,graphCorpus} from './graph-corpus';
import {MODEL,ALGORITHM,type VectorCache} from './graph-pipeline';
import {referenceProjector,validateCoordinates,validateReference} from './semantic-cache';
import {claimCandidatePool,claimPairId} from './claim-candidates';
import {prepareReviewedClaims,assembleClaimGraph,rankingRecipeHash,checkRelationProofs,type ClaimRelations,type PairProof} from './claim-pipeline';
import type {ClaimCache} from './claim-cache';
import type {ClaimBundle,claimUpdateRequest} from './claim-workflow';
import type {GraphData} from '../src/blog/graphTypes';
const scripts=dirname(fileURLToPath(import.meta.url));
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const write=(p:string,value:unknown)=>writeFileSync(p,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
export interface ClaimReviewReply {version:1;requestHash:string;cache:ClaimCache;reviewProofs:Record<string,string>}
/** Mechanical completion after an independent full-text review; never invokes a cloud model. */
export function completeClaimUpdate(request:ReturnType<typeof claimUpdateRequest>,reply:ClaimReviewReply,sources:Record<string,string>,base:GraphData,priorVectors:VectorCache,priorRelations:ClaimRelations,work:string,python:string):ClaimBundle {
 if(reply.version!==1||reply.requestHash!==request.requestHash)throw Error('Stale reviewed claim reply');
 const bySlug=Object.fromEntries(Object.entries(sources).map(([n,t])=>[n.replace(/\.md$/,''),t]));
 const {prepared}=prepareReviewedClaims(reply.cache,reply.reviewProofs,bySlug,base);
 checkRelationProofs(priorRelations,rankingRecipeHash());
 if(JSON.stringify(priorVectors.model)!==JSON.stringify(MODEL)||priorVectors.algorithm!==ALGORITHM)throw Error('Claim vector recipe mismatch');
 validateReference(priorVectors.reference,MODEL.dim);if(priorVectors.reference.id!==base.projection.id)throw Error('Claim basis changed');
 const project=referenceProjector(priorVectors.reference);for(const v of priorVectors.entries)validateCoordinates(v,project);
 const make=(vectors:VectorCache,relations:ClaimRelations):ClaimBundle=>{assembleClaimGraph(reply.cache,reply.reviewProofs,bySlug,base,vectors,relations);return{version:1,requestHash:request.requestHash,cache:reply.cache,reviewProofs:reply.reviewProofs,vectors,relations};};
 const signature=digest({request,reply,priorVectors,priorRelations});
 if(existsSync(work)){
  if(read(join(work,'intent.json')).signature!==signature||!existsSync(join(work,'bundle.json')))throw Error('Prior claim work is incomplete or different; preserve it and inspect before a separate run');
  const done=read(join(work,'bundle.json'));return make(done.vectors,done.relations);
 }
 mkdirSync(work,{recursive:false});write(join(work,'intent.json'),{signature,requestHash:request.requestHash,cloudCalls:0});
 const old=new Map(priorVectors.entries.map(e=>[e.id,e]));
 const nodes=prepared.nodes.map(n=>({id:n.id,text:n.embeddingText,textHash:n.textHash}));
 const needEmbedding=nodes.some(n=>old.get(n.id)?.textHash!==n.textHash);
 let vectors={...priorVectors,entries:priorVectors.entries.filter(e=>nodes.some(n=>n.id===e.id))};
 const run=(args:string[],seconds:number,result:string)=>execFileSync(python,[join(scripts,'claim-bounded-command.py'),'--result',join(work,result),'--seconds',String(seconds),...args],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:'inherit',timeout:(seconds+5)*1000});
 if(needEmbedding){
  const corpus=graphCorpus(Object.fromEntries(Object.entries(sources).filter(([name])=>reply.cache.articles.some(a=>name===a.slug+'.md'))));
  const input={model:MODEL,algorithm:ALGORITHM,nodes,articles:corpus.articles.map(a=>({...a,id:'article:'+a.slug,textHash:digest({text:a.text,extraction:a.extraction})}))};
  write(join(work,'embedding-input.json'),input);write(join(work,'vectors.json'),vectors);
  run([python,join(scripts,'embed-graph.py'),join(work,'embedding-input.json'),'--output',join(work,'vectors.json'),'--offline'],600,'embedding-result.json');vectors=read(join(work,'vectors.json'));
 }
 for(const n of nodes){const v=vectors.entries.find(e=>e.id===n.id);if(!v||v.textHash!==n.textHash)throw Error('Claim embedding incomplete');validateCoordinates(v,project);}
 const candidates=prepared.nodes.map(n=>({id:n.id,slug:n.slug,textHash:n.textHash,vector:vectors.entries.find(e=>e.id===n.id)!.vector}));
 const pool=claimCandidatePool(candidates,priorRelations.scores,rankingRecipeHash());
 const relations:ClaimRelations={version:1,recipeHash:rankingRecipeHash(),scores:[...pool.reused],proofs:Object.fromEntries(pool.reused.map(r=>[r.proofHash,priorRelations.proofs[r.proofHash]]))};
 write(join(work,'candidate-pool.json'),pool);
 if(pool.missing.length){
  if(pool.missing.length*2>12000)throw Error('Claim batch exceeds fixed 12000 direction budget');
  const dir=join(work,'rerank');mkdirSync(dir);
  write(join(dir,'input.json'),{version:1,recipeHash:rankingRecipeHash(),initialPoolHash:pool.hash,documents:Object.fromEntries(prepared.nodes.map(n=>[n.id,{id:n.id,slug:n.slug,text:n.embeddingText,textHash:n.textHash}])),pairs:pool.missing.map(p=>({id:p.id,a:p.ids[0],b:p.ids[1]}))});
  const model=read(join(scripts,'claim-rerank-model.json'));
  write(join(dir,'model-inventory.json'),{...model,path:join(process.env.HF_HOME??join(homedir(),'.cache/huggingface'),'hub','models--BAAI--bge-reranker-v2-m3','snapshots',model.revision)});
  const env={...process.env,CLAIM_RUN_ROOT:dir,PYTHONDONTWRITEBYTECODE:'1'};
  execFileSync(python,[join(scripts,'claim-rerank/prepare.py')],{env,stdio:'inherit',timeout:600000});
  const manifestHash=sha(readFileSync(join(dir,'manifest.json'),'utf8'));
  execFileSync(python,[join(scripts,'claim-rerank/run.py'),'--manifest-sha',manifestHash],{env,stdio:'inherit',timeout:3610000});
  execFileSync(python,[join(scripts,'claim-rerank/accept.py'),'--manifest-sha',manifestHash],{env,stdio:'inherit'});
  const acceptedBytes=readFileSync(join(dir,'accepted.json'),'utf8'),accepted=JSON.parse(acceptedBytes),rows=new Map<string,any>(accepted.rows.map((r:any)=>[r.pairId+':'+r.direction,r]));
  if(rows.size!==pool.missing.length*2)throw Error('Unexpected accepted direction count');
  for(const pair of pool.missing){
   const x=rows.get(pair.id+':0'),y=rows.get(pair.id+':1');if(!x||!y)throw Error('Missing accepted pair');
   const textHashes=pair.ids.map(id=>prepared.nodes.find(n=>n.id===id)!.textHash),directions=[x.score,y.score];
   const proof:PairProof={ids:pair.ids,textHashes,directions,tokenHashes:[x.tokenHash,y.tokenHash],recipeHash:rankingRecipeHash(),manifestHash,acceptedHash:sha(acceptedBytes)},proofHash=digest(proof);
   relations.proofs[proofHash]=proof;relations.scores.push({id:claimPairId(...pair.ids as [string,string]),ids:pair.ids,textHashes,directions,recipeHash:rankingRecipeHash(),proofHash});
  }
 }
 const finalPool=claimCandidatePool(candidates,relations.scores,rankingRecipeHash());
 if(finalPool.pairs.length!==pool.pairs.length||finalPool.pairs.some((p,i)=>p.id!==pool.pairs[i].id))throw Error('Candidate set changed during local completion');
 const bundle=make(vectors,relations);write(join(work,'bundle.json'),bundle);return bundle;
}
