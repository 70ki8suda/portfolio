import { describe, expect, it } from 'vitest';
import { projectRecent, readMusic } from './model';
const id=(n:number)=>String(n).padStart(22,'0');
const artist=(n=3)=>({id:id(n),name:'架空の演奏者'+n,external_urls:{spotify:'https://open.spotify.com/artist/'+id(n)}});
const track=(n=1)=>({id:id(n),name:'合成テスト曲'+n,type:'track',explicit:false,artists:[artist()],external_urls:{spotify:'https://open.spotify.com/track/'+id(n)},album:{id:id(2),name:'合成アルバム',artists:[artist()],images:[{url:'https://i.scdn.co/image/abc',width:300,height:300}],external_urls:{spotify:'https://open.spotify.com/album/'+id(2)}}});
const recent=(tracks:unknown[])=>({items:tracks.map(track=>({track,played_at:'2026-11-28T00:00:00Z',context:{secret:'private'}})),cursors:{after:'private'}});
describe('music public projection',()=>{
 it('contains metadata edges only, deduplicates tracks, never retains play timing or context',()=>{
  const result=projectRecent(recent([track(),track()]));expect(result.status).toBe('ready');
  if(result.status!=='ready')throw Error();
  expect(result.graph.nodes).toHaveLength(3);expect(result.graph.edges).toEqual([{source:'album:'+id(2),target:'artist:'+id(3)},{source:'track:'+id(1),target:'album:'+id(2)}]);
  expect(JSON.stringify(result)).not.toMatch(/played_at|2026|context|cursors|private/);expect(readMusic(result)).toEqual(result);
 });
 it('bounds whole track closures without dangling edges',()=>{
  const r=projectRecent(recent(Array.from({length:50},(_,i)=>track(i+10))));if(r.status!=='ready')throw Error();
  expect(r.graph.nodes.filter(n=>n.kind==='track')).toHaveLength(12);const ids=new Set(r.graph.nodes.map(n=>n.id));expect(r.graph.edges.every(e=>ids.has(e.source)&&ids.has(e.target))).toBe(true);
 });
 it('distinguishes valid zero from malformed, unsupported-only and extra public fields',()=>{
  expect(projectRecent(recent([]))).toEqual({version:1,status:'empty'});
  for(const v of [null,{},recent([null]),recent([{...track(),is_local:true}]),{items:Array(51).fill({track:track()})}])expect(projectRecent(v).status).toBe('unavailable');
  expect(()=>readMusic({version:1,status:'empty',access_token:'private'})).toThrow();expect(()=>readMusic({version:1,status:'other'})).toThrow();
 });
 it('rejects inconsistent IDs and unsafe URLs without turning them into empty history',()=>{
  expect(projectRecent(recent([track(),{...track(),name:'違う'}])).status).toBe('unavailable');
  for(const url of ['javascript:alert(1)','https://open.spotify.com.evil.test/track/'+id(1),'https://open.spotify.com:443/track/'+id(1)+'?x=1','https://user@open.spotify.com/track/'+id(1)])expect(projectRecent(recent([{...track(),external_urls:{spotify:url}}])).status).toBe('unavailable');
 });
 it('public reader rejects dangling edges, timing injection and wrong statuses',()=>{
  const r=projectRecent(recent([track()]));if(r.status!=='ready')throw Error();
  expect(()=>readMusic({...r,graph:{...r.graph,edges:[{source:'missing',target:r.graph.nodes[0].id}]}})).toThrow();
  expect(()=>readMusic({...r,graph:{...r.graph,nodes:r.graph.nodes.map(n=>({...n,played_at:'private'}))}})).toThrow();
  expect(()=>readMusic({...r,status:'empty'})).toThrow();
 });
});
it('rejects contradictory relationship metadata, but accepts reordered album credits',()=>{
 const a=track();const other={...track(),album:{...a.album,id:id(4),external_urls:{spotify:'https://open.spotify.com/album/'+id(4)}}};
 expect(projectRecent(recent([a,other])).status).toBe('unavailable');
 expect(projectRecent(recent([a,{...track(5),album:{...a.album,artists:[artist(6)]}}])).status).toBe('unavailable');
 const pair=[artist(3),artist(6)];expect(projectRecent(recent([{...track(),album:{...a.album,artists:pair}},{...track(5),album:{...a.album,artists:[...pair].reverse()}}])).status).toBe('ready');
});
