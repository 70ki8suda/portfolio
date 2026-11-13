import { expect, it } from 'vitest';
import { planGraphUpdate, applyGraphReply } from '../../scripts/graph-update-plan';
import { editorialHash } from '../../scripts/graph-editorial';
import { parsePost } from './parsePost';
const source = (body = '地域が設備を所有して暮らしを決める。', draft = false) => `---\ntitle: 所有と共同体\ndate: 2026-11-13\ndescription: 暮らしの選択を考える。\ntags: []\ndraft: ${draft}\n---\n${body}`;
const snapshot = () => ({ sources: { 'a.md': source() }, editorial: { version: 1 as const, articles: {} }, tags: { concepts: [{ id: 'ownership', label: '所有', description: '設備を所有する権利。' }], paragraphs: {} }, vectors: '', artifact: '' });
const answer = (s = snapshot()) => { const request = planGraphUpdate(s); return { requestHash: request.requestHash, articles: [{ slug: 'a', sourceHash: request.articles[0].sourceHash, category: 'long-term', decision: 'include', reason: '設備の所有と自己決定の関係が中心の問い。', paragraphs: Object.fromEntries(request.articles[0].paragraphs.map(p => [p.id, { tags: ['ownership'], stance: 'author', context: '筆者による所有と暮らしの考察。' }])) }] }; };
it('requires full-text decisions before new articles become graph-ready', () => {
  const s = snapshot(), request = planGraphUpdate(s);
  expect(request.articles[0].post.body).toContain('地域が設備');
  expect(request.articles[0].paragraphs).toHaveLength(1);
  expect(() => applyGraphReply(s)).toThrow(/AI|判断/);
  const next = applyGraphReply(s, answer());
  expect(next.prepared.nodes).toHaveLength(1); expect(next.sources['a.md']).toContain('graph: true');
  expect(next.editorial.articles.a.sourceHash).toBe(editorialHash(parsePost('a.md', next.sources['a.md'])));
});
it('binds replies to all source files, overrides and prior tags', () => {
  const s = snapshot(), reply = answer(s);
  for (const modified of [
    { ...s, sources: { ...s.sources, 'b.md': source('別の記事。') } },
    { ...s, tags: { ...s.tags, concepts: [...s.tags.concepts, { id: 'new', label: '追加', description: '追加定義。' }] } },
    { ...s, editorial: { version: 1 as const, articles: { a: { sourceHash: 'old', category: 'long-term' as const, decision: 'include' as const, reason: '旧判断', decidedBy: 'ai' as const, override: { decision: 'exclude' as const, reason: '人の指定' } } } } },
  ]) expect(() => applyGraphReply(modified, reply)).toThrow(/stale|古い|request/i);
});
it('rejects incomplete paragraphs, invalid attribution, unknown concepts, review and override changes', () => {
  const s = snapshot();
  for (const modify of [
    (r: ReturnType<typeof answer>) => { r.articles[0].paragraphs = {}; },
    (r: ReturnType<typeof answer>) => { Object.values(r.articles[0].paragraphs)[0].stance = 'invented'; },
    (r: ReturnType<typeof answer>) => { Object.values(r.articles[0].paragraphs)[0].tags = ['unknown']; },
    (r: ReturnType<typeof answer>) => { r.articles[0].decision = 'review'; r.articles[0].category = 'uncertain'; },
    (r: ReturnType<typeof answer>) => { Object.assign(r.articles[0], { override: { decision: 'include', reason: 'AI上書き' } }); },
  ]) { const r = answer(); modify(r); expect(() => applyGraphReply(s, r)).toThrow(); }
});
it('preserves human exclusions and unchanged decisions while pruning removed/draft entries', () => {
  const first = applyGraphReply(snapshot(), answer());
  const b = source('今週の株価を調べる。');
  const s = { ...snapshot(), sources: { ...first.sources, 'b.md': b }, editorial: { version: 1 as const, articles: { ...first.editorial.articles, b: { sourceHash: editorialHash(parsePost('b.md', b)), category: 'current-affairs' as const, decision: 'exclude' as const, reason: '今週の株価の判断', decidedBy: 'ai' as const, override: { decision: 'exclude' as const, reason: '人による時事除外' } } } }, tags: first.tags };
  const next = applyGraphReply(s);
  expect(next.editorial.articles.b).toEqual(s.editorial.articles.b); expect(next.sources['b.md']).toBe(s.sources['b.md']);
  const changed = { ...s, sources: { ...s.sources, 'a.md': source('地域が設備を所有して暮らしを決める。\n\n前後の論点を変えた。') } };
  expect(planGraphUpdate(changed).articles[0].paragraphs).toHaveLength(2);
  expect(() => applyGraphReply({ ...s, sources: { 'b.md': b } })).toThrow(/empty|空|全記事/i);
});

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { MODEL, ALGORITHM, assembleGraph } from '../../scripts/graph-pipeline';
const cli = resolve('scripts/update-graph.ts'), tsx = resolve('node_modules/.bin/tsx');
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'graph-workflow-test-'));
  const state = applyGraphReply(snapshot(), answer());
  const cache = { model: MODEL, algorithm: ALGORITHM, entries: state.prepared.nodes.map(n => ({ id: n.id, textHash: n.textHash, vector: [1, ...Array(383).fill(0)], x: 0, y: 0, chunks: 1 })), explainedVariance: [0, 0] };
  mkdirSync(join(dir, 'content/posts'), { recursive: true }); mkdirSync(join(dir, 'public'));
  writeFileSync(join(dir, 'content/posts/a.md'), state.sources['a.md']);
  writeFileSync(join(dir, 'content/graph-editorial.json'), JSON.stringify(state.editorial, null, 2) + '\n');
  writeFileSync(join(dir, 'content/graph-tags.json'), JSON.stringify(state.tags, null, 2) + '\n');
  writeFileSync(join(dir, 'content/graph-vectors.json'), JSON.stringify(cache) + '\n');
  writeFileSync(join(dir, 'public/paragraph-graph.json'), JSON.stringify(assembleGraph(state.prepared, cache)) + '\n');
  const request = join(tmpdir(), `${dir.split('/').pop()}-request.json`);
  const run = (args: string[] = [], env = process.env) => execFileSync(tsx, [cli, '--request', request, ...args], { cwd: dir, env, stdio: 'pipe' }).toString();
  const read = (p: string) => readFileSync(join(dir, p), 'utf8');
  return { dir, request, run, read, close: () => { rmSync(dir, { recursive: true, force: true }); rmSync(request, { force: true }); } };
}
it('runs idempotently without Python for current vectors and blocks build without AI', () => {
  const s = sandbox();
  try {
    const before = s.read('content/graph-vectors.json');
    expect(s.run(['--python', '/missing'])).toContain('no Python'); expect(s.run()).toContain('complete');
    expect(s.read('content/graph-vectors.json')).toBe(before);
    writeFileSync(join(s.dir, 'content/posts/a.md'), source('本文が変わった。'));
    expect(() => s.run(['--build'])).toThrow();
    const request = JSON.parse(readFileSync(s.request, 'utf8')); expect(request.articles[0].post.body).toContain('本文が変わった');
    expect(s.read('content/graph-vectors.json')).toBe(before); expect(existsSync(join(s.dir, '.graph-update.lock'))).toBe(false);
  } finally { s.close(); }
});
it('does not apply AI decisions or opt-in if local embedding fails', () => {
  const s = sandbox();
  try {
    writeFileSync(join(s.dir, 'content/posts/a.md'), source('変更した本文で所有を再考する。'));
    expect(() => s.run()).toThrow();
    const request = JSON.parse(readFileSync(s.request, 'utf8'));
    const r = { requestHash: request.requestHash, articles: [{ ...answer().articles[0], sourceHash: request.articles[0].sourceHash, paragraphs: Object.fromEntries(request.articles[0].paragraphs.map((p: { id: string }) => [p.id, { tags: ['ownership'], stance: 'author', context: '筆者の考察。' }])) }] };
    const reply = join(s.dir, 'reply.json'); writeFileSync(reply, JSON.stringify(r));
    const before = s.read('content/graph-editorial.json'); expect(() => s.run(['--reply', reply, '--python', '/missing'])).toThrow();
    expect(s.read('content/graph-editorial.json')).toBe(before); expect(s.read('content/posts/a.md')).not.toContain('graph:');
  } finally { s.close(); }
});
it('blocks competing builds and refuses recovery over live writers or later human edits', () => {
  const s = sandbox();
  try {
    const lock = join(s.dir, '.graph-update.lock'); mkdirSync(lock);
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, token: 'other' }));
    expect(() => s.run(['--build'])).toThrow(); expect(() => s.run(['--recover'])).toThrow();
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: 999999999, token: 'dead' }));
    const p = 'content/posts/a.md', before = s.read(p), after = before + '\n更新\n';
    writeFileSync(join(lock, 'journal.json'), JSON.stringify([{ path: p, before, after }]));
    writeFileSync(join(s.dir, p), after + '人の編集'); expect(() => s.run(['--recover'])).toThrow();
    expect(s.read(p)).toContain('人の編集');
    writeFileSync(join(s.dir, p), after); expect(s.run(['--recover'])).toContain('rolled back'); expect(s.read(p)).toBe(before);
  } finally { s.close(); }
});
it('rolls back earlier files when a later rename fails', () => {
  const s = sandbox();
  try {
    // Valid semantic values, deliberately noncanonical bytes so both destinations need writing.
    const paths = ['content/graph-editorial.json', 'content/graph-tags.json'];
    for (const p of paths) writeFileSync(join(s.dir, p), JSON.stringify(JSON.parse(s.read(p))));
    const before = paths.map(s.read);
    const hook = join(s.dir, 'fail-rename.cjs');
    writeFileSync(hook, `const fs=require('node:fs');const original=fs.renameSync;let n=0;fs.renameSync=(...a)=>{if(++n===2)throw new Error('injected rename failure');return original(...a)};require('node:module').syncBuiltinESMExports();`);
    expect(() => s.run([], { ...process.env, NODE_OPTIONS: `--require=${hook}` })).toThrow();
    expect(paths.map(s.read)).toEqual(before); expect(existsSync(join(s.dir, '.graph-update.lock'))).toBe(false);
  } finally { s.close(); }
});
it('passes the existing cache to the encoder and rejects source changes during generation', () => {
  for (const concurrentEdit of [false, true]) {
    const s = sandbox();
    try {
      const oldCache = JSON.parse(s.read('content/graph-vectors.json'));
      writeFileSync(join(s.dir, 'content/posts/a.md'), source('地域が設備を所有して暮らしを決める。\n\n共同の所有を続ける条件を考える。'));
      expect(() => s.run()).toThrow();
      const request = JSON.parse(readFileSync(s.request, 'utf8'));
      const reply = join(s.dir, 'reply.json');
      writeFileSync(reply, JSON.stringify({ requestHash: request.requestHash, articles: [{ ...answer().articles[0], sourceHash: request.articles[0].sourceHash, paragraphs: Object.fromEntries(request.articles[0].paragraphs.map((p: { id: string }) => [p.id, { tags: ['ownership'], stance: 'author', context: '筆者の共同所有についての考察。' }])) }] }));
      // Fake local encoder exercises the orchestration contract, not model quality.
      const encoder = join(s.dir, 'encoder');
      writeFileSync(encoder, `#!${process.execPath}\nconst fs=require('node:fs');const input=JSON.parse(fs.readFileSync(process.argv[3]));const output=process.argv[5];const cache=JSON.parse(fs.readFileSync(output));if(cache.entries.length!==1)throw Error('old cache not copied');cache.entries=input.nodes.map(n=>cache.entries.find(e=>e.id===n.id&&e.textHash===n.textHash)||({...n,vector:[1,...Array(383).fill(0)],x:0,y:0,chunks:1}));fs.writeFileSync(output,JSON.stringify(cache));${concurrentEdit ? "fs.writeFileSync('content/posts/concurrent.md',fs.readFileSync('content/posts/a.md'));" : ''}`, { mode: 0o700 });
      const before = s.read('content/graph-editorial.json');
      if (concurrentEdit) {
        expect(() => s.run(['--reply', reply, '--python', encoder])).toThrow(/Inputs changed/);
        expect(s.read('content/graph-editorial.json')).toBe(before);
        expect(JSON.parse(s.read('content/graph-vectors.json'))).toEqual(oldCache);
        expect(existsSync(join(s.dir, 'content/posts/concurrent.md'))).toBe(true);
      } else {
        expect(s.run(['--reply', reply, '--python', encoder])).toContain('2 nodes');
        const cache = JSON.parse(s.read('content/graph-vectors.json'));
        expect(cache.entries[0]).toEqual(oldCache.entries[0]);
        expect(JSON.parse(s.read('public/paragraph-graph.json')).nodes).toHaveLength(2);
        expect(s.run(['--python', '/missing'])).toContain('no Python');
      }
    } finally { s.close(); }
  }
});
it('rejects edits during typecheck or bundling without rolling back the new source', () => {
  for (const phase of ['typecheck', 'bundle']) {
    const s = sandbox();
    try {
      mkdirSync(join(s.dir, 'node_modules/typescript/bin'), { recursive: true });
      mkdirSync(join(s.dir, 'node_modules/vite/bin'), { recursive: true });
      const edit = `require('node:fs').appendFileSync('content/posts/a.md','\\n人の編集');`;
      writeFileSync(join(s.dir, 'node_modules/typescript/bin/tsc'), phase === 'typecheck' ? edit : '');
      writeFileSync(join(s.dir, 'node_modules/vite/bin/vite.js'), phase === 'bundle' ? edit : '');
      expect(() => s.run(['--build'])).toThrow(/Inputs changed during/);
      expect(s.read('content/posts/a.md')).toContain('人の編集');
      expect(existsSync(join(s.dir, '.graph-update.lock'))).toBe(false);
    } finally { s.close(); }
  }
});
it('does not adopt a concurrent edit as the rollback baseline when creating the journal', () => {
  const s = sandbox();
  try {
    const p = 'content/graph-tags.json';
    writeFileSync(join(s.dir, p), JSON.stringify(JSON.parse(s.read(p))));
    const edit = s.read(p) + '\n ';
    const hook = join(s.dir, 'journal-race.cjs');
    writeFileSync(hook, `const fs=require('node:fs');const original=fs.writeFileSync;fs.writeFileSync=(p,...a)=>{if(String(p).endsWith('/journal.json'))original('${p}',${JSON.stringify(edit)});return original(p,...a)};require('node:module').syncBuiltinESMExports();`);
    expect(() => s.run([], { ...process.env, NODE_OPTIONS: `--require=${hook}` })).toThrow(/Inputs changed/);
    expect(s.read(p)).toBe(edit);
    expect(existsSync(join(s.dir, '.graph-update.lock/journal.json'))).toBe(true);
  } finally { s.close(); }
});

