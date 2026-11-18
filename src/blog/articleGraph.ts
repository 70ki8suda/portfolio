import {isGraphPayload} from './graphRefresh';
import type {GraphData} from './graphTypes';
export interface ArticleClaimAnchor {anchor:string;ids:string[];scope:'passage'|'section';targetIds:string[]}
export type ArticleClaimMapping={state:'invalid'|'mismatch'}|{state:'ready';data:GraphData;anchors:ArticleClaimAnchor[]};
/** Called only after the delivery envelope is verified. Never infer a source location. */
export function articleClaimAnchors(value:unknown,slug:string,sourceHash:string):ArticleClaimMapping {
 if(!isGraphPayload(value)||value.version!==4||!value.claims)return {state:'invalid'};
 if(!/^[a-f0-9]{64}$/.test(sourceHash)||value.claims.sources[slug]!==sourceHash)return {state:'mismatch'};
 const anchors=new Map<string,ArticleClaimAnchor>();
 for(const node of value.nodes){
  if(node.slug!==slug||!value.claims.links.neighbors[node.id].length)continue;
  for(const evidence of value.claims.summaries[node.id].evidence){
   const entry=anchors.get(evidence.anchor)??{anchor:evidence.anchor,ids:[],scope:'passage',targetIds:[]};
   if(!entry.ids.includes(node.id))entry.ids.push(node.id);
   if(evidence.kind==='block')entry.scope='section';
   anchors.set(evidence.anchor,entry);
  }
 }
 for(const entry of anchors.values()){
  entry.ids.sort();
  entry.targetIds=[...new Set(entry.ids.flatMap(id=>value.claims!.links.neighbors[id].map(n=>n.id)))].sort();
 }
 return {state:'ready',data:value,anchors:[...anchors.values()]};
}

/** DOM order determines the representative, only after its identity is unambiguous. */
export function selectArticleClaimEntrances(anchors:ArticleClaimAnchor[],locations:{anchor:string;eligible:boolean}[]):ArticleClaimAnchor[] {
 const counts=new Map<string,number>();
 for(const location of locations)counts.set(location.anchor,(counts.get(location.anchor)??0)+1);
 const byAnchor=new Map(anchors.map(entry=>[entry.anchor,entry])),seen=new Set<string>();
 const result:ArticleClaimAnchor[]=[];
 for(const location of locations){
  if(!location.eligible||counts.get(location.anchor)!==1)continue;
  const entry=byAnchor.get(location.anchor);if(!entry)continue;
  const ids=[...new Set(entry.ids)].sort(),key=JSON.stringify(ids);
  if(seen.has(key))continue;
  seen.add(key);result.push({...entry,ids});
 }
 return result;
}
