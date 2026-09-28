import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import { describe, it, expect } from 'vitest';
import { markdownOptions } from './markdownOptions';
import { parseMarkdownVideo } from './markdownExtensions';
import { legacyGarysChapter } from './legacyPosts';

const render = (source: string) => renderToStaticMarkup(createElement(ReactMarkdown, markdownOptions, source));

describe('long-form Markdown', () => {
  it('creates chapter anchors without displaying the authoring suffix', () => {
    const html = render('## 富とは何か {#wealth}\n\n[目次](#wealth)');
    expect(html).toContain('<h2 id="wealth">富とは何か</h2>');
    expect(html).toContain('href="#wealth"');
    expect(html).not.toContain('{#wealth}');
  });
  it('keeps duplicate IDs out and rejects unsafe anchor text', () => {
    const html = render('## A {#wealth}\n\n## B {#wealth}\n\n## C {#<script>}');
    expect(html.match(/id="wealth"/g)).toHaveLength(1);
    expect(html).not.toContain('<script>');
  });
  it('recognizes only a validated two-line YouTube block', () => {
    expect(parseMarkdownVideo('bReS9FLpgT4\nWhat is wealth?\n')).toEqual({ youtubeId: 'bReS9FLpgT4', title: 'What is wealth?' });
    for (const value of ['https://evil.test/embed\nBad', 'bReS9FLpgT4', 'bReS9FLpgT4\nTitle\nExtra']) {
      expect(parseMarkdownVideo(value)).toBeUndefined();
    }
    const html = render('```youtube\nbReS9FLpgT4\nWhat is wealth?\n```');
    expect(html).toContain('data-youtube-id="bReS9FLpgT4"');
    expect(html).not.toContain('<pre>');
  });
  it('continues dropping arbitrary HTML and unsafe links', () => {
    const html = render('<iframe src="https://evil.test"></iframe>\n\n[x](javascript:alert(1))\n\n```youtube\nhttps://evil.test\nBad\n```');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('data-youtube-id');
    expect(html).toContain('<pre>');
  });
  it('only redirects exact legacy slugs', () => {
    expect(legacyGarysChapter('garys-understand-economy-1-what-is-wealth')).toBe('wealth');
    expect(legacyGarysChapter('toString')).toBeUndefined();
    expect(legacyGarysChapter('unknown')).toBeUndefined();
  });
});
