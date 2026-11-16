import type {GraphNode,GraphData} from './graphTypes';
import {type ClaimSummary,validClaimSummary} from './claimPreview';
export interface ClaimGraph {
 version:1;
 sources:Record<string,string>;
 summaries:Record<string,ClaimSummary>;
 links:{model:'bge-reranker-v2-m3';revision:string;recipeHash:string;poolHash:string;threshold:number;queryIds:string[];neighbors:Record<string,{id:string;score:number}[]>};
 baselineCount:number;
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function validClaimGraph(value:unknown,nodes:GraphNode[],articleSlugs:string[]):value is ClaimGraph {
 if(!record(value)||value.version!==1||!record(value.sources)||!record(value.summaries)||!record(value.links)||!Number.isSafeInteger(value.baselineCount)||(value.baselineCount as number)<0)return false;
 const slugs=new Set(articleSlugs),map=new Map(nodes.map(n=>[n.id,n])),ids=new Set(map.keys()),l=value.links;
 if(slugs.size!==articleSlugs.length||Object.keys(value.sources).length!==slugs.size||Object.entries(value.sources).some(([s,h])=>!slugs.has(s)||!hash(h)))return false;
 if(Object.keys(value.summaries).length!==ids.size||Object.entries(value.summaries).some(([id,c])=>!ids.has(id)||!validClaimSummary(c)))return false;
 for(const [id,c] of Object.entries(value.summaries)){
  const summary=c as ClaimSummary,sourceHash=value.sources[map.get(id)!.slug];
  if([...summary.evidence,...(summary.relatedPoints??[]).flatMap(p=>p.evidence)].some(e=>e.kind==='block'&&e.sourceHash!==sourceHash))return false;
 }
 if(l.model!=='bge-reranker-v2-m3'||l.revision!=='953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e'||!hash(l.recipeHash)||!hash(l.poolHash)||l.threshold!==-3.8601101636886597||!Array.isArray(l.queryIds)||l.queryIds.length!==ids.size||new Set(l.queryIds).size!==ids.size||l.queryIds.some(id=>typeof id!=='string'||!ids.has(id))||!record(l.neighbors)||Object.keys(l.neighbors).length!==ids.size)return false;
 return Object.entries(l.neighbors).every(([id,list])=>ids.has(id)&&Array.isArray(list)&&list.length<=5&&new Set(list.map(n=>n?.id)).size===list.length&&list.every((n,i)=>record(n)&&typeof n.id==='string'&&ids.has(n.id)&&map.get(id)!.slug!==map.get(n.id)!.slug&&typeof n.score==='number'&&Number.isFinite(n.score)&&n.score>=(l.threshold as number)&&(i===0||list[i-1].score>=n.score)));
}
export const claimSummaries=(data:GraphData)=>data.claims?.summaries??data.preview?.claims;
export const claimLinks=(data:GraphData)=>data.claims?.links??data.preview?.exploration;
export const hasClaims=(data:GraphData)=>!!data.claims||data.preview?.mode==='claims'||data.preview?.mode==='exploratory';
/** Legacy URLs remain readable, but never choose a different claim on the reader's behalf. */
export function legacyClaimLocation(data:GraphData,id:string):{slug:string;anchor?:string}|undefined {
 if(!data.claims||data.nodes.some(n=>n.id===id))return;
 const separator=id.indexOf(':'),slug=id.slice(0,separator),anchor=id.slice(separator+1);
 if(separator<1||!data.articles.some(a=>a.slug===slug)||! /^(?:p-[a-f0-9]{16}(?:-[0-9]+)?(?:-p)*|claim-[a-f0-9]{20})$/.test(anchor))return;
 const referenced=Object.entries(data.claims.summaries).some(([nodeId,c])=>nodeId.startsWith(slug+':')&&[...c.evidence,...(c.relatedPoints??[]).flatMap(p=>p.evidence)].some(e=>e.anchor===anchor));
 return {slug,...(referenced?{anchor}:{})};
}
