import {useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import * as stylex from '@stylexjs/stylex';
import {watchGraph} from './graphRefresh';
import {articleClaimAnchors,selectArticleClaimEntrances,type ArticleClaimAnchor,type ArticleClaimMapping} from './articleGraph';
import {ClaimDetails} from './ClaimDetails';
import {graph} from '../styles/graph.stylex';
import {color,type} from '../styles/tokens.stylex';

const styles=stylex.create({
 root:{position:'relative'},
 source:{paddingRight:{default:40,'@media (max-width: 680px)':0}},
 entrance:{position:'absolute',right:0,width:36,minHeight:36,padding:4,display:'flex',alignItems:'center',justifyContent:'center',backgroundColor:'transparent',color:{default:color.textMuted,':hover':color.cyan},borderWidth:1,borderStyle:'solid',borderColor:color.borderFaint,borderRadius:4,cursor:'pointer',userSelect:'none'},
 dialog:{position:'fixed',inset:0,margin:'auto',width:'min(560px, calc(100vw - 24px))',maxHeight:'calc(100svh - 32px)',boxSizing:'border-box',overflowY:'auto',overscrollBehavior:'contain',padding:20,borderWidth:1,borderStyle:'solid',borderColor:color.border,backgroundColor:color.surfaceRaised,color:color.text,fontFamily:type.reading,'::backdrop':{backgroundColor:'rgba(0,0,0,0.25)'}},
 head:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12},
 close:{minWidth:40,minHeight:40,fontSize:24,borderWidth:0,backgroundColor:'transparent',color:color.text,cursor:'pointer'},
 status:{fontSize:12,color:color.textMuted,lineHeight:1.6},
});
type Positioned=ArticleClaimAnchor&{top:number};
/** Controls live outside the source/CommentProvider DOM, so quotes keep their exact text. */
export function ArticleGraphRelated({slug,sourceHash,enabled,children}:{slug:string;sourceHash?:string;enabled:boolean;children:ReactNode}) {
 const root=useRef<HTMLDivElement>(null),source=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),heading=useRef<HTMLHeadingElement>(null),origin=useRef<HTMLButtonElement|null>(null);
 const [mounted,setMounted]=useState(false);
 useEffect(()=>setMounted(true),[]);
 const [mapping,setMapping]=useState<ArticleClaimMapping|null>(null),[failed,setFailed]=useState(false),[positions,setPositions]=useState<Positioned[]>([]);
 const [selection,setSelection]=useState<{ids:string[];id:string}|null>(null);

 useEffect(()=>{
  if(!enabled)return;
  const watcher=watchGraph({data:data=>{const next=articleClaimAnchors(data,slug,sourceHash??'');setMapping(next);setFailed(false);setSelection(null);},error:()=>{setFailed(true);setSelection(null);},recovered:()=>setFailed(false)},undefined,'/graph-view.json');
  return ()=>watcher.stop();
 },[slug,sourceHash,enabled]);
 const ready=!failed&&mapping?.state==='ready';
 useLayoutEffect(()=>{
  if(!ready||!source.current||!root.current){setPositions([]);return;}
  const spaced=new Set<HTMLElement>(),mobile=window.matchMedia('(max-width: 680px)');
  let active=true;
  const measure=()=>{
   if(!active)return;
   const parent=root.current!,content=source.current!;
   const elements=Array.from(content.querySelectorAll<HTMLElement>('[id]'));
   const byId=new Map(elements.map(element=>[element.id,element]));
   const entrances=selectArticleClaimEntrances(mapping.anchors,elements.map(element=>({anchor:element.id,eligible:element.matches('p,h1,h2,h3,h4,h5,h6')})));
   const current=new Set(entrances.map(item=>byId.get(item.anchor)!));
   for(const element of spaced)if(!current.has(element)){element.removeAttribute('data-related-anchor-space');spaced.delete(element);}
   for(const element of current){element.setAttribute('data-related-anchor-space','');spaced.add(element);}
   const y=parent.getBoundingClientRect().top;
   setPositions(entrances.map(item=>{const rect=byId.get(item.anchor)!.getBoundingClientRect();return {...item,top:(mobile.matches?rect.bottom-40:rect.top)-y};}));
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(source.current!);
  mobile.addEventListener('change',measure);document.fonts.addEventListener('loadingdone',measure);void document.fonts.ready.then(measure);
  return()=>{active=false;observer.disconnect();mobile.removeEventListener('change',measure);document.fonts.removeEventListener('loadingdone',measure);for(const element of spaced)element.removeAttribute('data-related-anchor-space');};
 },[mapping,ready]);
 const close=()=>{setSelection(null);dialog.current?.close();origin.current?.isConnected&&origin.current.focus({preventScroll:true});};
 useLayoutEffect(()=>{
  if(selection&&ready){dialog.current?.showModal();dialog.current?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});}
  else if(dialog.current?.open){dialog.current.close();origin.current?.isConnected&&origin.current.focus({preventScroll:true});}
 },[!!selection,ready]);
 const choose=(id:string)=>{setSelection(previous=>previous?{...previous,id}:null);dialog.current?.scrollTo({top:0});heading.current?.focus({preventScroll:true});};
 const open=(item:Positioned,button:HTMLButtonElement)=>{origin.current=button;setSelection({ids:item.ids,id:item.ids[0]});};
 return <div ref={root} {...stylex.props(styles.root)} data-article-related-state={!enabled?'disabled':failed?'unavailable':mapping?.state??'loading'}>
  <div ref={source} {...stylex.props(enabled&&styles.source)}>{children}</div>
  {positions.map(item=><button key={item.anchor} data-related-anchor={item.anchor} data-related-claim-count={item.ids.length} type="button" aria-haspopup="dialog" aria-label={`${item.scope==='section'?'この節の根拠':'この箇所'}に関連する別記事を読む（関連先${item.targetIds.length}箇所）`} title={`関連先${item.targetIds.length}箇所`} {...stylex.props(styles.entrance)} style={{top:item.top}} onClick={event=>open(item,event.currentTarget)}>
   <svg aria-hidden="true" width="26" height="26" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="14" cy="14" r="11"/><text x="14" y="14" textAnchor="middle" dominantBaseline="central" stroke="none" fill="currentColor" fontFamily="system-ui, sans-serif" fontSize={item.targetIds.length>=100?10:12} fontWeight="600">{item.targetIds.length}</text></svg>
  </button>)}
  {enabled&&(!mapping||failed||mapping.state!=='ready')&&<p role="status" {...stylex.props(styles.status)}>{failed?'関連箇所を読み込めませんでした。接続が戻ると再確認します。':!mapping?'関連箇所を読み込み中…':mapping.state==='mismatch'?'本文と関連データの版が一致しないため、関連箇所を表示していません。':'関連データを確認できないため、関連箇所を表示していません。'}</p>}
  {mounted&&createPortal(<dialog ref={dialog} aria-label="関連する別記事の主張" lang="ja" {...stylex.props(styles.dialog)} onKeyDown={event=>{if(event.key==='Escape')event.stopPropagation();}} onCancel={event=>{event.preventDefault();close();}} onClick={event=>{if(event.target instanceof Element&&event.target.closest('a'))close();}}>
   <div {...stylex.props(styles.head)}><h2 ref={heading} tabIndex={-1} {...stylex.props(graph.groupHeading)}>関連する別記事の主張</h2><button type="button" aria-label="関連する主張を閉じる" {...stylex.props(styles.close)} onClick={close}>×</button></div>
   {selection&&ready&&<>
    {selection.ids.length>1&&<nav aria-label="この箇所を根拠にする主張"><ul {...stylex.props(graph.rows)}>{selection.ids.map(id=><li key={id}><button type="button" aria-pressed={selection.id===id} {...stylex.props(graph.rowButton)} onClick={()=>choose(id)}>{mapping.data.claims!.summaries[id].label??mapping.data.nodes.find(n=>n.id===id)!.text}</button></li>)}</ul></nav>}
    <ClaimDetails key={selection.id} data={mapping.data} id={selection.id} onSelect={choose}/>
   </>}
  </dialog>,document.body)}
 </div>;
}
