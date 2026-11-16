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
it('loads schema4 only through its explicit development rollout preview and rejects raw fallback',async()=>{
 const {claimPreviewMode}=await import('./claimPreview');
 expect(claimPreviewMode('rollout',false)).toBeUndefined();expect(claimPreviewMode('rollout',true)).toBe('rollout');
 let payload:any=graph;
 const fetch=vi.fn(async(_url:string)=>new Response(JSON.stringify(payload)));vi.stubGlobal('fetch',fetch);
 const callbacks={data:vi.fn(),error:vi.fn(),recovered:vi.fn()};const watcher=watchGraph(callbacks,'rollout' as any);
 await vi.advanceTimersByTimeAsync(0);expect(callbacks.data).not.toHaveBeenCalled();expect(callbacks.error).toHaveBeenCalledOnce();
 payload={...graph,version:4,edges:[],conceptNeighbors:Object.fromEntries(graph.nodes.map((n:any)=>[n.id,[]])),claims:{version:1,sources:Object.fromEntries(graph.articles.map((a:any)=>[a.slug,'a'.repeat(64)])),summaries:Object.fromEntries(graph.nodes.map((n:any)=>[n.id,{speaker:n.context,conditions:[],evidence:[{anchor:n.anchor,text:n.text}]}])),baselineCount:graph.nodes.length,links:{model:'bge-reranker-v2-m3',revision:'953dc6f6f85a1b2dbfca4c34a2796e7dde08d41e',recipeHash:'a'.repeat(64),poolHash:'b'.repeat(64),threshold:-3.8601101636886597,queryIds:graph.nodes.map((n:any)=>n.id),neighbors:Object.fromEntries(graph.nodes.map((n:any)=>[n.id,[]]))}}};
 watcher.refresh();await vi.advanceTimersByTimeAsync(0);expect(callbacks.data).toHaveBeenCalledOnce();expect(fetch.mock.calls[0][0]).toBe('/__claim-preview/rollout.json');watcher.stop();
});
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
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({...graph,version:5}))));
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
  await vi.advanceTimersByTimeAsync(0);payload={...graph,version:5};watcher.refresh();await vi.advanceTimersByTimeAsync(0);
  expect(reload).not.toHaveBeenCalled();expect(callbacks.error).toHaveBeenCalledTimes(2);watcher.stop();
});

it('rejects malformed reviewed retrieval rather than accepting it as legacy neighbors',()=>{
  expect(isGraphPayload({...graph,retrieval:{}})).toBe(false);
  const h='a'.repeat(64);
  const retrieval={version:1,corpusHash:h,recipeHash:h,queries:Object.fromEntries(graph.nodes.map((n:{id:string})=>[n.id,{candidateFingerprint:h,reviewHash:h,items:[]}]))};
  expect(isGraphPayload({...graph,retrieval})).toBe(true);
  const broken=structuredClone(retrieval);delete broken.queries[graph.nodes[0].id];
  expect(isGraphPayload({...graph,retrieval:broken})).toBe(false);
  expect(isGraphPayload(graph)).toBe(true);
});

it('accepts local retrieval only with its matching outer schema and without reload',async()=>{
 const h='a'.repeat(64);
 const retrieval={version:2,mode:'local-index',corpusHash:h,recipeHash:h,
  indices:Object.fromEntries(graph.nodes.map((n:{id:string})=>[n.id,{inputHash:h,indexHash:h,subject:'対象',claim:'主張',question:'問い',speaker:'筆者',qualifications:''}])),
  queries:Object.fromEntries(graph.nodes.map((n:{id:string})=>[n.id,{rankingHash:h,items:[]}]))};
 const payload={...graph,version:3,retrieval};
 expect(isGraphPayload(payload)).toBe(true);
 expect(isGraphPayload({...payload,version:2})).toBe(false);
 expect(isGraphPayload({...graph,version:3})).toBe(false);
 const reload=vi.fn();vi.stubGlobal('location',{reload});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(payload))));
 const callbacks={data:vi.fn(),error:vi.fn(),recovered:vi.fn()};const watcher=watchGraph(callbacks);
 await vi.advanceTimersByTimeAsync(0);
 expect(callbacks.data).toHaveBeenCalledOnce();expect(reload).not.toHaveBeenCalled();expect(callbacks.error).not.toHaveBeenCalled();watcher.stop();
});

