import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { isGraphPayload, watchGraph } from './graphRefresh';
const graph = JSON.parse(readFileSync('public/paragraph-graph.json', 'utf8'));
let doc: EventTarget & { visibilityState: string };
let win: EventTarget;
beforeEach(() => {
  vi.useFakeTimers(); doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }); win = new EventTarget();
  vi.stubGlobal('document', doc); vi.stubGlobal('window', win);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('validates all references and attribution before replacing a graph', () => {
  expect(isGraphPayload(graph)).toBe(true);
  for (const mutate of [
    (g: typeof graph) => g.nodes.push(g.nodes[0]),
    (g: typeof graph) => g.articles.pop(),
    (g: typeof graph) => g.nodes[0].tags.push('unknown'),
    (g: typeof graph) => g.nodes[0].stance = 'invented',
    (g: typeof graph) => g.edges.push({ source: 'gone', target: g.nodes[0].id, kind: 'semantic' }),
    (g: typeof graph) => g.conceptNeighbors[g.nodes[0].id] = ['gone'],
  ]) { const changed = structuredClone(graph); mutate(changed); expect(isGraphPayload(changed)).toBe(false); }
});
it('polls only visible pages, catches BFCache return, and skips unchanged artifacts', async () => {
  let payload = graph;
  const fetch = vi.fn(async () => new Response(JSON.stringify(payload))); vi.stubGlobal('fetch', fetch);
  const callbacks = { data: vi.fn(), error: vi.fn(), recovered: vi.fn() }; const watcher = watchGraph(callbacks);
  await vi.advanceTimersByTimeAsync(0); expect(callbacks.data).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(30_000); expect(fetch).toHaveBeenCalledTimes(2); expect(callbacks.data).toHaveBeenCalledTimes(1);
  doc.visibilityState = 'hidden'; await vi.advanceTimersByTimeAsync(30_000); expect(fetch).toHaveBeenCalledTimes(2);
  payload = structuredClone(graph); payload.articles[0].title += '更新'; // same editorial fingerprint
  doc.visibilityState = 'visible'; win.dispatchEvent(new Event('pageshow')); await vi.advanceTimersByTimeAsync(0);
  expect(callbacks.data).toHaveBeenCalledTimes(2); expect(callbacks.data.mock.lastCall![0].articles[0].title).toContain('更新');
  watcher.stop(); await vi.advanceTimersByTimeAsync(60_000); win.dispatchEvent(new Event('focus')); expect(fetch).toHaveBeenCalledTimes(3);
});
it('coalesces events, times out, recovers, and ignores responses after cleanup', async () => {
  let signal: AbortSignal;
  let resolve!: (r: Response) => void;
  const fetch = vi.fn((_url, options) => { signal = options.signal; return new Promise<Response>((r, reject) => { resolve = r; signal.addEventListener('abort', () => reject(new Error('aborted'))); }); });
  vi.stubGlobal('fetch', fetch); const callbacks = { data: vi.fn(), error: vi.fn(), recovered: vi.fn() }; const watcher = watchGraph(callbacks);
  win.dispatchEvent(new Event('focus')); win.dispatchEvent(new Event('online')); expect(fetch).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(15_000); expect(signal!.aborted).toBe(true); expect(callbacks.error).toHaveBeenCalledOnce();
  watcher.refresh(); resolve(new Response(JSON.stringify(graph))); await vi.advanceTimersByTimeAsync(0); expect(callbacks.data).toHaveBeenCalledOnce();
  watcher.refresh(); watcher.stop(); resolve(new Response(JSON.stringify(graph))); await vi.advanceTimersByTimeAsync(0);
  expect(callbacks.data).toHaveBeenCalledOnce(); expect(callbacks.error).toHaveBeenCalledOnce();
});
it('upgrades an unsupported newer schema only once and never consumes it', async () => {
  const memory = new Map<string,string>();
  vi.stubGlobal('sessionStorage', { getItem: (k:string)=>memory.get(k)??null, setItem: (k:string,v:string)=>memory.set(k,v) });
  const reload=vi.fn(); vi.stubGlobal('location',{reload});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...graph,version:2}))));
  const callbacks={data:vi.fn(),error:vi.fn(),recovered:vi.fn()};
  let watcher=watchGraph(callbacks);await vi.advanceTimersByTimeAsync(0);
  expect(reload).toHaveBeenCalledTimes(1);expect(callbacks.data).not.toHaveBeenCalled();watcher.stop();
  watcher=watchGraph(callbacks);await vi.advanceTimersByTimeAsync(0);await vi.advanceTimersByTimeAsync(30000);
  expect(reload).toHaveBeenCalledTimes(1);expect(callbacks.error).toHaveBeenCalled();watcher.stop();
});
it('does not reload for malformed current data or denied session storage', async () => {
  const reload=vi.fn();vi.stubGlobal('location',{reload});
  vi.stubGlobal('sessionStorage',{getItem:()=>{throw new Error('denied');}});
  let payload:unknown={...graph,nodes:[]};vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(payload))));
  const callbacks={data:vi.fn(),error:vi.fn(),recovered:vi.fn()};const watcher=watchGraph(callbacks);
  await vi.advanceTimersByTimeAsync(0);payload={...graph,version:2};watcher.refresh();await vi.advanceTimersByTimeAsync(0);
  expect(reload).not.toHaveBeenCalled();expect(callbacks.error).toHaveBeenCalledTimes(2);watcher.stop();
});
