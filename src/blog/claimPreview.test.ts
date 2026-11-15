import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { claimPreviewMode, validClaimPreview, originalAnchor, claimSearchText } from './claimPreview';
import { isGraphPayload } from './graphRefresh';
import type { GraphData } from './graphTypes';
const data: GraphData = JSON.parse(readFileSync('public/paragraph-graph.json', 'utf8'));
const node = data.nodes[0];
it('limits selection to two named datasets behind the explicit development flag', () => {
  expect(claimPreviewMode('claims', false)).toBeUndefined();
  expect(claimPreviewMode('paragraphs', true)).toBe('paragraphs');
  expect(claimPreviewMode('../../private', true)).toBeUndefined();
});
it('rejects incomplete claim metadata while accepting explicitly empty local neighbors', () => {
  const preview = {version:1 as const,mode:'claims' as const,baselineCount:254,claims:Object.fromEntries(data.nodes.map(n=>[n.id,{speaker:'筆者',conditions:['短期の見立て'],evidence:[{anchor:n.anchor,text:n.text}]}]))};
  const graph = {...data,preview,semanticNeighbors:Object.fromEntries(data.nodes.map(n=>[n.id,[]]))};
  expect(isGraphPayload(graph)).toBe(true);
  delete preview.claims[node.id];expect(isGraphPayload(graph)).toBe(false);
  expect(validClaimPreview({...preview,claims:{[node.id]:{speaker:'筆者',conditions:[],evidence:[]}}},[node])).toBe(false);
});
it('routes synthetic claim IDs to original paragraph anchors and searches the supporting text', () => {
  const synthetic={...node,id:`${node.slug}:claim-demo`,anchor:'claim-demo'};
  const graph={...data,preview:{version:1 as const,mode:'claims' as const,baselineCount:254,claims:{[synthetic.id]:{speaker:'本人',conditions:['条件'],evidence:[{anchor:node.anchor,text:'元文の固有語'}]}}}};
  expect(originalAnchor(graph,synthetic)).toBe(node.anchor);
  expect(claimSearchText(graph,synthetic)).toContain('元文の固有語');
  expect(originalAnchor(data,node)).toBe(node.anchor);
  expect(validClaimPreview({version:1,mode:'paragraphs',baselineCount:1,claims:{}},[node])).toBe(true);
});
