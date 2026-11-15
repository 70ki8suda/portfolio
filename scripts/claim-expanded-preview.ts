/** Build the all-origin local preview from independently checked, completed local scores. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import type {GraphData} from '../src/blog/graphTypes';
import {isGraphPayload} from '../src/blog/graphRefresh';
const root='/tmp/section-claim-memory-fix-v1';
const hash=(s:string|Buffer)=>createHash('sha256').update(s).digest('hex');
const acceptedBytes=readFileSync(`${root}/accepted.json`);
assert.match(process.argv[2]??'',/^[a-f0-9]{64}$/);assert.equal(hash(acceptedBytes),process.argv[2]);
const accepted=JSON.parse(acceptedBytes.toString());
assert.equal(hash(readFileSync(`${root}/remaining-complete.json`)),accepted.completeHash);
const parent=JSON.parse(readFileSync(`${root}/remaining-result.json`,'utf8'));
assert.equal(parent.accepted,true);assert.equal(parent.completeHash,accepted.completeHash);
assert.equal(hash(readFileSync(`${root}/manifest.json`)),accepted.manifestHash);
const baseBytes=readFileSync('/tmp/section-claim-existing-graph/graph-claims.json');
assert.equal(hash(baseBytes),'d01f3d75b042dbf51f8bd5844f5f3495b6aa0bbe209fdb3a18ea6ad3e3088f15');
const base=JSON.parse(baseBytes.toString()) as GraphData;assert(isGraphPayload(base)&&base.preview?.mode==='claims');
type Doc={graphId:string;slug:string;summary:string;speaker:string;conditions:string[]};
const docs=accepted.input.documents as Record<string,Doc>;
assert.equal(Object.keys(docs).length,53);assert.equal(accepted.threshold,-3.8601101636886597);
for(const [id,d] of Object.entries(docs)){
 const n=base.nodes.find(n=>n.id===d.graphId);assert(n);assert.equal(n.slug,d.slug);assert.equal(n.text,d.summary,id);
 assert.equal(base.preview.claims[d.graphId].speaker,d.speaker);assert.deepEqual(base.preview.claims[d.graphId].conditions,d.conditions);
}
const byDirection=new Map<string,number>();
for(const r of accepted.rows){assert(r.direction===0||r.direction===1);assert(typeof r.score==='number'&&Number.isFinite(r.score));const k=`${r.pairId}:${r.direction}`;assert(!byDirection.has(k));byDirection.set(k,r.score);}
assert.equal(byDirection.size,1744);
const ids=Object.keys(docs).sort(),pairs=new Map<string,number>(),pairKey=(a:string,b:string)=>hash(JSON.stringify([a,b].sort()));
for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
 const a=ids[i],b=ids[j];if(docs[a].slug===docs[b].slug)continue;
 const key=pairKey(a,b),x=byDirection.get(`${key}:0`),y=byDirection.get(`${key}:1`);assert(x!==undefined&&y!==undefined);pairs.set(key,(x+y)/2);
}
assert.equal(pairs.size,872);
const ranked=Object.fromEntries(ids.map(id=>[id,ids.filter(c=>docs[c].slug!==docs[id].slug).map(c=>({id:c,score:pairs.get(pairKey(id,c))!})).sort((a,b)=>b.score-a.score||(a.id<b.id?-1:a.id>b.id?1:0)).filter(n=>n.score>=accepted.threshold).slice(0,5)]));
const neighbors=Object.fromEntries(ids.map(id=>[docs[id].graphId,ranked[id].map(n=>({id:docs[n.id].graphId,score:n.score}))]));
const output:GraphData={...base,preview:{...base.preview,mode:'exploratory',exploration:{version:2,model:'bge-reranker-v2-m3',threshold:accepted.threshold,queryIds:ids.map(id=>docs[id].graphId),neighbors,sourceHashes:[hash(acceptedBytes),accepted.manifestHash,hash(baseBytes)]}},edges:Object.entries(neighbors).flatMap(([source,items])=>items.map(({id:target,score})=>({source,target,score,kind:'semantic' as const}))),fingerprint:''};
output.fingerprint=hash(JSON.stringify(output));assert(isGraphPayload(output));
const samples:{source:string;target:string|null;rule:string;score:number|null;pairId:string|null}[]=[];
for(const slug of [...new Set(ids.map(id=>docs[id].slug))].sort()){
 const list=ids.filter(id=>docs[id].slug===slug);
 for(const source of [list[0],list[Math.floor(list.length/2)],list.at(-1)!]){
  const list=ranked[source];if(!list.length)samples.push({source,target:null,rule:'article-first-middle-last-empty',score:null,pairId:null});
  else for(const n of [list[0],...(list.length>1?[list.at(-1)!]:[])])samples.push({source,target:n.id,score:n.score,rule:'article-first-middle-last-top-bottom',pairId:pairKey(source,n.id)});
 }
}
const displayed=new Map<string,{source:string;target:string;score:number;pairId:string}>();
for(const source of ids)for(const n of ranked[source]){const key=pairKey(source,n.id);if(!displayed.has(key))displayed.set(key,{source,target:n.id,score:n.score,pairId:key});}
for(const s of [...displayed.values()].sort((a,b)=>a.score-b.score||(a.pairId<b.pairId?-1:a.pairId>b.pairId?1:0)).slice(0,3))samples.push({...s,rule:'nearest-displayed-threshold'});
const summary={origins:53,pairs:872,threshold:accepted.threshold,displayedDirected:output.edges.length,displayedUnique:displayed.size,articles:[...new Set(ids.map(id=>docs[id].slug))].map(slug=>{const qs=ids.filter(id=>docs[id].slug===slug);return {slug,origins:qs.length,withCandidates:qs.filter(id=>ranked[id].length>0).length,zeroCandidates:qs.filter(id=>!ranked[id].length).length,displayed:qs.reduce((n,id)=>n+ranked[id].length,0)};}),quality:'exploratory; representative review separate; not whole-corpus usefulness'};
for(const name of ['graph.json','samples.json','summary.json'])assert(!existsSync(`${root}/${name}`),'preserve prior outputs');
writeFileSync(`${root}/graph.json`,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
writeFileSync(`${root}/samples.json`,JSON.stringify(samples.map(s=>({...s,sourceClaim:docs[s.source],targetClaim:s.target?docs[s.target]:null})),null,2)+'\n',{flag:'wx'});
writeFileSync(`${root}/summary.json`,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary));
