import {CANDIDATE_RECIPE} from '../../scripts/retrieval-gate';
import { readFileSync,readdirSync } from 'node:fs';
import { expect,it } from 'vitest';
import { graphCorpus } from '../../scripts/graph-corpus';
import { prepareGraph,assembleGraph } from '../../scripts/graph-pipeline';
import { assembleReviewedGraph, retrievalRequest, applyRetrievalReply } from '../../scripts/graph-retrieval';
const sources=Object.fromEntries(readdirSync('content/posts').filter(f=>f.endsWith('.md')).map(f=>[f,readFileSync(`content/posts/${f}`,'utf8')]));
const prepared=prepareGraph(graphCorpus(sources),JSON.parse(readFileSync('content/graph-tags.json','utf8')));
const vectors=JSON.parse(readFileSync('content/graph-vectors.json','utf8'));
const recipes={candidateRecipe:CANDIDATE_RECIPE,indexRecipe:'a'.repeat(64),pairRecipe:'b'.repeat(64),indexReviewRecipe:'c'.repeat(64),pairReviewRecipe:'d'.repeat(64)};
const config=JSON.stringify({version:1,recipes});
it('preserves legacy graph only when both retrieval configuration and cache are absent',()=>{
 expect(assembleReviewedGraph(sources,prepared,vectors,{config:null,store:null})).toEqual(assembleGraph(prepared,vectors));
 expect(()=>assembleReviewedGraph(sources,prepared,vectors,{config:null,store:'{}'})).toThrow(/config/i);
 expect(()=>assembleReviewedGraph(sources,prepared,vectors,{config,store:null})).toThrow(/store/i);
 expect(()=>assembleReviewedGraph(sources,prepared,vectors,{config:'{}',store:null})).toThrow(/config/i);
});
it('binds reply to current complete source/vector/config/cache snapshot and fails closed without judgments',()=>{
 const files={config,store:null};const request=retrievalRequest('snapshot-a',sources,prepared,vectors,files);
 expect(request.work.index).toHaveLength(prepared.nodes.length);
 const changed=retrievalRequest('snapshot-b',sources,prepared,vectors,files);
 expect(changed.requestHash).not.toBe(request.requestHash);
 expect(()=>applyRetrievalReply(changed,{requestHash:request.requestHash,store:{}})).toThrow(/stale/i);
 expect(()=>applyRetrievalReply(request,{requestHash:request.requestHash,store:{}})).toThrow(/store/i);
 const cacheEdit=retrievalRequest('snapshot-a',sources,prepared,vectors,{config,store:'{}'});
 expect(cacheEdit.requestHash).not.toBe(request.requestHash);
 const altered=structuredClone(vectors);altered.entries[0].vector[0]+=.1;
 expect(()=>retrievalRequest('snapshot-a',sources,prepared,altered,files)).toThrow();
});