import { symlinkSync, readdirSync } from 'node:fs';
it('publishes ownership atomically and recovers damaged metadata only for a dead owner', () => {
  const s = sandbox();
  try {
    const hook = join(s.dir, 'owner-fail.cjs');
    writeFileSync(hook, `const fs=require('node:fs');const original=fs.writeFileSync;fs.writeFileSync=(p,...a)=>{if(String(p).endsWith('/owner.json'))throw Error('owner write failed');return original(p,...a)};require('node:module').syncBuiltinESMExports();`);
    expect(() => s.run([], { ...process.env, NODE_OPTIONS: `--require=${hook}` })).toThrow(/owner write failed/);
    expect(readdirSync(s.dir).filter(p => p.startsWith('.graph-update'))).toEqual([]);
    for (const pid of [process.pid, 999999999]) for (const metadata of [null, '{broken']) {
      const target = `.graph-update-work-${pid}-abcd`;
      mkdirSync(join(s.dir, target)); if (metadata) writeFileSync(join(s.dir, target, 'owner.json'), metadata);
      symlinkSync(target, join(s.dir, '.graph-update.lock'), 'dir');
      if (pid === process.pid) {
        expect(() => s.run(['--recover'])).toThrow(/still running/);
        expect(existsSync(join(s.dir, target))).toBe(true);
        rmSync(join(s.dir, '.graph-update.lock')); rmSync(join(s.dir, target), { recursive: true });
      } else {
        expect(s.run(['--recover'])).toContain('rolled back'); expect(existsSync(join(s.dir, target))).toBe(false);
      }
    }
  } finally { s.close(); }
});
