/** Independent display schema: never passed to the article graph or AI pipeline. */
export type MusicKind = 'track' | 'album' | 'artist';
export interface MusicNode {id:string;kind:MusicKind;name:string;url:string;artists?:string[];image?:string;explicit?:boolean}
export interface MusicGraph {nodes:MusicNode[];edges:{source:string;target:string}[]}
export type MusicStatus='unconfigured'|'disconnected'|'syncing'|'empty'|'reauthorize'|'rate_limited'|'unavailable';
export type MusicPeriod=30|90|180;
export const musicPeriods:readonly MusicPeriod[]=[30,90,180];
export const readPeriod=(v:unknown):MusicPeriod=>musicPeriods.find(p=>String(p)===String(v))??30;
export type MusicResponse={version:1;status:MusicStatus}|{version:1;status:'ready';graph:MusicGraph;period?:MusicPeriod};
/** Display bound: accumulation is larger than any one view, so a phone never draws the whole library. */
export const DISPLAY_TRACKS=36;
export const RETENTION_DAYS=180;
export const LIBRARY_TRACKS=240;
export const LIBRARY_BYTES=600000;
const DAY=86400000;
const kinds:MusicKind[]=['track','album','artist'];
const statuses:MusicStatus[]=['unconfigured','disconnected','syncing','empty','reauthorize','rate_limited','unavailable'];
const record=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid music data');return v as Record<string,unknown>;};
const text=(v:unknown)=>{if(typeof v!=='string'||!v.length||v.length>500)throw Error('Invalid music text');return v;};
const identifier=(v:unknown)=>{if(typeof v!=='string'||!/^[a-zA-Z0-9]{22}$/.test(v))throw Error('Invalid music id');return v;};
function spotifyUrl(v:unknown,kind:MusicKind,id:string){if(v!==`https://open.spotify.com/${kind}/${id}`)throw Error('Invalid Spotify URL');return v as string;}
function imageUrl(v:unknown){if(typeof v!=='string'||!/^https:\/\/i\.scdn\.co\/image\/[a-zA-Z0-9]+$/.test(v)||v.length>300)throw Error('Invalid artwork URL');return v;}
function list(v:unknown,max:number){if(!Array.isArray(v)||v.length>max)throw Error('Invalid music list');return v;}
function entity(v:unknown,kind:MusicKind):MusicNode {const o=record(v),id=identifier(o.id);return {id:kind+':'+id,kind,name:text(o.name),url:spotifyUrl(record(o.external_urls).spotify,kind,id)};}
function only(o:Record<string,unknown>,keys:string[]){if(Object.keys(o).some(k=>!keys.includes(k)))throw Error('Unexpected public music field');}

/** One play reduced to its allowlisted metadata; undefined for local or unplayable items. */
function closure(item:unknown){
 const raw=record(record(item).track);
 if(raw.is_local===true||raw.id===null||raw.is_playable===false)return undefined;
 if(raw.type!=='track')throw Error('Unsupported media');
 const t=entity(raw,'track'),a=record(raw.album),album=entity(a,'album');
 const performers=list(raw.artists,64).map(x=>entity(x,'artist'));if(!performers.length)throw Error('No performer');
 const artists=list(a.artists,64).map(x=>entity(x,'artist'));if(!artists.length)throw Error('No album credit');
 const images=list(a.images,8);if(images.length)album.image=imageUrl(record(images[0]).url);
 if(typeof raw.explicit!=='boolean')throw Error('Missing explicit status');
 t.artists=performers.map(x=>x.name);t.explicit=raw.explicit;
 t.image=album.image; // Undefined is omitted during JSON serialization.
 return {track:t,album,artists,performers:performers.map(p=>p.id)};
}
/** Fail closed for inconsistent batches; unsupported local tracks may be omitted, never called empty. */
export function projectRecent(input:unknown):MusicResponse {
 try {
  const items=list(record(input).items,50);if(!items.length)return {version:1,status:'empty'};
  const signatures=new Map<string,string>();const relation=(id:string,targets:string[])=>{const sig=[...new Set(targets)].sort().join(',');if(signatures.has(id)&&signatures.get(id)!==sig)throw Error('Conflicting relation');signatures.set(id,sig);};
  const all=new Map<string,MusicNode>(), closures:{track:MusicNode;nodes:MusicNode[]}[]=[];
  const add=(n:MusicNode)=>{const prev=all.get(n.id);if(prev&&JSON.stringify(prev)!==JSON.stringify(n))throw Error('Conflicting metadata');all.set(n.id,n);};
  for(const item of items){
   const c=closure(item);if(!c)continue;
   relation(c.track.id,[c.album.id,...c.performers]);relation(c.album.id,c.artists.map(p=>p.id));
   const nodes=[c.track,c.album,...c.artists];nodes.forEach(add);closures.push({track:c.track,nodes});
  }
  const nodes=new Map<string,MusicNode>(),edges=new Map<string,{source:string;target:string}>();let tracks=0;
  for(const c of closures){
   if(nodes.has(c.track.id)||tracks>=12)continue;
   const next=new Map(nodes);c.nodes.forEach(n=>next.set(n.id,n));if([...next.values()].filter(n=>n.kind==='artist').length>64)continue;
   c.nodes.forEach(n=>nodes.set(n.id,n));tracks++;
   const album=c.nodes[1];const es=[{source:c.track.id,target:album.id},...c.nodes.slice(2).map(n=>({source:album.id,target:n.id}))];
   es.forEach(e=>edges.set(e.source+'>'+e.target,e));
  }
  if(!tracks)return {version:1,status:'unavailable'};
  return readMusic({version:1,status:'ready',graph:{nodes:[...nodes.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),edges:[...edges.values()].sort((a,b)=>(a.source+a.target)<(b.source+b.target)?-1:(a.source+a.target)>(b.source+b.target)?1:0)}});
 }catch{return {version:1,status:'unavailable'};}
}

