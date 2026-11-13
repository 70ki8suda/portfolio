import projectionRecipe from './projection-recipe.json';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { toString } from 'mdast-util-to-string';
import type { RootContent } from 'mdast';
export const ARTICLE_EXTRACTION = projectionRecipe.extraction;
/** Includes excluded editorial paragraphs: a document embedding represents the entire article. */
export function articleEmbeddingText(title: string, body: string): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body);
  const read = (node: RootContent): string => {
    if (node.type === 'html') throw new Error('HTML needs an explicit readable-text extraction rule');
    if (node.type === 'code') return node.lang === 'youtube' ? '' : node.value;
    if (node.type === 'definition' || node.type === 'thematicBreak' || node.type === 'footnoteReference') return '';
    if ('children' in node) return node.children.map(child => read(child as RootContent)).join(node.type === 'paragraph' || node.type === 'heading' || node.type === 'link' || node.type === 'emphasis' || node.type === 'strong' ? '' : '\n');
    return toString(node);
  };
  return [title, ...tree.children.map(read)].filter(Boolean).join('\n\n').replace(/\s*\{#[^}]+\}/g, '').trim();
}
