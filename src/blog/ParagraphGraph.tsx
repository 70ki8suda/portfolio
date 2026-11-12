import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from '@tanstack/react-router';
import * as stylex from '@stylexjs/stylex';
import type { GraphData, GraphNode } from './graphTypes';
import { graph } from '../styles/graph.stylex';
import { shared } from '../styles/shared.stylex';

export interface GraphSearch {
  article?: string;
  concept?: string;
  q?: string;
  node?: string;
}
interface Props {
  search: GraphSearch;
  onChange: (search: GraphSearch) => void;
}
const COLORS = ['#366b87', '#8a654e', '#5d7861', '#80728d'];
const W = 800;
const H = 440;
const point = (n: { x: number; y: number }) => ({ x: 55 + n.x * 690, y: 55 + n.y * 330 });
const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}…` : text;
const relationLabels = { semantic: '意味が近い段落', sequence: '同じ記事の前後', explicit: '本文中のリンク' };
const stanceLabels = { source: '原典・話者の主張', author: '筆者の解説・考察', critic: '批評・反論', mixed: '複数の立場を比較' };
const initialView = { x: 0, y: 0, zoom: 1 };

/** Only labels move to avoid overlap. Article centers retain their exact projected positions. */
function placeArticleLabels(articles: GraphData['articles']) {
  const placed: { slug: string; x: number; y: number }[] = [];
  for (const article of [...articles].sort((a, b) => a.y - b.y || a.slug.localeCompare(b.slug))) {
    const p = point(article);
    const candidates = [36, -36, 76, -76, 116, -116, 156, -156].flatMap(dy => [0, 100, -100].map(dx => ({
      slug: article.slug, x: Math.max(125, Math.min(W - 125, p.x + dx)), y: Math.max(22, Math.min(H - 22, p.y + dy)),
    })));
    const free = candidates.find(candidate => placed.every(label => Math.abs(candidate.x - label.x) > 248 || Math.abs(candidate.y - label.y) > 32));
    placed.push(free ?? candidates[0]);
  }
  return new Map(placed.map(label => [label.slug, label]));
}

export default function ParagraphGraph(props: Props) {
  const [data, setData] = useState<GraphData>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    void fetch('/paragraph-graph.json', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Graph unavailable');
      const payload = await response.json() as GraphData;
      if (payload.version !== 1 || !Array.isArray(payload.nodes) || !Array.isArray(payload.articles) || !Array.isArray(payload.concepts) || !Array.isArray(payload.edges)) throw new Error('Invalid graph');
      setData(payload);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  if (error) return <div lang="ja" {...stylex.props(graph.status)} role="alert">地図を読み込めませんでした。 <button type="button" {...stylex.props(graph.button)} onClick={() => setAttempt(a => a + 1)}>再読み込み</button></div>;
  if (!data) return <p lang="ja" role="status" {...stylex.props(graph.status)}>テーマの地図を読み込んでいます…</p>;
  return <GraphExplorer {...props} data={data} />;
}

function GraphExplorer({ data, search, onChange }: Props & { data: GraphData }) {
  const [viewport, setViewport] = useState(initialView);
  const [viewReady, setViewReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [limit, setLimit] = useState(20);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | undefined>(undefined);
  const storageKey = `paragraph-map-view:${data.fingerprint}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as typeof viewport | null;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y) && Number.isFinite(saved.zoom) && saved.zoom >= 0.7 && saved.zoom <= 4) setViewport(saved);
    } catch { /* Storage is optional, including in private browsing. */ }
    setViewReady(true);
  }, [storageKey]);
  useEffect(() => {
    if (!viewReady) return;
    try { sessionStorage.setItem(storageKey, JSON.stringify(viewport)); } catch { /* URL still preserves selection and filters. */ }
  }, [storageKey, viewport, viewReady]);
  useEffect(() => { setLimit(20); }, [search.article, search.concept, search.q]);
  const articles = useMemo(() => new Map(data.articles.map((article, i) => [article.slug, { ...article, color: COLORS[i % COLORS.length] }])), [data]);
  const concepts = useMemo(() => new Map(data.concepts.map(c => [c.id, c])), [data]);
  const articleLabels = useMemo(() => placeArticleLabels(data.articles), [data]);
  const nodes = useMemo(() => new Map(data.nodes.map(n => [n.id, n])), [data]);
  const selected = search.node ? nodes.get(search.node) : undefined;
  const filtered = useMemo(() => {
    const query = search.q?.trim().normalize('NFKC').toLocaleLowerCase();
    return data.nodes.filter(n => (!search.article || n.slug === search.article)
      && (!search.concept || n.tags.includes(search.concept))
      && (!query || `${n.text} ${n.section} ${articles.get(n.slug)?.title} ${n.tags.map(t => concepts.get(t)?.label).join(' ')}`.normalize('NFKC').toLocaleLowerCase().includes(query)))
      .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  }, [data, search.article, search.concept, search.q, articles, concepts]);
  const filteredIds = useMemo(() => new Set(filtered.map(n => n.id)), [filtered]);
  const adjacent = selected ? data.edges.filter(e => e.source === selected.id || e.target === selected.id) : [];
  const nearby = new Set(adjacent.flatMap(e => [e.source, e.target]));
  const showParagraphs = !!(search.article || search.concept || search.q || selected || viewport.zoom > 1.4);
  const select = (node: GraphNode, clearFilters = false) => {
    onChange(clearFilters ? { node: node.id } : { ...search, node: node.id });
    requestAnimationFrame(() => detailHeading.current?.focus());
  };
  const pan = (x: number, y: number) => setViewport(v => ({ ...v, x: Math.max(-W * 3, Math.min(W * 3, v.x + x)), y: Math.max(-H * 3, Math.min(H * 3, v.y + y)) }));
  const zoom = (factor: number) => setViewport(v => ({ ...v, zoom: Math.max(0.7, Math.min(4, v.zoom * factor)) }));
  const reset = () => { setViewport(initialView); onChange({}); setLimit(20); };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const moves: Record<string, [number, number]> = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] };
    if (moves[event.key]) { event.preventDefault(); pan(...moves[event.key]); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.2); }
    else if (event.key === '-') { event.preventDefault(); zoom(1 / 1.2); }
    else if (event.key === 'Home') { event.preventDefault(); setViewport(initialView); }
  };
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    // Touch keeps the native vertical page scroll; the visible pan/zoom buttons are equivalent.
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) < 3 && !drag.current.moved) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const scale = W / event.currentTarget.getBoundingClientRect().width;
    pan(dx * scale, dy * scale);
    drag.current = { x: event.clientX, y: event.clientY, moved: true };
    setDragging(true);
  };
  const onPointerUp = () => { setDragging(false); setTimeout(() => { drag.current = undefined; }, 0); };
  const row = (node: GraphNode, related = false) => <li key={node.id} {...stylex.props(graph.row)}>
    <button type="button" aria-pressed={selected?.id === node.id} {...stylex.props(graph.rowButton, selected?.id === node.id && graph.rowCurrent)} onClick={() => select(node, related)}>
      <span {...stylex.props(graph.rowMeta)}>{articles.get(node.slug)?.title} · {node.section || '冒頭'}</span>
      <span {...stylex.props(graph.rowText)}>{clip(node.text, 105)}</span>
    </button>
  </li>;
  const relationList = (kind: keyof typeof relationLabels) => {
    const related = adjacent.filter(e => e.kind === kind).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map(e => nodes.get(e.source === selected?.id ? e.target : e.source)).filter((n): n is GraphNode => !!n);
    if (!related.length) return null;
    return <section key={kind} aria-label={relationLabels[kind]}><h4 {...stylex.props(shared.label, graph.relatedHeading)}>{relationLabels[kind]}</h4><ul {...stylex.props(graph.rows)}>{related.map(n => row(n, true))}</ul></section>;
  };
  const sameConcept = selected ? data.nodes.filter(n => n.id !== selected.id && n.slug !== selected.slug && n.tags.some(t => selected.tags.includes(t))).slice(0, 3) : [];

  return <section lang="ja" aria-label="段落の地図" {...stylex.props(graph.root)}>
    <p {...stylex.props(graph.lead)}>長く育てているテーマの地図です。記事から段落へ、気になる概念から別の記事へ辿れます。</p>
    <p {...stylex.props(graph.note)}>位置は文章の意味ベクトルを平面に写した近似です。近さや線は賛同・因果を表しません。批判と賛成が近くに並ぶこともあります。</p>
    <div {...stylex.props(graph.controls)}>
      <label {...stylex.props(graph.field)}><span {...stylex.props(shared.label, graph.fieldLabel)}>段落を検索</span><input type="search" value={search.q ?? ''} {...stylex.props(graph.input)} onChange={event => onChange({ ...search, q: event.target.value || undefined, node: undefined })} /></label>
      <label {...stylex.props(graph.field)}><span {...stylex.props(shared.label, graph.fieldLabel)}>記事</span><select value={search.article ?? ''} {...stylex.props(graph.input, graph.select)} onChange={event => onChange({ ...search, article: event.target.value || undefined, node: undefined })}><option value="">すべての記事</option>{data.articles.map(a => <option key={a.slug} value={a.slug}>{a.title}</option>)}</select></label>
      <label {...stylex.props(graph.field)}><span {...stylex.props(shared.label, graph.fieldLabel)}>概念</span><select value={search.concept ?? ''} {...stylex.props(graph.input, graph.select)} onChange={event => onChange({ ...search, concept: event.target.value || undefined, node: undefined })}><option value="">すべての概念</option>{data.concepts.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <button type="button" onClick={reset} {...stylex.props(graph.button)}>リセット</button>
    </div>
    <div {...stylex.props(graph.mapFrame)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="段落の意味地図。矢印キーで移動、プラス・マイナスで拡大縮小、Homeで位置を戻せます。段落は下のリストでも選べます。" tabIndex={0} {...stylex.props(graph.svg, dragging && graph.svgDragging)} onKeyDown={onKeyDown} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = undefined; setDragging(false); }}>
        <g data-testid="graph-plane" transform={`translate(${W / 2 + viewport.x},${H / 2 + viewport.y}) scale(${viewport.zoom}) translate(${-W / 2},${-H / 2})`}>
          {adjacent.map(edge => {
            const a = nodes.get(edge.source), b = nodes.get(edge.target);
            if (!a || !b) return null;
            const p = point(a), q = point(b);
            return <line key={`${edge.kind}:${edge.source}:${edge.target}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={edge.kind === 'semantic' ? '#366b87' : edge.kind === 'explicit' ? '#a06851' : '#9a9b91'} strokeWidth={edge.kind === 'semantic' ? 1.5 : 1} strokeDasharray={edge.kind === 'semantic' ? '5 4' : undefined} opacity={0.65} vectorEffect="non-scaling-stroke" />;
          })}
          {showParagraphs && data.nodes.map(node => {
            const p = point(node);
            const active = filteredIds.has(node.id) || nearby.has(node.id);
            return <circle key={node.id} cx={p.x} cy={p.y} r={selected?.id === node.id ? 7 : 3.5} fill={articles.get(node.slug)?.color} opacity={active ? 0.8 : 0.09} stroke={selected?.id === node.id ? '#24282b' : 'none'} strokeWidth={2} onClick={() => { if (!drag.current?.moved && active) select(node, !filteredIds.has(node.id)); }}><title>{clip(node.text, 75)}</title></circle>;
          })}
          {data.articles.map((article, index) => {
            const p = point(article);
            const label = articleLabels.get(article.slug)!;
            return <g key={article.slug} opacity={search.article && search.article !== article.slug ? 0.25 : 1} onClick={() => { if (!drag.current?.moved) onChange({ article: article.slug }); }}>
              <circle cx={p.x} cy={p.y} r={showParagraphs ? 10 : 18} fill="#faf8f3" stroke={articles.get(article.slug)?.color} strokeWidth={2} />
              <line x1={p.x} y1={p.y} x2={label.x} y2={label.y} stroke={articles.get(article.slug)?.color} opacity={0.45} vectorEffect="non-scaling-stroke" />
              <rect x={label.x - 122} y={label.y - 14} width={244} height={28} rx={3} fill="#faf8f3" opacity={0.95} />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fill="#24282b" fontSize={15}>{index + 1}</text>
              <text x={label.x} y={label.y + 4} textAnchor="middle" fill="#24282b" fontSize={11}><title>{article.title}</title>{clip(article.title, 21)}</text>
            </g>;
          })}
        </g>
      </svg>
      <div {...stylex.props(graph.zoom)}>
        <button type="button" aria-label="地図を拡大" {...stylex.props(graph.button, graph.zoomButton)} onClick={() => zoom(1.25)}>＋</button>
        <button type="button" aria-label="地図を縮小" {...stylex.props(graph.button, graph.zoomButton)} onClick={() => zoom(0.8)}>−</button>
      </div>
    </div>
    <div {...stylex.props(graph.mapTools)} aria-label="地図の位置">
      <button type="button" aria-label="地図を左へ移動" {...stylex.props(graph.button)} onClick={() => pan(-60, 0)}>←</button>
      <button type="button" aria-label="地図を上へ移動" {...stylex.props(graph.button)} onClick={() => pan(0, -60)}>↑</button>
      <button type="button" aria-label="地図を下へ移動" {...stylex.props(graph.button)} onClick={() => pan(0, 60)}>↓</button>
      <button type="button" aria-label="地図を右へ移動" {...stylex.props(graph.button)} onClick={() => pan(60, 0)}>→</button>
      <span {...stylex.props(graph.context)}>拡大率 {Math.round(viewport.zoom * 100)}% · ドラッグまたはボタンで移動</span>
    </div>
    <ul {...stylex.props(graph.articleKey)} aria-label="地図の記事">{data.articles.map((article, index) => <li key={article.slug}><button type="button" aria-pressed={search.article === article.slug} {...stylex.props(graph.articleButton, search.article === article.slug && graph.rowCurrent)} onClick={() => onChange({ article: article.slug })}><span {...stylex.props(shared.label)}>{index + 1}</span> {article.title}</button></li>)}</ul>
    <ul {...stylex.props(graph.legend)} aria-label="地図の凡例">
      <li>大きい円：記事の重心 / 小さい点：段落</li><li>青い破線：意味の近さ</li><li>灰色の線：記事内の前後</li><li>茶色の線：本文中のリンク</li>
    </ul>
    <div {...stylex.props(graph.columns)}>
      <section aria-labelledby="graph-detail-heading">
        <h3 id="graph-detail-heading" ref={detailHeading} tabIndex={-1} {...stylex.props(shared.label, graph.panelTitle)}>選んだ段落</h3>
        {!selected ? <p {...stylex.props(graph.panelHint)}>{search.node ? 'この段落は更新または削除されました。' : '記事の円や下のリストから、段落を選んでください。'} 記事・概念・ことばで絞り込むと、段落の位置が見えます。</p> : <>
          <p {...stylex.props(graph.detailMeta)}><span {...stylex.props(graph.detailArticle)}>{articles.get(selected.slug)?.title}</span><br />{selected.section || '冒頭'}</p>
          <p {...stylex.props(graph.detailText)}>{selected.text}</p>
          {(selected.context || selected.stance) && <p {...stylex.props(graph.context)}>{selected.context ?? (selected.stance && stanceLabels[selected.stance])}{selected.kind === 'quote' ? ' · 引用段落' : ''}</p>}
          <ul {...stylex.props(graph.chips)} aria-label="この段落の概念">{selected.tags.map(tag => <li key={tag}><button type="button" {...stylex.props(graph.button, graph.chip)} onClick={() => onChange({ concept: tag, node: selected.id })}>{concepts.get(tag)?.label ?? tag}</button></li>)}</ul>
          <Link to="/blog/$slug" params={{ slug: selected.slug }} hash={selected.anchor} {...stylex.props(graph.readLink)}>元の記事でこの段落を読む <span aria-hidden="true">↗</span></Link>
          {(['semantic', 'sequence', 'explicit'] as const).map(relationList)}
          {sameConcept.length > 0 && <section aria-label="同じ概念"><h4 {...stylex.props(shared.label, graph.relatedHeading)}>同じ概念から</h4><p {...stylex.props(graph.relatedNote)}>編集上の共通タグです。意味の類似度とは別のつながりです。</p><ul {...stylex.props(graph.rows)}>{sameConcept.map(n => row(n, true))}</ul></section>}
        </>}
      </section>
      <section aria-labelledby="graph-list-heading">
        <h3 id="graph-list-heading" {...stylex.props(shared.label, graph.panelTitle)}>段落のリスト</h3>
        <p role="status" {...stylex.props(graph.context)}>{filtered.length} 段落{filtered.length > limit ? ` · ${limit} 件を表示` : ''}</p>
        {filtered.length === 0 && <p {...stylex.props(graph.panelHint)}>条件に合う段落がありません。検索語や絞り込みを変えてみてください。</p>}
        <ul {...stylex.props(graph.rows)} aria-label="段落の検索結果">{filtered.slice(0, limit).map(n => row(n))}</ul>
        {filtered.length > limit && <button type="button" {...stylex.props(graph.button, graph.more)} onClick={() => setLimit(l => l + 20)}>次の20段落を表示</button>}
      </section>
    </div>
    <details {...stylex.props(graph.method)}><summary>地図の読み方と生成方法</summary><p>{data.model.id} の {data.model.dim} 次元のベクトルをローカルで事前生成し、{data.projection.method} で2次元に写しています。この2軸が保持する分散は約 {(data.projection.explainedVariance.reduce((sum, value) => sum + value, 0) * 100).toFixed(1)}% です。平面上の距離で表せない違いが多く残り、思想の優劣や絶対的な軸ではありません。意味の線は平面距離ではなく、元のベクトルのコサイン類似度で選びます。</p><p>意味の近傍は、共通の概念タグを持つ別の記事の段落から、コサイン類似度{data.similarity.threshold}以上の上位{data.similarity.topK}件を選び、どちらかが選んだ組を結びます。各段落に表示される線は{data.similarity.topK}本を超える場合があります。概念タグと話者の補足は編集用メタデータです。本文の段落と引用を扱い、箇条書き・表・埋め込み・出典案内は地図から省いています。全文の文脈や留保は元の記事で確認できます。</p></details>
  </section>;
}