/** Strict public reader guards corrupted storage; request sequencing is the client’s responsibility. */
export function readMusic(value:unknown):MusicResponse {
 const o=record(value);if(o.version!==1)throw Error('Unsupported music schema');
 if(o.status!=='ready'){only(o,['version','status']);if(!statuses.includes(o.status as MusicStatus))throw Error('Invalid music state');return {version:1,status:o.status as MusicStatus};}
 only(o,['version','status','graph','period']);const g=record(o.graph);only(g,['nodes','edges']);
 if(o.period!==undefined&&!musicPeriods.includes(o.period as MusicPeriod))throw Error('Invalid music period');
 const nodes=list(g.nodes,DISPLAY_TRACKS*2+64).map(v=>{
  const n=record(v);only(n,['id','kind','name','url','artists','image','explicit']);
  if(!kinds.includes(n.kind as MusicKind)||typeof n.id!=='string')throw Error('Invalid node');
  const kind=n.kind as MusicKind,id=identifier(n.id.slice(kind.length+1));if(n.id!==kind+':'+id)throw Error('Invalid node id');
  const result:MusicNode={id:n.id,kind,name:text(n.name),url:spotifyUrl(n.url,kind,id)};
  if(n.image!==undefined){if(kind==='artist')throw Error('Unexpected artist image');result.image=imageUrl(n.image);}
  if(kind==='track'){result.artists=list(n.artists,64).map(text);if(!result.artists.length||typeof n.explicit!=='boolean')throw Error('Invalid track');result.explicit=n.explicit;}
  else if(n.artists!==undefined||n.explicit!==undefined)throw Error('Unexpected attribution');
  return result;
 });
 const map=new Map(nodes.map(n=>[n.id,n]));if(map.size!==nodes.length||!nodes.length)throw Error('Duplicate/empty nodes');
 for(const [kind,max] of [['track',DISPLAY_TRACKS],['album',DISPLAY_TRACKS],['artist',64]] as const){const count=nodes.filter(n=>n.kind===kind).length;if(!count||count>max)throw Error('Invalid node bounds');}
 const seen=new Set<string>();const edges=list(g.edges,DISPLAY_TRACKS*65).map(v=>{
  const e=record(v);only(e,['source','target']);const source=text(e.source),target=text(e.target),s=map.get(source),t=map.get(target);
  if(!s||!t||!((s.kind==='track'&&t.kind==='album')||(s.kind==='album'&&t.kind==='artist'))||seen.has(source+'>'+target))throw Error('Invalid edge');
  seen.add(source+'>'+target);return {source,target};
 });
 for(const n of nodes){const out=edges.filter(e=>e.source===n.id),incoming=edges.some(e=>e.target===n.id);if(n.kind==='track'?out.length!==1:n.kind==='album'?(!out.length||!incoming):!incoming)throw Error('Incomplete metadata relation');}
 return o.period===undefined?{version:1,status:'ready',graph:{nodes,edges}}:{version:1,status:'ready',graph:{nodes,edges},period:o.period as MusicPeriod};
}

/**
 * Private accumulation. `seen` (last play, ms) never leaves the server; it only orders, expires and
 * period-filters entries. Metadata is the copy Spotify returned at that last play, so no entry is older than the retention.
 */
