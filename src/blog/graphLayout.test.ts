import { describe, expect, it } from 'vitest';
import data from '../../public/paragraph-graph.json';
import type { GraphData, GraphNode } from './graphTypes';
import { buildGraphLayout, semanticLevel, selectedEdgeId } from './graphLayout';
const real = data as GraphData;
const node = (id: string, slug: string, tags = ['shared']): GraphNode => ({ id, slug, tags, anchor: id, kind: 'paragraph', order: 1, section: '', text: id, x: 0.5, y: 0.5 });
const fixture = (): GraphData => ({ ...real,
  articles: ['a','b','c'].map(slug => ({ slug, title: slug, tags: [], x: 0.5, y: 0.5 })),
  nodes: [node('a1','a'),node('a2','a'),node('b1','b'),node('c1','c',['other'])],
  concepts: [{id:'shared',label:'Shared'},{id:'other',label:'Other'}],
  edges: [{source:'a1',target:'b1',kind:'semantic',score:0.95},{source:'b1',target:'a1',kind:'semantic',score:0.95},{source:'a1',target:'a2',kind:'sequence'}],
  conceptNeighbors: {a1:['b1'],b1:['a1'],a2:['b1'],c1:[]},
});
describe('explorable graph layout', () => {
  it('aggregates unique existing paragraph evidence without fabricating article relations', () => {
    const result = buildGraphLayout(fixture());
    expect(result.articleEdges).toHaveLength(1);
    expect(result.articleEdges[0]).toMatchObject({source:'a',target:'b',semanticCount:1,conceptCount:2,explicitCount:0});
    expect(result.articleEdges[0].examples).toHaveLength(3);
    expect(result.paragraphEdges.filter(e=>e.kind==='sequence')).toHaveLength(1);
  });
  it('rejects dangling, same-article and tagless concept suggestions as interarticle evidence', () => {
    const input = fixture();
    input.conceptNeighbors = {a1:['a2','missing','c1']};
    const result = buildGraphLayout(input);
    expect(result.articleEdges[0].conceptCount).toBe(0);
    expect(result.articleEdges).toHaveLength(1);
  });
  it('preserves coincident meaning coordinates and applies the same isotropic transform across articles', () => {
    const input=fixture();input.nodes[1].x=.6;input.nodes[2].y=.7;
    const result=buildGraphLayout(input);
    expect(result.articles.get('a')).toEqual(result.articles.get('b'));
    expect(result.paragraphs.get('a1')).toEqual(result.articles.get('a'));
    expect(result.paragraphs.get('a2')!.x-result.paragraphs.get('a1')!.x).toBeCloseTo(180);
    expect(result.paragraphs.get('b1')!.y-result.paragraphs.get('a1')!.y).toBeCloseTo(360);
    const filtered={...input,nodes:[input.nodes[2]],articles:[input.articles[1]]};
    expect(buildGraphLayout(filtered).paragraphs.get('b1')).toEqual(result.paragraphs.get('b1'));
    expect(buildGraphLayout(input)).toEqual(result);
  });
  it('preserves real opted-in topology and keeps every position finite and within bounds', () => {
    const result = buildGraphLayout(real);
    expect(result.paragraphs.size).toBe(real.nodes.length);
    expect(result.articles.size).toBe(real.articles.length);
    expect(result.concepts.size).toBe(0);
    const positions=[...result.articles.values(),...result.paragraphs.values(),...result.concepts.values()];
    for(const p of positions) {
      expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(result.bounds.x);
      expect(p.x).toBeLessThanOrEqual(result.bounds.x+result.bounds.width);
      expect(p.y).toBeGreaterThanOrEqual(result.bounds.y);
      expect(p.y).toBeLessThanOrEqual(result.bounds.y+result.bounds.height);
    }
    for(const edge of result.articleEdges) {
      expect(edge.examples.length).toBe(edge.semanticCount+edge.conceptCount+edge.explicitCount);
      expect(edge.examples.every(e=>real.nodes.some(n=>n.id===e.source)&&real.nodes.some(n=>n.id===e.target))).toBe(true);
    }
  });
  it('changes actual semantic levels rather than magnification alone', () => {
    expect([1,1.64,1.65,3.09,3.1,8].map(semanticLevel)).toEqual(['article','article','paragraph','paragraph','paragraph','paragraph']);
  });
});

it('keeps both incoming sequence edges uniquely identified for a selected paragraph',()=>{
 const data=fixture();data.nodes=[node('a','a'),node('b','a'),node('z','a')];
 data.edges=[{source:'a',target:'z',kind:'sequence'},{source:'z',target:'b',kind:'sequence'}];
 const edges=buildGraphLayout(data).paragraphEdges.filter(e=>e.kind==='sequence'&&(e.source==='z'||e.target==='z'));
 expect(edges).toHaveLength(2);
 expect(new Set(edges.map(selectedEdgeId)).size).toBe(2);
});
