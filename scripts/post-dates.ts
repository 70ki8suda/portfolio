import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePost } from '../src/blog/parsePost';

export function articleBody(source: string) {
  const match = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(?:\r?\n|$)/.exec(source);
  if (!match) throw new Error('Missing frontmatter');
  return source.slice(match[0].length).replace(/\r\n/g, '\n');
}
const jstDay = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
/** Use recorded content changes, never a build time or a tag-only commit. */
export function inferUpdatedAt(file: string, source: string, published: string, existing?: string, today = jstDay(new Date()), cwd = process.cwd()) {
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();
  const show = (ref: string, path: string) => {
    // A missing path is normal; an unreadable ref/tree/blob is not.
    const entries = git('ls-tree', '-z', ref, '--', path).split('\0').filter(Boolean);
    if (entries.length === 0) return undefined;
    if (entries.length !== 1) throw new Error(`Ambiguous history path: ${path}`);
    const match = /^\d+ blob ([a-f0-9]+)\t/.exec(entries[0]);
    if (!match) throw new Error(`Not a history blob: ${path}`);
    return execFileSync('git', ['cat-file', 'blob', match[1]], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  };
  if (git('rev-parse', '--is-inside-work-tree') !== 'true') throw new Error('Content date updates require Git history.');
  if (git('rev-parse', '--is-shallow-repository') === 'true') throw new Error('Complete Git history is required for content dates.');
  const head = show('HEAD', file);
  if (head === undefined) return published; // A new article starts with its publication date.
  if (articleBody(head) !== articleBody(source)) return [published, today].sort().at(-1)!;
  let historicalPath = file;
  const commits = git('log', '--follow', '--format=%H', '--', file).split('\n').filter(Boolean);
  for (const sha of commits) {
    const text = show(sha, historicalPath);
    if (text === undefined) throw new Error(`Missing content history: ${historicalPath} at ${sha}`);
    let parentPath = historicalPath;
    const rename = git('diff-tree', '--root', '--no-commit-id', '--name-status', '-r', '-M', sha).split('\n')
      .map(line => line.split('\t')).find(parts => /^R\d+$/.test(parts[0]) && parts[2] === historicalPath);
    if (rename) parentPath = rename[1];
    const parents = git('rev-list', '--parents', '-n', '1', sha).split(' ').slice(1);
    const parent = parents.length ? show(parents[0], parentPath) : undefined;
    if (parent === undefined || articleBody(text) !== articleBody(parent)) {
      const recorded = jstDay(new Date(git('show', '-s', '--format=%cI', sha)));
      return [published, existing ?? '', recorded].sort().at(-1)!;
    }
    historicalPath = parentPath;
  }
  throw new Error(`No recorded content change: ${file}`);
}
export function withUpdatedAt(file: string, source: string, updatedAt: string) {
  const match = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---[^\S\r\n]*(?:\r?\n|$))/.exec(source);
  if (!match) throw new Error(`Missing frontmatter: ${file}`);
  const newline = match[1].includes('\r\n') ? '\r\n' : '\n';
  const fields = /^updatedAt:/m.test(match[2])
    ? match[2].replace(/^updatedAt:[^\r\n]*/m, `updatedAt: "${updatedAt}"`)
    : `${match[2]}${newline}updatedAt: "${updatedAt}"`;
  const result = match[1] + fields + match[3] + source.slice(match[0].length);
  if (result.slice(result.indexOf(match[3]) + match[3].length) !== source.slice(match[0].length)
      || parsePost(file, result).updatedAt !== updatedAt) throw new Error(`Invalid date-only transformation: ${file}`);
  return result;
}
function main() {
  const check = process.argv.includes('--check');
  const editorial = JSON.parse(readFileSync('content/graph-editorial.json', 'utf8'));
  const changes: { path: string; source: string; before: string; updatedAt: string }[] = [];
  for (const name of readdirSync('content/posts').filter(n => n.endsWith('.md')).sort()) {
    const path = `content/posts/${name}`, before = readFileSync(path, 'utf8'), post = parsePost(name, before);
    if (post.draft || editorial.articles[post.slug]?.category === 'current-affairs') continue;
    const updatedAt = inferUpdatedAt(path, before, post.date, post.updatedAt);
    if (updatedAt === post.updatedAt) continue;
    const source = withUpdatedAt(name, before, updatedAt);
    changes.push({ path, source, before, updatedAt });
  }
  if (check && changes.length) throw new Error(`Content update dates need synchronization: ${changes.map(c => c.path).join(', ')}. Run npm run posts:update-dates before graph:update.`);
  for (const c of changes) if (readFileSync(c.path, 'utf8') !== c.before) throw new Error(`Concurrent content edit: ${c.path}`);
  if (!check) for (const c of changes) { writeFileSync(c.path, c.source); console.log(`${c.path}: ${c.updatedAt}`); }
  console.log(`${changes.length} content date changes${check ? ' required' : ' applied'}.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
}
