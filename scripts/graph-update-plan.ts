import { parseDocument, isScalar } from 'yaml';
import { collectPosts, parsePost } from '../src/blog/parsePost';
import type { GraphTags } from '../src/blog/graphTypes';
import { editorialHash, effectiveDecision, validateEditorial, type EditorialManifest, type EditorialEntry } from './graph-editorial';
import { graphCorpus, digest } from './graph-corpus';
import { prepareGraph, MODEL, ALGORITHM } from './graph-pipeline';

export interface GraphSnapshot {
  sources: Record<string, string>;
  editorial: EditorialManifest;
  tags: GraphTags;
  vectors: string;
  artifact: string;
}
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown): x is string => typeof x === 'string' && !!x.trim();
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some(k => !allowed.includes(k))) throw new Error('Unknown fields in AI reply (human overrides cannot be supplied).');
}
/** Change only the graph scalar. Preserve prose, comments and all unrelated frontmatter. */
export function setGraphFlag(source: string, value: boolean) {
  const match = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(source);
  if (!match) throw new Error('Missing frontmatter');
  const scalar = parseDocument(match[2]).get('graph', true);
  if (scalar === undefined && !value) return source;
  let front = match[2];
  if (scalar === undefined) front += `${match[1].includes('\r\n') ? '\r\n' : '\n'}graph: ${value}`;
  else {
    if (!isScalar(scalar) || !scalar.range) throw new Error('Unsupported graph scalar');
    front = front.slice(0, scalar.range[0]) + String(value) + front.slice(scalar.range[1]);
  }
  return match[1] + front + match[3] + source.slice(match[0].length);
}
function validTag(value: unknown, concepts: Set<string>): value is GraphTags['paragraphs'][string] {
  if (!record(value) || !Array.isArray(value.tags)) return false;
  if (value.tags.length === 0) return text(value.excludeReason) && Object.keys(value).every(k => ['tags', 'excludeReason'].includes(k));
  return value.tags.length <= 3 && new Set(value.tags).size === value.tags.length
    && value.tags.every(t => typeof t === 'string' && concepts.has(t)) && text(value.context)
    && ['source', 'author', 'critic', 'mixed'].includes(value.stance as string)
    && Object.keys(value).every(k => ['tags', 'context', 'stance'].includes(k));
}
export function planGraphUpdate(snapshot: GraphSnapshot) {
  const posts = collectPosts(snapshot.sources, { includeDrafts: true });
  const allParagraphs = graphCorpus(Object.fromEntries(Object.entries(snapshot.sources).map(([name, source]) => [name, setGraphFlag(source, true)]))).nodes;
  const concepts = new Set(snapshot.tags.concepts.map(c => c.id));
  const articles = posts.filter(post => {
    if (post.draft) return false;
    const prior = snapshot.editorial.articles[post.slug];
    return !prior || prior.sourceHash !== editorialHash(post) || effectiveDecision(prior) === 'review'
      || (effectiveDecision(prior) === 'include' && allParagraphs.filter(n => n.slug === post.slug).some(n => !validTag(snapshot.tags.paragraphs[n.id], concepts)));
  }).map(post => ({ slug: post.slug, sourceHash: editorialHash(post), post,
    previous: snapshot.editorial.articles[post.slug] ?? null,
    paragraphs: allParagraphs.filter(n => n.slug === post.slug).map(n => ({ ...n, previous: snapshot.tags.paragraphs[n.id] ?? null })),
  }));
  return { version: 1, requestHash: digest({ snapshot, MODEL, ALGORITHM, schema: 1 }),
    instructions: 'Read every affected article in full, including lists/tables and adjacent paragraphs. Decide its main purpose, not keywords. Preserve human overrides. Return every paragraph for included articles with 1–3 concept IDs, stance and specific attribution/context, or tags:[] and excludeReason. review blocks publication unless a human override resolves it. Do not edit the repository from this request.',
    concepts: snapshot.tags.concepts, articles,
    replyShape: { requestHash: 'copy requestHash', concepts: 'optional new definitions only: id,label,description,group', articles: [{ slug: 'exact affected slug', sourceHash: 'copy sourceHash', category: 'long-term|current-affairs|curation|other|uncertain', decision: 'include|exclude|review', reason: 'full-text purpose and evidence', paragraphs: { 'slug:p-ID': { tags: ['concept-id'], stance: 'source|author|critic|mixed', context: 'speaker and qualifications' } } }] },
  };
}
export function applyGraphReply(snapshot: GraphSnapshot, reply?: unknown) {
  const request = planGraphUpdate(snapshot);
  if (request.articles.length && reply === undefined) throw new Error(`AI判断が必要: ${request.articles.map(a => a.slug).join(', ')}`);
  const editorial = structuredClone(snapshot.editorial), tags = structuredClone(snapshot.tags);
  if (reply !== undefined) {
    if (!record(reply) || reply.requestHash !== request.requestHash) throw new Error('Stale request/reply: re-read the latest request.');
    keys(reply, ['requestHash', 'articles', 'concepts']);
    if (!Array.isArray(reply.articles) || reply.articles.length !== request.articles.length) throw new Error('Reply must cover exactly the requested articles.');
    if (reply.concepts !== undefined) {
      if (!Array.isArray(reply.concepts)) throw new Error('Invalid concepts');
      for (const concept of reply.concepts) {
        if (!record(concept)) throw new Error('Invalid concept');
        keys(concept, ['id', 'label', 'description', 'group']);
        if (!text(concept.id) || !/^[a-z][a-z0-9-]*$/.test(concept.id) || !text(concept.label) || !text(concept.description)
          || (concept.group !== undefined && !text(concept.group)) || tags.concepts.some(c => c.id === concept.id)) throw new Error('New concepts must be defined and cannot overwrite existing concepts.');
        tags.concepts.push(concept as unknown as GraphTags['concepts'][number]);
      }
    }
    const concepts = new Set(tags.concepts.map(c => c.id)), seen = new Set<string>();
    for (const row of reply.articles) {
      if (!record(row) || !text(row.slug) || seen.has(row.slug)) throw new Error('Invalid/duplicate article reply');
      seen.add(row.slug); keys(row, ['slug', 'sourceHash', 'category', 'decision', 'reason', 'paragraphs']);
      const requested = request.articles.find(a => a.slug === row.slug);
      if (!requested || requested.sourceHash !== row.sourceHash || !text(row.reason) || !record(row.paragraphs)) throw new Error('Invalid article/hash/reason/paragraphs');
      const prior = editorial.articles[row.slug];
      const entry: EditorialEntry = { sourceHash: requested.sourceHash, category: row.category as EditorialEntry['category'], decision: row.decision as EditorialEntry['decision'], reason: row.reason, decidedBy: 'ai', ...(prior?.override ? { override: prior.override } : {}) };
      const included = effectiveDecision(entry) === 'include';
      if (effectiveDecision(entry) === 'review') throw new Error(`未決着のreview: ${row.slug}. AI must not convert uncertainty into exclusion.`);
      const expected = new Set(included ? requested.paragraphs.map(p => p.id) : []);
      if (Object.keys(row.paragraphs).length !== expected.size || Object.entries(row.paragraphs).some(([id, value]) => !expected.has(id) || !validTag(value, concepts))) throw new Error(`Incomplete/invalid paragraph judgements: ${row.slug}`);
      for (const id of Object.keys(tags.paragraphs)) if (id.startsWith(row.slug + ':')) delete tags.paragraphs[id];
      Object.assign(tags.paragraphs, row.paragraphs); editorial.articles[row.slug] = entry;
    }
  }
  const posts = collectPosts(snapshot.sources, { includeDrafts: true }), slugs = new Set(posts.map(p => p.slug));
  for (const slug of Object.keys(editorial.articles)) if (!slugs.has(slug)) delete editorial.articles[slug];
  validateEditorial(posts, editorial, false);
  for (const post of posts) if (!post.draft && effectiveDecision(editorial.articles[post.slug]) === 'review') throw new Error(`Unresolved review: ${post.slug}`);
  const sources = { ...snapshot.sources };
  for (const [name, source] of Object.entries(sources)) {
    const post = parsePost(name, source);
    // A draft does not need AI decisions and is excluded irrespective of its opt-in value.
    if (!post.draft) sources[name] = setGraphFlag(source, effectiveDecision(editorial.articles[post.slug]) === 'include');
  }
  const corpus = graphCorpus(sources), ids = new Set(corpus.nodes.map(n => n.id));
  for (const id of Object.keys(tags.paragraphs)) if (!ids.has(id)) delete tags.paragraphs[id];
  const prepared = prepareGraph(corpus, tags);
  if (!prepared.nodes.length) throw new Error('Refusing an empty graph / 全記事除外で成功させない。');
  validateEditorial(collectPosts(sources, { includeDrafts: true }), editorial);
  return { sources, editorial, tags, prepared };
}