it('isolates preview data from the production loader and rejects missing or wrong preview metadata',async()=>{
 const preview={...graph,preview:{version:1,mode:'paragraphs',ranking:{threshold:.89 as const,maxCandidates:5 as const},baselineCount:graph.nodes.length,claims:{}}};
 let payload=preview;
 const fetcher=vi.fn(async(_url:string)=>new Response(JSON.stringify(payload)));vi.stubGlobal('fetch',fetcher);
 const callbacks={data:vi.fn(),error:vi.fn(),recovered:vi.fn()};
 let watcher=watchGraph(callbacks);await vi.advanceTimersByTimeAsync(0);
 expect(callbacks.data).not.toHaveBeenCalled();expect(callbacks.error).toHaveBeenCalledOnce();watcher.stop();
 watcher=watchGraph(callbacks,'paragraphs');await vi.advanceTimersByTimeAsync(0);
 expect(fetcher.mock.calls.at(-1)?.[0]).toBe('/__claim-preview/paragraphs.json');
 expect(callbacks.data).toHaveBeenCalledOnce();
 payload=graph;watcher.refresh();await vi.advanceTimersByTimeAsync(0);
 expect(callbacks.data).toHaveBeenCalledOnce();expect(callbacks.error).toHaveBeenCalledTimes(2);watcher.stop();
});

it('accepts a manifest generation atomically and keeps old data through a mismatched update',async()=>{
 const {createHash}=await import('node:crypto');const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 let bytes=JSON.stringify(graph),payloadBytes=bytes;
 const manifest=()=>({version:1,mode:'raw',schema:2,payloadUrl:'/paragraph-graph.json',payloadHash:hash(bytes),sourceSetHash:hash(JSON.stringify(graph.articles.map((a:{slug:string})=>a.slug).sort()))});
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(url==='/graph-view.json'?JSON.stringify(manifest()):payloadBytes)));
 const callbacks={data:vi.fn(),error:vi.fn(),recovered:vi.fn()};const watcher=watchGraph(callbacks,undefined,'/graph-view.json');
 await vi.waitFor(()=>expect(callbacks.data).toHaveBeenCalledOnce());
 const changed=structuredClone(graph);changed.articles[0].title+='new';bytes=JSON.stringify(changed);
 watcher.refresh();await vi.waitFor(()=>expect(callbacks.error).toHaveBeenCalledOnce());expect(callbacks.data).toHaveBeenCalledOnce();
 payloadBytes=bytes;watcher.refresh();await vi.waitFor(()=>expect(callbacks.data).toHaveBeenCalledTimes(2));expect(callbacks.data.mock.lastCall![0].articles[0].title).toContain('new');watcher.stop();
});
it('reloads an unknown manifest schema only once, or preserves state if storage is denied',async()=>{
 const memory=new Map<string,string>(),reload=vi.fn();vi.stubGlobal('location',{reload});
 vi.stubGlobal('sessionStorage',{getItem:(k:string)=>memory.get(k)??null,setItem:(k:string,v:string)=>memory.set(k,v)});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({version:1,mode:'claims',schema:5,payloadUrl:'/claim-graph.json',payloadHash:'a'.repeat(64),sourceSetHash:'b'.repeat(64)}))));
 const callbacks={data:vi.fn(),error:vi.fn(),recovered:vi.fn()};const watcher=watchGraph(callbacks,undefined,'/graph-view.json');
 await vi.advanceTimersByTimeAsync(0);expect(reload).toHaveBeenCalledOnce();expect(callbacks.data).not.toHaveBeenCalled();
 watcher.refresh();await vi.advanceTimersByTimeAsync(0);expect(reload).toHaveBeenCalledOnce();watcher.stop();
 vi.stubGlobal('sessionStorage',{getItem:()=>{throw Error('denied');}});const next=watchGraph(callbacks,undefined,'/graph-view.json');await vi.advanceTimersByTimeAsync(0);expect(reload).toHaveBeenCalledOnce();next.stop();
});
it('does not reload or fetch a payload from a manifest decoded after cleanup',async()=>{
 let decode!:(data:unknown)=>void;const reload=vi.fn();vi.stubGlobal('location',{reload});vi.stubGlobal('sessionStorage',{getItem:()=>null,setItem:vi.fn()});
 const fetch=vi.fn(async()=>({ok:true,json:()=>new Promise(r=>{decode=r;})}));vi.stubGlobal('fetch',fetch);
 const callbacks={data:vi.fn(),error:vi.fn(),recovered:vi.fn()};const watcher=watchGraph(callbacks,undefined,'/graph-view.json');await vi.advanceTimersByTimeAsync(0);watcher.stop();
 decode({version:1,mode:'claims',schema:5,payloadUrl:'/claim-graph.json',payloadHash:'a'.repeat(64),sourceSetHash:'b'.repeat(64)});await vi.advanceTimersByTimeAsync(0);
 expect(reload).not.toHaveBeenCalled();expect(fetch).toHaveBeenCalledOnce();expect(callbacks.data).not.toHaveBeenCalled();expect(callbacks.error).not.toHaveBeenCalled();
});
