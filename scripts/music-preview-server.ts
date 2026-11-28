import type {Plugin} from 'vite';
import {emptyLibrary,mergeLibrary,projectLibrary,projectPlays,readPeriod} from '../src/music/model';
/** Synthetic only. Installed only for explicit local Vite development, never production. */
export function musicPreviewServer(enabled:boolean):Plugin {
 return {name:'local-synthetic-music',configureServer(server){if(!enabled)return;server.middlewares.use((req,res,next)=>{
  if(req.url?.split('?')[0]!=='/api/music'||!/^127\.0\.0\.1:\d+$/.test(req.headers.host??''))return next();
  // 60 plays spread over 170 days: enough to exercise accumulation, the periods and the display bound.
  const id=(n:number)=>String(n).padStart(22,'0'),now=Date.now(),artist=(n:number)=>({id:id(n),name:'架空の演奏者 '+(n-300),external_urls:{spotify:'https://open.spotify.com/artist/'+id(n)}});
  const items=Array.from({length:60},(_,i)=>({played_at:new Date(now-i*i*4080000-60000).toISOString(),track:{id:id(i+1),type:'track',name:'架空の曲 '+(i+1),explicit:false,artists:[artist(301+i%9)],external_urls:{spotify:'https://open.spotify.com/track/'+id(i+1)},album:{id:id(101+i%17),name:'架空のアルバム '+(i%17+1),artists:[artist(301+(i%17)%9)],images:[],external_urls:{spotify:'https://open.spotify.com/album/'+id(101+i%17)}}}}));
  const library=emptyLibrary();for(const page of [items.slice(0,50),items.slice(50)])mergeLibrary(library,projectPlays({items:page}).plays,now);
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(projectLibrary(library,now,readPeriod(new URL(req.url!,'http://local').searchParams.get('period')))));
 });}};
}
