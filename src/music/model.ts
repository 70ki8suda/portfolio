/** Independent display schema: never passed to the article graph or AI pipeline. */
export type MusicKind = 'track' | 'album' | 'artist';
export interface MusicNode {id:string;kind:MusicKind;name:string;url:string;artists?:string[];image?:string;explicit?:boolean}
export interface MusicGraph {nodes:MusicNode[];edges:{source:string;target:string}[]}
export type MusicStatus='unconfigured'|'disconnected'|'syncing'|'empty'|'reauthorize'|'rate_limited'|'unavailable';
/** Granularity of one public view. Each view is the whole retention window; only the kind of node changes. */
export type MusicView='artist'|'album'|'track';
export const musicViews:readonly MusicView[]=['artist','album','track'];
export const readView=(v:unknown):MusicView=>musicViews.find(p=>p===v)??'artist';
/** `total` counts the view's own kind in the retention window, so a bounded view can say what it left out. */
export type MusicResponse={version:1;status:MusicStatus}|{version:1;status:'ready';graph:MusicGraph;view?:MusicView;total?:number};
/** Display bounds: accumulation is larger than any one view, so a phone never draws the whole library. */
export const DISPLAY_TRACKS=36;
export const DISPLAY_ALBUMS=60;
export const DISPLAY_ARTISTS=96;
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
 return {track:t,album,artists,performers};
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
   relation(c.track.id,[c.album.id,...c.performers.map(p=>p.id)]);relation(c.album.id,c.artists.map(p=>p.id));
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

/**
 * Strict public reader guards corrupted storage; request sequencing is the client’s responsibility.
 * Every line is a relation Spotify states: track>album (appears on), album>artist and track>artist (credit),
 * artist>artist (both credited on one track or one album). Nothing is inferred from listening.
 */
