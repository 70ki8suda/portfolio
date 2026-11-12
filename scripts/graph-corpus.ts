import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { collectPosts } from '../src/blog/parsePost';
import { isGraphPost } from '../src/blog/posts';
import { extractParagraphs } from '../src/blog/paragraphs';
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function graphCorpus() {
  const files = Object.fromEntries(readdirSync('content/posts').filter(f => f.endsWith('.md')).sort().map(f => [f, readFileSync(`content/posts/${f}`, 'utf8')]));
  const posts = collectPosts(files, { includeDrafts: false }).filter(isGraphPost).sort((a,b) => a.slug.localeCompare(b.slug));
  const articles = posts.map(p => ({ slug: p.slug, title: p.title, tags: p.tags }));
  const nodes = posts.flatMap(p => extractParagraphs(unified().use(remarkParse).use(remarkGfm).parse(p.body)).map(n => ({ ...n, slug: p.slug, id: `${p.slug}:${n.anchor}` })));
  return { articles, nodes };
}
