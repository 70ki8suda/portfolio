import { articleEmbeddingText, ARTICLE_EXTRACTION } from './article-embedding';
import { assertGraphReadable } from './graph-update-lock';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { collectPosts } from '../src/blog/parsePost';
import { isGraphPost } from '../src/blog/posts';
import { extractParagraphs } from '../src/blog/paragraphs';
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function readSources() {
  assertGraphReadable();
  return Object.fromEntries(readdirSync('content/posts').filter(f => f.endsWith('.md')).sort().map(f => [f, readFileSync(`content/posts/${f}`, 'utf8')]));
}
export function graphCorpus(files: Record<string,string> = readSources()) {
  const posts = collectPosts(files, { includeDrafts: false }).filter(isGraphPost).sort((a,b) => a.slug.localeCompare(b.slug));
  const articles = posts.map(p => ({ slug: p.slug, title: p.title, tags: p.tags, text: articleEmbeddingText(p.title, p.body), extraction: ARTICLE_EXTRACTION }));
  const nodes = posts.flatMap(p => extractParagraphs(unified().use(remarkParse).use(remarkGfm).parse(p.body)).map(n => ({ ...n, slug: p.slug, id: `${p.slug}:${n.anchor}` })));
  return { articles, nodes };
}
