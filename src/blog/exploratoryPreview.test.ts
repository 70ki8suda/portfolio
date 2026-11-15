import {expect,it} from 'vitest';
import {claimPreviewMode,validClaimPreview} from './claimPreview';
import type {GraphNode} from './graphTypes';
const nodes=Array.from({length:53},(_,i)=>({id:`s${i%3}:claim-${i}`,slug:`s${i%3}`,anchor:`claim-${i}`,text:'主張',kind:'paragraph',section:'節',order:i,tags:[],x:i,y:i,context:'条件',stance:'source'} as GraphNode));
function fixture(){return {version:1,mode:'exploratory',baselineCount:254,ranking:{threshold:.89,maxCandidates:5},claims:Object.fromEntries(nodes.map(n=>[n.id,{speaker:'本人',conditions:[],evidence:[{anchor:'source',text:'原文'}]}])),exploration:{version:1,model:'bge-reranker-v2-m3',threshold:-2,queryIds:nodes.slice(0,6).map(n=>n.id),neighbors:Object.fromEntries(nodes.slice(0,6).map(n=>[n.id,[]])),sourceHashes:['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)]}};}
it('keeps exploration opt-in and distinguishes six valid empty queries from unmeasured nodes',()=>{
 expect(claimPreviewMode('exploratory',false)).toBeUndefined();expect(claimPreviewMode('exploratory',true)).toBe('exploratory');
 expect(validClaimPreview(fixture(),nodes)).toBe(true);
 const p=fixture();delete p.exploration.neighbors[nodes[0].id];expect(validClaimPreview(p,nodes)).toBe(false);
});
it('rejects incomplete, duplicate, unbounded or same-article exploratory neighbors',()=>{
 for(const change of [(p:any)=>p.exploration.queryIds.pop(),(p:any)=>p.exploration.queryIds[1]=p.exploration.queryIds[0],(p:any)=>p.exploration.neighbors[nodes[6].id]=[],(p:any)=>p.exploration.neighbors[nodes[0].id]=[{id:nodes[3].id,score:0}],(p:any)=>p.exploration.neighbors[nodes[0].id]=[{id:nodes[1].id,score:NaN}],(p:any)=>p.exploration.neighbors[nodes[0].id]=[{id:nodes[1].id,score:-3}]]){const p=fixture();change(p);expect(validClaimPreview(p,nodes)).toBe(false);}
});
it('accepts raw reranker logits without turning them into probabilities',()=>{
 const p=fixture();(p.exploration.neighbors[nodes[0].id] as any[])=[{id:nodes[1].id,score:5},{id:nodes[2].id,score:-1}];expect(validClaimPreview(p,nodes)).toBe(true);
});
it('rejects exploration metadata hidden on baseline mode',()=>{const p=fixture();p.mode='claims';expect(validClaimPreview(p,nodes)).toBe(false);});

import {isGraphPayload} from './graphRefresh';
it('rejects baseline lines mixed into the exploratory payload',()=>{
 const preview=fixture();
 const graph={version:2,fingerprint:'test',model:{id:'test',revision:'test',license:'test',prefix:'',dim:384},projection:{method:'frozen-umap-reference-interpolation',id:'test',explainedVariance:[]},similarity:{threshold:.89,topK:5,nearestK:5},nodes,preview,articles:[0,1,2].map(i=>({slug:`s${i}`,title:'記事',tags:[],x:0,y:0})),concepts:[],conceptNeighbors:Object.fromEntries(nodes.map(n=>[n.id,[]])),semanticNeighbors:Object.fromEntries(nodes.map(n=>[n.id,[]])),articleNeighbors:Object.fromEntries([0,1,2].map(i=>[`article:s${i}`,[]])),edges:[] as {source:string;target:string;kind:string;score:number}[]};
 expect(isGraphPayload(graph)).toBe(true);
 graph.edges=[{source:nodes[0].id,target:nodes[1].id,kind:'semantic',score:.9}];expect(isGraphPayload(graph)).toBe(false);
 (preview.exploration.neighbors[nodes[0].id] as any[])=[{id:nodes[1].id,score:.9}];expect(isGraphPayload(graph)).toBe(true);
 graph.edges.push(graph.edges[0]);expect(isGraphPayload(graph)).toBe(false);
});

it('requires complete all-origin coverage for exploration v2, preserving v1 unknown states',()=>{
 const p=fixture();p.exploration.version=2;
 expect(validClaimPreview(p,nodes)).toBe(false);
 p.exploration.queryIds=nodes.map(n=>n.id);p.exploration.neighbors=Object.fromEntries(nodes.map(n=>[n.id,[]]));
 expect(validClaimPreview(p,nodes)).toBe(true);
 delete p.exploration.neighbors[nodes[52].id];expect(validClaimPreview(p,nodes)).toBe(false);
});
