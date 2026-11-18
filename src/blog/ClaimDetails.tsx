import {useState} from 'react';
import {Link} from '@tanstack/react-router';
import * as stylex from '@stylexjs/stylex';
import type {GraphData,GraphNode} from './graphTypes';
import {originalAnchor} from './claimPreview';
import {graph} from '../styles/graph.stylex';
const stanceLabels={source:'原典・話者の主張',author:'筆者の解説・考察',critic:'批評・反論',mixed:'複数の立場を比較'};
const clip=(text:string,max:number)=>text.length>max?text.slice(0,max)+'…':text;
/** The same detail content in the map and in an article. No scene/camera dependency. */
export function ClaimDetails({data,id,onSelect,onSelectConcept}:{data:GraphData;id:string;onSelect:(id:string)=>void;onSelectConcept?:(id:string)=>void}) {
 const [expanded,setExpanded]=useState(false);
 const endpoints=new Set(data.edges.flatMap(e=>[e.source,e.target]));
 const nodes=new Map(data.nodes.filter(n=>endpoints.has(n.id)).map(n=>[n.id,n])),articles=new Map(data.articles.map(a=>[a.slug,a]));
 const summaries=data.claims?.summaries,selected=nodes.get(id),links=data.claims?.links;
 if(!selected||!summaries||!links)return null;
 const row=(node:GraphNode,_focus:boolean,extra:string)=><li key={node.id} {...stylex.props(graph.row)}><button type="button" {...stylex.props(graph.rowButton)} onClick={()=>onSelect(node.id)}><span {...stylex.props(graph.rowMeta)}>{articles.get(node.slug)?.title} · {node.section||'冒頭'} · {extra}</span><span {...stylex.props(graph.rowText)}>{clip(node.text,84)}</span></button></li>;
 const items=links.neighbors[id];
 const candidates=<section aria-label="探索用の接点">
  <h3 {...stylex.props(graph.groupHeading)}>探索用の接点 · {items.length}</h3>
  <p {...stylex.props(graph.note)}>別記事の論点を探す手がかりです。支持や賛同の認定ではありません。{!items.length&&'この起点では表示条件を満たす候補がありません。'}</p>
  <ul {...stylex.props(graph.rows)}>{items.map(item=>{const node=nodes.get(item.id)!;return <li key={node.id} {...stylex.props(graph.row)}>
   <button type="button" {...stylex.props(graph.rowButton)} onClick={()=>onSelect(node.id)}><span {...stylex.props(graph.rowMeta)}>{articles.get(node.slug)?.title} · BGE score {item.score.toFixed(2)}</span><span {...stylex.props(graph.rowText)}>{clip(node.text,84)}</span></button>
   <details><summary {...stylex.props(graph.textButton)}>主張と条件を読む</summary><blockquote {...stylex.props(graph.quote)}>{node.text}</blockquote>
    <p {...stylex.props(graph.note)}>話者：{summaries[node.id].speaker}</p>{summaries[node.id].conditions.map((c,i)=><p key={i} {...stylex.props(graph.note)}>{c}</p>)}
    <Link to="/blog/$slug" params={{slug:node.slug}} hash={originalAnchor(data,node)} {...stylex.props(graph.readLink)}>候補の原文へ ↗</Link>
   </details></li>;})}</ul>
 </section>;
 return <>
      <p {...stylex.props(graph.meta)}><span {...stylex.props(graph.metaStrong)}>{articles.get(selected.slug)?.title}</span><br />{selected.section || '冒頭'}</p>
      <blockquote {...stylex.props(graph.quote, !expanded && graph.clamp)}>{selected.text}</blockquote>
      {selected.text.length > 150 && <button type="button" {...stylex.props(graph.textButton)} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? '折りたたむ' : '全文を表示'}</button>}
      {(selected.context || selected.stance) && <p {...stylex.props(graph.note)}>{selected.stance ? `${stanceLabels[selected.stance]}。` : ''}{selected.context ?? ''}{selected.kind === 'quote' ? ' 引用段落。' : ''}</p>}
      {summaries?.[selected.id] && <section aria-label="主張の根拠">
        <p {...stylex.props(graph.note)}>話者：{summaries![selected.id].speaker}</p>
        {summaries![selected.id].conditions.map((c, i) => <p key={i} {...stylex.props(graph.note)}>{c}</p>)}
        <details><summary {...stylex.props(graph.textButton)}>原文の根拠を読む（{summaries![selected.id].evidence.length}）</summary>
          {summaries![selected.id].evidence.map((e, i) => <div key={`${e.anchor}:${i}`}><blockquote {...stylex.props(graph.quote, e.kind === 'block' && graph.sourceBlock)}>{e.text}</blockquote>
            <Link to="/blog/$slug" params={{slug:selected.slug}} hash={e.anchor} {...stylex.props(graph.readLink)}>{e.kind === 'block' ? '根拠を含む節・段落へ ↗' : '記事のこの箇所へ ↗'}</Link></div>)}
        </details>
      </section>}
      {!!summaries?.[selected.id]?.relatedPoints?.length && <details><summary {...stylex.props(graph.textButton)}>補足の論点と原文</summary>
        {summaries![selected.id].relatedPoints!.map((p,i)=><section key={i}>
          <p {...stylex.props(graph.meta)}>{p.text}</p><p {...stylex.props(graph.note)}>話者：{p.speaker}</p>
          {p.conditions.map((c,j)=><p key={j} {...stylex.props(graph.note)}>{c}</p>)}
          {p.evidence.map((e,j)=><div key={j}><blockquote {...stylex.props(graph.quote, e.kind === 'block' && graph.sourceBlock)}>{e.text}</blockquote>
            <Link to="/blog/$slug" params={{slug:selected.slug}} hash={e.anchor} {...stylex.props(graph.readLink)}>補足の原文へ ↗</Link></div>)}
        </section>)}
      </details>}
      <ul {...stylex.props(graph.chips)} aria-label="この主張の概念">{selected.tags.map(tag=><li key={tag}>{onSelectConcept?<button type="button" {...stylex.props(graph.chip)} onClick={()=>onSelectConcept(tag)}>{data.concepts.find(c=>c.id===tag)?.label??tag}</button>:<Link to="/blog" search={{view:'graph',concept:tag}} {...stylex.props(graph.chip)}>{data.concepts.find(c=>c.id===tag)?.label??tag}</Link>}</li>)}</ul>
      <Link to="/blog/$slug" params={{ slug: selected.slug }} hash={originalAnchor(data, selected)} {...stylex.props(graph.readLink)}>元の記事でこの段落を読む <span aria-hidden="true">↗</span></Link>
      {candidates}
      {<details><summary {...stylex.props(graph.textButton)}>元ベクトルの近傍（未審査）</summary>
        <p {...stylex.props(graph.note)}>元の384次元ベクトルのcosine順です。関連する確率ではありません。上の候補とは別の探索に使えます。</p>
        <ul {...stylex.props(graph.rows)}>{(data.semanticNeighbors[selected.id]??[]).map(item=>{const node=nodes.get(item.id);return node?row(node,false,`cosine ${item.score.toFixed(2)}`):null;})}</ul>
      </details>}
 </>;
}
