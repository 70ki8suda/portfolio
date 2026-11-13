import { createContext, useContext } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import * as stylex from '@stylexjs/stylex';
import { prose } from '../styles/blog.stylex';
import { markdownOptions } from './markdownOptions';
import { YouTubeEmbed } from './YouTubeEmbed';
import { isYouTubeId } from './posts';

// Lets `code` tell a fenced block apart from inline code.
const InCodeBlock = createContext(false);

const isExternal = (href?: string) => !!href && /^https?:\/\//i.test(href);

const components: Components = {
  div: ({ node, ...props }) => {
    const id = node?.properties?.['data-youtube-id'];
    const title = node?.properties?.['data-youtube-title'];
    if (typeof id === 'string' && isYouTubeId(id) && typeof title === 'string') {
      return <YouTubeEmbed video={{ youtubeId: id, title }} />;
    }
    return <div {...props} />;
  },
  // The post title is the page's only h1, so body headings start at h2.
  h1: ({ node: _node, ...props }) => <h2 {...props} {...stylex.props(prose.h2)} />,
  h2: ({ node: _node, ...props }) => <h2 {...props} {...stylex.props(prose.h2)} />,
  h3: ({ node: _node, ...props }) => <h3 {...props} {...stylex.props(prose.h3)} />,
  h4: ({ node: _node, ...props }) => <h4 {...props} {...stylex.props(prose.h4)} />,
  h5: ({ node: _node, ...props }) => <h5 {...props} {...stylex.props(prose.h4)} />,
  h6: ({ node: _node, ...props }) => <h6 {...props} {...stylex.props(prose.h4)} />,
  p: ({ node: _node, ...props }) => <p {...props} {...stylex.props(prose.paragraph)} />,
  a: ({ node: _node, href, ...props }) => (
    <a href={href} {...props} rel={isExternal(href) ? 'noopener noreferrer' : undefined} {...stylex.props(prose.link)} />
  ),
  ul: ({ node: _node, className, ...props }) => <ul {...props} {...stylex.props(prose.list, className?.includes('contains-task-list') && prose.taskList)} />,
  ol: ({ node: _node, className: _className, ...props }) => <ol {...props} {...stylex.props(prose.list)} />,
  li: ({ node: _node, className: _className, ...props }) => <li {...props} {...stylex.props(prose.listItem)} />,
  input: ({ node: _node, ...props }) => <input {...props} {...stylex.props(prose.checkbox)} />,
  strong: ({ node: _node, ...props }) => <strong {...props} {...stylex.props(prose.strong)} />,
  blockquote: ({ node: _node, ...props }) => <blockquote {...props} {...stylex.props(prose.blockquote)} />,
  hr: ({ node: _node, ...props }) => <hr {...props} {...stylex.props(prose.rule)} />,
  img: ({ node: _node, alt, width, height, ...props }) => <img alt={alt ?? ''} width={width} height={height} loading="lazy" decoding="async" {...props} {...stylex.props(prose.figureImage)} style={width && height ? { aspectRatio: `${width} / ${height}` } : undefined} />,
  // Long code scrolls inside the block; tabIndex lets keyboard users scroll it too.
  pre: ({ node: _node, ...props }) => (
    <InCodeBlock.Provider value={true}>
      <pre tabIndex={0} {...props} {...stylex.props(prose.pre)} />
    </InCodeBlock.Provider>
  ),
  code: function Code({ node: _node, className, ...props }) {
    const block = useContext(InCodeBlock);
    const language = /language-([\w-]+)/.exec(className ?? '')?.[1];
    return <code data-language={language} {...props} {...stylex.props(block ? prose.blockCode : prose.inlineCode)} />;
  },
  table: ({ node: _node, ...props }) => (
    <div role="region" aria-label="Table" tabIndex={0} {...stylex.props(prose.tableScroll)}>
      <table {...props} {...stylex.props(prose.table)} />
    </div>
  ),
  th: ({ node: _node, ...props }) => <th {...props} {...stylex.props(prose.th)} />,
  td: ({ node: _node, ...props }) => <td {...props} {...stylex.props(prose.td)} />,
};

export function Markdown({ source }: { source: string }) {
  return (
    <div {...stylex.props(prose.root)}>
      <ReactMarkdown {...markdownOptions} components={components}>{source}</ReactMarkdown>
    </div>
  );
}
