import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {articleClaimAnchors} from './articleGraph';
import type {GraphData} from './graphTypes';
const data=JSON.parse(readFileSync('public/claim-graph.json','utf8')) as GraphData;
const slug=data.nodes[0].slug;
const hash=data.claims!.sources[slug];
describe('article claim entrances',()=>{
 it('rejects invalid and mismatching source revisions instead of treating them as empty',()=>{
  expect(articleClaimAnchors(null,slug,hash).state).toBe('invalid');
  expect(articleClaimAnchors(data,slug,'0'.repeat(64)).state).toBe('mismatch');
  const broken=structuredClone(data);delete broken.claims!.links.neighbors[data.nodes[0].id];
  expect(articleClaimAnchors(broken,slug,hash).state).toBe('invalid');
 });
 it('keeps a valid empty result distinct from invalid',()=>{
  const empty=structuredClone(data);empty.edges=[];for(const id of empty.claims!.links.queryIds)empty.claims!.links.neighbors[id]=[];
  const result=articleClaimAnchors(empty,slug,hash);expect(result.state).toBe('ready');if(result.state==='ready')expect(result.anchors).toEqual([]);
 });
 it('maps every exact evidence anchor, deduplicates claims and keeps multiple claims',()=>{
  const result=articleClaimAnchors(data,slug,hash);expect(result.state).toBe('ready');if(result.state!=='ready')return;
  const expected=new Map<string,Set<string>>();
  for(const n of data.nodes.filter(n=>n.slug===slug&&data.claims!.links.neighbors[n.id].length))
   for(const e of data.claims!.summaries[n.id].evidence){const ids=expected.get(e.anchor)??new Set();ids.add(n.id);expected.set(e.anchor,ids);}
  expect(result.anchors.map(a=>[a.anchor,a.ids])).toEqual([...expected].map(([a,ids])=>[a,[...ids]]));
  expect(result.anchors.some(a=>a.ids.length>1)).toBe(true);
  expect(result.anchors.some(a=>a.scope==='section')).toBe(true);
 });
 it('does not offer isolated or incoming-only nodes, while preserving destinations',()=>{
  const result=articleClaimAnchors(data,slug,hash);if(result.state!=='ready')throw Error('not ready');
  const ids=new Set(result.anchors.flatMap(a=>a.ids));
  for(const n of data.nodes.filter(n=>n.slug===slug))if(!data.claims!.links.neighbors[n.id].length)expect(ids.has(n.id)).toBe(false);
  expect(data.nodes.some(n=>data.claims!.links.neighbors[n.id].length===0)).toBe(true);
 });
});
