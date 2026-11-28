import { describe, expect, it } from 'vitest';
import { DISPLAY_TRACKS, LIBRARY_TRACKS, emptyLibrary, mergeLibrary, projectLibrary, projectPlays, projectRecent, pruneLibrary, readMusic, readView } from './model';
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
  const view=projectLibrary(lib,now,'track');expect(view.status).toBe('ready');expect(JSON.stringify(view)).not.toMatch(/seen|played|2026|count|private/);expect(readMusic(view)).toEqual(view);
 });
 const duo=(n:number,album:number,performers:number[],credits:number[],daysAgo:number)=>{const base=item(n,album,performers[0],daysAgo);return {...base,track:{...base.track,artists:performers.map(artist),album:{...base.track.album,artists:credits.map(artist)}}};};
 const kindsOf=(v:ReturnType<typeof projectLibrary>)=>{if(v.status!=='ready')throw Error(v.status);return [...new Set(v.graph.nodes.map(n=>n.kind))].sort().join();};
 it('shows one granularity at a time over the whole window, artists by default, and reports the total',()=>{
  const lib=mergeLibrary(emptyLibrary(),page([item(1,500,900,5),item(2,501,901,60),item(3,502,902,150),item(4,502,902,151)]).plays,now);
  const a=projectLibrary(lib,now,'artist'),b=projectLibrary(lib,now,'album'),c=projectLibrary(lib,now,'track');
  expect([kindsOf(a),kindsOf(b),kindsOf(c)]).toEqual(['artist','album,artist','album,artist,track']);
  expect([a,b,c].map(v=>v.status==='ready'&&[v.view,v.total])).toEqual([['artist',3],['album',3],['track',4]]);
  for(const v of [a,b,c]){expect(readMusic(v)).toEqual(v);expect(JSON.stringify(v)).not.toMatch(/seen|played|2026|private/);}
  expect([readView('album'),readView('track'),readView('30'),readView(null),readView('artist')]).toEqual(['album','track','artist','artist','artist']);
  expect(projectLibrary(lib,now+400*DAY,'artist').status).toBe('empty');
 });
 it('joins artists only where Spotify credits them together; unrelated artists get no line',()=>{
  // 900+901 share a track, 902+903 share an album credit, 904 and 905 are alone even though both were heard the same day.
  const lib=mergeLibrary(emptyLibrary(),page([duo(1,500,[900,901],[900],1),duo(2,501,[902],[902,903],1),item(3,502,904,1),item(4,503,905,1)]).plays,now);
  const v=projectLibrary(lib,now,'artist');if(v.status!=='ready')throw Error();
  expect(v.graph.nodes).toHaveLength(6);expect(v.graph.edges).toEqual([{source:'artist:'+id(900),target:'artist:'+id(901)},{source:'artist:'+id(902),target:'artist:'+id(903)}]);
  // The same guest appears in the track view tied to the track, not to an album that does not credit them.
  const t=projectLibrary(lib,now,'track');if(t.status!=='ready')throw Error();
  expect(t.graph.edges).toContainEqual({source:'track:'+id(1),target:'artist:'+id(901)});expect(t.graph.edges).not.toContainEqual({source:'album:'+id(500),target:'artist:'+id(901)});expect(readMusic(t)).toEqual(t);
  const al=projectLibrary(lib,now,'album');if(al.status!=='ready')throw Error();expect(al.graph.nodes.some(n=>n.id==='artist:'+id(901))).toBe(false);expect(al.graph.edges.every(e=>e.source.startsWith('album:')&&e.target.startsWith('artist:'))).toBe(true);
 });
 it('entries stored before track credits were kept still show, and re-merging the same play fills the credits in',()=>{
  const lib=mergeLibrary(emptyLibrary(),page([duo(1,500,[900,901],[900],1)]).plays,now);delete lib.tracks['track:'+id(1)].performers;delete lib.artists['artist:'+id(901)];
  const before=projectLibrary(lib,now,'artist');expect(before.status==='ready'&&before.graph.nodes).toHaveLength(1);expect(projectLibrary(lib,now,'track').status).toBe('ready');
  mergeLibrary(lib,page([duo(1,500,[900,901],[900],1)]).plays,now);const after=projectLibrary(lib,now,'artist');expect(after.status==='ready'&&after.graph.edges).toHaveLength(1);
 });
 it('bounds each granularity and says how many it left out',()=>{
  const lib=emptyLibrary();for(let start=0;start<200;start+=50)mergeLibrary(lib,page(Array.from({length:50},(_,i)=>item(start+i+1,1000+start+i,2000+start+i,(start+i)/10))).plays,now);
  const shape=(view:'artist'|'album'|'track')=>{const v=projectLibrary(lib,now,view);if(v.status!=='ready')throw Error();return [v.graph.nodes.filter(n=>n.kind===view).length,v.total,v.graph.nodes.some(n=>n.id===view+':'+id(view==='track'?1:view==='album'?1000:2000))];};
  expect([shape('artist'),shape('album'),shape('track')]).toEqual([[96,200,true],[60,200,true],[36,200,true]]);
 });
 it('public reader rejects lines the view does not define, unordered artist pairs and impossible totals',()=>{
  const lib=mergeLibrary(emptyLibrary(),page([duo(1,500,[900,901],[900],1)]).plays,now);
  const a=projectLibrary(lib,now,'artist'),t=projectLibrary(lib,now,'track');if(a.status!=='ready'||t.status!=='ready')throw Error();
  const pair=a.graph.edges[0];
  expect(()=>readMusic({...a,graph:{...a.graph,edges:[{source:pair.target,target:pair.source}]}})).toThrow();
  expect(()=>readMusic({...t,graph:{...t.graph,edges:[...t.graph.edges,pair]}})).toThrow();
  expect(()=>readMusic({...a,graph:t.graph})).toThrow();expect(()=>readMusic({...a,total:1})).toThrow();expect(()=>readMusic({...a,total:undefined})).toThrow();expect(()=>readMusic({...a,period:30})).toThrow();
 });
 it('deletes entries last played before the retention window together with their orphaned albums and artists',()=>{
  const lib=mergeLibrary(emptyLibrary(),page([item(1,500,900,5),item(2,501,901,179)]).plays,now);expect(Object.keys(lib.tracks)).toHaveLength(2);
  pruneLibrary(lib,now+2*DAY);expect(Object.keys(lib.tracks)).toEqual(['track:'+id(1)]);expect(Object.keys(lib.albums)).toEqual(['album:'+id(500)]);expect(Object.keys(lib.artists)).toEqual(['artist:'+id(900)]);
  expect(JSON.stringify(lib)).not.toContain(id(501));pruneLibrary(lib,now+400*DAY);expect(lib).toEqual(emptyLibrary());
 });
 it('bounds stored and displayed tracks: storage keeps the most recent, a view never draws the whole library',()=>{
  const lib=emptyLibrary();for(let start=0;start<300;start+=50)mergeLibrary(lib,page(Array.from({length:50},(_,i)=>item(start+i+1,1000+start+i,2000+(start+i)%40,(start+i)/10))).plays,now);
  expect(Object.keys(lib.tracks)).toHaveLength(LIBRARY_TRACKS);expect(lib.tracks['track:'+id(1)]).toBeDefined();expect(lib.tracks['track:'+id(300)]).toBeUndefined();
  const v=projectLibrary(lib,now,'track');if(v.status!=='ready')throw Error();expect(v.total).toBe(LIBRARY_TRACKS);expect(v.graph.nodes.filter(n=>n.kind==='track')).toHaveLength(DISPLAY_TRACKS);expect(v.graph.nodes.some(n=>n.id==='track:'+id(1))).toBe(true);expect(v.graph.nodes.some(n=>n.id==='track:'+id(DISPLAY_TRACKS+1))).toBe(false);
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
