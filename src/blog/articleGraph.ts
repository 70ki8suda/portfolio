import {isGraphPayload} from './graphRefresh';
import type {GraphData} from './graphTypes';
export interface ArticleClaimAnchor {anchor:string;ids:string[];scope:'passage'|'section'}
export type ArticleClaimMapping={state:'invalid'|'mismatch'}|{state:'ready';data:GraphData;anchors:ArticleClaimAnchor[]};
/** Called only after the delivery envelope is verified. Never infer a source location. */
export function articleClaimAnchors(value:unknown,slug:string,sourceHash:string):ArticleClaimMapping {
 if(!isGraphPayload(value)||value.version!==4||!value.claims)return {state:'invalid'};
 if(!/^[a-f0-9]{64}$/.test(sourceHash)||value.claims.sources[slug]!==sourceHash)return {state:'mismatch'};
 const anchors=new Map<string,ArticleClaimAnchor>();
 for(const node of value.nodes){
  if(node.slug!==slug||!value.claims.links.neighbors[node.id].length)continue;
  for(const evidence of value.claims.summaries[node.id].evidence){
   const entry=anchors.get(evidence.anchor)??{anchor:evidence.anchor,ids:[],scope:'passage'};
   if(!entry.ids.includes(node.id))entry.ids.push(node.id);
   if(evidence.kind==='block')entry.scope='section';
   anchors.set(evidence.anchor,entry);
  }
 }
 return {state:'ready',data:value,anchors:[...anchors.values()]};
}
