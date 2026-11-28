import {lazy,Suspense,useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {SceneHandle,SceneView} from '../blog/ParagraphGraphScene';
import * as stylex from '@stylexjs/stylex';
import {graph} from '../styles/graph.stylex';
import type {MusicGraph as Data,MusicNode,MusicPeriod,MusicResponse} from './model';
import {musicPeriods,readMusic} from './model';
import './music.css';
const Scene=lazy(()=>import('../blog/ParagraphGraphScene'));
const messages={loading:'音楽を読み込んでいます…',unconfigured:'音楽はまだ接続されていません。',disconnected:'音楽の接続は解除されています。',syncing:'音楽を更新しています…',reauthorize:'Spotifyへの再接続を待っています。',rate_limited:'Spotifyの利用制限により、更新を待っています。',unavailable:'音楽を読み込めませんでした。'};
const preview=import.meta.env.DEV&&process.env.MUSIC_GRAPH_PREVIEW==='1';
const tone={track:'#247e7a',album:'#b17b3b',artist:'#87619a'};
const kindLabel={track:'曲',album:'アルバム',artist:'アーティスト'};
const GOLDEN=Math.PI*(3-Math.sqrt(5));
/** Deterministic clusters: each album sits beside its first credited artist, its tracks fan out behind it. */
export function layoutMusic(data:Data){
 const p=new Map<string,{x:number;y:number}>(),home=new Map<string,string[]>();
 for(const album of data.nodes.filter(n=>n.kind==='album')){const first=data.edges.find(e=>e.source===album.id)!.target;home.set(first,[...(home.get(first)??[]),album.id]);}
 const clusters=data.nodes.filter(n=>n.kind==='artist').map(a=>({id:a.id,albums:home.get(a.id)??[]})).sort((a,b)=>b.albums.length-a.albums.length||(a.id<b.id?-1:1));
 clusters.forEach((c,i)=>{
  const turn=i*GOLDEN,r=440*Math.sqrt(i),cx=r*Math.cos(turn),cy=r*Math.sin(turn);p.set(c.id,{x:cx,y:cy});
  c.albums.forEach((album,j)=>{
   const angle=turn+j*2*Math.PI/c.albums.length,ax=cx+120*Math.cos(angle),ay=cy+120*Math.sin(angle);p.set(album,{x:ax,y:ay});
   const tracks=data.edges.filter(e=>e.target===album).map(e=>e.source),spread=Math.min(.6,2.2/tracks.length);
   tracks.forEach((track,k)=>{const a=angle+(k-(tracks.length-1)/2)*spread,d=110+(k%2)*45;p.set(track,{x:ax+d*Math.cos(a),y:ay+d*Math.sin(a)});});
  });
 });
 return p;
}
export default function MusicGraph({home=false}:{home?:boolean}){
 const [data,setData]=useState<MusicResponse|{status:'loading'}>({status:'loading'}),[period,setPeriod]=useState<MusicPeriod>(30),[active,setActive]=useState(false);
 useEffect(()=>{
  let disposed=false,sequence=0,controller:AbortController|undefined;
  const load=async()=>{const turn=++sequence;controller?.abort();controller=new AbortController();try{const r=await fetch('/api/music?period='+period,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();const v=readMusic(await r.json());if(!disposed&&turn===sequence)setData(v);}catch{if(!disposed&&turn===sequence)setData({version:1,status:'unavailable'});}};
  void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);
  const visible=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',visible);
  return()=>{disposed=true;sequence++;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[period]);
 const Heading=home?'h2':'h1';
 return <section className={home?'music-section music-home':'music-section'} lang="ja" aria-labelledby="music-heading">
  <div className="music-intro"><Heading id="music-heading">最近の音楽</Heading><p>接続してから聴いた曲を、アルバム、アーティストへたどれます。線はSpotifyに記載された収録・クレジットの関係です。</p>{preview&&<p className="music-preview">合成データのローカルプレビュー</p>}</div>
  {data.status==='ready'?<MusicCanvas key={JSON.stringify(data.graph)} data={data.graph} period={period} onPeriod={setPeriod} active={active} setActive={setActive}/>:<>{data.status==='empty'&&period!==30&&<PeriodSwitch period={period} onPeriod={setPeriod}/>}<p role="status" className="music-status">{data.status==='empty'?`この${period}日に聴いた音楽はまだありません。`:messages[data.status]}</p>{data.status==='empty'&&period===30&&<button type="button" className="music-wider" onClick={()=>setPeriod(180)}>180日で見る</button>}</>}
  <footer className="music-footer"><a href="https://open.spotify.com/" aria-label="Spotify"><img src="/spotify-logo.svg" width="90" alt="Spotify"/></a><a href="/music-privacy">音楽データについて</a>{home&&<a href="/knowdes?media=music">音楽のページで見る</a>}</footer>
 </section>;
}
function PeriodSwitch({period,onPeriod}:{period:MusicPeriod;onPeriod:(p:MusicPeriod)=>void}){
 return <div role="group" aria-label="表示する期間" {...stylex.props(graph.glass,graph.levels)}>{musicPeriods.map(p=><button key={p} type="button" aria-pressed={period===p} {...stylex.props(graph.levelButton,period===p&&graph.levelCurrent)} onClick={()=>onPeriod(p)}>{p}日</button>)}</div>;
}
function MusicCanvas({data,period,onPeriod,active,setActive}:{data:Data;period:MusicPeriod;onPeriod:(p:MusicPeriod)=>void;active:boolean;setActive:(v:boolean)=>void}){
 const scene=useRef<SceneHandle|null>(null),labels=useRef<HTMLDivElement|null>(null),frame=useRef<HTMLDivElement|null>(null),lastButton=useRef<HTMLElement|null>(null),close=useRef<HTMLButtonElement|null>(null);
 const [ready,setReady]=useState(false),[view,setView]=useState<SceneView>(),[selected,setSelected]=useState<MusicNode>(),[list,setList]=useState(false);
 const drag=useRef<{id:number;x:number;y:number;startX:number;startY:number;moved:boolean}|undefined>(undefined),suppressClick=useRef(false);
 const down=(e:ReactPointerEvent<HTMLButtonElement>)=>{if(!e.isPrimary||e.button!==0)return;suppressClick.current=false;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);};
 const move=(e:ReactPointerEvent<HTMLButtonElement>)=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;d.moved ||= Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>6;if(d.moved){suppressClick.current=true;if(active){e.preventDefault();scene.current?.panBy(e.clientX-d.x,e.clientY-d.y);}}d.x=e.clientX;d.y=e.clientY;};
 const cancelDrag=()=>{drag.current=undefined;suppressClick.current=true;};
 const positions=useMemo(()=>layoutMusic(data),[data]);
 const box=useMemo(()=>{const v=[...positions.values()];return {x:(Math.min(...v.map(p=>p.x))+Math.max(...v.map(p=>p.x)))/2,y:(Math.min(...v.map(p=>p.y))+Math.max(...v.map(p=>p.y)))/2,w:Math.max(...v.map(p=>p.x))-Math.min(...v.map(p=>p.x))+260,h:Math.max(...v.map(p=>p.y))-Math.min(...v.map(p=>p.y))+220};},[positions]);
 const fitOf=(v:{width:number;height:number})=>Math.min((v.width-40)/box.w,(v.height-120)/box.h,1.2);
 const fit=view?fitOf(view):.3;
 const fitRef=useRef(fit);fitRef.current=fit;
 const size=useRef('');
 const onView=(v:SceneView)=>{setView(v);const next=v.width+':'+v.height;if(next!==size.current){size.current=next;requestAnimationFrame(()=>scene.current?.moveTo(box.x,box.y,fitOf(v),false));}};
 useEffect(()=>{if(ready)scene.current?.moveTo(box.x,box.y,fitRef.current,false);},[ready]);
 const select=(id:string,button?:HTMLElement)=>{const n=data.nodes.find(n=>n.id===id);if(!n)return;lastButton.current=button??document.activeElement as HTMLElement;setSelected(n);};
 const dismiss=()=>{setSelected(undefined);requestAnimationFrame(()=>{const el=lastButton.current;if(el?.isConnected)el.focus({preventScroll:true});});};
 useEffect(()=>{if(!selected)return;close.current?.focus({preventScroll:true});const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();dismiss();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[selected]);
 const enter=useRef<HTMLButtonElement|null>(null);
 const leave=()=>{setActive(false);requestAnimationFrame(()=>enter.current?.focus({preventScroll:true}));};
 // Like the article map: leaving the viewport hands the gestures back to the page.
 useEffect(()=>{const el=frame.current;if(!el||!active)return;const o=new IntersectionObserver(([e])=>{if(!e.isIntersecting)setActive(false);});o.observe(el);return()=>o.disconnect();},[active]);
 const nodes=data.nodes.map(n=>({id:n.id,data:{kind:'node' as const,ref:n.id,radius:Math.min(7/Math.max(fit,.01),30),fill:n.kind==='album'?'#efede6':tone[n.kind],stroke:tone[n.kind],opacity:1,ring:n.id===selected?.id?'#263732':undefined}}));
 const edges=data.edges.map(e=>({...e,id:e.source+'>'+e.target,fill:'#b8b6ab',size:Math.min(1/Math.max(fit,.01),5),data:{kind:'link' as const,ref:''}}));
 return <><div className="music-tools"><button type="button" {...stylex.props(graph.glass,graph.control)} onClick={()=>setList(v=>!v)} aria-expanded={list}>曲から選ぶ</button></div>
 {list&&<div className="music-list" aria-label="曲の一覧">{data.nodes.filter(n=>n.kind==='track').map(n=><button key={n.id} onClick={e=>select(n.id,e.currentTarget)}>{n.name}</button>)}</div>}
 <div ref={frame} className="music-canvas" data-testid="music-graph" data-ready={ready} data-zoom={view?.zoom} data-x={view?.x} data-y={view?.y} onPointerDownCapture={e=>{if(!e.isPrimary)cancelDrag();}} onKeyDown={e=>{if(e.key==='Escape'&&active&&!selected){e.preventDefault();leave();}}} style={{touchAction:active?'none':'pan-y'}}>
  <div className="music-scene" style={{pointerEvents:active?'auto':'none'}}><Suspense fallback={<p role="status">グラフを準備しています…</p>}><Scene ref={scene} gestureSurface={frame} gesturesEnabled={active} nodes={nodes} edges={edges} positions={id=>positions.get(id)} rings={[]} background="#efede6" accent="#247e7a" minZoom={Math.max(fit*.5,.005)} maxZoom={Math.max(fit*12,2)} labels={labels} onReady={()=>setReady(true)} onView={onView} onNode={n=>select(n.ref)} onEdge={()=>{}} onBackground={()=>{if(selected)dismiss();}} onHover={()=>{}} onDragged={()=>{}}/></Suspense></div>
  <div ref={labels} className="music-labels" inert={!active}>{data.nodes.map(n=>{const p=positions.get(n.id)!;return <div key={n.id} className="music-anchor" data-wx={p.x} data-wy={p.y}><button data-kind="paragraph-tag" data-priority={selected?.id===n.id?'3':'1'} className="music-label" onPointerDown={down} onPointerMove={move} onPointerUp={()=>{drag.current=undefined;}} onPointerCancel={cancelDrag} style={{color:tone[n.kind]}} title={`${kindLabel[n.kind]}: ${n.name}`} aria-label={`${kindLabel[n.kind]}: ${n.name}`} onClick={e=>{if(e.detail!==0&&suppressClick.current){e.preventDefault();return;}select(n.id,e.currentTarget);}}>{n.name}</button></div>;})}</div>
  <div data-label-obstacle="" inert={!active} {...stylex.props(graph.corner,graph.bottomLeft)}>
   <button type="button" aria-label="音楽グラフを縮小" {...stylex.props(graph.glass,graph.control)} onClick={()=>scene.current?.zoomBy(1/1.5,true)}>−</button>
   <button type="button" aria-label="音楽グラフを拡大" {...stylex.props(graph.glass,graph.control)} onClick={()=>scene.current?.zoomBy(1.5,true)}>＋</button>
   <button type="button" {...stylex.props(graph.glass,graph.control)} onClick={()=>scene.current?.moveTo(box.x,box.y,fit,true)}>全体</button>
   <PeriodSwitch period={period} onPeriod={onPeriod}/>
  </div>
  <p data-label-obstacle="" {...stylex.props(graph.corner,graph.glass,graph.legend,graph.bottomRight)}><span><span style={{color:tone.track}}>●</span> 曲　<span style={{color:tone.album}}>○</span> アルバム　<span style={{color:tone.artist}}>●</span> アーティスト</span></p>
  {!active?<div {...stylex.props(graph.activation)}><button ref={enter} type="button" {...stylex.props(graph.glass,graph.control)} onClick={()=>setActive(true)}>音楽グラフを操作</button></div>
   :<button data-label-obstacle="" type="button" {...stylex.props(graph.glass,graph.control,graph.leaveEmbedded)} onClick={leave}>ページ操作へ</button>}
 </div>
 {selected&&<aside className="music-sheet" role="dialog" aria-modal="false" aria-label="音楽の詳細"><button ref={close} className="music-close" aria-label="音楽の詳細を閉じる" onClick={dismiss}>×</button><p>{kindLabel[selected.kind]}</p><h2>{selected.name}</h2>{selected.explicit&&<span aria-label="Explicit content">E</span>}{selected.artists&&<p>{selected.artists.join(' / ')}</p>}{selected.image&&<a href={selected.kind==='album'?selected.url:data.nodes.find(n=>n.id===data.edges.find(e=>e.source===selected.id)?.target)?.url} aria-label="Spotifyでアルバムを見る"><img src={selected.image} width="220" height="220" alt={`${selected.name}のジャケット`}/></a>}<p><a href={selected.url}>Spotifyで{kindLabel[selected.kind]}を開く</a></p><ul>{data.edges.filter(e=>e.source===selected.id||e.target===selected.id).map(e=>data.nodes.find(n=>n.id===(e.source===selected.id?e.target:e.source))!).map(n=><li key={n.id}><button onClick={()=>setSelected(n)}>{kindLabel[n.kind]}: {n.name}</button></li>)}</ul></aside>}
 </>;
}
