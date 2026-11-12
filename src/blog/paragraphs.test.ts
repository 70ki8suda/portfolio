import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { markdownOptions } from './markdownOptions';
import { extractParagraphs } from './paragraphs';
import { parsePost } from './parsePost';
const extract = (body: string) => extractParagraphs(unified().use(remarkParse).use(remarkGfm).parse(body));
const source = (extra = '') => `---\ntitle: Example\ndate: 2026-01-01\ndescription: Test\ntags: []\n${extra}---\n\n本文。`;
describe('paragraph graph boundaries', () => {
  it('requires explicit editorial opt-in independently of topic tags', () => {
    expect(parsePost('a.md', source()).graph).toBe(false);
    expect(parsePost('a.md', source('graph: true\n')).graph).toBe(true);
    expect(() => parsePost('a.md', source('graph: yes\n'))).toThrow();
  });
  it('extracts prose and quotes once, excluding lists, tables, code and URL-only blocks', () => {
    const body = '## 見出し {#topic}\n\n本文 **強調** です。\n\n> 引用の文章。\n\n- リスト項目\n\n| A | B |\n| - | - |\n| a | b |\n\n```js\nconst a = 1\n```\n\nhttps://example.com';
    const nodes = extract(body);
    expect(nodes.map(n => n.text)).toEqual(['本文 強調 です。', '引用の文章。']);
    const html = renderToStaticMarkup(createElement(ReactMarkdown, markdownOptions, body));
    for (const node of nodes) expect(html).toContain(`id="${node.anchor}"`);
    expect(nodes[1].kind).toBe('quote');
  });
  it('keeps unchanged paragraph IDs across insertion and disambiguates duplicates', () => {
    const nodes = extract('本文。\n\n別の文章。\n\n本文。');
    expect(new Set(nodes.map(n => n.anchor)).size).toBe(3);
    expect(extract('追加。\n\n本文。')[1].anchor).toBe(nodes[0].anchor);
    expect(extract('変更した本文。')[0].anchor).not.toBe(nodes[0].anchor);
  });
});
