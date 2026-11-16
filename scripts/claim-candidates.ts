import {sha} from './claim-preview-data';
export const CLAIM_CANDIDATE_POLICY={version:1,topK:24,threshold:-3.8601101636886597,maxDisplay:5} as const;
export interface ClaimCandidate {id:string;slug:string;textHash:string;vector:number[]}
export interface ClaimPairScore {id:string;ids:string[];textHashes:string[];recipeHash:string;directions:number[];proofHash:string}
const order=(a:string,b:string)=>a<b?-1:a>b?1:0;
const hashPattern=/^[a-f0-9]{64}$/;
export const claimPairId=(a:string,b:string)=>sha(JSON.stringify([a,b].sort(order)));
/** Candidate membership is local. A cached score is usable only for the identical input and recipe. */
export function claimCandidatePool(input:ClaimCandidate[],cache:ClaimPairScore[],recipeHash:string){
 const nodes=[...input].sort((a,b)=>order(a.id,b.id)),map=new Map(nodes.map(n=>[n.id,n]));
 if(!hashPattern.test(recipeHash)||map.size!==nodes.length||nodes.some(n=>!n.id||!n.slug||!hashPattern.test(n.textHash)||!n.vector.length||n.vector.length!==nodes[0].vector.length||n.vector.some(v=>!Number.isFinite(v))||Math.abs(Math.hypot(...n.vector)-1)>.001))throw new Error('Invalid claim vectors');
 const pairs=new Map<string,{id:string;ids:string[]}>();
 const add=(a:string,b:string)=>{const ids=[a,b].sort(order),id=claimPairId(a,b);pairs.set(id,{id,ids});};
 for(const node of nodes){
  const near=nodes.filter(n=>n.slug!==node.slug).map(n=>({id:n.id,score:node.vector.reduce((sum,v,i)=>sum+v*n.vector[i],0)}))
   .sort((a,b)=>b.score-a.score||order(a.id,b.id)).slice(0,CLAIM_CANDIDATE_POLICY.topK);
  for(const n of near)add(node.id,n.id);
 }
 const localPairs=pairs.size,seen=new Set<string>(),valid:ClaimPairScore[]=[];
 for(const row of cache){
  if(seen.has(row.id))throw new Error('Duplicate pair score');seen.add(row.id);
  if(!Array.isArray(row.ids)||row.ids.length!==2||row.ids.some(id=>typeof id!=='string')||order(row.ids[0],row.ids[1])>=0||row.id!==claimPairId(...row.ids as [string,string])
   ||!Array.isArray(row.textHashes)||row.textHashes.length!==2||row.textHashes.some(h=>!hashPattern.test(h))||!hashPattern.test(row.recipeHash)||!hashPattern.test(row.proofHash)
   ||!Array.isArray(row.directions)||row.directions.length!==2||row.directions.some(x=>!Number.isFinite(x)))throw new Error('Invalid pair score');
  if(row.recipeHash!==recipeHash||row.ids.some((id,i)=>!map.has(id)||map.get(id)!.textHash!==row.textHashes[i]))continue;
  if(map.get(row.ids[0])!.slug===map.get(row.ids[1])!.slug)throw new Error('Same article pair');
  valid.push(row);add(row.ids[0],row.ids[1]);
 }
 const ordered=[...pairs.values()].sort((a,b)=>order(a.id,b.id)),reused=valid.sort((a,b)=>order(a.id,b.id));
 const available=new Set(reused.map(r=>r.id));
 return {hash:sha(JSON.stringify({policy:CLAIM_CANDIDATE_POLICY,recipeHash,nodes,cachePairs:reused.map(r=>r.id)})),pairs:ordered,reused,missing:ordered.filter(p=>!available.has(p.id)),localPairs,cacheAddedPairs:pairs.size-localPairs};
}
/** All candidate pairs must be complete; an absent score is never an empty/zero result. */
export function rankClaimPairs(nodes:ClaimCandidate[],pool:ReturnType<typeof claimCandidatePool>,scores:ClaimPairScore[],recipeHash:string){
 const fresh=claimCandidatePool(nodes,scores,recipeHash);
 if(pool.hash!==fresh.hash||fresh.missing.length)throw new Error('Incomplete or changed candidate pool');
 const map=new Map(nodes.map(n=>[n.id,n]));
 const result:Record<string,{id:string;score:number}[]>=Object.fromEntries([...map.keys()].sort(order).map(id=>[id,[]]));
 for(const row of fresh.reused){
  const score=(row.directions[0]+row.directions[1])/2;
  if(!Number.isFinite(score))throw new Error('Invalid mean score');
  if(score<CLAIM_CANDIDATE_POLICY.threshold)continue;
  result[row.ids[0]].push({id:row.ids[1],score});result[row.ids[1]].push({id:row.ids[0],score});
 }
 for(const id of Object.keys(result))result[id]=result[id].sort((a,b)=>b.score-a.score||order(a.id,b.id)).slice(0,CLAIM_CANDIDATE_POLICY.maxDisplay);
 return result;
}
