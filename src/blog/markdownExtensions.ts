import type { Root, RootContent } from 'mdast';
import { isYouTubeId, type PostVideo } from './posts';

/** A youtube fence contains a video ID and a human-readable title, never HTML. */
export function parseMarkdownVideo(value: string): PostVideo | undefined {
  const lines = value.trim().split(/\r?\n/).map((line) => line.trim());
  if (lines.length !== 2 || !isYouTubeId(lines[0]) || !lines[1] || lines[1].length > 200) return;
  return { youtubeId: lines[0], title: lines[1] };
}

/** Adds explicit chapter anchors and validated inline players without enabling raw HTML. */
export function remarkArticleExtensions() {
  return (tree: Root) => {
    const ids = new Set<string>();
    function visit(parent: { children: RootContent[] }) {
      parent.children.forEach((node, index) => {
        if (node.type === 'heading') {
          const last = node.children.at(-1);
          if (last?.type === 'text') {
            const match = /\s+\{#([a-z][a-z0-9-]*)\}$/.exec(last.value);
            if (match && !ids.has(match[1])) {
              ids.add(match[1]);
              last.value = last.value.slice(0, match.index);
              node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: match[1] } };
            }
          }
        }
        if (node.type === 'code' && node.lang === 'youtube') {
          const video = parseMarkdownVideo(node.value);
          if (video) {
            parent.children[index] = {
              type: 'paragraph', children: [],
              data: { hName: 'div', hProperties: { 'data-youtube-id': video.youtubeId, 'data-youtube-title': video.title } },
            };
          }
        } else if ('children' in node) {
          visit(node as { children: RootContent[] });
        }
      });
    }
    visit(tree);
  };
}