export interface MusicLibrary {
 tracks:Record<string,{node:MusicNode;album:string;seen:number}>;
 albums:Record<string,{node:MusicNode;artists:string[]}>;
 artists:Record<string,{node:MusicNode}>;
}
export interface MusicPlay {at:number;track:MusicNode;album:MusicNode;artists:MusicNode[]}
export const emptyLibrary=():MusicLibrary=>({tracks:{},albums:{},artists:{}});

/** One recently-played page: validated plays, newest first, and the cursor to the page before it. */
export function projectPlays(input:unknown):{plays:MusicPlay[];full:boolean;before?:number}{
 const o=record(input),items=list(o.items,50),plays:MusicPlay[]=[];
 for(const item of items){
  const at=Date.parse(text(record(item).played_at));if(!Number.isFinite(at))throw Error('Invalid play time');
  const c=closure(item);if(c)plays.push({at,track:c.track,album:c.album,artists:c.artists});
 }
 const cursor=o.cursors&&typeof o.cursors==='object'?(o.cursors as Record<string,unknown>).before:undefined;
 const before=typeof cursor==='string'&&/^[0-9]{1,16}$/.test(cursor)?Number(cursor):undefined;
 return {plays,full:items.length===50,before};
}

/** Newest copy wins, so displayed metadata is the most recent Spotify supplied. Future-dated plays are ignored. */
export function mergeLibrary(library:MusicLibrary,plays:MusicPlay[],now:number):MusicLibrary {
 for(const p of [...plays].sort((a,b)=>a.at-b.at)){
  if(p.at>now+DAY)continue;
  const prev=library.tracks[p.track.id];if(prev&&prev.seen>p.at)continue;
  library.tracks[p.track.id]={node:p.track,album:p.album.id,seen:p.at};
  library.albums[p.album.id]={node:p.album,artists:p.artists.map(a=>a.id)};
  for(const a of p.artists)library.artists[a.id]={node:a};
 }
 return pruneLibrary(library,now);
}

/** Deletes what was last played before the retention window, then the oldest beyond the size bound, then orphans. */
export function pruneLibrary(library:MusicLibrary,now:number):MusicLibrary {
 let keep=Object.entries(library.tracks).filter(([,t])=>t.seen>=now-RETENTION_DAYS*DAY&&library.albums[t.album]).sort((a,b)=>b[1].seen-a[1].seen||(a[0]<b[0]?-1:1)).slice(0,LIBRARY_TRACKS);
 for(;;){
  const tracks=Object.fromEntries(keep),albums:MusicLibrary['albums']={},artists:MusicLibrary['artists']={};
  for(const [,t] of keep){const album=library.albums[t.album];albums[t.album]=album;for(const id of album.artists)if(library.artists[id])artists[id]=library.artists[id];}
  // Stay far below the storage value limit even for unusually long credits: drop the oldest until it fits.
  if(keep.length>1&&JSON.stringify([tracks,albums,artists]).length>LIBRARY_BYTES){keep=keep.slice(0,Math.max(1,keep.length-8));continue;}
  library.tracks=tracks;library.albums=albums;library.artists=artists;return library;
 }
}

/** The public view of one period: most recently played tracks first, whole closures only, no timing. */
export function projectLibrary(library:MusicLibrary,now:number,period:MusicPeriod):MusicResponse {
 try{
  const nodes=new Map<string,MusicNode>(),edges=new Map<string,{source:string;target:string}>();let tracks=0;
  const recent=Object.values(library.tracks).filter(t=>t.seen>=now-period*DAY&&t.seen>=now-RETENTION_DAYS*DAY).sort((a,b)=>b.seen-a.seen||(a.node.id<b.node.id?-1:1));
  for(const t of recent){
   if(tracks>=DISPLAY_TRACKS)break;
   const album=library.albums[t.album];if(!album)continue;const credits=album.artists.map(id=>library.artists[id]?.node);if(!credits.length||credits.some(a=>!a))continue;
   const next=new Set([...nodes.keys(),...album.artists]);if([...next].filter(id=>id.startsWith('artist:')).length>64)continue;
   nodes.set(t.node.id,t.node);nodes.set(album.node.id,album.node);tracks++;edges.set(t.node.id+'>'+album.node.id,{source:t.node.id,target:album.node.id});
   for(const a of credits){nodes.set(a!.id,a!);edges.set(album.node.id+'>'+a!.id,{source:album.node.id,target:a!.id});}
  }
  if(!tracks)return {version:1,status:'empty'};
  const key=(e:{source:string;target:string})=>e.source+e.target;
  return readMusic({version:1,status:'ready',period,graph:{nodes:[...nodes.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),edges:[...edges.values()].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0)}});
 }catch{return {version:1,status:'unavailable'};}
}
