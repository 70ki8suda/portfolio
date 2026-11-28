import { describe, expect, it } from 'vitest';
import { DISPLAY_TRACKS, LIBRARY_TRACKS, emptyLibrary, mergeLibrary, projectLibrary, projectPlays, projectRecent, pruneLibrary, readMusic, readPeriod } from './model';
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

describe('music accumulation',()=>{
 const DAY=86400000,now=Date.parse('2026-11-28T00:00:00Z');
 const item=(n:number,album:number,performer:number,daysAgo:number,name='合成テスト曲'+n)=>({played_at:new Date(now-daysAgo*DAY).toISOString(),context:{secret:'private'},track:{id:id(n),name,type:'track',explicit:false,artists:[artist(performer)],external_urls:{spotify:'https://open.spotify.com/track/'+id(n)},album:{id:id(album),name:'合成アルバム'+album,artists:[artist(performer)],images:[],external_urls:{spotify:'https://open.spotify.com/album/'+id(album)}}}});
 const page=(items:unknown[],before?:string)=>projectPlays({items,cursors:before?{before,after:'1'}:undefined});
 it('reads one page with its plays, fullness and numeric before-cursor, and rejects malformed input',()=>{
  const p=page([item(1,500,900,1)],'1700000000000');expect(p.plays).toHaveLength(1);expect(p.plays[0].at).toBe(now-DAY);expect(p.full).toBe(false);expect(p.before).toBe(1700000000000);
  expect(page(Array.from({length:50},(_,i)=>item(i+1,500,900,1))).full).toBe(true);expect(page([item(1,500,900,1)],'not-a-number').before).toBeUndefined();
  expect(()=>projectPlays({items:[{track:item(1,500,900,1).track,played_at:'yesterday'}]})).toThrow();expect(()=>projectPlays({items:Array.from({length:51},(_,i)=>item(i+1,500,900,1))})).toThrow();
 });
 it('deduplicates repeated plays, keeps the newest metadata, and never exposes timing or counts',()=>{
  const lib=mergeLibrary(emptyLibrary(),[...page([item(1,500,900,40,'古い題名'),item(1,500,900,2,'新しい題名'),item(1,500,900,10,'中間の題名'),item(2,501,901,100)]).plays],now);
  expect(Object.keys(lib.tracks)).toHaveLength(2);expect(lib.tracks['track:'+id(1)].node.name).toBe('新しい題名');
  // Merging an older page later must not roll metadata or recency back.
  mergeLibrary(lib,page([item(1,500,900,60,'さらに古い題名')]).plays,now);expect(lib.tracks['track:'+id(1)].node.name).toBe('新しい題名');expect(lib.tracks['track:'+id(1)].seen).toBe(now-2*DAY);
  const view=projectLibrary(lib,now,180);expect(view.status).toBe('ready');expect(JSON.stringify(view)).not.toMatch(/seen|played|2026|count|private/);expect(readMusic(view)).toEqual(view);
 });
 it('separates the periods and treats nothing-in-period as empty, not as an error',()=>{
  const lib=mergeLibrary(emptyLibrary(),page([item(1,500,900,5),item(2,501,901,60),item(3,502,902,150)]).plays,now);
  const count=(p:30|90|180)=>{const v=projectLibrary(lib,now,p);return v.status==='ready'?v.graph.nodes.filter(n=>n.kind==='track').length:v.status;};
  expect([count(30),count(90),count(180)]).toEqual([1,2,3]);expect(projectLibrary(lib,now+40*DAY,30).status).toBe('empty');
  const v=projectLibrary(lib,now,90);expect(v.status==='ready'&&v.period).toBe(90);expect([readPeriod('90'),readPeriod('7'),readPeriod(null),readPeriod('180')]).toEqual([90,30,30,180]);
 });
 it('deletes entries last played before the retention window together with their orphaned albums and artists',()=>{
  const lib=mergeLibrary(emptyLibrary(),page([item(1,500,900,5),item(2,501,901,179)]).plays,now);expect(Object.keys(lib.tracks)).toHaveLength(2);
  pruneLibrary(lib,now+2*DAY);expect(Object.keys(lib.tracks)).toEqual(['track:'+id(1)]);expect(Object.keys(lib.albums)).toEqual(['album:'+id(500)]);expect(Object.keys(lib.artists)).toEqual(['artist:'+id(900)]);
  expect(JSON.stringify(lib)).not.toContain(id(501));pruneLibrary(lib,now+400*DAY);expect(lib).toEqual(emptyLibrary());
 });
 it('bounds stored and displayed tracks: storage keeps the most recent, a view never draws the whole library',()=>{
  const lib=emptyLibrary();for(let start=0;start<300;start+=50)mergeLibrary(lib,page(Array.from({length:50},(_,i)=>item(start+i+1,1000+start+i,2000+(start+i)%40,(start+i)/10))).plays,now);
  expect(Object.keys(lib.tracks)).toHaveLength(LIBRARY_TRACKS);expect(lib.tracks['track:'+id(1)]).toBeDefined();expect(lib.tracks['track:'+id(300)]).toBeUndefined();
  const v=projectLibrary(lib,now,180);if(v.status!=='ready')throw Error();expect(v.graph.nodes.filter(n=>n.kind==='track')).toHaveLength(DISPLAY_TRACKS);expect(v.graph.nodes.some(n=>n.id==='track:'+id(1))).toBe(true);expect(v.graph.nodes.some(n=>n.id==='track:'+id(DISPLAY_TRACKS+1))).toBe(false);
 });
 it('keeps the stored accumulation under a fixed size by dropping the oldest first',()=>{
  const lib=emptyLibrary();for(let start=0;start<200;start+=50)mergeLibrary(lib,page(Array.from({length:50},(_,i)=>item(start+i+1,1000+start+i,2000+start+i,(start+i)/10,'長'.repeat(500)))).plays,now);
  const before=Object.keys(lib.tracks).length;expect(before).toBe(200);
  for(const t of Object.values(lib.tracks))t.node.artists=Array.from({length:64},()=>'名'.repeat(500));pruneLibrary(lib,now);
  expect(JSON.stringify(lib).length).toBeLessThan(700000);expect(Object.keys(lib.tracks).length).toBeLessThan(before);expect(lib.tracks['track:'+id(1)]).toBeDefined();expect(Object.keys(lib.albums).length).toBe(Object.keys(lib.tracks).length);
 });
 it('ignores plays dated in the future so a bad clock cannot pin an entry forever',()=>{
  const lib=mergeLibrary(emptyLibrary(),page([item(1,500,900,-30)]).plays,now);expect(lib).toEqual(emptyLibrary());
 });
});
