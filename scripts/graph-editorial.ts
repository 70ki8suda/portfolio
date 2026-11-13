import { assertGraphReadable } from './graph-update-lock';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { collectPosts } from '../src/blog/parsePost';
import type { Post } from '../src/blog/posts';
export type EditorialDecision = 'include' | 'exclude' | 'review';
export interface EditorialEntry {
  sourceHash: string;
  category: 'long-term' | 'current-affairs' | 'curation' | 'other' | 'uncertain';
  decision: EditorialDecision;
  reason: string;
  decidedBy: 'ai';
  override?: { decision: 'include' | 'exclude'; reason: string };
}
export interface EditorialManifest { version: 1; articles: Record<string,EditorialEntry> }
/** Graph participation is an output of editorial judgement, not an input to that judgement. */
export function editorialHash({graph:_graph,...post}:Post) {
  return createHash('sha256').update(JSON.stringify(post)).digest('hex');
}
export const effectiveDecision = (entry:EditorialEntry) => entry.override?.decision ?? entry.decision;
export function readEditorialPosts() {
  assertGraphReadable();
  const files=Object.fromEntries(readdirSync('content/posts').filter(f=>f.endsWith('.md')).sort().map(f=>[f,readFileSync(`content/posts/${f}`,'utf8')]));
  return collectPosts(files,{includeDrafts:true});
}
export function readEditorialManifest(): EditorialManifest {
  return JSON.parse(readFileSync('content/graph-editorial.json','utf8'));
}
export function validateEditorial(posts:Post[],manifest:EditorialManifest,checkOptIn=true) {
  if (manifest.version!==1 || !manifest.articles) throw new Error('Invalid editorial manifest');
  const slugs = new Set(posts.map(p=>p.slug));
  for (const slug of Object.keys(manifest.articles)) if (!slugs.has(slug)) throw new Error(`Stale editorial entry: ${slug}`);
  for (const post of posts) {
    if (post.draft) continue;
    const entry=manifest.articles[post.slug];
    if (!entry) throw new Error(`Missing editorial classification: ${post.slug}. Run graph:classify-input and read the article.`);
    if (entry.sourceHash!==editorialHash(post)) throw new Error(`Stale editorial classification: ${post.slug}. Re-read changed content before updating its hash.`);
    if (!['long-term','current-affairs','curation','other','uncertain'].includes(entry.category) || !['include','exclude','review'].includes(entry.decision) || entry.decidedBy!=='ai') throw new Error(`Invalid editorial decision: ${post.slug}`);
    if (typeof entry.reason!=='string' || !entry.reason.trim()) throw new Error(`Missing editorial reason: ${post.slug}`);
    if (entry.override && (!['include','exclude'].includes(entry.override.decision) || typeof entry.override.reason!=='string' || !entry.override.reason.trim())) throw new Error(`Invalid human override: ${post.slug}`);
    if (entry.category==='uncertain' && entry.decision!=='review') throw new Error(`Uncertain classification must await review: ${post.slug}`);
    if (entry.category!=='long-term' && entry.decision==='include') throw new Error(`Graph inclusion needs a long-term purpose or explicit human override: ${post.slug}`);
    if (checkOptIn && (post.graph===true)!==(effectiveDecision(entry)==='include')) throw new Error(`Editorial opt-in mismatch: ${post.slug}. Run graph:sync-optin for this reviewed article.`);
  }
}
