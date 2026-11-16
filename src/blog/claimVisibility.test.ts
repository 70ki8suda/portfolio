import {expect,it} from 'vitest';
import {claimVisibility} from './claimVisibility';
import type {GraphData} from './graphTypes';
const fixture=():GraphData=>{
 const nodes=Array.from({length:53},(_,i)=>({id:`s${i%3}:claim-${i}`,slug:`s${i%3}`,anchor:`claim-${i}`,text:'主張',kind:'paragraph' as const,context:'条件',stance:'source' as const,section:'節',order:i,tags:[],x:i,y:i}));
 const articles=[0,1,2].map(i=>({slug:`s${i}`,title:'記事',tags:[],x:i,y:i}));
 return {version:2,fingerprint:'fixture',model:{id:'test',revision:'test',license:'test',prefix:'',dim:384},projection:{method:'frozen-umap-reference-interpolation',id:'test',explainedVariance:[]},similarity:{threshold:.89,topK:5,nearestK:5},nodes,articles,concepts:[],edges:[],conceptNeighbors:Object.fromEntries(nodes.map(n=>[n.id,[]])),semanticNeighbors:Object.fromEntries(nodes.map(n=>[n.id,[]])),articleNeighbors:Object.fromEntries(articles.map(a=>[`article:${a.slug}`,[]])),preview:{version:1,mode:'exploratory',baselineCount:254,ranking:{threshold:.89,maxCandidates:5},claims:Object.fromEntries(nodes.map(n=>[n.id,{speaker:'本人',conditions:[],evidence:[{anchor:'source',text:'原文'}]}])),exploration:{version:2,model:'bge-reranker-v2-m3',threshold:-2,queryIds:nodes.map(n=>n.id),neighbors:Object.fromEntries(nodes.map(n=>[n.id,[]])),sourceHashes:['a'.repeat(64),'b'.repeat(64),'c'.repeat(64)]}}};
};
const blank=()=>{const d=fixture();d.edges=[];d.preview!.exploration!.neighbors=Object.fromEntries(d.nodes.map(n=>[n.id,[]]));return d;};
const connect=(d:GraphData,a:string,b:string)=>{d.preview!.exploration!.neighbors[a]=[{id:b,score:0}];d.edges.push({source:a,target:b,kind:'semantic',score:0});};
it('hides only computed isolated claims and keeps incoming endpoints without modifying the source',()=>{
 const d=blank(),a=d.nodes[0],b=d.nodes.find(n=>n.slug!==a.slug)!,before=structuredClone(d);connect(d,a.id,b.id);
 const source=structuredClone(d),v=claimVisibility(d);
 expect(v.hidden.size).toBe(51);expect(v.hidden.has(a.id)).toBe(false);expect(v.hidden.has(b.id)).toBe(false);expect(d).toEqual(source);expect(before.nodes).toEqual(d.nodes);
});
it('restores a hidden node on the next valid candidate update without changing its coordinates',()=>{
 const d=blank(),a=d.nodes[0],b=d.nodes.find(n=>n.slug!==a.slug)!;
 expect(claimVisibility(d).hidden.has(a.id)).toBe(true);connect(d,a.id,b.id);
 expect(claimVisibility(d).hidden.has(a.id)).toBe(false);expect(claimVisibility(d).nodes.find(n=>n.id===a.id)).toBe(a);
});
it('preserves unknown nodes and does not interpret loading or invalid data as zero',()=>{
 const d=blank();d.preview!.exploration!.version=1;d.preview!.exploration!.queryIds=d.nodes.slice(0,6).map(n=>n.id);d.preview!.exploration!.neighbors=Object.fromEntries(d.nodes.slice(0,6).map(n=>[n.id,[]]));
 expect(claimVisibility(d).hidden.size).toBe(6);expect(claimVisibility(d).nodes).toHaveLength(47);
 expect(claimVisibility(undefined).hidden.size).toBe(0);
 delete d.preview!.exploration!.neighbors[d.nodes[0].id];expect(()=>claimVisibility(d)).toThrow('Invalid');
});
it('keeps raw and non-exploratory claim views unchanged',()=>{
 const d=fixture();delete d.preview;
 expect(claimVisibility(d).nodes).toBe(d.nodes);expect(claimVisibility(d).hidden.size).toBe(0);
});
it('derives visible articles and preserves valid edges from visible claims',()=>{
 const d=blank(),a=d.nodes[0],b=d.nodes.find(n=>n.slug!==a.slug)!;connect(d,a.id,b.id);
 const v=claimVisibility(d);expect(v.articles.map(x=>x.slug).sort()).toEqual([a.slug,b.slug].sort());
 expect(v.edges).toEqual(d.edges);expect(v.nodes).toHaveLength(2);
 expect(claimVisibility(blank()).articles).toHaveLength(0);
});
