import type {Plugin} from 'vite';
import {projectRecent} from '../src/music/model';
/** Synthetic only. Installed only for explicit local Vite development, never production. */
export function musicPreviewServer(enabled:boolean):Plugin {
 return {name:'local-synthetic-music',configureServer(server){if(!enabled)return;server.middlewares.use((req,res,next)=>{
  if(req.url?.split('?')[0]!=='/api/music'||!/^127\.0\.0\.1:\d+$/.test(req.headers.host??''))return next();
  const id=(n:number)=>String(n).padStart(22,'0');const artist=(n:number)=>({id:id(n),name:'架空の演奏者 '+n,external_urls:{spotify:'https://open.spotify.com/artist/'+id(n)}});
  const items=Array.from({length:8},(_,i)=>({track:{id:id(i+1),type:'track',name:'架空の曲 '+(i+1),explicit:false,artists:[artist(30+i%3)],external_urls:{spotify:'https://open.spotify.com/track/'+id(i+1)},album:{id:id(20+i%4),name:'架空のアルバム '+(i%4+1),artists:[artist(30+(i%4)%3)],images:[],external_urls:{spotify:'https://open.spotify.com/album/'+id(20+i%4)}}}}));
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(projectRecent({items})));
 });}};
}
