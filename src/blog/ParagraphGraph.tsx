import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode, type RefAttributes } from 'react';
import { Link } from '@tanstack/react-router';
import * as stylex from '@stylexjs/stylex';
import type { GraphData, GraphNode } from './graphTypes';
import { isGraphPayload, watchGraph } from './graphRefresh';
import { buildGraphLayout, type ArticleRelation, type Point, type Relation } from './graphLayout';
import { CONCEPT_ZOOM, fitScale, isCamera, MAX_ZOOM, MIN_ZOOM, nextLevel, overviewCamera, PARAGRAPH_ZOOM, toScreen, type Camera, type Level } from './graphCamera';
import type { SceneEdgeData, SceneHandle, SceneNodeData, SceneRing, SceneView } from './ParagraphGraphScene';
import { graph } from '../styles/graph.stylex';

export interface GraphSearch {
  article?: string;
  concept?: string;
  q?: string;
  node?: string;
}
interface Props {
  embedded?: boolean;
  search: GraphSearch & { tag?: string };
  onChange: (search: GraphSearch) => void;
}
type SceneComponent = ComponentType<Parameters<typeof import('./ParagraphGraphScene').default>[0] & RefAttributes<SceneHandle>>;
type SceneNodes = Parameters<typeof import('./ParagraphGraphScene').default>[0]['nodes'];
type SceneEdges = Parameters<typeof import('./ParagraphGraphScene').default>[0]['edges'];

const COLORS = ['#366b87', '#8a654e', '#5d7861', '#80728d', '#9a7b3c', '#4f7f86', '#8d5f6f', '#6b7280'];
const PAPER = '#faf8f3';
const INK = '#24282b';
const CYAN = '#366b87';
const AMBER = '#a06851';
const GREY = '#8d8f88';
const TERRITORY = 172;
const levelLabels: Record<Level, string> = { article: '記事', paragraph: '段落', concept: '概念' };
const levelZoom: Record<Level, number> = { article: 1, paragraph: 2.2, concept: 3.6 };
const stanceLabels = { source: '原典・話者の主張', author: '筆者の解説・考察', critic: '批評・反論', mixed: '複数の立場を比較' };
const relationLabels = { semantic: '意味が近い段落', concept: '同じ概念で近い段落', sequence: '同じ節の前後', explicit: '本文中のリンク' };

