import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, renameSync, symlinkSync, lstatSync, readlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { digest } from './graph-corpus';
import { MODEL, ALGORITHM, assembleGraph, type VectorCache } from './graph-pipeline';
import { planGraphUpdate, applyGraphReply, type GraphSnapshot } from './graph-update-plan';
import { GRAPH_LOCK } from './graph-update-lock';
const args = process.argv.slice(2);
function option(name: string) { const at = args.indexOf(name); if (at < 0) return undefined; const value = args[at + 1]; if (!value || value.startsWith('--')) throw new Error(`Missing ${name} value`); return value; }
const scriptRoot = dirname(fileURLToPath(import.meta.url));
const paths = ['content/graph-editorial.json', 'content/graph-tags.json', 'content/graph-vectors.json', 'public/paragraph-graph.json'];
const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : null;
function inputs() {
  const sources = Object.fromEntries(readdirSync('content/posts').filter(n => n.endsWith('.md')).sort().map(n => [n, readFileSync(`content/posts/${n}`, 'utf8')]));
  const files = Object.fromEntries(paths.map(p => [p, read(p)]));
  const snapshot: GraphSnapshot = { sources, editorial: JSON.parse(files[paths[0]] ?? '{"version":1,"articles":{}}'), tags: JSON.parse(files[paths[1]] ?? '{"concepts":[],"paragraphs":{}}'), vectors: files[paths[2]] ?? '', artifact: files[paths[3]] ?? '' };
  return { snapshot, files, hash: digest({ sources, files }) };
}
type Change = { path: string; before: string | null; after: string };
function restore(changes: Change[]) {
  // Check every destination first, so recovery never erases a later human edit.
  for (const c of changes) {
    if (!(paths.includes(c.path) || /^content\/posts\/[a-z0-9-]+\.md$/.test(c.path))) throw new Error('Invalid recovery path');
    const current = read(c.path);
    if (current !== c.before && current !== c.after) throw new Error(`Recovery conflict: ${c.path}. Preserve the journal and reconcile this edit manually.`);
  }
  for (const c of [...changes].reverse()) {
    if (read(c.path) === c.before) continue;
    if (c.before === null) rmSync(c.path); else writeFileSync(c.path, c.before);
  }
}
function lockOwner() {
  if (lstatSync(GRAPH_LOCK).isSymbolicLink()) {
    const target = readlinkSync(GRAPH_LOCK);
    const match = /^\.graph-update-work-(\d+)-([a-f0-9-]+)$/.exec(target);
    if (!match) throw new Error('Unknown lock target; preserve it for manual inspection.');
    return { pid: Number(match[1]), token: match[2], target };
  }
  // Compatibility with a complete lock from the previous implementation.
  try { return { ...JSON.parse(readFileSync(`${GRAPH_LOCK}/owner.json`, 'utf8')), target: undefined }; }
  catch { throw new Error('Legacy lock has no valid owner. Preserve it and inspect the interrupted process before manual recovery.'); }
}
function releaseLock() {
  const owner = lockOwner();
  rmSync(GRAPH_LOCK, { recursive: true });
  if (owner.target) rmSync(owner.target, { recursive: true, force: true });
}
function recover() {
  if (!existsSync(GRAPH_LOCK)) { console.log('No interrupted update.'); return; }
  const owner = lockOwner();
  if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Invalid lock owner PID');
  let running = true;
  try { process.kill(owner.pid, 0); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') running = false; else throw e; }
  if (running) throw new Error(`Update/build process ${owner.pid} is still running. Do not recover it.`);
  const journal = read(`${GRAPH_LOCK}/journal.json`);
  if (journal) restore(JSON.parse(journal));
  releaseLock(); console.log('Interrupted update rolled back; run graph:update again.');
}
async function main() {
  if (args.includes('--recover')) { recover(); return; }
  const token = randomUUID();
  const workspace = `.graph-update-work-${process.pid}-${token}`;
  // Prepare ownership before atomically publishing the lock. Never expose an ownerless lock.
  mkdirSync(workspace);
  try {
    writeFileSync(`${workspace}/owner.json`, JSON.stringify({ pid: process.pid, token }));
    symlinkSync(workspace, GRAPH_LOCK, 'dir');
  } catch (e) {
    rmSync(workspace, { recursive: true, force: true });
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Another graph update/build owns .graph-update.lock; do not publish concurrently. Interrupted runs require --recover.');
    throw e;
  }
  process.env.GRAPH_UPDATE_LOCK_TOKEN = token;
  let journal: Change[] | undefined;
  let retainLock = false;
  try {
    const before = inputs();
    const request = planGraphUpdate(before.snapshot);
    const requestPath = resolve(option('--request') ?? `/tmp/paragraph-graph-update-${digest(process.cwd()).slice(0, 12)}.json`);
    // Requests can include unpublished source material. Never put them in the repository or assets.
    if (requestPath === process.cwd() || requestPath.startsWith(process.cwd() + '/')) throw new Error('Use a request path outside the repository, e.g. /tmp/graph-update-request.json');
    writeFileSync(requestPath, JSON.stringify(request, null, 2) + '\n', { mode: 0o600 });
    const replyPath = option('--reply');
    const next = applyGraphReply(before.snapshot, replyPath ? JSON.parse(readFileSync(replyPath, 'utf8')) : undefined);
    let cache: VectorCache;
    let artifact: string;
    let vectorText = before.snapshot.vectors;
    try {
      cache = JSON.parse(before.snapshot.vectors);
      artifact = JSON.stringify(assembleGraph(next.prepared, cache)) + '\n';
      console.log('Existing embeddings are current; no Python/model load needed.');
    } catch {
      const input = resolve(`${GRAPH_LOCK}/embedding-input.json`), output = resolve(`${GRAPH_LOCK}/vectors.json`);
      writeFileSync(input, JSON.stringify({ model: MODEL, algorithm: ALGORITHM, nodes: next.prepared.nodes.map(({ id, text, textHash }) => ({ id, text, textHash })) }));
      // The local encoder reads its old cache from --output. Copy it before generation.
      if (before.snapshot.vectors) writeFileSync(output, before.snapshot.vectors);
      const python = option('--python') ?? process.env.GRAPH_PYTHON ?? '/tmp/paragraph-graph-python/bin/python';
      try { execFileSync(python, [join(scriptRoot, 'embed-graph.py'), input, '--output', output, '--offline'], { stdio: 'inherit' }); }
      catch { throw new Error(`Local embedding failed. Configure GRAPH_PYTHON or --python with scripts/graph-requirements.txt and the pinned model cached locally. No graph files were published. Request: ${requestPath}`); }
      vectorText = readFileSync(output, 'utf8');
      cache = JSON.parse(vectorText);
      artifact = JSON.stringify(assembleGraph(next.prepared, cache)) + '\n';
    }
    if (inputs().hash !== before.hash) throw new Error('Inputs changed during generation (including added/deleted files or overrides). Re-run with fresh AI decisions.');
    const outputs: Record<string, string> = { 'content/graph-editorial.json': JSON.stringify(next.editorial, null, 2) + '\n', 'content/graph-tags.json': JSON.stringify(next.tags, null, 2) + '\n', 'content/graph-vectors.json': vectorText, 'public/paragraph-graph.json': artifact, ...Object.fromEntries(Object.entries(next.sources).map(([name, source]) => [`content/posts/${name}`, source])) };
    const original: Record<string, string | null> = { ...before.files, ...Object.fromEntries(Object.entries(before.snapshot.sources).map(([name, source]) => [`content/posts/${name}`, source])) };
    journal = Object.entries(outputs).filter(([path, after]) => original[path] !== after).map(([path, after]) => ({ path, before: original[path] ?? null, after }));
    writeFileSync(`${GRAPH_LOCK}/journal.json`, JSON.stringify(journal));
    if (inputs().hash !== before.hash) throw new Error('Inputs changed before publication. Keep the new edit and repeat the update.');
    // All files were generated and checked before the first target write. A journal detects interrupted commits.
    for (const [index, c] of journal.entries()) {
      if (read(c.path) !== c.before) throw new Error(`Concurrent edit: ${c.path}`);
      const stage = `${GRAPH_LOCK}/stage-${index}`; writeFileSync(stage, c.after); renameSync(stage, c.path);
    }
    const verified = inputs();
    const final = applyGraphReply(verified.snapshot);
    if (JSON.stringify(assembleGraph(final.prepared, JSON.parse(verified.snapshot.vectors))) + '\n' !== verified.snapshot.artifact) throw new Error('Post-update graph check failed');
    rmSync(`${GRAPH_LOCK}/journal.json`); journal = undefined;
    console.log(`Graph update/check complete: ${final.prepared.articles.length} articles / ${final.prepared.nodes.length} nodes. Request: ${requestPath}`);
    if (args.includes('--build')) {
      // Hold the same lock through the production build; a second updater/build cannot observe a partial set.
      execFileSync(process.execPath, [resolve('node_modules/typescript/bin/tsc'), '-b'], { stdio: 'inherit' });
      if (inputs().hash !== verified.hash) throw new Error('Inputs changed during typecheck; refusing publication.');
      execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { stdio: 'inherit' });
      if (inputs().hash !== verified.hash) throw new Error('Inputs changed during build; refusing publication.');
    }
  } catch (e) {
    if (journal) {
      try { restore(journal); } catch (rollbackError) { retainLock = true; console.error(rollbackError); }
    }
    // Always name the concrete request, also when no AI decision was available.
    const requestPath = option('--request') ?? `/tmp/paragraph-graph-update-${digest(process.cwd()).slice(0, 12)}.json`;
    console.error(`Graph workflow stopped. AI author: read ${requestPath} and supply --reply after full-text review.`);
    throw e;
  } finally {
    delete process.env.GRAPH_UPDATE_LOCK_TOKEN;
    if (!retainLock) releaseLock();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
