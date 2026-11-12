import type { Root, RootContent, Paragraph } from 'mdast';
import { toString } from 'mdast-util-to-string';

/** Content identity, independent of offsets. Collisions are checked during extraction. */
export function paragraphHash(text: string) {
  let a = 2166136261;
  let b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
export interface ExtractedParagraph {
  anchor: string;
  text: string;
  section: string;
  sectionId?: string;
  kind: 'paragraph' | 'quote';
  order: number;
  links: string[];
}
/** Same AST walk is used by the renderer and the offline extractor. Lists/tables are not prose paragraphs. */
export function extractParagraphs(tree: Root, annotate = false): ExtractedParagraph[] {
  const result: ExtractedParagraph[] = [];
  const occurrences = new Map<string, number>();
  const identities = new Map<string, string>();
  const headings: { depth: number; text: string; id?: string }[] = [];
  const reserved = new Set<string>();
  for (const node of tree.children) if (node.type === 'heading') {
    const match = /\s+\{#([a-z][a-z0-9-]*)\}$/.exec(toString(node));
    if (match) reserved.add(match[1]);
  }
  function walk(nodes: RootContent[], quoted = false) {
    for (const node of nodes) {
      if (node.type === 'heading') {
        const raw = toString(node);
        const match = /\s+\{#([a-z][a-z0-9-]*)\}$/.exec(raw);
        while (headings.length && headings.at(-1)!.depth >= node.depth) headings.pop();
        headings.push({ depth: node.depth, text: raw.replace(/\s+\{#[^}]+\}$/, ''), id: match?.[1] });
      } else if (node.type === 'blockquote') walk(node.children, true);
      else if (node.type === 'paragraph') {
        const text = toString(node).replace(/\s+/g, ' ').trim();
        if (!text || /^https?:\/\/\S+$/.test(text) || !/[\p{L}\p{N}]/u.test(text)) continue;
        // Inline-code-only and image-only paragraphs aren't conceptual prose.
        if (node.children.every(c => ['inlineCode', 'image', 'imageReference', 'html'].includes(c.type))) continue;
        const hash = paragraphHash(text);
        if (identities.has(hash) && identities.get(hash) !== text) throw new Error('Paragraph hash collision');
        identities.set(hash, text);
        const count = (occurrences.get(hash) ?? 0) + 1;
        occurrences.set(hash, count);
        let anchor = `p-${hash}${count > 1 ? `-${count}` : ''}`;
        while (reserved.has(anchor)) anchor += '-p';
        reserved.add(anchor);
        const links: string[] = [];
        function collect(n: Paragraph | Paragraph['children'][number]) {
          if (n.type === 'link') links.push(n.url);
          if ('children' in n) for (const child of n.children) collect(child as Paragraph['children'][number]);
        }
        collect(node);
        result.push({ anchor, text, section: headings.map(h => h.text).join(' / '),
          sectionId: [...headings].reverse().find(h => h.id)?.id,
          kind: quoted ? 'quote' : 'paragraph', order: result.length, links });
        if (annotate) node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id: anchor, tabIndex: -1 } };
      }
    }
  }
  walk(tree.children);
  return result;
}
export function remarkParagraphAnchors() {
  return (tree: Root) => { extractParagraphs(tree, true); };
}
