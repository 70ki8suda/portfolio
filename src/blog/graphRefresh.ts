import type { GraphData } from './graphTypes';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

/** Reject stale or malformed payloads before any nested metadata or node access. */
export function isGraphPayload(value: unknown): value is GraphData {
  if (!isRecord(value) || value.version !== 2 || typeof value.fingerprint !== 'string') return false;
  const { model, projection, similarity, conceptNeighbors, nodes, articles, concepts, edges } = value;
  if (!isRecord(conceptNeighbors) || !Object.values(conceptNeighbors).every(isStringList)) return false;
  if (!isRecord(model) || typeof model.id !== 'string' || typeof model.revision !== 'string'
    || typeof model.license !== 'string' || typeof model.prefix !== 'string' || !isFiniteNumber(model.dim) || model.dim <= 0) return false;
  if (!isRecord(projection) || typeof projection.method !== 'string' || !Array.isArray(projection.explainedVariance)
    || projection.method !== 'frozen-umap-reference-interpolation' || typeof projection.id !== 'string' || !projection.explainedVariance.every(isFiniteNumber)) return false;
  if (!isRecord(similarity) || !isFiniteNumber(similarity.threshold) || similarity.threshold < -1 || similarity.threshold > 1
    || !isFiniteNumber(similarity.topK) || !Number.isInteger(similarity.topK) || similarity.topK < 1) return false;
  const valid = Array.isArray(nodes) && nodes.every(n => isRecord(n) && typeof n.id === 'string' && typeof n.slug === 'string'
    && typeof n.anchor === 'string' && typeof n.section === 'string' && typeof n.text === 'string'
    && (n.kind === 'paragraph' || n.kind === 'quote') && isStringList(n.tags)
    && isFiniteNumber(n.x) && isFiniteNumber(n.y) && isFiniteNumber(n.order)
    && typeof n.context === 'string' && n.context.trim().length > 0
    && ['source', 'author', 'critic', 'mixed'].includes(n.stance as string)
)
    && Array.isArray(articles) && articles.every(a => isRecord(a) && typeof a.slug === 'string' && typeof a.title === 'string'
      && isStringList(a.tags) && isFiniteNumber(a.x) && isFiniteNumber(a.y))
    && Array.isArray(concepts) && concepts.every(c => isRecord(c) && typeof c.id === 'string' && typeof c.label === 'string')
    && Array.isArray(edges) && edges.every(e => isRecord(e) && typeof e.source === 'string' && typeof e.target === 'string'
      && (e.kind === 'semantic' || e.kind === 'sequence' || e.kind === 'explicit')
      && (e.score === undefined || isFiniteNumber(e.score)));
  if (!valid) return false;
  const data = value as unknown as GraphData;
  const articleIds = new Set(data.articles.map(a => a.slug));
  const conceptIds = new Set(data.concepts.map(c => c.id));
  const nodeMap = new Map(data.nodes.map(n => [n.id, n]));
  if (articleIds.size !== data.articles.length || conceptIds.size !== data.concepts.length || nodeMap.size !== data.nodes.length) return false;
  if (data.nodes.some(n => !articleIds.has(n.slug) || n.id !== `${n.slug}:${n.anchor}` || n.tags.length < 1 || n.tags.length > 3
    || new Set(n.tags).size !== n.tags.length || n.tags.some(t => !conceptIds.has(t)))) return false;
  if (data.edges.some(e => !nodeMap.has(e.source) || !nodeMap.has(e.target) || e.source === e.target
    || (e.kind === 'semantic' && nodeMap.get(e.source)!.slug === nodeMap.get(e.target)!.slug))) return false;
  const near=(map:unknown,ids:Set<string>,eligible:(a:string,b:string)=>boolean)=>isRecord(map)&&Object.keys(map).length===ids.size&&Object.entries(map).every(([id,list])=>ids.has(id)&&Array.isArray(list)&&list.length<=5&&new Set(list.map(n=>n?.id)).size===list.length&&list.every((n,i)=>isRecord(n)&&typeof n.id==='string'&&ids.has(n.id)&&n.id!==id&&eligible(id,n.id)&&isFiniteNumber(n.score)&&n.score>=-1&&n.score<=1&&(i===0||list[i-1].score>=n.score)));
  if(data.similarity.nearestK!==5||!near(data.semanticNeighbors,new Set(nodeMap.keys()),(a,b)=>nodeMap.get(a)!.slug!==nodeMap.get(b)!.slug)
    ||!near(data.articleNeighbors,new Set(data.articles.map(a=>`article:${a.slug}`)),()=>true))return false;
  if (Object.keys(data.conceptNeighbors).length !== nodeMap.size) return false;
  return Object.entries(data.conceptNeighbors).every(([id, list]) => nodeMap.has(id) && list.length <= data.similarity.topK
    && new Set(list).size === list.length && list.every(other => nodeMap.has(other) && nodeMap.get(other)!.slug !== nodeMap.get(id)!.slug
      && nodeMap.get(other)!.tags.some(t => nodeMap.get(id)!.tags.includes(t))));
}


/** One request at a time; a response can never overwrite a later request. */
export function watchGraph(callbacks: { data: (data: GraphData) => void; error: () => void; recovered: () => void }) {
  let stopped = false;
  let inFlight: AbortController | undefined;
  let signature: string | undefined;
  const refresh = async () => {
    if (stopped || inFlight || document.visibilityState === 'hidden') return;
    const controller = new AbortController();
    inFlight = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch('/paragraph-graph.json', { signal: controller.signal, cache: 'no-cache' });
      if (!response.ok) throw new Error('Graph unavailable');
      const data: unknown = await response.json();
      if (stopped || controller.signal.aborted) return;
      // A payload upgrade also needs the matching JS bundle. A session marker prevents
      // loops if HTML/CDN propagation lags or storage is unavailable.
      if (isRecord(data) && data.version === 3 && typeof data.fingerprint === 'string') {
        const key = 'paragraph-map-schema-upgrade:3';
        try {
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, 'attempted');
            location.reload();
          }
        } catch { /* Keep the readable old graph/list fallback when storage is denied. */ }
        throw new Error('Graph application update required');
      }
      if (!isGraphPayload(data)) throw new Error('Inconsistent graph');
      if (stopped || controller.signal.aborted) return;
      // fingerprint describes editorial input, not all vectors/edges. Compare the complete artifact too.
      const next = JSON.stringify(data);
      if (next !== signature) { signature = next; callbacks.data(data); }
      callbacks.recovered();
    } catch { if (!stopped) callbacks.error(); }
    finally { clearTimeout(timeout); inFlight = undefined; }
  };
  const events = ['focus', 'online', 'pageshow'] as const;
  for (const event of events) window.addEventListener(event, refresh);
  document.addEventListener('visibilitychange', refresh);
  const interval = setInterval(refresh, 30_000);
  void refresh();
  return {
    refresh: () => { void refresh(); },
    stop: () => {
      stopped = true; inFlight?.abort(); clearInterval(interval);
      for (const event of events) window.removeEventListener(event, refresh);
      document.removeEventListener('visibilitychange', refresh);
    },
  };
}
