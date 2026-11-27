import {lazy,Suspense,useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import type {SceneHandle,SceneView} from '../blog/ParagraphGraphScene';
import type {MusicGraph as Data,MusicNode,MusicResponse} from './model';
import {readMusic} from './model';
import './music.css';
const Scene=lazy(()=>import('../blog/ParagraphGraphScene'));
const messages={loading:'音楽を読み込んでいます…',unconfigured:'音楽はまだ接続されていません。',disconnected:'音楽の接続は解除されています。',syncing:'音楽を更新しています…',empty:'最近の音楽はまだありません。',reauthorize:'Spotifyへの再接続を待っています。',rate_limited:'Spotifyの利用制限により、更新を待っています。',unavailable:'音楽を読み込めませんでした。'};
const preview=import.meta.env.DEV&&process.env.MUSIC_GRAPH_PREVIEW==='1';
const tone={track:'#247e7a',album:'#b17b3b',artist:'#87619a'};
const kindLabel={track:'曲',album:'アルバム',artist:'アーティスト'};
export default function MusicGraph({home=false}:{home?:boolean}){
 const [data,setData]=useState<MusicResponse|{status:'loading'}>({status:'loading'});
 useEffect(()=>{
  let disposed=false,sequence=0,controller:AbortController|undefined;
  const load=async()=>{const turn=++sequence;controller?.abort();controller=new AbortController();try{const r=await fetch('/api/music',{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();const v=readMusic(await r.json());if(!disposed&&turn===sequence)setData(v);}catch{if(!disposed&&turn===sequence)setData({version:1,status:'unavailable'});}};
  void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);
  const visible=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',visible);
  return()=>{disposed=true;sequence++;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[]);
 const Heading=home?'h2':'h1';
 return <section className={home?'music-section music-home':'music-section'} lang="ja" aria-labelledby="music-heading">
  <div className="music-intro"><Heading id="music-heading">最近の音楽</Heading><p>曲からアルバム、アーティストへ。線はSpotifyに記載された収録・クレジットの関係です。</p>{preview&&<p className="music-preview">合成データのローカルプレビュー</p>}</div>
  {data.status==='ready'?<MusicCanvas key={JSON.stringify(data.graph)} data={data.graph}/>:<p role="status" className="music-status">{messages[data.status]}</p>}
  <footer className="music-footer"><a href="https://open.spotify.com/" aria-label="Spotify"><img src="/spotify-logo.svg" width="90" alt="Spotify"/></a><a href="/music-privacy">音楽データについて</a>{home&&<a href="/knowdes?media=music">音楽のページで見る</a>}</footer>
 </section>;
}
function MusicCanvas({data}:{data:Data}){
 const scene=useRef<SceneHandle|null>(null),labels=useRef<HTMLDivElement|null>(null),frame=useRef<HTMLDivElement|null>(null),lastButton=useRef<HTMLElement|null>(null),close=useRef<HTMLButtonElement|null>(null);
 const [ready,setReady]=useState(false),[view,setView]=useState<SceneView>(),[selected,setSelected]=useState<MusicNode>(),[list,setList]=useState(false),[active,setActive]=useState(false);
 const drag=useRef<{id:number;x:number;y:number;startX:number;startY:number;moved:boolean}|undefined>(undefined),suppressClick=useRef(false);
 const down=(e:ReactPointerEvent<HTMLButtonElement>)=>{if(!e.isPrimary||e.button!==0)return;suppressClick.current=false;drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};e.currentTarget.setPointerCapture(e.pointerId);};
 const move=(e:ReactPointerEvent<HTMLButtonElement>)=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;d.moved ||= Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>6;if(d.moved){suppressClick.current=true;if(active){e.preventDefault();scene.current?.panBy(e.clientX-d.x,e.clientY-d.y);}}d.x=e.clientX;d.y=e.clientY;};
 const cancelDrag=()=>{drag.current=undefined;suppressClick.current=true;};
 const positions=useMemo(()=>{const p=new Map<string,{x:number;y:number}>();for(const [col,kind] of ['track','album','artist'].entries()){const group=data.nodes.filter(n=>n.kind===kind);group.forEach((n,i)=>p.set(n.id,{x:(col-1)*350,y:(i-(group.length-1)/2)*95}));}return p;},[data]);
 const extent=Math.max(300,...[...positions.values()].map(p=>Math.abs(p.y)*2+160));
 const fit=view?Math.min((view.width-80)/950,(view.height-100)/extent):.3;
 const fitRef=useRef(fit);fitRef.current=fit;
 const size=useRef('');
 const onView=(v:SceneView)=>{setView(v);const next=v.width+':'+v.height;if(next!==size.current){size.current=next;requestAnimationFrame(()=>scene.current?.moveTo(0,0,Math.min((v.width-80)/950,(v.height-100)/extent),false));}};
 useEffect(()=>{if(ready)scene.current?.moveTo(0,0,fitRef.current,false);},[ready]);
 const select=(id:string,button?:HTMLElement)=>{const n=data.nodes.find(n=>n.id===id);if(!n)return;lastButton.current=button??document.activeElement as HTMLElement;setSelected(n);};
 const dismiss=()=>{setSelected(undefined);requestAnimationFrame(()=>{const el=lastButton.current;if(el?.isConnected)el.focus({preventScroll:true});});};
 useEffect(()=>{if(!selected)return;close.current?.focus({preventScroll:true});const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();dismiss();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[selected]);
 const nodes=data.nodes.map(n=>({id:n.id,data:{kind:'node' as const,ref:n.id,radius:7/Math.max(fit,.01),fill:n.kind==='album'?'#efede6':tone[n.kind],stroke:tone[n.kind],opacity:1,ring:n.id===selected?.id?'#263732':undefined}}));
 const edges=data.edges.map(e=>({...e,id:e.source+'>'+e.target,fill:'#b8b6ab',size:1/Math.max(fit,.01),data:{kind:'link' as const,ref:''}}));
 return <><div className="music-tools"><button onClick={()=>setList(v=>!v)} aria-expanded={list}>曲から選ぶ</button><button onClick={()=>setActive(v=>!v)} aria-pressed={active}>{active?'ページのスクロールに戻る':'グラフを操作'}</button><button aria-label="拡大" onClick={()=>scene.current?.zoomBy(1.4,true)}>＋</button><button aria-label="縮小" onClick={()=>scene.current?.zoomBy(1/1.4,true)}>−</button><button onClick={()=>scene.current?.moveTo(0,0,fit,true)}>全体を見る</button></div>
 {list&&<div className="music-list" aria-label="曲の一覧">{data.nodes.filter(n=>n.kind==='track').map(n=><button key={n.id} onClick={e=>select(n.id,e.currentTarget)}>{n.name}</button>)}</div>}
 <div ref={frame} className="music-canvas" data-testid="music-graph" data-ready={ready} data-zoom={view?.zoom} data-x={view?.x} data-y={view?.y} onPointerDownCapture={e=>{if(!e.isPrimary)cancelDrag();}} style={{touchAction:active?'none':'pan-y'}}>
  <div className="music-scene" style={{pointerEvents:active?'auto':'none'}}><Suspense fallback={<p role="status">グラフを準備しています…</p>}><Scene ref={scene} gestureSurface={frame} gesturesEnabled={active} nodes={nodes} edges={edges} positions={id=>positions.get(id)} rings={[]} background="#efede6" accent="#247e7a" minZoom={Math.max(fit*.5,.005)} maxZoom={Math.max(fit*12,2)} labels={labels} onReady={()=>setReady(true)} onView={onView} onNode={n=>select(n.ref)} onEdge={()=>{}} onBackground={()=>{}} onHover={()=>{}} onDragged={()=>{}}/></Suspense></div>
  <div ref={labels} className="music-labels">{data.nodes.map(n=>{const p=positions.get(n.id)!;return <div key={n.id} className="music-anchor" data-wx={p.x} data-wy={p.y}><button data-kind="paragraph-tag" data-priority={selected?.id===n.id?'3':'1'} className="music-label" onPointerDown={down} onPointerMove={move} onPointerUp={()=>{drag.current=undefined;}} onPointerCancel={cancelDrag} style={{color:tone[n.kind]}} title={`${kindLabel[n.kind]}: ${n.name}`} aria-label={`${kindLabel[n.kind]}: ${n.name}`} onClick={e=>{if(e.detail!==0&&suppressClick.current){e.preventDefault();return;}select(n.id,e.currentTarget);}}>{n.name}</button></div>;})}</div>
  <div className="music-legend" data-label-obstacle>曲 <span>—</span> アルバム <span>—</span> アーティスト</div>
 </div>
 {selected&&<aside className="music-sheet" role="dialog" aria-modal="false" aria-label="音楽の詳細"><button ref={close} className="music-close" aria-label="音楽の詳細を閉じる" onClick={dismiss}>×</button><p>{kindLabel[selected.kind]}</p><h2>{selected.name}</h2>{selected.explicit&&<span aria-label="Explicit content">E</span>}{selected.artists&&<p>{selected.artists.join(' / ')}</p>}{selected.image&&<a href={selected.kind==='album'?selected.url:data.nodes.find(n=>n.id===data.edges.find(e=>e.source===selected.id)?.target)?.url} aria-label="Spotifyでアルバムを見る"><img src={selected.image} width="220" height="220" alt={`${selected.name}のジャケット`}/></a>}<p><a href={selected.url}>Spotifyで{kindLabel[selected.kind]}を開く</a></p><ul>{data.edges.filter(e=>e.source===selected.id||e.target===selected.id).map(e=>data.nodes.find(n=>n.id===(e.source===selected.id?e.target:e.source))!).map(n=><li key={n.id}><button onClick={()=>setSelected(n)}>{kindLabel[n.kind]}: {n.name}</button></li>)}</ul></aside>}
 </>;
}
