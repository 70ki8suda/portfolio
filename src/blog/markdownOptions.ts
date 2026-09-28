import type { Options } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkArticleExtensions } from './markdownExtensions';

/**
 * Safety rules for post bodies, kept separate from styling so they can be unit tested.
 * - `skipHtml`: raw HTML in Markdown is dropped, never rendered, so posts cannot run scripts or inject markup.
 * - react-markdown's default `urlTransform` removes `javascript:` and other unsafe URL schemes.
 * - GFM adds tables, task lists, strikethrough, footnotes, and autolinks.
 */
export const markdownOptions = {
  remarkPlugins: [remarkGfm, remarkArticleExtensions],
  skipHtml: true,
} satisfies Options;
