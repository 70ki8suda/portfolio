import { describe, expect, it } from 'vitest';
import data from '../../public/paragraph-graph.json';
import type { GraphData, GraphNode } from './graphTypes';
import { buildGraphLayout, semanticLevel } from './graphLayout';
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
  it('separates coincident hubs and paragraphs deterministically within article neighborhoods', () => {
    const input = fixture();
    const result = buildGraphLayout(input);
    expect(buildGraphLayout(input)).toEqual(result);
    const a = result.articles.get('a')!;
    const b = result.articles.get('b')!;
    expect(Math.hypot(a.x-b.x,a.y-b.y)).toBeGreaterThan(300);
    const p = result.paragraphs.get('a1')!;
    const q = result.paragraphs.get('a2')!;
    expect(Math.hypot(p.x-q.x,p.y-q.y)).toBeGreaterThan(10);
    expect(Math.hypot(p.x-a.x,p.y-a.y)).toBeLessThan(180);
  });
  it('preserves real opted-in topology and keeps every position finite and within bounds', () => {
    const result = buildGraphLayout(real);
    expect(result.paragraphs.size).toBe(real.nodes.length);
    expect(result.articles.size).toBe(4);
    expect(result.concepts.size).toBe(real.concepts.length);
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
    expect([1,1.64,1.65,3.09,3.1,8].map(semanticLevel)).toEqual(['article','article','paragraph','paragraph','concept','concept']);
  });
});