export function readMusic(value:unknown):MusicResponse {
 const o=record(value);if(o.version!==1)throw Error('Unsupported music schema');
 if(o.status!=='ready'){only(o,['version','status']);if(!statuses.includes(o.status as MusicStatus))throw Error('Invalid music state');return {version:1,status:o.status as MusicStatus};}
 only(o,['version','status','graph','view','total']);const g=record(o.graph);only(g,['nodes','edges']);
 if(o.view!==undefined&&!musicViews.includes(o.view as MusicView))throw Error('Invalid music view');
 if((o.view===undefined)!==(o.total===undefined))throw Error('Invalid music total');
 const view=(o.view??'track') as MusicView;
 const nodes=list(g.nodes,DISPLAY_TRACKS*2+DISPLAY_ALBUMS+DISPLAY_ARTISTS).map(v=>{
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
 const bounds={track:view==='track'?DISPLAY_TRACKS:0,album:view==='track'?DISPLAY_TRACKS:view==='album'?DISPLAY_ALBUMS:0,artist:DISPLAY_ARTISTS};
 const count=(kind:MusicKind)=>nodes.filter(n=>n.kind===kind).length;
 for(const kind of kinds)if(count(kind)>bounds[kind]||(!count(kind)&&(kind===view||view==='track')))throw Error('Invalid node bounds');
 if(o.total!==undefined&&(!Number.isSafeInteger(o.total)||(o.total as number)<count(view)||(o.total as number)>100000))throw Error('Invalid music total');
 const seen=new Set<string>();const edges=list(g.edges,8000).map(v=>{
  const e=record(v);only(e,['source','target']);const source=text(e.source),target=text(e.target),s=map.get(source),t=map.get(target);
  if(!s||!t||seen.has(source+'>'+target))throw Error('Invalid edge');
  const pair=s.kind+'>'+t.kind;
  if(!(view==='artist'?pair==='artist>artist'&&source<target:pair==='album>artist'||(view==='track'&&(pair==='track>album'||pair==='track>artist'))))throw Error('Invalid edge');
  seen.add(source+'>'+target);return {source,target};
 });
 if(view!=='artist')for(const n of nodes){
  const out=edges.filter(e=>e.source===n.id),incoming=edges.some(e=>e.target===n.id);
  if(n.kind==='track'?out.filter(e=>e.target.startsWith('album:')).length!==1:n.kind==='album'?(!out.length||(view==='track'&&!incoming)):!incoming)throw Error('Incomplete metadata relation');
 }
 return o.view===undefined?{version:1,status:'ready',graph:{nodes,edges}}:{version:1,status:'ready',graph:{nodes,edges},view,total:o.total as number};
}

/**
 * Private accumulation. `seen` (last play, ms) never leaves the server; it only orders, expires and
 * bounds entries. Metadata is the copy Spotify returned at that last play, so no entry is older than the retention.
 */
export interface MusicLibrary {
 /** `performers` are the track's own credits; entries stored before it existed simply have none. */
 tracks:Record<string,{node:MusicNode;album:string;seen:number;performers?:string[]}>;
 albums:Record<string,{node:MusicNode;artists:string[]}>;
 artists:Record<string,{node:MusicNode}>;
}
export interface MusicPlay {at:number;track:MusicNode;album:MusicNode;artists:MusicNode[];performers:MusicNode[]}
export const emptyLibrary=():MusicLibrary=>({tracks:{},albums:{},artists:{}});

/** One recently-played page: validated plays, newest first, and the cursor to the page before it. */
export function projectPlays(input:unknown):{plays:MusicPlay[];items:number;full:boolean;before?:number}{
 const o=record(input),items=list(o.items,50),plays:MusicPlay[]=[];
 for(const item of items){
  const at=Date.parse(text(record(item).played_at));if(!Number.isFinite(at))throw Error('Invalid play time');
  const c=closure(item);if(c)plays.push({at,track:c.track,album:c.album,artists:c.artists,performers:c.performers});
 }
 const cursor=o.cursors&&typeof o.cursors==='object'?(o.cursors as Record<string,unknown>).before:undefined;
 const before=typeof cursor==='string'&&/^[0-9]{1,16}$/.test(cursor)?Number(cursor):undefined;
 return {plays,items:items.length,full:items.length===50,before};
}

/** Newest copy wins, so displayed metadata is the most recent Spotify supplied. Future-dated plays are ignored. */
export function mergeLibrary(library:MusicLibrary,plays:MusicPlay[],now:number):MusicLibrary {
 for(const p of [...plays].sort((a,b)=>a.at-b.at)){
  if(p.at>now+DAY)continue;
  const prev=library.tracks[p.track.id];if(prev&&prev.seen>p.at)continue;
  library.tracks[p.track.id]={node:p.track,album:p.album.id,seen:p.at,performers:p.performers.map(a=>a.id)};
  library.albums[p.album.id]={node:p.album,artists:p.artists.map(a=>a.id)};
  for(const a of [...p.artists,...p.performers])library.artists[a.id]={node:a};
 }
 return pruneLibrary(library,now);
}

/** Deletes what was last played before the retention window, then the oldest beyond the size bound, then orphans. */
export function pruneLibrary(library:MusicLibrary,now:number):MusicLibrary {
 let keep=Object.entries(library.tracks).filter(([,t])=>t.seen>=now-RETENTION_DAYS*DAY&&library.albums[t.album]).sort((a,b)=>b[1].seen-a[1].seen||(a[0]<b[0]?-1:1)).slice(0,LIBRARY_TRACKS);
 for(;;){
  const tracks=Object.fromEntries(keep),albums:MusicLibrary['albums']={},artists:MusicLibrary['artists']={};
  for(const [,t] of keep){const album=library.albums[t.album];albums[t.album]=album;for(const id of [...album.artists,...(t.performers??[])])if(library.artists[id])artists[id]=library.artists[id];}
  // Stay far below the storage value limit even for unusually long credits: drop the oldest until it fits.
  if(keep.length>1&&JSON.stringify([tracks,albums,artists]).length>LIBRARY_BYTES){keep=keep.slice(0,Math.max(1,keep.length-8));continue;}
  library.tracks=tracks;library.albums=albums;library.artists=artists;return library;
 }
}

/**
 * The public view at one granularity over the whole retention window: most recently played first, no timing.
 * Bounded per view; `total` says how many of that kind the window holds.
 */
export function projectLibrary(library:MusicLibrary,now:number,view:MusicView):MusicResponse {
 try{
  const nodes=new Map<string,MusicNode>(),edges=new Map<string,{source:string;target:string}>();
  const link=(source:string,target:string)=>edges.set(source+'>'+target,{source,target});
  // Whole closures only: a track whose album or credits are missing is not part of any view.
  const recent=Object.values(library.tracks).filter(t=>t.seen>=now-RETENTION_DAYS*DAY).sort((a,b)=>b.seen-a.seen||(a.node.id<b.node.id?-1:1)).flatMap(t=>{
   const album=library.albums[t.album];if(!album)return [];
   const credits=album.artists.map(id=>library.artists[id]?.node),performers=(t.performers??[]).map(id=>library.artists[id]?.node);
   if(!credits.length||[...credits,...performers].some(a=>!a))return [];
   return [{track:t.node,album:album.node,credits:credits as MusicNode[],performers:performers as MusicNode[]}];
  });
  let total=0;
  if(view==='track'){
   total=recent.length;let tracks=0;
   for(const t of recent){
    if(tracks>=DISPLAY_TRACKS)break;
    const extra=t.performers.filter(p=>!t.credits.some(c=>c.id===p.id));
    if(new Set([...[...nodes.keys()].filter(id=>id.startsWith('artist:')),...t.credits.map(a=>a.id),...extra.map(a=>a.id)]).size>DISPLAY_ARTISTS)continue;
    nodes.set(t.track.id,t.track);nodes.set(t.album.id,t.album);tracks++;link(t.track.id,t.album.id);
    for(const a of t.credits){nodes.set(a.id,a);link(t.album.id,a.id);}
    // A performer the album does not credit is tied to the track itself.
    for(const a of extra){nodes.set(a.id,a);link(t.track.id,a.id);}
   }
  }else if(view==='album'){
   total=new Set(recent.map(t=>t.album.id)).size;let shown=0;
   for(const t of recent){
    if(shown>=DISPLAY_ALBUMS)break;if(nodes.has(t.album.id))continue;
    if(new Set([...[...nodes.keys()].filter(id=>id.startsWith('artist:')),...t.credits.map(a=>a.id)]).size>DISPLAY_ARTISTS)continue;
    nodes.set(t.album.id,t.album);shown++;for(const a of t.credits){nodes.set(a.id,a);link(t.album.id,a.id);}
   }
  }else{
   const all=new Map<string,MusicNode>();for(const t of recent)for(const a of [...t.credits,...t.performers])if(!all.has(a.id))all.set(a.id,a);
   total=all.size;for(const a of [...all.values()].slice(0,DISPLAY_ARTISTS))nodes.set(a.id,a);
   // Artists are joined only when Spotify credits them together on one track or one album.
   for(const t of recent)for(const group of [t.credits,t.performers]){
    const ids=[...new Set(group.map(a=>a.id))].filter(id=>nodes.has(id)).sort();
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)link(ids[i],ids[j]);
   }
  }
  if(!nodes.size)return {version:1,status:'empty'};
  const key=(e:{source:string;target:string})=>e.source+e.target;
  return readMusic({version:1,status:'ready',view,total,graph:{nodes:[...nodes.values()].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0),edges:[...edges.values()].sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0)}});
 }catch{return {version:1,status:'unavailable'};}
}
