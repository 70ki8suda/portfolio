import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import * as stylex from '@stylexjs/stylex';
import {clearCommentSession,getCommentSession,commentTarget,rangeCommentTarget,discussionUrl,GISCUS_ORIGIN,widgetUrl,type CommentTarget} from './githubComments';
import {annotationHash,createAnnotation,decodeAnnotation,validateAnnotation,type CommentAnnotation} from './commentAnnotations';
import {annotationParagraphs,selectedAnnotationRanges,annotationRange} from './annotationDom';
import {useCommentIndex} from './useCommentIndex';
import type {IndexedComment,CommentIndexState} from './commentIndex';
const styles=stylex.create({
 area:{marginBlock:20,padding:16,borderWidth:1,borderStyle:'solid',borderColor:'#52685f50',borderRadius:12,color:'#263d35',backgroundColor:'#f5f5ed'},
 actions:{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap'},
 button:{fontFamily:'inherit',fontSize:13,color:'#263d35',backgroundColor:'#f5f5ed',borderWidth:1,borderStyle:'solid',borderColor:'#52685f80',borderRadius:6,padding:'8px 10px',cursor:'pointer',minHeight:44},
 link:{fontSize:13,color:'#34584a',overflowWrap:'anywhere'},
 note:{fontSize:12,lineHeight:1.7,color:'#465a51',marginBlock:10},
 frame:{width:'100%',borderWidth:0,minHeight:250,colorScheme:'light'},
 popup:{position:'fixed',right:12,bottom:12,width:'min(560px, calc(100vw - 24px))',maxHeight:'75dvh',overflowY:'auto',zIndex:100,padding:16,borderWidth:1,borderStyle:'solid',borderColor:'#52685f',borderRadius:12,backgroundColor:'#f5f5ed',color:'#263d35',boxShadow:'0 6px 28px #0003'},
 quote:{fontSize:14,lineHeight:1.6,overflowWrap:'anywhere',whiteSpace:'pre-wrap',marginBlock:10},
});
type Post={slug:string;title:string;body:string};
type ContextValue={ready:boolean;post:Post;notice:string;index:CommentIndexState;entries:IndexedComment[];openArticle:(origin?:HTMLElement)=>void;openExisting:(entry:IndexedComment,origin?:HTMLElement)=>void;manual:(anchor:string,start:number,end:number)=>void;paragraphs:{anchor:string;text:string}[]};
const Context=createContext<ContextValue|null>(null);
export function CommentProvider({post,children}:{post:Post;children:ReactNode}){
 const root=useRef<HTMLDivElement>(null),heading=useRef<HTMLHeadingElement>(null),generation=useRef(0),selectionGeneration=useRef(0),focusOnOpen=useRef(false),returnAnchor=useRef(''),returnElement=useRef<HTMLElement|null>(null),targetRef=useRef<CommentTarget|null>(null),restoreRequest=useRef<{number:string;turn:number}|null>(null);
 const [revision,setRevision]=useState(''),[notice,setNotice]=useState(''),[draft,setDraft]=useState<CommentAnnotation|null>(null),[target,setTarget]=useState<CommentTarget|null>(null),[quote,setQuote]=useState('');
 const [paragraphs,setParagraphs]=useState<{anchor:string;text:string}[]>([]),[placed,setPlaced]=useState<IndexedComment[]>([]),[choices,setChoices]=useState<IndexedComment[]>([]);
 const index=useCommentIndex(),entries=index.entries.filter(e=>e.annotation.slug===post.slug);
 const ready=!!revision;
 function begin(){selectionGeneration.current++;restoreRequest.current=null;return ++generation.current;}
 function close(){begin();targetRef.current=null;setTarget(null);setChoices([]);setDraft(null);setNotice('');const u=new URL(location.href);u.searchParams.delete('annotation');u.searchParams.delete('discussion');u.searchParams.delete('comment');history.replaceState(history.state,'',u);
  const anchor=returnAnchor.current?root.current?.querySelector<HTMLElement>(`p[id="${returnAnchor.current}"]`):null;
  const destination=anchor??(returnElement.current?.isConnected?returnElement.current:null)??root.current?.querySelector<HTMLElement>('[data-article-comment-button]');destination?.focus({preventScroll:true});
 }
 function open(next:CommentTarget,text:string,explicit=true,origin:HTMLElement|null=null,anchor=''){
  try{widgetUrl(next,getCommentSession(),next.backLink);}catch{setNotice('引用の情報が長すぎます。短い範囲を選んでください。');return;}
  const current=targetRef.current;
  if(current&&current.key!==next.key&&!window.confirm('切り替えると未送信の入力は失われます。切り替えますか？'))return;
  returnElement.current=origin;returnAnchor.current=anchor;targetRef.current=next;
  focusOnOpen.current=explicit;setTarget(next);setQuote(text);setDraft(null);setChoices([]);
  const nextUrl=new URL(next.backLink),url=new URL(location.href);for(const name of ['annotation','discussion','comment']){url.searchParams.delete(name);const value=nextUrl.searchParams.get(name);if(value)url.searchParams.set(name,value);}history.replaceState(history.state,'',url);
 }
 async function openRange(a:CommentAnnotation,explicit=true,turn=begin()){
  try{
   if(!root.current||!await validateAnnotation(a,post.slug,revision||await annotationHash(post.body),annotationParagraphs(root.current)))throw new Error('引用を復元できません。本文から選び直してください。');
   const next=await rangeCommentTarget(post,a);if(turn===generation.current)open(next,a.quote,explicit,null,a.segments[0].anchor);
  }catch(error){if(turn===generation.current)setNotice(error instanceof Error?error.message:'引用を確認できません。');}
 }
 async function openExisting(entry:IndexedComment,explicit=true,turn=begin(),origin:HTMLElement|null=null){
  try{
   const url=new URL('/api/discussions',GISCUS_ORIGIN);url.searchParams.set('repo','70ki8suda/portfolio');url.searchParams.set('number',String(entry.number));
   const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('会話を確認できません。GitHubで確認してください。');
   const data=await response.json() as {id?:string;url?:string};if(data.id!==entry.id||data.url!==entry.url)throw new Error('会話の対応を確認できません。');
   const link=new URL(`/blog/${post.slug}`,location.origin);link.searchParams.set('discussion',String(entry.number));
   const next:CommentTarget={term:entry.term,revision:entry.annotation.bodyRevision,backLink:link.toString(),description:'',searchUrl:entry.url,key:`discussion:${entry.id}`,number:entry.number};
   if(turn===generation.current)open(next,entry.annotation.quote,explicit,origin);
  }catch(error){if(turn===generation.current)setNotice(error instanceof Error?error.message:'会話を確認できません。');}
 }
 useEffect(()=>{
  let alive=true;const turn=++generation.current;const url=new URL(location.href);restoreRequest.current=url.searchParams.has('discussion')?{number:url.searchParams.get('discussion')!,turn}:null;
  setParagraphs(annotationParagraphs(root.current!));void annotationHash(post.body).then(async hash=>{
   if(!alive)return;setRevision(hash);if(turn!==generation.current)return;const encoded=url.searchParams.get('annotation');
   if(encoded){const a=await decodeAnnotation(encoded,post.slug,hash,annotationParagraphs(root.current!));if(!alive||turn!==generation.current)return;if(a)await openRange(a,false,turn);else setNotice('引用を復元できません。本文版が変わった可能性があります。本文から選び直してください。');}
   else if(url.searchParams.get('comment')==='article'){const t=await commentTarget(post);if(alive&&turn===generation.current)open(t,'',false);}
  });
  return()=>{alive=false;generation.current++;selectionGeneration.current++;restoreRequest.current=null;};
 },[post.slug,post.body]);
 useEffect(()=>{if(target&&focusOnOpen.current){heading.current?.focus({preventScroll:true});focusOnOpen.current=false;}},[target]);
 useEffect(()=>{
  if(!ready)return;let timer:ReturnType<typeof setTimeout>;
  const selected=()=>{clearTimeout(timer);const turn=++selectionGeneration.current;timer=setTimeout(async()=>{
   const selection=getSelection();if(!selection||selection.isCollapsed||!root.current)return;
   try{const ranges=selectedAnnotationRanges(root.current,selection);if(!ranges.length||turn!==selectionGeneration.current)return;const operation=++generation.current;restoreRequest.current=null;const a=await createAnnotation(post.slug,revision,annotationParagraphs(root.current),ranges);if(turn===selectionGeneration.current&&operation===generation.current){returnAnchor.current=a.segments[0].anchor;setDraft(a);setNotice('');setChoices([]);}}
   catch(error){if(turn===selectionGeneration.current)setNotice(error instanceof Error?error.message:'引用範囲を確認できません。');}
  },180);};
  document.addEventListener('selectionchange',selected);return()=>{clearTimeout(timer);selectionGeneration.current++;document.removeEventListener('selectionchange',selected);};
 },[ready,revision,post.slug]);
 useEffect(()=>{
  let alive=true;const registry=(CSS as unknown as {highlights?:Map<string,unknown>}).highlights;
  void (async()=>{const valid:IndexedComment[]=[];if(root.current)for(const e of entries)if(e.comments+e.replies>0&&await validateAnnotation(e.annotation,post.slug,revision,annotationParagraphs(root.current)))valid.push(e);
   if(!alive)return;setPlaced(valid);registry?.delete('blog-comments');
   const HighlightClass=(window as unknown as {Highlight?:new(...ranges:Range[])=>unknown}).Highlight;
   if(root.current&&registry&&HighlightClass){const ranges=valid.flatMap(e=>e.annotation.segments.map(s=>annotationRange(root.current!,s)).filter((r):r is Range=>!!r));registry.set('blog-comments',new HighlightClass(...ranges));}
  })();
  return()=>{alive=false;registry?.delete('blog-comments');};
 },[index,revision,post.slug]);
 useEffect(()=>{
  const request=restoreRequest.current;if(!request||!ready||index.state!=='fresh'||request.turn!==generation.current)return;
  restoreRequest.current=null;const entry=entries.find(e=>String(e.number)===request.number);
  if(entry)void openExisting(entry,false,request.turn);else setNotice('この会話は現在のコメント一覧で確認できません。');
 },[index,ready,post.slug]);
 const manual=(anchor:string,start:number,end:number)=>{const turn=begin();if(start===end){setNotice('引用する文字を選択してください。');return;}if(root.current)void createAnnotation(post.slug,revision,annotationParagraphs(root.current),[{anchor,start,end}]).then(a=>{if(turn!==generation.current)return;returnAnchor.current=a.segments[0].anchor;setDraft(a);setNotice('');}).catch(error=>{if(turn===generation.current)setNotice(error.message);});};
 const openArticle=(origin?:HTMLElement)=>{const turn=begin();void commentTarget(post).then(t=>{if(turn===generation.current)open(t,'',true,origin??null);}).catch(error=>{if(turn===generation.current)setNotice(error.message);});};
 return <Context.Provider value={{ready,post,notice,index,entries,paragraphs,manual,openExisting:(e,origin)=>void openExisting(e,true,undefined,origin),openArticle}}>
  <div ref={root} data-comment-article data-comments-ready={ready} onKeyDown={e=>{if(e.key==='Escape'){close();}}} onClick={e=>{
   if(e.target instanceof Element&&e.target.closest('a,button,input,textarea,select,summary'))return;
   if(!getSelection()?.isCollapsed)return;
   const hits=placed.filter(entry=>entry.annotation.segments.some(segment=>{const range=annotationRange(root.current!,segment);return range&&Array.from(range.getClientRects()).some(r=>e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom);}));
   if(hits.length){begin();setChoices(hits);setDraft(null);}
  }}>{children}</div>
  <style>{'::highlight(blog-comments){background:#f2da9c;color:inherit;}'}</style>
  {(draft||choices.length>0||target||notice)&&<aside aria-label="引用コメント" {...stylex.props(styles.popup)} onKeyDown={e=>{if(e.key==='Escape')close();}}>
   <button {...stylex.props(styles.button)} type="button" onClick={close} aria-label="コメントを閉じる">閉じる</button>
   {notice&&<p role="status" {...stylex.props(styles.note)}>{notice}</p>}
   {draft&&<><blockquote {...stylex.props(styles.quote)}>{draft.quote}</blockquote><button type="button" {...stylex.props(styles.button)} onClick={()=>void openRange(draft)}>引用にコメント</button></>}
   {choices.map(e=><button key={e.id} type="button" {...stylex.props(styles.button)} onClick={event=>void openExisting(e,true,undefined,event.currentTarget)}>会話 #{e.number}（{e.comments+e.replies}件）</button>)}
   {target&&<><h2 ref={heading} tabIndex={-1} {...stylex.props(styles.note)}>選択した対象へのコメント</h2>{quote&&<blockquote {...stylex.props(styles.quote)}>{quote}</blockquote>}<CommentWidget key={target.key} target={target} session={getCommentSession()}/></>}
  </aside>}
 </Context.Provider>;
}
export function ParagraphComment({children}:{anchor?:string;children:ReactNode}){return children;}
export function ArticleComments(){
 const c=useContext(Context),[article,setArticle]=useState<CommentTarget|null>(null),[anchor,setAnchor]=useState(''),manualText=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{let alive=true;if(c)void commentTarget(c.post).then(t=>{if(alive)setArticle(t);});return()=>{alive=false;};},[c?.post.slug,c?.post.body]);
 if(!c)return null;const paragraph=c.paragraphs.find(p=>p.anchor===anchor)??c.paragraphs[0];
 const posted=c.entries.filter(e=>e.comments+e.replies>0);
 return <section aria-label="記事へのコメント" {...stylex.props(styles.area)}>
  <div {...stylex.props(styles.actions)}><button type="button" disabled={!c.ready} {...stylex.props(styles.button)} data-article-comment-button onClick={e=>c.openArticle(e.currentTarget)}>GitHubでコメントする</button>{article&&<a href={article.searchUrl} target="_blank" rel="noopener noreferrer" {...stylex.props(styles.link)}>GitHubで記事のコメントを探す</a>}</div>
  <p {...stylex.props(styles.note)}>本文の文字を選ぶと、引用にコメントできます。GitHubアカウントを使います。</p>
  <p {...stylex.props(styles.note)}>{c.index.state==='unknown'?'コメントの一覧を確認できません。':c.index.state==='stale'?'コメントの一覧は更新を確認できていません。':posted.length?`引用への会話 ${posted.length}件。反映には時間がかかることがあります。`:'引用へのコメントはまだありません。反映には時間がかかることがあります。'}</p>
  {posted.map(e=><div key={e.id}><button type="button" {...stylex.props(styles.button)} onClick={event=>c.openExisting(e,event.currentTarget)}>会話 #{e.number}（{e.comments+e.replies}件）</button><span {...stylex.props(styles.note)}>本文版 {e.annotation.bodyRevision.slice(0,8)}</span><blockquote {...stylex.props(styles.quote)}>{e.annotation.quote}</blockquote><a href={e.url} {...stylex.props(styles.link)}>GitHubで会話を見る</a></div>)}
  <details><summary>引用範囲を指定する</summary><label>段落<select value={paragraph?.anchor??''} onChange={e=>{setAnchor(e.target.value);}} style={{display:'block',maxWidth:'100%',minHeight:44}}>{c.paragraphs.map(p=><option key={p.anchor} value={p.anchor}>{p.text.slice(0,40)}</option>)}</select></label>
   <label>引用する文字を選択<textarea ref={manualText} readOnly value={paragraph?.text??''} rows={5} style={{width:'100%',boxSizing:'border-box'}}/></label>
   <button type="button" disabled={!c.ready||!paragraph} {...stylex.props(styles.button)} onClick={()=>{const text=manualText.current;if(text)c.manual(paragraph.anchor,text.selectionStart,text.selectionEnd);}}>選択した引用を確認</button>
  </details>
 </section>;
}
function CommentWidget({target,session}:{target:CommentTarget;session:string}) {
  const ref=useRef<HTMLIFrameElement>(null),[height,setHeight]=useState(300),[link,setLink]=useState(target.searchUrl),[error,setError]=useState(false),[activeSession,setActiveSession]=useState(session);
  let src='';try{src=widgetUrl(target,activeSession,typeof location==='undefined'?target.backLink:location.href);}catch{/* The URL may include a long OAuth session; never truncate it. */}
  useEffect(()=>{
    const handle=(event:MessageEvent)=>{
      if(event.origin!==GISCUS_ORIGIN||event.source!==ref.current?.contentWindow||!event.data||typeof event.data!=='object'||!event.data.giscus)return;
      const data=event.data.giscus;
      if(typeof data.resizeHeight==='number'&&Number.isFinite(data.resizeHeight))setHeight(Math.max(250,Math.min(12000,data.resizeHeight)));
      const url=discussionUrl(data.discussion?.url);if(url)setLink(url);
      if(data.signOut || (typeof data.error==='string'&&/Bad credentials|Invalid state value|State has expired/.test(data.error))) {clearCommentSession();setActiveSession('');}
      if(typeof data.error==='string'&&!data.error.includes('Discussion not found'))setError(true);
    };
    window.addEventListener('message',handle);return()=>window.removeEventListener('message',handle);
  },[]);
  return <section aria-label="選択した対象へのコメント" {...stylex.props(styles.area)}>
    <p {...stylex.props(styles.note)}>本文版 {target.revision.slice(0,8)}。対象を切り替えると未送信の入力は失われます。</p>
    <a href={link} target="_blank" rel="noopener noreferrer" {...stylex.props(styles.link)}>GitHubで開く</a>
    {error&&<p role="status" {...stylex.props(styles.note)}>コメントを読み込めませんでした。GitHubへのリンクから確認できます。</p>}
    {!src&&<p role="status">引用の情報が長すぎます。短い範囲を選んでください。</p>}
    {src&&<iframe ref={ref} src={src} title="GitHubコメント" allow="clipboard-write" referrerPolicy="strict-origin-when-cross-origin" {...stylex.props(styles.frame)} style={{height}} />}
  </section>;
}
