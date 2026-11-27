/** Saved-score-only, development-only exploratory dataset. No model or private labels. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import type {GraphData} from '../src/blog/graphTypes';
import {isGraphPayload} from '../src/blog/graphRefresh';
const hash=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
const sources=[
 ['/tmp/section-claim-existing-graph/graph-claims.json','d01f3d75b042dbf51f8bd5844f5f3495b6aa0bbe209fdb3a18ea6ad3e3088f15'],
 ['/tmp/section-claim-reranker-v2/dev-input.json','3960b7296bec7a697beea8121011c99acba360810415645f27f032cd676b6920'],
 ['/tmp/section-claim-reranker-v2/dev-bge-scores.jsonl','30185286daf922ae6cc35853356ba936d854e4d53c46c60945eeabb58d690ef9'],
 ['/tmp/section-claim-exploratory-tradeoffs.json','3f78b9138b97bb8d965fe3070b206dfedf5b49d877ed7ae0ac54b2d788230c24'],
] as const;
const text=sources.map(([path,h])=>{const b=readFileSync(path);assert.equal(hash(b),h,path);return b.toString('utf8');});
const base=JSON.parse(text[0]) as GraphData;
const input=JSON.parse(text[1]) as {documents:Record<string,{graphId:string;summary:string;speaker:string;conditions:string[]}>;pairs:{id:string;a:string;b:string}[];queries:{queryId:string;slug:string;key:string;candidateIds:string[]}[]};
const rows=text[2].trim().split('\n').map(line=>JSON.parse(line) as {pairId:string;direction:number;score:number});
const report=JSON.parse(text[3]);assert.equal(report.previewSelection.status,'selected');
const threshold=report.previewSelection.metrics.threshold as number;assert(Number.isFinite(threshold));
assert(isGraphPayload(base)&&base.preview?.mode==='claims');assert.equal(base.nodes.length,53);assert.equal(input.queries.length,6);assert.equal(rows.length,input.pairs.length*2);
for(const [id,doc] of Object.entries(input.documents)){
 const node=base.nodes.find(n=>n.id===doc.graphId);assert(node);assert.equal(node.text,doc.summary,id);
 assert.equal(base.preview.claims[doc.graphId].speaker,doc.speaker);assert.deepEqual(base.preview.claims[doc.graphId].conditions,doc.conditions);
}
const pairKey=(a:string,b:string)=>JSON.stringify([a,b].sort());
const scores=new Map<string,number>();
for(const pair of input.pairs){
 const found=rows.filter(r=>r.pairId===pair.id);assert.equal(found.length,2);assert.deepEqual(found.map(r=>r.direction).sort(),[0,1]);assert(found.every(r=>typeof r.score==='number'&&Number.isFinite(r.score)));
 scores.set(pairKey(pair.a,pair.b),(found[0].score+found[1].score)/2);
}
assert.equal(scores.size,input.pairs.length);
const queries=[...input.queries].sort((a,b)=>a.queryId.localeCompare(b.queryId));
const neighbors=Object.fromEntries(queries.map(q=>{
 const origin=q.slug+':'+q.key;
 const ranked=q.candidateIds.map(id=>{const score=scores.get(pairKey(origin,id));assert(score!==undefined);return {id,score};})
  .sort((a,b)=>b.score-a.score||(a.id<b.id?-1:a.id>b.id?1:0)).filter(n=>n.score>=threshold).slice(0,5);
 return [input.documents[origin].graphId,ranked.map(n=>({id:input.documents[n.id].graphId,score:n.score}))];
}));
assert.equal(Object.values(neighbors).reduce((sum,list)=>sum+list.length,0),report.previewSelection.metrics.displayCount);
const output:GraphData={...base,preview:{...base.preview,mode:'exploratory',exploration:{version:1,model:'bge-reranker-v2-m3',threshold,queryIds:queries.map(q=>input.documents[q.slug+':'+q.key].graphId),neighbors,sourceHashes:sources.slice(1).map(([,h])=>h)}},
 edges:Object.entries(neighbors).flatMap(([source,items])=>items.map(({id:target,score})=>({source,target,score,kind:'semantic' as const}))),fingerprint:''};
output.fingerprint=hash(JSON.stringify(output));assert(isGraphPayload(output));
const samples=queries.map(q=>{const source=input.documents[q.slug+':'+q.key].graphId,target=neighbors[source][0]?.id??null;return {queryId:q.queryId,source,target,rule:'first-ranked-candidate-per-query; no private grade',url:`/knowdes?view=graph&preview=exploratory&node=${encodeURIComponent(source)}`};});
const root='/tmp/section-claim-exploratory-links';mkdirSync(root,{recursive:true});
writeFileSync(`${root}/graph.json`,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
writeFileSync(`${root}/samples.json`,JSON.stringify(samples,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({nodes:output.nodes.length,queries:queries.length,links:output.edges.length,graphHash:hash(readFileSync(`${root}/graph.json`)),samplesHash:hash(readFileSync(`${root}/samples.json`))}));
