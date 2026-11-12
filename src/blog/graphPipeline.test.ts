import { describe, expect, it } from 'vitest';
import { prepareGraph, assembleGraph, MODEL, ALGORITHM } from '../../scripts/graph-pipeline';
import { isGraphPost } from './posts';
import type { GraphTags } from './graphTypes';
const n = (id: string, slug = 'a', order = 0) => ({ id, slug, anchor: id, text: `本文 ${id}`, section: '節', kind: 'paragraph' as const, order, links: [] });
const corpus = { articles: [{slug:'a',title:'A',tags:[]},{slug:'b',title:'B',tags:[]}], nodes:[n('a'),n('b','b'),n('c','a',1)] };
const tags: GraphTags = { concepts:[{id:'topic',label:'話題'}], paragraphs: { a:{tags:['topic']}, b:{tags:['topic']}, c:{tags:[],excludeReason:'案内'} } };
const vectors = () => ({ model: MODEL, algorithm: ALGORITHM, entries: ['a','b'].map((id) => ({id,textHash:'',vector:[1,...Array(383).fill(0)],x:0.5,y:0.5})), explainedVariance:[0,0] });
describe('graph generation contracts', () => {
  it('uses explicit opt-in and never allows a draft', () => {
    expect(isGraphPost({graph:true,draft:true} as never)).toBe(false);
    expect(isGraphPost({draft:false} as never)).toBe(false);
    expect(isGraphPost({graph:true,draft:false} as never)).toBe(true);
  });
  it('requires exact coverage and known controlled concepts', () => {
    expect(prepareGraph(corpus,tags).nodes.map(n=>n.id)).toEqual(['a','b']);
    expect(()=>prepareGraph(corpus,{...tags,paragraphs:{a:tags.paragraphs.a}})).toThrow(/missing/i);
    expect(()=>prepareGraph(corpus,{...tags,paragraphs:{...tags.paragraphs,old:{tags:['topic']}}})).toThrow(/stale/i);
    expect(()=>prepareGraph(corpus,{...tags,paragraphs:{...tags.paragraphs,a:{tags:['unknown']}}})).toThrow(/concept/i);
  });
  it('rejects stale, malformed and extra vector data before publication', () => {
    const prepared = prepareGraph(corpus,tags);
    expect(()=>assembleGraph(prepared,vectors())).toThrow(/stale/i);
    const cache = vectors();
    for (const entry of cache.entries) entry.textHash = prepared.nodes.find(n=>n.id===entry.id)!.textHash;
    const data = assembleGraph(prepared,cache);
    expect(data.nodes).toHaveLength(2);
    expect(data.edges).toEqual([{source:'a',target:'b',kind:'semantic',score:1}]);
    expect(JSON.stringify(data)).not.toContain('textHash');
    expect(JSON.stringify(data)).not.toContain('vector');
    cache.entries[0].vector[0] = NaN;
    expect(()=>assembleGraph(prepared,cache)).toThrow(/vector/i);
  });
});
