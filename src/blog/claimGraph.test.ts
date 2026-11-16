import {expect,it} from 'vitest';
import {validClaimGraph,type ClaimGraph} from './claimGraph';
import type {GraphNode} from './graphTypes';
const nodes=[{id:'a:c',slug:'a'},{id:'b:d',slug:'b'}] as GraphNode[];
function fixture():ClaimGraph{return {version:1,sources:{a:'a'.repeat(64),b:'b'.repeat(64)},summaries:Object.fromEntries(nodes.map(n=>[n.id,{speaker:'筆者',conditions:[],evidence:[{anchor:'body',text:'原文'}]}])),links:{model:'bge-reranker-v2-m3',revision:'953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e',recipeHash:'c'.repeat(64),poolHash:'d'.repeat(64),threshold:-3.8601101636886597,queryIds:nodes.map(n=>n.id),neighbors:{'a:c':[],'b:d':[]}},baselineCount:10};}
it('accepts any complete article/claim set, including computed empty, without a hardcoded node count',()=>{
 expect(validClaimGraph(fixture(),nodes,['a','b'])).toBe(true);
});
it('rejects missing/unknown computation, dangling endpoints, changed recipe bounds and unsupported sources',()=>{
 for(const mutate of [
 (d:ClaimGraph)=>{delete d.links.neighbors['a:c'];},
 (d:ClaimGraph)=>{d.links.queryIds=['a:c','a:c'];},
 (d:ClaimGraph)=>{d.links.neighbors['a:c']=[{id:'missing',score:0}];},
 (d:ClaimGraph)=>{d.links.threshold=-4;},
 (d:ClaimGraph)=>{d.sources.other='f'.repeat(64);},
 (d:ClaimGraph)=>{d.summaries['a:c'].evidence=[];},
 ]){const d=fixture();mutate(d);expect(validClaimGraph(d,nodes,['a','b'])).toBe(false);}
});

it('accepts schema4 only with complete claim metadata and exact displayed edges; raw remains separate',async()=>{
 const {readFileSync}=await import('node:fs');const {isGraphPayload}=await import('./graphRefresh');
 const raw=JSON.parse(readFileSync('public/paragraph-graph.json','utf8'));
 const metadata:ClaimGraph={...fixture(),sources:Object.fromEntries(raw.articles.map((a:{slug:string})=>[a.slug,'a'.repeat(64)])),summaries:Object.fromEntries(raw.nodes.map((n:GraphNode)=>[n.id,{speaker:n.context,conditions:[],evidence:[{anchor:n.anchor,text:n.text}]}])),links:{...fixture().links,queryIds:raw.nodes.map((n:GraphNode)=>n.id),neighbors:Object.fromEntries(raw.nodes.map((n:GraphNode)=>[n.id,[]]))},baselineCount:raw.nodes.length};
 const g={...raw,version:4,claims:metadata,edges:[],conceptNeighbors:Object.fromEntries(raw.nodes.map((n:GraphNode)=>[n.id,[]]))};
 expect(isGraphPayload(g)).toBe(true);expect(isGraphPayload({...g,version:2})).toBe(false);
 expect(isGraphPayload({...g,claims:undefined})).toBe(false);expect(isGraphPayload({...g,edges:raw.edges})).toBe(false);
 expect(isGraphPayload(raw)).toBe(true);
});
it('preserves legacy source URLs without auto-selecting a new claim or inventing an anchor',async()=>{
 const {legacyClaimLocation}=await import('./claimGraph');const anchor='p-1234567890abcdef',c=fixture();c.summaries['a:c'].evidence[0].anchor=anchor;
 const data={claims:c,nodes,articles:[{slug:'a'},{slug:'b'}]} as import('./graphTypes').GraphData;
 expect(legacyClaimLocation(data,'a:'+anchor)).toEqual({slug:'a',anchor});
 expect(legacyClaimLocation(data,'a:p-0000000000000000')).toEqual({slug:'a'});
 expect(legacyClaimLocation(data,'other:'+anchor)).toBeUndefined();expect(legacyClaimLocation(data,'a:c')).toBeUndefined();
});
it('binds primary and supplementary block evidence to the declared article version',()=>{
 for(const supplementary of [false,true]){const d=fixture(),e={anchor:'body',text:'table',kind:'block' as const,sourceHash:'b'.repeat(64),startByte:1,endByte:5};
 if(supplementary)d.summaries['a:c'].relatedPoints=[{text:'supplement',speaker:'author',conditions:[],evidence:[e]}];else d.summaries['a:c'].evidence=[e];
 expect(validClaimGraph(d,nodes,['a','b'])).toBe(false);e.sourceHash='a'.repeat(64);expect(validClaimGraph(d,nodes,['a','b'])).toBe(true);}
});
