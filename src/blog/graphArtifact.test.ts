import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';
import { graphCorpus } from '../../scripts/graph-corpus';
import { prepareGraph, assembleGraph, MODEL } from '../../scripts/graph-pipeline';
import { parsePost } from './parsePost';
import { markdownOptions } from './markdownOptions';
import type { GraphData } from './graphTypes';
const read = (path:string) => JSON.parse(readFileSync(path,'utf8'));
const fixture = (graph:boolean,draft=false) => `---\ntitle: Example\ndate: 2026-01-01\ndescription: Example\ntags: [ソーラーパンク]\ngraph: ${graph}\ndraft: ${draft}\n---\n\n公開の意味ある本文。`;
describe('committed paragraph map', () => {
  it('filters opt-out and drafts at the corpus entrance, regardless of topic', () => {
    const corpus = graphCorpus({'visible.md':fixture(true),'private.md':fixture(true,true),'outside.md':fixture(false)});
    expect(corpus.articles.map(a=>a.slug)).toEqual(['visible']);
    expect(corpus.nodes.map(a=>a.slug)).toEqual(['visible']);
  });
  it('is a fresh derivation of reviewed prose and valid local vectors', () => {
    const corpus = graphCorpus();
    const prepared = prepareGraph(corpus,read('content/graph-tags.json'));
    const vectors = read('content/graph-vectors.json');
    expect(vectors.algorithm).toBe('e5-chunk480-mean-l2-pca-full-v2');
    expect(vectors.model).toEqual(MODEL);
    expect(assembleGraph(prepared,vectors)).toEqual(read('public/paragraph-graph.json'));
    expect(vectors.entries.every((e:{chunks:number})=>Number.isInteger(e.chunks)&&e.chunks>=1)).toBe(true);
  });
  it('excludes editorially omitted articles from every public and vector field but preserves articles', () => {
    const payload = readFileSync('public/paragraph-graph.json','utf8');
    const cache = readFileSync('content/graph-vectors.json','utf8');
    for (const slug of ['anthropic-financials-and-valuation','memory-stocks-cycle-and-valuation','solarpunk-three-tracks']) {
      const post = parsePost(`${slug}.md`,readFileSync(`content/posts/${slug}.md`,'utf8'));
      expect(post.draft).toBe(false);
      expect(post.graph).toBe(false);
      expect(payload).not.toContain(slug);
      expect(payload).not.toContain(post.title);
      expect(cache).not.toContain(slug);
    }
  });
  it('resolves every node to exactly one rendered paragraph and every edge to existing nodes', () => {
    const data: GraphData = read('public/paragraph-graph.json');
    const ids = new Set(data.nodes.map(n=>n.id));
    expect(ids.size).toBe(data.nodes.length);
    for (const article of data.articles) {
      const post = parsePost(`${article.slug}.md`,readFileSync(`content/posts/${article.slug}.md`,'utf8'));
      const html = renderToStaticMarkup(createElement(ReactMarkdown,markdownOptions,post.body));
      for (const node of data.nodes.filter(n=>n.slug===article.slug)) expect(html.split(`id="${node.anchor}"`).length-1).toBe(1);
    }
    for (const edge of data.edges) {
      expect(ids.has(edge.source)&&ids.has(edge.target)).toBe(true);
      if (edge.kind==='semantic') {
        expect(data.nodes.find(n=>n.id===edge.source)!.slug).not.toBe(data.nodes.find(n=>n.id===edge.target)!.slug);
        expect(edge.score).toBeGreaterThanOrEqual(0.89);
      }
    }
  });
});