const clip = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}…` : text;
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase();
/** Long titles become two short lines; the full title stays available as a tooltip and accessible name. */
function shortTitle(title: string): string[] {
  const base = title.split(/\s+[—–]\s+/)[0].trim();
  if (base.length <= 15) return [base];
  // Prefer a natural break: before an opening bracket, or after a space or punctuation mark.
  let cut = 13;
  for (let i = 16; i >= 5; i--) {
    if (/[「『（(]/.test(base[i] ?? '') || /[\s、。：・」』）)]/.test(base[i - 1] ?? '')) { cut = i; break; }
  }
  const rest = base.slice(cut).trim();
  return [base.slice(0, cut).trim(), rest.length > 15 ? `${rest.slice(0, 14)}…` : rest];
}
/** WebGL lines have no per-edge opacity here, so quieter lines are mixed toward the paper colour instead. */
function mix(hex: string, toward: number) {
  const channel = (index: number) => {
    const from = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16), to = parseInt(PAPER.slice(1 + index * 2, 3 + index * 2), 16);
    return Math.round(from + (to - from) * toward).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}
const linkKey = (edge: { source: string; target: string }) => `${edge.source}|${edge.target}`;


export default function ParagraphGraph(props: Props) {
  const [data, setData] = useState<GraphData>();
  const [Scene, setScene] = useState<SceneComponent>();
  const [error, setError] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    const watcher = watchGraph({
      data: payload => { setData(payload); setRefreshFailed(false); },
      error: () => setRefreshFailed(true),
      recovered: () => setRefreshFailed(false),
    });
    refresh.current = watcher.refresh;
    return watcher.stop;
  }, []);
  useEffect(() => {
    let cancelled = false;
    setError(false);
    void import('./ParagraphGraphScene').then(module => { if (!cancelled) setScene(() => module.default as SceneComponent); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [attempt]);
  useEffect(() => {
    if (!data) return;
    const next = { ...props.search };
    if (next.article && !data.articles.some(a => a.slug === next.article)) delete next.article;
    if (next.node && !data.nodes.some(n => n.id === next.node)) delete next.node;
    if (next.concept && !data.concepts.some(c => c.id === next.concept)) delete next.concept;
    if (next.article !== props.search.article || next.node !== props.search.node || next.concept !== props.search.concept) props.onChange(next);
  }, [data, props.search, props.onChange]);
  const listLink = <Link to="/blog" search={props.search.tag ? { tag: props.search.tag } : {}} {...stylex.props(graph.button)}>一覧へ戻る</Link>;
  // Recheck retained state as well: a hot update can preserve an older payload.
  if (error || (!data && refreshFailed) || (data !== undefined && !isGraphPayload(data))) return <div lang="ja" {...stylex.props(graph.status)} role="alert">地図を読み込めませんでした。 <button type="button" {...stylex.props(graph.button)} onClick={() => { refresh.current(); setAttempt(a => a + 1); }}>再読み込み</button> {listLink}</div>;
  if (!data || !Scene) return <p lang="ja" role="status" {...stylex.props(graph.status)}>テーマの地図を読み込んでいます…</p>;
  return <GraphExplorer {...props} data={data} Scene={Scene} refreshFailed={refreshFailed} retry={() => refresh.current()} />;
}

/** `go` is an edge-of-screen pointer that jumps to something outside the view. */
type Hit = { kind: 'article' | 'node' | 'concept' | 'link' | 'go'; id: string };

/** WebGL can be unavailable or lost. The search panel and the list link keep working without the drawing. */
class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function GraphExplorer({ data, search, onChange, Scene, refreshFailed, retry, embedded }: Props & { data: GraphData; Scene: SceneComponent; refreshFailed: boolean; retry: () => void }) {
  const layout = useMemo(() => buildGraphLayout(data), [data]);
  const nodes = useMemo(() => new Map(data.nodes.map(n => [n.id, n])), [data]);
  const concepts = useMemo(() => new Map(data.concepts.map(c => [c.id, c])), [data]);
  const articles = useMemo(() => new Map(data.articles.map((article, index) => [article.slug, {
    ...article, index, color: COLORS[index % COLORS.length], count: data.nodes.filter(n => n.slug === article.slug).length,
  }])), [data]);
  const relations = useMemo(() => {
    const map = new Map<string, Relation[]>();
    for (const edge of layout.paragraphEdges) for (const id of [edge.source, edge.target]) map.set(id, [...(map.get(id) ?? []), edge]);
    return map;
  }, [layout]);
  const members = useMemo(() => {
    const map = new Map<string, GraphNode[]>();
    for (const node of data.nodes) for (const tag of node.tags) map.set(tag, [...(map.get(tag) ?? []), node]);
    return map;
  }, [data]);

  const root = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneHandle>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sheetTitle = useRef<HTMLHeadingElement>(null);
  const levelRef = useRef<Level>('article');
  const pointer = useRef<Point>({ x: 0, y: 0 });
  const pressed = useRef<Point>({ x: 0, y: 0 });
  const dragged = useRef(false);
  const pointerType = useRef('mouse');
  const interacted = useRef(false);
  const [size, setSize] = useState<{ width: number; height: number }>();
  const [ready, setReady] = useState(false);
  const [level, setLevel] = useState<Level>('article');
  const [view, setView] = useState<SceneView>();
  const [moving, setMoving] = useState(false);
  const [offsets, setOffsets] = useState<Record<string, Point>>({});
  const [hover, setHover] = useState<{ text: string; x: number; y: number }>();
  const [panel, setPanel] = useState<'find' | 'help'>();
  const [link, setLink] = useState<string>();
  const [expanded, setExpanded] = useState(false);
  const [more, setMore] = useState(false);
  const [query, setQuery] = useState(search.q ?? '');
  const [limit, setLimit] = useState(30);
  const composing = useRef(false);
  // The camera is remembered per history entry and per focus, so the browser's back button returns to the same
  // place while a fresh visit or an explicit ?article= / ?node= link is never overridden by an older position.
  const storageKey = () => {
    const entry = typeof history === 'undefined' ? null : history.state as { __TSR_key?: string; key?: string } | null;
    return `paragraph-map-camera:${data.fingerprint}:${entry?.__TSR_key ?? entry?.key ?? 'direct'}:${search.article ?? ''}:${search.node ?? ''}`;
  };
  const storageKeyRef = useRef(storageKey);
  storageKeyRef.current = storageKey;
  const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const position = useCallback((id: string) => offsets[id] ?? layout.paragraphs.get(id) ?? { x: 0, y: 0 }, [offsets, layout]);
  const fit = size ? fitScale(layout.bounds, size) : 1;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  const articleAt = useCallback((slug: string) => offsets[`a:${slug}`] ?? layout.articles.get(slug) ?? { x: 0, y: 0 }, [offsets, layout]);
  const conceptAt = useCallback((id: string) => offsets[`c:${id}`] ?? layout.concepts.get(id) ?? { x: 0, y: 0 }, [offsets, layout]);
  /** World position for every id the scene draws: `a:` article hubs, `c:` concepts, bare paragraph ids. */
  const scenePosition = useCallback((id: string) => id.startsWith('a:') ? articleAt(id.slice(2)) : id.startsWith('c:') ? conceptAt(id.slice(2)) : position(id), [articleAt, conceptAt, position]);
  /** Dragging is only a local rearrangement. A dragged article takes its paragraphs along so nothing is left behind. */
  const onDragged = (id: string, point: Point) => setOffsets(now => {
    if (!id.startsWith('a:')) return { ...now, [id]: point };
    const slug = id.slice(2);
    const from = now[id] ?? layout.articles.get(slug) ?? point;
    const next = { ...now, [id]: point };
    for (const node of data.nodes) if (node.slug === slug) {
      const p = now[node.id] ?? layout.paragraphs.get(node.id);
      if (p) next[node.id] = { x: p.x + point.x - from.x, y: p.y + point.y - from.y };
    }
    return next;
  });

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => { const rect = element.getBoundingClientRect(); if (rect.width && rect.height) setSize({ width: rect.width, height: rect.height }); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const current = (): Camera | undefined => {
    const now = scene.current?.view();
    return now ? { x: now.x, y: now.y, k: now.zoom / fitRef.current } : undefined;
  };
  const moveGuard = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const animateTo = useCallback((target: Camera, animated = true) => {
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, target.k));
    const zoom = k * fitRef.current;
    const now = scene.current?.view();
    // The map counts as moving from the moment a move is asked for, not from the camera's first frame of it.
    // Otherwise "selected" (or "focused") and "still about to move" are both true for a while with nothing to
    // tell them apart. The guard covers a request the camera decides needs no movement, which reports nothing.
    if (started.current && now && (Math.abs(now.zoom / zoom - 1) > 0.001 || Math.hypot(now.x - target.x, now.y - target.y) * zoom > 0.5)) {
      setMoving(true);
      clearTimeout(moveGuard.current);
      moveGuard.current = setTimeout(() => { const view = scene.current?.view(); setMoving(false); if (view) setView(view); }, 1500);
    }
    scene.current?.moveTo(target.x, target.y, zoom, animated && !reducedMotion());
  }, []);
  useEffect(() => () => clearTimeout(moveGuard.current), []);
  const articleCamera = useCallback((slug: string): Camera | undefined => {
    const hub = layout.articles.has(slug) ? articleAt(slug) : undefined;
    if (!hub || !size) return undefined;
    const target = Math.min(size.width, size.height) / (TERRITORY * 2 + 60);
    return { x: hub.x, y: hub.y, k: Math.max(PARAGRAPH_ZOOM + 0.2, Math.min(CONCEPT_ZOOM - 0.2, target / fitRef.current)) };
  }, [layout, size, articleAt]);
  const nodeCamera = useCallback((id: string): Camera => {
    const p = position(id);
    const k = Math.max(current()?.k ?? 1, 2.2);
    // On a phone the detail sheet covers the lower half, so the selected point sits in the upper part.
    const lift = size && size.width <= 680 ? size.height * 0.2 / (fitRef.current * k) : 0;
    return { x: p.x, y: p.y + lift, k };
  }, [position, size]);

  // Reagraph fits the whole graph once, asynchronously, some time after it mounts. Until the reader touches the
  // map, the position asked for by the URL or the history entry is put back whenever that fit displaces it.
  const intended = useRef<{ camera: Camera; until: number } | undefined>(undefined);
  const onView = useCallback((next: SceneView, resting: boolean) => {
    const k = next.zoom / fitRef.current;
    const want = intended.current;
    if (want && !interacted.current && performance.now() < want.until) {
      const offBy = Math.hypot(next.x - want.camera.x, next.y - want.camera.y) * next.zoom;
      if (Math.abs(k / want.camera.k - 1) > 0.002 || offBy > 1) { scene.current?.moveTo(want.camera.x, want.camera.y, want.camera.k * fitRef.current, false); return; }
    }
    const nextLevelValue = nextLevel(levelRef.current, k);
    if (nextLevelValue !== levelRef.current) { levelRef.current = nextLevelValue; setLevel(nextLevelValue); }
    if (!resting) { setMoving(true); return; }
    clearTimeout(moveGuard.current);
    setMoving(false);
    setView(next);
    if (interacted.current) try { sessionStorage.setItem(storageKeyRef.current(), JSON.stringify({ x: next.x, y: next.y, k })); } catch { /* The URL still restores selection and focus. */ }
  }, []);

  // Reagraph fits the whole graph once when it mounts; the reader's own position is applied after that.
  const started = useRef(false);
  useEffect(() => {
    if (!ready || !size || started.current) return;
    started.current = true;
    let stored: unknown;
    try { stored = JSON.parse(sessionStorage.getItem(storageKey()) ?? 'null'); } catch { stored = undefined; }
    const initial = isCamera(stored) ? stored
      : search.node && nodes.has(search.node) ? nodeCamera(search.node)
      : (search.article && articleCamera(search.article)) || overviewCamera(layout.bounds);
    intended.current = { camera: { ...initial, k: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, initial.k)) }, until: performance.now() + 8000 };
    const place = () => { if (!interacted.current) { animateTo(initial, false); const now = scene.current?.view(); if (now) onView(now, true); } };
    place();
    const timers = [setTimeout(place, 120), setTimeout(place, 400)];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, size]);

  const previousData = useRef(data);
  useLayoutEffect(() => {
    if (previousData.current === data) return;
    previousData.current = data;
    setOffsets({}); setHover(undefined); setLink(undefined);
    if (!started.current || !size) return;
    const node = search.node ? layout.paragraphs.get(search.node) : undefined;
    const hub = search.article ? layout.articles.get(search.article) : undefined;
    const target = node ? { x: node.x, y: node.y + (size.width <= 680 ? size.height * .2 / (fit * 2.2) : 0), k: 2.2 }
      : hub ? { ...hub, k: Math.max(PARAGRAPH_ZOOM + .2, Math.min(CONCEPT_ZOOM - .2, Math.min(size.width, size.height) / (TERRITORY * 2 + 60) / fit)) }
      : overviewCamera(layout.bounds);
    interacted.current = false;
    intended.current = { camera: target, until: performance.now() + 8000 };
    animateTo(target, false);
  }, [data, layout, size, fit, search.node, search.article, animateTo]);

  useEffect(() => {
    const release = () => scene.current?.setPan(true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    return () => { window.removeEventListener('pointerup', release, true); window.removeEventListener('pointercancel', release, true); };
  }, []);
  // A resize or rotation changes the fitted scale; keep the same relative zoom so the level and sizes stay true.
  const lastFit = useRef(fit);
  useEffect(() => {
    const previous = lastFit.current;
    lastFit.current = fit;
    const now = scene.current?.view();
    if (!started.current || !now || previous === fit) return;
    scene.current?.moveTo(now.x, now.y, now.zoom / previous * fit, false);
    const after = scene.current?.view();
    if (after) onView({ ...after, zoom: now.zoom / previous * fit, width: size?.width ?? after.width, height: size?.height ?? after.height }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit]);
  // Compared with the previous value rather than a "first run" flag: development StrictMode runs effects twice
  // on mount, and a flag would then treat the mount itself as a change.
  // Layout effects: the request to move is made in the same commit that shows the new focus or selection.
  const lastArticle = useRef(search.article);
  useLayoutEffect(() => {
    if (lastArticle.current === search.article) return;
    lastArticle.current = search.article;
    const target = search.article && !search.node ? articleCamera(search.article) : undefined;
    if (target) { interacted.current = true; animateTo(target); }
    // Leaving a focused article through the browser's back button returns to the whole map.
    else if (!search.article && !search.node) { interacted.current = true; animateTo(overviewCamera(layout.bounds)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.article]);
  const lastNode = useRef(search.node);
  useLayoutEffect(() => {
    if (lastNode.current === search.node) return;
    lastNode.current = search.node;
    setExpanded(false);
    if (!search.node || !nodes.has(search.node) || !size) return;
    const screen = scene.current?.project(position(search.node));
    const comfortable = !!screen && screen.x > 60 && screen.x < size.width - 60 && screen.y > 80 && screen.y < size.height * (size.width <= 680 ? 0.42 : 0.85);
    if (levelRef.current === 'article' || !comfortable) { interacted.current = true; animateTo(nodeCamera(search.node)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.node]);
  useEffect(() => { setQuery(search.q ?? ''); }, [search.q]);
  useEffect(() => { setLimit(30); }, [query, search.article]);
  useEffect(() => { setMore(false); }, [link, search.concept]);

  const selected = search.node ? nodes.get(search.node) : undefined;
  const selectedRelations = useMemo(() => selected ? relations.get(selected.id) ?? [] : [], [selected, relations]);
  const neighbors = useMemo(() => new Set(selectedRelations.flatMap(e => [e.source, e.target])), [selectedRelations]);
  const activeLink = link ? layout.articleEdges.find(edge => linkKey(edge) === link) : undefined;
  const matches = useMemo(() => {
    const text = search.q ? normalize(search.q.trim()) : '';
    if (!text && !search.concept) return undefined;
    return new Set(data.nodes.filter(n => (!search.concept || n.tags.includes(search.concept))
      && (!text || normalize(`${n.text} ${n.section} ${articles.get(n.slug)?.title ?? ''} ${n.tags.map(t => concepts.get(t)?.label ?? '').join(' ')}`).includes(text))).map(n => n.id));
  }, [data, search.q, search.concept, articles, concepts]);

  const selectNode = (id: string, focusSheet = false) => {
    interacted.current = true;
    setLink(undefined);
    onChange({ ...search, node: id });
    if (focusSheet) { setPanel(undefined); requestAnimationFrame(() => sheetTitle.current?.focus()); }
  };
  const selectConcept = (id: string) => { setLink(undefined); onChange({ ...search, concept: id, node: undefined }); };
  const focusArticle = (slug: string) => {
    interacted.current = true;
    setLink(undefined);
    if (search.article === slug && !search.node) { const target = articleCamera(slug); if (target) animateTo(target); } else onChange({ ...search, article: slug, node: undefined });
  };
  const showOverview = () => { interacted.current = true; setLink(undefined); animateTo(overviewCamera(layout.bounds)); if (search.article || search.node) onChange({ q: search.q, concept: search.concept }); };
  const closeSheet = () => { if (link) setLink(undefined); else if (search.node) onChange({ ...search, node: undefined }); else if (search.concept) onChange({ ...search, concept: undefined }); };
  const flyTo = (p: Point, k?: number) => { interacted.current = true; animateTo({ x: p.x, y: p.y, k: k ?? Math.max(current()?.k ?? 1, 2.2) }); };
  const zoomBy = (factor: number) => { interacted.current = true; scene.current?.zoomBy(factor, !reducedMotion()); };
  const goToLevel = (target: Level) => {
    interacted.current = true;
    const now = current();
    if (target === 'article') { animateTo(search.article && now ? { ...now, k: 1 } : overviewCamera(layout.bounds)); return; }
    const hub = !search.node && search.article && layout.articles.has(search.article) ? articleAt(search.article) : undefined;
    const center = hub && levelRef.current === 'article' ? hub : now ?? overviewCamera(layout.bounds);
    animateTo({ x: center.x, y: center.y, k: levelZoom[target] });
  };
  const activate = (hit: Hit) => {
    if (hit.kind === 'article') focusArticle(hit.id);
    else if (hit.kind === 'node') selectNode(hit.id);
    else if (hit.kind === 'concept') selectConcept(hit.id);
    else if (hit.kind === 'go') pointersOut.find(item => item.key === hit.id)?.go();
    else setLink(hit.id);
  };
  /** A finger cannot hit a 5px dot, so a missed tap selects the closest visible thing within a 44px target. */
  const nearest = (point: Point): { hit: Hit; distance: number } | undefined => {
    let best: Hit | undefined;
    let distance = 22;
    const consider = (hit: Hit, world: Point, slack = 0) => {
      const screen = scene.current?.project(world);
      if (!screen) return;
      const d = Math.hypot(screen.x - point.x, screen.y - point.y) - slack;
      if (d < distance) { distance = d; best = hit; }
    };
    for (const slug of layout.articles.keys()) consider({ kind: 'article', id: slug }, articleAt(slug), levelRef.current === 'article' ? 18 : 0);
    if (levelRef.current !== 'article') for (const node of data.nodes) consider({ kind: 'node', id: node.id }, position(node.id));
    if (levelRef.current === 'concept') for (const id of layout.concepts.keys()) consider({ kind: 'concept', id }, conceptAt(id));
    return best ? { hit: best, distance } : undefined;
  };
  /** Labels never intercept the pointer (so a drag or pinch can start on them); a click on one is resolved here. */
  const labelAt = (x: number, y: number): Hit | undefined => {
    const label = [...(labels.current?.querySelectorAll<HTMLElement>('[data-hit]') ?? [])].find(element => {
      const box = element.getBoundingClientRect();
      const pad = Math.max(0, (36 - Math.min(box.width, box.height)) / 2);
      return x >= box.left - pad && x <= box.right + pad && y >= box.top - pad && y <= box.bottom + pad;
    })?.dataset.hit;
    if (!label) return undefined;
    const index = label.indexOf(':');
    return { kind: label.slice(0, index) as Hit['kind'], id: label.slice(index + 1) };
  };
  /** The node drawn under a screen point: exactly the discs the scene draws, so there is no dead zone around them. */
  const nodeUnder = (point: Point): boolean => {
    const zoom = scene.current?.view()?.zoom;
    if (!zoom) return false;
    return drawn.current.some(node => {
      const world = scenePosition(node.id);
      const screen = world && scene.current?.project(world);
      return !!screen && Math.hypot(screen.x - point.x, screen.y - point.y) <= node.radius * zoom + 1;
    });
  };
  const onBackground = (event: MouseEvent) => {
    const rect = root.current?.getBoundingClientRect();
    const touch = (event as PointerEvent).pointerType === 'touch' || (event as PointerEvent).pointerType === 'pen';
    const hit = touch && rect ? nearest({ x: event.clientX - rect.left, y: event.clientY - rect.top })?.hit : undefined;
    if (hit) activate(hit);
    else if (link || search.node) closeSheet();
  };
  const describe = (item: SceneNodeData | SceneEdgeData) => item.kind === 'node' ? clip(nodes.get(item.ref)?.text ?? '', 64)
    : item.kind === 'article' ? articles.get(item.ref)?.title ?? ''
    : item.kind === 'concept' ? `${concepts.get(item.ref)?.label ?? ''} · ${(members.get(item.ref) ?? []).length} 段落`
    : item.kind === 'link' ? (() => {
      const edge = layout.articleEdges.find(e => linkKey(e) === item.ref);
      return edge ? `${[edge.semanticCount ? `意味が近い段落 ${edge.semanticCount} 組` : '', edge.conceptCount ? `同じ概念 ${edge.conceptCount} 組` : ''].filter(Boolean).join(' · ')}。押すと根拠を表示` : '';
    })() : '';
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const moves: Record<string, [number, number]> = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] };
    if (moves[event.key]) { event.preventDefault(); interacted.current = true; scene.current?.panBy(...moves[event.key]); }
    else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.35); }
    else if (event.key === '-') { event.preventDefault(); zoomBy(1 / 1.35); }
    else if (event.key === '0' || event.key === 'Home') { event.preventDefault(); showOverview(); }
    else if (event.key === '/') { event.preventDefault(); setPanel('find'); }
    else if (event.key === 'Escape') {
      event.preventDefault();
      if (panel) setPanel(undefined);
      else if (link || search.node || search.concept) closeSheet();
      else showOverview();
    }
  };

  // Screen-space decisions (labels, off-screen pointers) are made once the camera rests.
  const camera: Camera | undefined = view ? { x: view.x, y: view.y, k: view.zoom / fit } : undefined;
  const screenOf = (p: Point) => view && camera ? toScreen(camera, fit, view, p) : undefined;
  const onScreen = (p: Point, margin = 0) => {
    const s = screenOf(p);
    return !!s && !!view && s.x >= -margin && s.x <= view.width + margin && s.y >= -margin && s.y <= view.height + margin;
  };
  const tagLabels = useMemo(() => {
    const kept: GraphNode[] = [];
    if (!view || level !== 'concept') return kept;
    const placed: Point[] = [];
    const ordered = [...data.nodes].sort((a, b) => Number(b.id === search.node) - Number(a.id === search.node)
      || Number(neighbors.has(b.id)) - Number(neighbors.has(a.id)) || (relations.get(b.id)?.length ?? 0) - (relations.get(a.id)?.length ?? 0) || a.id.localeCompare(b.id));
    for (const node of ordered) {
      const s = screenOf(position(node.id));
      if (!s || s.x < 0 || s.x > view.width || s.y < 0 || s.y > view.height) continue;
      if (placed.some(p => Math.abs(p.x - s.x) < 108 && Math.abs(p.y - s.y) < 20)) continue;
      placed.push(s);
      kept.push(node);
    }
    return kept;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, level, data, position, search.node, neighbors, relations]);
  const membership = useMemo(() => {
    if (level !== 'concept' || !view) return [] as { concept: string; node: string; strong: boolean }[];
    const focus = new Set([...(search.concept ? [search.concept] : []), ...(selected?.tags ?? [])]);
    const visible = [...layout.concepts.keys()].filter(id => onScreen(conceptAt(id), 40));
    // A concept on screen keeps its lines to members beyond the edge, so the reader can see where its paragraphs are.
    const everywhere = visible.flatMap(concept => (members.get(concept) ?? []).map(n => ({ concept, node: n.id, strong: false })));
    const all = everywhere.length <= 260 ? everywhere : everywhere.filter(line => onScreen(position(line.node), 40));
    const focused = [...focus].flatMap(concept => (members.get(concept) ?? []).map(n => ({ concept, node: n.id, strong: true })));
    return all.length <= 260 ? [...focused, ...all.filter(line => !focus.has(line.concept))] : focused;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, view, layout, members, position, search.concept, selected]);
  /** Things that matter but are outside the viewport get a small pointer on the nearest edge. */
  const pointersOut = useMemo(() => {
    const result: { key: string; label: string; title: string; x: number; y: number; go: () => void }[] = [];
    if (!view || moving) return result;
    const edge = (p: Point) => {
      const s = screenOf(p);
      if (!s || (s.x >= 0 && s.x <= view.width && s.y >= 0 && s.y <= view.height)) return undefined;
      // Stay clear of the corner controls and the legend.
      return { x: Math.max(96, Math.min(view.width - 96, s.x)), y: Math.max(88, Math.min(view.height - (view.width > 680 ? 132 : 88), s.y)) };
    };
    if (level !== 'article') for (const article of data.articles) {
      const at = edge(articleAt(article.slug));
      if (at) result.push({ key: `a:${article.slug}`, label: `→ ${clip(shortTitle(article.title)[0], 11)}`, title: article.title, ...at, go: () => focusArticle(article.slug) });
    }
    if (level === 'concept' && search.concept && layout.concepts.has(search.concept)) {
      const p = conceptAt(search.concept);
      const at = edge(p);
      if (at) result.push({ key: `c:${search.concept}`, label: `→ ${concepts.get(search.concept)?.label ?? ''}`, title: '概念の位置へ', ...at, go: () => flyTo(p, CONCEPT_ZOOM + 0.4) });
    }
    // Keep pointers from stacking on one edge.
    return result.filter((item, index) => result.slice(0, index).every(other => Math.abs(other.x - item.x) > 150 || Math.abs(other.y - item.y) > 40));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, moving, level, data, layout, search.concept, search.article, search.node]);

  // What Reagraph draws. The node and edge sets themselves change with the level, not only their size.
  const hubPixels = (count: number) => level === 'article' ? 15 + Math.sqrt(count) * 2 : 9;
  const unit = 1 / (fit * levelZoom[level]);

  const maxSemantic = Math.max(1, ...layout.articleEdges.map(e => e.semanticCount));
  const sceneNodes = useMemo<SceneNodes>(() => {
    const result: SceneNodes = [];
    for (const article of data.articles) {
      const info = articles.get(article.slug)!;
      const quiet = matches && !data.nodes.some(n => n.slug === article.slug && matches.has(n.id));
      result.push({ id: `a:${article.slug}`,
        data: { kind: 'article', ref: article.slug, radius: hubPixels(info.count) * unit, fill: PAPER, stroke: info.color, opacity: quiet ? 0.4 : 1, ring: search.article === article.slug && level === 'article' ? info.color : undefined } satisfies SceneNodeData });
    }
    if (level === 'article') return result;
    for (const node of data.nodes) {
      const tone = articles.get(node.slug)?.color ?? GREY;
      const isSelected = node.id === selected?.id;
      const near = neighbors.has(node.id);
      const opacity = isSelected || near ? 1 : matches ? (matches.has(node.id) ? 1 : 0.14) : selected ? 0.4 : search.article && node.slug !== search.article ? 0.4 : 0.95;
      const paint = node.stance === 'author' ? { fill: PAPER, stroke: tone } : node.stance === 'critic' ? { fill: tone, stroke: AMBER }
        : node.stance === 'mixed' ? { fill: PAPER, stroke: AMBER } : { fill: tone, stroke: tone };
      result.push({ id: node.id, data: { kind: 'node', ref: node.id, radius: (isSelected ? 6.5 : near ? 5.5 : 4.5) * unit, ...paint, opacity, ring: isSelected ? INK : undefined } satisfies SceneNodeData });
    }
    if (level === 'concept') for (const id of layout.concepts.keys()) {
      const active = id === search.concept || !!selected?.tags.includes(id);
      result.push({ id: `c:${id}`, data: { kind: 'concept', ref: id, radius: 7 * unit, fill: active ? AMBER : PAPER, stroke: AMBER, opacity: 1, diamond: true } satisfies SceneNodeData });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, articles, layout, level, unit, matches, selected, neighbors, search.article, search.concept]);
  // World radius of everything currently drawn (the selection ring included), for press hit testing.
  const drawn = useRef<{ id: string; radius: number }[]>([]);
  drawn.current = sceneNodes.map(node => { const item = node.data as SceneNodeData; return { id: node.id, radius: item.radius * (item.ring ? 1.75 : 1) }; });
  const sceneEdges = useMemo<SceneEdges>(() => {
    const result: SceneEdges = [];
    const overview = level === 'article';
    for (const edge of layout.articleEdges) {
      const key = linkKey(edge);
      const active = link === key;
      const info = { kind: 'link', ref: key } satisfies SceneEdgeData;
      if (edge.conceptCount > 0) result.push({ id: `lc:${key}`, source: `a:${edge.source}`, target: `a:${edge.target}`, dashed: true, dashArray: [1.5, 3],
        size: (overview ? (active ? 4 : 3) : 1) * unit, fill: mix(AMBER, overview ? (active ? 0.1 : 0.35) : 0.75), data: info });
      if (edge.semanticCount > 0) result.push({ id: `ls:${key}`, source: `a:${edge.source}`, target: `a:${edge.target}`,
        size: (overview ? 1 + 4 * edge.semanticCount / maxSemantic : 1) * unit, fill: mix(CYAN, overview ? (active ? 0 : 0.2) : 0.8), data: info });
    }
    if (overview) return result;
    const chosen = new Set(selectedRelations.map(e => `${e.kind}:${e.source}:${e.target}`));
    for (const e of layout.paragraphEdges) if (e.kind === 'semantic' && !chosen.has(`${e.kind}:${e.source}:${e.target}`)) {
      const touchesFocus = !!search.article && (nodes.get(e.source)?.slug === search.article || nodes.get(e.target)?.slug === search.article);
      result.push({ id: `s:${e.source}:${e.target}`, source: e.source, target: e.target, size: 0.7 * unit, fill: mix(CYAN, selected || matches ? 0.86 : touchesFocus ? 0.45 : 0.8), data: { kind: 'relation', ref: '' } satisfies SceneEdgeData });
    }
    // Structure, not similarity: neighbouring paragraphs of one section, and which article a paragraph belongs to.
    for (const e of layout.paragraphEdges) if (e.kind === 'sequence' && !chosen.has(`${e.kind}:${e.source}:${e.target}`)) {
      const tone = articles.get(nodes.get(e.source)?.slug ?? '')?.color ?? GREY;
      result.push({ id: `q:${e.source}:${e.target}`, source: e.source, target: e.target, size: 0.7 * unit, fill: mix(tone, selected || matches ? 0.84 : 0.68), data: { kind: 'relation', ref: '' } satisfies SceneEdgeData });
    }
    if (search.article && articles.has(search.article)) for (const node of data.nodes) if (node.slug === search.article) {
      result.push({ id: `o:${node.id}`, source: `a:${node.slug}`, target: node.id, size: 0.5 * unit, fill: mix(articles.get(node.slug)!.color, 0.86), data: { kind: 'relation', ref: '' } satisfies SceneEdgeData });
    }
    for (const m of membership) result.push({ id: `m:${m.concept}:${m.node}`, source: `c:${m.concept}`, target: m.node, size: 0.8 * unit, fill: mix(AMBER, m.strong ? 0.35 : 0.8), data: { kind: 'relation', ref: '' } satisfies SceneEdgeData });
    for (const e of selectedRelations) result.push({ id: `r:${e.kind}:${e.source}:${e.target}`, source: e.source, target: e.target, data: { kind: 'relation', ref: '' } satisfies SceneEdgeData,
      ...(e.kind === 'semantic' ? { size: 1.8 * unit, fill: CYAN } : e.kind === 'concept' ? { size: 1 * unit, fill: mix(AMBER, 0.4), dashed: true, dashArray: [1.5, 2.5] as [number, number] }
        : e.kind === 'explicit' ? { size: 1.8 * unit, fill: AMBER } : { size: 1.1 * unit, fill: GREY }) });
    return result;
  }, [layout, level, unit, link, maxSemantic, selectedRelations, selected, matches, membership, search.article, nodes, articles, data]);
  const rings = useMemo<SceneRing[]>(() => level === 'article' ? [] : data.articles.map(article => {
    const p = articleAt(article.slug);
    return { x: p.x, y: p.y, radius: TERRITORY, color: mix(articles.get(article.slug)?.color ?? GREY, 0.78) };
  }), [level, data, articleAt, articles]);
  const hubOrder = useMemo(() => [...layout.articles.keys()].sort((a, b) => {
    const pa = layout.articles.get(a)!, pb = layout.articles.get(b)!;
    return Math.atan2(pa.y, pa.x) - Math.atan2(pb.y, pb.x);
  }), [layout]);

  const row = (node: GraphNode, focusSheet = true, extra?: string) => <li key={`${extra ?? ''}${node.id}`} {...stylex.props(graph.row)}>
    <button type="button" aria-pressed={selected?.id === node.id} {...stylex.props(graph.rowButton, selected?.id === node.id && graph.rowCurrent)} onClick={() => selectNode(node.id, focusSheet)}>
      <span {...stylex.props(graph.rowMeta)}>{clip(shortTitle(articles.get(node.slug)?.title ?? '').join(''), 22)} · {clip(node.section.split(' / ').at(-1) || '冒頭', 26)}{extra ? ` · ${extra}` : ''}</span>
      <span {...stylex.props(graph.rowText)}>{clip(node.text, 84)}</span>
    </button>
  </li>;
  const relationGroup = (kind: Relation['kind']) => {
    const items = selectedRelations.filter(e => e.kind === kind).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .map(e => ({ edge: e, node: nodes.get(e.source === selected?.id ? e.target : e.source) })).filter((item): item is { edge: Relation; node: GraphNode } => !!item.node);
    if (!items.length) return null;
    return <section key={kind} aria-label={relationLabels[kind]}>
      <h3 {...stylex.props(graph.groupHeading)}>{relationLabels[kind]} · {items.length}</h3>
      {kind === 'semantic' && <p {...stylex.props(graph.note)}>話題と言葉づかいの近さです。賛成・反対や因果は表しません。</p>}
      {kind === 'concept' && <p {...stylex.props(graph.note)}>共通の概念タグを持つ別記事の段落です。意味の線の基準に届かない候補も含みます。</p>}
      <ul {...stylex.props(graph.rows)}>{items.map(({ edge, node }) => row(node, false, edge.score ? `類似度 ${edge.score.toFixed(2)}` : undefined))}</ul>
    </section>;
  };
  const evidence = (kind: 'semantic' | 'concept', relation: ArticleRelation) => {
    const all = relation.examples.filter(e => e.kind === kind).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.source.localeCompare(b.source));
    if (!all.length) return null;
    const shared = new Map<string, number>();
    for (const e of all) for (const tag of nodes.get(e.source)?.tags ?? []) if (nodes.get(e.target)?.tags.includes(tag)) shared.set(tag, (shared.get(tag) ?? 0) + 1);
    const top = [...shared.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    return <section aria-label={kind === 'semantic' ? '意味が近い段落の組' : '同じ概念で近い段落の組'}>
      <h3 {...stylex.props(graph.groupHeading)}>{kind === 'semantic' ? `意味が近い段落の組 · ${all.length}` : `同じ概念で近い段落の組 · ${all.length}`}</h3>
      <p {...stylex.props(graph.note)}>{kind === 'semantic'
        ? `別の記事の段落どうしで、意味ベクトルの類似度が ${data.similarity.threshold} 以上の組です。話題の近さで、賛同や因果ではありません。`
        : '共通の概念タグを持つ段落を、近い順に各段落から結んだ候補です。段落の多い記事ほど組が増えるので、数はつながりの強さを表しません。'}</p>
      <ul {...stylex.props(graph.chips)} aria-label="この組に多い概念">{top.map(([tag, count]) => <li key={tag}><button type="button" {...stylex.props(graph.chip)} onClick={() => selectConcept(tag)}>{concepts.get(tag)?.label ?? tag} {count}</button></li>)}</ul>
      <ul {...stylex.props(graph.rows)}>{all.slice(0, more ? 40 : 3).flatMap((e, index) => [e.source, e.target].map(id => nodes.get(id)).filter((n): n is GraphNode => !!n)
        .map((n, side) => row(n, false, `${index + 1}組目${side === 0 && e.score ? ` · 類似度 ${e.score.toFixed(2)}` : ''}`)))}</ul>
      {all.length > 3 && !more && <button type="button" {...stylex.props(graph.textButton)} onClick={() => setMore(true)}>ほかの組も表示（{Math.min(all.length, 40) - 3}）</button>}
    </section>;
  };

  let sheet: { title: string; body: ReactNode } | undefined;
  if (activeLink) {
    const a = articles.get(activeLink.source), b = articles.get(activeLink.target);
    sheet = { title: '記事どうしのつながり', body: <>
      <p {...stylex.props(graph.meta)}><span {...stylex.props(graph.metaStrong)}>{a?.title}</span><br />と<br /><span {...stylex.props(graph.metaStrong)}>{b?.title}</span></p>
      <p {...stylex.props(graph.note)}>この線は、下の段落どうしの関係をまとめたものです。記事全体の賛否や近さを一つの数にしたものではありません。</p>
      {evidence('semantic', activeLink)}
      {evidence('concept', activeLink)}
    </> };
  } else if (selected) {
    sheet = { title: '選んだ段落', body: <>
      <p {...stylex.props(graph.meta)}><span {...stylex.props(graph.metaStrong)}>{articles.get(selected.slug)?.title}</span><br />{selected.section || '冒頭'}</p>
      <blockquote {...stylex.props(graph.quote, !expanded && graph.clamp)}>{selected.text}</blockquote>
      {selected.text.length > 150 && <button type="button" {...stylex.props(graph.textButton)} aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? '折りたたむ' : '全文を表示'}</button>}
      {(selected.context || selected.stance) && <p {...stylex.props(graph.note)}>{selected.stance ? `${stanceLabels[selected.stance]}。` : ''}{selected.context ?? ''}{selected.kind === 'quote' ? ' 引用段落。' : ''}</p>}
      <ul {...stylex.props(graph.chips)} aria-label="この段落の概念">{selected.tags.map(tag => <li key={tag}><button type="button" {...stylex.props(graph.chip)} onClick={() => selectConcept(tag)}>{concepts.get(tag)?.label ?? tag}</button></li>)}</ul>
      <Link to="/blog/$slug" params={{ slug: selected.slug }} hash={selected.anchor} {...stylex.props(graph.readLink)}>元の記事でこの段落を読む <span aria-hidden="true">↗</span></Link>
      {(['semantic', 'concept', 'explicit', 'sequence'] as const).map(relationGroup)}
    </> };
  } else if (search.node) {
    sheet = { title: '選んだ段落', body: <p {...stylex.props(graph.meta)}>この段落は更新または削除されました。</p> };
  } else if (search.concept && concepts.has(search.concept)) {
    const concept = concepts.get(search.concept)!;
    const list = members.get(concept.id) ?? [];
    const at = layout.concepts.has(concept.id) ? conceptAt(concept.id) : undefined;
    sheet = { title: '選んだ概念', body: <>
      <p {...stylex.props(graph.meta)}><span {...stylex.props(graph.metaStrong)}>{concept.label}</span>{concept.description ? <><br />{concept.description}</> : null}</p>
      <p {...stylex.props(graph.note)}>編集時に段落を読んで付けたタグです。{list.length} 段落（{data.articles.filter(article => list.some(n => n.slug === article.slug)).length} 記事）。同じタグでも、主張する人と批判する人が含まれます。</p>
      {at && <button type="button" {...stylex.props(graph.textButton)} onClick={() => flyTo(at, CONCEPT_ZOOM + 0.4)}>地図でこの概念の位置へ</button>}
      <ul {...stylex.props(graph.rows)}>{[...list].sort((x, y) => (articles.get(x.slug)?.index ?? 0) - (articles.get(y.slug)?.index ?? 0) || x.order - y.order).slice(0, more ? 200 : 8).map(n => row(n, false))}</ul>
      {list.length > 8 && !more && <button type="button" {...stylex.props(graph.textButton)} onClick={() => setMore(true)}>すべて表示（{list.length}）</button>}
    </> };
  }

  const found = useMemo(() => {
    const text = normalize(query.trim());
    const list = (text ? data.nodes.filter(n => normalize(`${n.text} ${n.section} ${articles.get(n.slug)?.title ?? ''} ${n.tags.map(t => concepts.get(t)?.label ?? '').join(' ')}`).includes(text))
      : search.article ? data.nodes.filter(n => n.slug === search.article) : [])
      .sort((a, b) => (articles.get(a.slug)?.index ?? 0) - (articles.get(b.slug)?.index ?? 0) || a.order - b.order);
    return { text, list, concepts: text ? data.concepts.filter(c => normalize(`${c.label} ${c.description ?? ''}`).includes(text)).slice(0, 6) : [] };
  }, [query, data, search.article, articles, concepts]);
  const commitQuery = (value: string) => { if (!composing.current && (value.trim() || undefined) !== search.q) onChange({ ...search, q: value.trim() || undefined }); };

  return <div ref={root} lang="ja" role="group" aria-label="テーマの地図。矢印キーで移動、プラスとマイナスで拡大縮小、0で全体、スラッシュで段落を探す、Escapeで一つ戻ります。" tabIndex={0}
    data-testid="graph-canvas" data-level={level} data-zoom={view ? (view.zoom / fit).toFixed(2) : undefined} data-moving={moving || undefined}
    data-nodes={sceneNodes.length} data-edges={sceneEdges.length}
    onKeyDown={onKeyDown} onPointerDownCapture={event => {
      interacted.current = true;
      setHover(undefined);
      pressed.current = { x: event.clientX, y: event.clientY };
      pointerType.current = event.pointerType;
      dragged.current = false;
      // A press on a node is about to drag that node. Reagraph pauses the camera only once its drag has started,
      // which lets the first movements pan the map as well; panning is switched off for this gesture up front.
      if (event.target instanceof HTMLCanvasElement) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (nodeUnder({ x: event.clientX - rect.left, y: event.clientY - rect.top })) scene.current?.setPan(false);
      }
    }} onWheelCapture={() => { interacted.current = true; }}
    onClickCapture={event => {
      // A label wins over whatever line happens to run underneath it, but never after a drag.
      if (!(event.target instanceof HTMLCanvasElement) || Math.hypot(event.clientX - pressed.current.x, event.clientY - pressed.current.y) > 6) return;
      // Labels sit on top of the dots (an article's name lies across its own paragraphs), so a dot that is
      // clearly meant always wins over the label covering it.
      const rect = event.currentTarget.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const label = labelAt(event.clientX, event.clientY);
      let hit: Hit | undefined;
      if (pointerType.current === 'touch' || pointerType.current === 'pen') {
        // With a finger the closest thing within a 44px target is chosen here. Left to the WebGL hit test, a tap
        // beside a dot lands on whichever thin line passes under it and selects nothing.
        const near = nearest(point);
        hit = near && (near.distance <= 14 || !label) ? near.hit : label;
      } else if (!nodeUnder(point)) hit = label;
      if (hit) { event.stopPropagation(); activate(hit); }
    }}
    onPointerMove={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      if (event.buttons !== 0 && Math.hypot(event.clientX - pressed.current.x, event.clientY - pressed.current.y) > 6) dragged.current = true;
    }}
    {...stylex.props(graph.root, embedded && graph.embeddedRoot)}>
    {size && <div {...stylex.props(graph.scene)}>
      <SceneBoundary fallback={<p role="alert" {...stylex.props(graph.status)}>この環境では地図を描画できませんでした。右上の「探す」から段落を選ぶか、一覧へ戻って読めます。</p>}><Scene ref={scene} nodes={sceneNodes} edges={sceneEdges} positions={scenePosition} rings={rings} background={PAPER} accent={CYAN}
        minZoom={fit * MIN_ZOOM} maxZoom={fit * MAX_ZOOM} labels={labels}
        onReady={() => setReady(true)} onView={onView}
        // Letting go of a dragged node is not a choice of that node.
        onNode={item => { if (!dragged.current) activate({ kind: item.kind, id: item.ref }); }}
        onEdge={item => { if (item.kind === 'link' && !dragged.current) setLink(item.ref); }}
        onBackground={onBackground}
        onHover={item => { const text = item ? describe(item) : ''; setHover(text ? { text, ...pointer.current } : undefined); }}
        onDragged={onDragged} /></SceneBoundary>
    </div>}

    <div ref={labels} data-testid="graph-labels" {...stylex.props(graph.labels)}>
      {data.articles.map(article => {
        const info = articles.get(article.slug)!;
        const p = articleAt(article.slug);
        const hits = matches ? data.nodes.filter(n => n.slug === article.slug && matches.has(n.id)).length : undefined;
        const radius = hubPixels(info.count);
        return <div key={article.slug} data-wx={p.x} data-wy={p.y} {...stylex.props(graph.anchor)}>
          {level === 'article' && <span aria-hidden="true" {...stylex.props(graph.hubCount)}>{hits !== undefined ? `${hits}/${info.count}` : info.count}</span>}
          <button type="button" data-kind="article" data-hit={`article:${article.slug}`} title={article.title} aria-label={`${article.title}。${info.count} 段落。この記事に近づく`} aria-pressed={search.article === article.slug}
            data-clamp="" style={{ top: radius + 4 }} {...stylex.props(graph.hubLabel)} onClick={() => focusArticle(article.slug)}>
            {shortTitle(article.title).map(text => <span key={text} {...stylex.props(graph.hubLine)}>{text}</span>)}
          </button>
        </div>;
      })}
      {level === 'article' && layout.articleEdges.map(edge => {
        const a = articleAt(edge.source), b = articleAt(edge.target);
        const key = linkKey(edge);
        const gap = Math.abs(hubOrder.indexOf(edge.source) - hubOrder.indexOf(edge.target));
        const t = hubOrder.length < 4 || gap === 1 || gap === hubOrder.length - 1 ? 0.5 : 0.3;
        const text = [edge.semanticCount ? `意味 ${edge.semanticCount}` : '', edge.conceptCount ? `概念 ${edge.conceptCount}` : '', edge.explicitCount ? `リンク ${edge.explicitCount}` : ''].filter(Boolean).join(' · ');
        // A quiet marker by default; the counts appear in words only for the chosen link (and in the hover tooltip).
        return <div key={key} data-wx={a.x + (b.x - a.x) * t} data-wy={a.y + (b.y - a.y) * t} {...stylex.props(graph.anchor)}>
          <button type="button" data-kind="article-edge" data-hit={`link:${key}`} aria-pressed={link === key}
            aria-label={`${articles.get(edge.source)?.title} と ${articles.get(edge.target)?.title} のつながり。${text}。根拠を見る`}
            {...stylex.props(link === key ? graph.glass : graph.linkDot, link === key && graph.linkChip, link === key && graph.linkChipActive)} onClick={() => setLink(key)}>{link === key ? text : null}</button>
        </div>;
      })}
      {level === 'concept' && [...layout.concepts.keys()].map(id => { const p = conceptAt(id); return <div key={id} data-wx={p.x} data-wy={p.y} {...stylex.props(graph.anchor)}>
        <button type="button" data-kind="concept" data-hit={`concept:${id}`} aria-pressed={search.concept === id} {...stylex.props(graph.conceptLabel, (id === search.concept || !!selected?.tags.includes(id)) && graph.conceptLabelActive)} onClick={() => selectConcept(id)}>{concepts.get(id)?.label}</button>
      </div>; })}
      {pointersOut.map(item => <button key={item.key} type="button" title={item.title} data-testid="graph-offscreen" data-hit={`go:${item.key}`} style={{ left: item.x, top: item.y }} {...stylex.props(graph.glass, graph.edgeChip)} onClick={item.go}>{item.label}</button>)}
      {tagLabels.map(node => { const p = position(node.id); return <div key={node.id} data-wx={p.x} data-wy={p.y} {...stylex.props(graph.anchor)}>
        <span data-kind="paragraph-tag" data-node={node.id} {...stylex.props(graph.tagLabel)}>{concepts.get(node.tags[0])?.label}{node.tags.length > 1 ? ` +${node.tags.length - 1}` : ''}</span>
      </div>; })}
    </div>

    {hover && <div role="presentation" style={{ left: Math.min(hover.x + 14, (size?.width ?? 600) - 290), top: hover.y + 16 }} {...stylex.props(graph.glass, graph.tooltip)}>{hover.text}</div>}

    {refreshFailed && <div role="status" {...stylex.props(graph.refreshNotice)}>
      地図の更新を確認できませんでした。 <button type="button" onClick={retry} {...stylex.props(graph.button)}>更新を再試行</button>
    </div>}
    {!embedded && <div {...stylex.props(graph.corner, graph.topLeft)}>
      <Link to="/blog" search={search.tag ? { tag: search.tag } : {}} {...stylex.props(graph.glass, graph.control)}><span aria-hidden="true">←</span> 一覧</Link>
      <span {...stylex.props(graph.glass, graph.title)}>長く育てているテーマの地図</span>
    </div>}
    <div {...stylex.props(graph.corner, graph.topRight)}>
      <button type="button" aria-expanded={panel === 'find'} {...stylex.props(graph.glass, graph.control, panel === 'find' && graph.controlActive)} onClick={() => setPanel(p => p === 'find' ? undefined : 'find')}>探す</button>
      <button type="button" aria-expanded={panel === 'help'} aria-label="地図の読み方" {...stylex.props(graph.glass, graph.control, panel === 'help' && graph.controlActive)} onClick={() => setPanel(p => p === 'help' ? undefined : 'help')}>?</button>
    </div>
    <div {...stylex.props(graph.corner, graph.bottomLeft)}>
      <button type="button" aria-label="地図を縮小" {...stylex.props(graph.glass, graph.control)} onClick={() => zoomBy(1 / 1.5)}>−</button>
      <button type="button" aria-label="地図を拡大" {...stylex.props(graph.glass, graph.control)} onClick={() => zoomBy(1.5)}>＋</button>
      <button type="button" {...stylex.props(graph.glass, graph.control)} onClick={showOverview}>全体</button>
      <div role="group" aria-label="表示の段階" {...stylex.props(graph.glass, graph.levels)}>
        {(['article', 'paragraph', 'concept'] as const).map(item => <button key={item} type="button" aria-pressed={level === item} {...stylex.props(graph.levelButton, level === item && graph.levelCurrent)} onClick={() => goToLevel(item)}>{levelLabels[item]}</button>)}
      </div>
    </div>
    {!sheet && <ul aria-label="線の凡例" {...stylex.props(graph.corner, graph.glass, graph.legend, graph.bottomRight)}>
      <li {...stylex.props(graph.legendItem)}><svg width="28" height="6" aria-hidden="true"><line x1="0" y1="3" x2="28" y2="3" stroke={CYAN} strokeWidth="2" /></svg>意味が近い段落がある</li>
      <li {...stylex.props(graph.legendItem)}><svg width="28" height="6" aria-hidden="true"><line x1="1" y1="3" x2="28" y2="3" stroke={AMBER} strokeWidth="3" strokeDasharray="1 6" strokeLinecap="round" /></svg>同じ概念でつながる</li>
      {level !== 'article' && <li {...stylex.props(graph.legendItem)}><svg width="28" height="6" aria-hidden="true"><line x1="0" y1="3" x2="28" y2="3" stroke={GREY} strokeWidth="1" /></svg>同じ節の前後・記事への所属</li>}
    </ul>}
    <p role="status" {...stylex.props(graph.srOnly)}>{levelLabels[level]}を表示しています</p>

    {panel === 'find' && <section role="dialog" aria-label="段落を探す" data-testid="graph-find" {...stylex.props(graph.glass, graph.panel)}>
      <div {...stylex.props(graph.panelHead)}><h2 {...stylex.props(graph.panelTitle)}>探す</h2><button type="button" aria-label="閉じる" {...stylex.props(graph.close)} onClick={() => setPanel(undefined)}>×</button></div>
      <div {...stylex.props(graph.panelBody)}>
        <label><span {...stylex.props(graph.srOnly)}>段落を検索</span>
          <input type="search" autoFocus placeholder="ことば・概念で探す" value={query} {...stylex.props(graph.input)}
            onChange={event => { setQuery(event.target.value); if (!composing.current) commitQuery(event.target.value); }}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={event => { composing.current = false; commitQuery(event.currentTarget.value); }}
            onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setPanel(undefined); root.current?.focus(); } }} /></label>
        <h3 {...stylex.props(graph.groupHeading)}>記事</h3>
        <ul {...stylex.props(graph.chips)} aria-label="記事に近づく">
          {data.articles.map(article => <li key={article.slug}><button type="button" title={article.title} aria-pressed={search.article === article.slug} {...stylex.props(graph.chip, search.article === article.slug && graph.rowCurrent)} onClick={() => focusArticle(article.slug)}>{clip(shortTitle(article.title).join(''), 16)}</button></li>)}
          {search.article && <li><button type="button" {...stylex.props(graph.chip)} onClick={showOverview}>全体へ戻る</button></li>}
        </ul>
        {found.concepts.length > 0 && <><h3 {...stylex.props(graph.groupHeading)}>概念</h3>
          <ul {...stylex.props(graph.chips)} aria-label="概念を選ぶ">{found.concepts.map(c => <li key={c.id}><button type="button" {...stylex.props(graph.chip)} onClick={() => selectConcept(c.id)}>{c.label}</button></li>)}</ul></>}
        <h3 {...stylex.props(graph.groupHeading)}>段落</h3>
        <p role="status" {...stylex.props(graph.note)}>{found.text || search.article ? `${found.list.length} 段落` : 'ことばを入れるか、記事を選ぶと段落が並びます。'}</p>
        <ul {...stylex.props(graph.rows)} aria-label="段落の検索結果">{found.list.slice(0, limit).map(n => row(n))}</ul>
        {found.list.length > limit && <button type="button" {...stylex.props(graph.textButton)} onClick={() => setLimit(l => l + 30)}>次の30段落を表示</button>}
      </div>
    </section>}
    {panel === 'help' && <section role="dialog" aria-label="地図の読み方" data-testid="graph-help" {...stylex.props(graph.glass, graph.panel)}>
      <div {...stylex.props(graph.panelHead)}><h2 {...stylex.props(graph.panelTitle)}>地図の読み方</h2><button type="button" aria-label="閉じる" {...stylex.props(graph.close)} onClick={() => setPanel(undefined)}>×</button></div>
      <div {...stylex.props(graph.panelBody)}>
        <p {...stylex.props(graph.meta)}>長く育てているテーマの記事を、段落のつながりから辿る地図です。近づくほど、記事、段落、概念の順に細かく見えます。</p>
        <p {...stylex.props(graph.meta)}>ホイールやピンチで拡大、ドラッグで移動します。記事の名前を押すとその記事に近づき、点を押すと段落を読めます。線の上の札を押すと、その線のもとになった段落の組を確かめられます。</p>
        <p {...stylex.props(graph.meta)}>記事と段落の位置は、記事ごとに探しやすく並べた配置です。距離そのものは意味の近さを表しません。関係は線で示します。</p>
        <p {...stylex.props(graph.meta)}>青い実線は、意味ベクトルの類似度が {data.similarity.threshold} 以上の段落の組です。似た話題を扱っているという意味で、賛成どうしとは限りません。批判と主張が結ばれることもあります。琥珀色の点線は、編集時に付けた共通の概念タグによるつながりです。細い薄い線は、同じ節で隣り合う段落と、段落がどの記事に属するかを示す構造の線で、意味の近さではありません。</p>
        <p {...stylex.props(graph.meta)}>点の塗りは話者を表します。塗りつぶしは原典や話者の主張、白抜きは筆者の解説、琥珀色の縁は批評や複数の立場の比較です。</p>
        <p {...stylex.props(graph.note)}>ベクトルは {data.model.id}（{data.model.dim} 次元）でローカルに事前生成しています。記事内の並びは {data.projection.method} の座標（寄与率 約 {(data.projection.explainedVariance.reduce((sum, value) => sum + value, 0) * 100).toFixed(1)}%）を記事ごとに広げ直したもので、粗い近似です。箇条書き・表・出典案内は地図に含めていません。</p>
      </div>
    </section>}
    {sheet && <aside aria-label={sheet.title} data-testid="graph-sheet" {...stylex.props(graph.glass, graph.sheet)}>
      <div {...stylex.props(graph.panelHead)}><h2 ref={sheetTitle} tabIndex={-1} {...stylex.props(graph.panelTitle)}>{sheet.title}</h2><button type="button" aria-label="閉じる" {...stylex.props(graph.close)} onClick={closeSheet}>×</button></div>
      <div {...stylex.props(graph.panelBody)}>{sheet.body}</div>
    </aside>}
  </div>;
}
