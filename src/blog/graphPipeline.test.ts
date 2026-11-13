import {createHash} from 'node:crypto';
import {fakeCache} from './graphTestFixtures';
import { describe, expect, it } from 'vitest';
import { prepareGraph, assembleGraph } from '../../scripts/graph-pipeline';
import { isGraphPost } from './posts';
import type { GraphTags } from './graphTypes';
const n = (id: string, slug = 'a', order = 0) => ({ id, slug, anchor: id, text: `本文 ${id}`, section: '節', kind: 'paragraph' as const, order, links: [] });
const corpus = { articles: [{slug:'a',title:'A',tags:[],text:'full A',extraction:'test'},{slug:'b',title:'B',tags:[],text:'full B',extraction:'test'}], nodes:[n('a'),n('b','b'),n('c','a',1)] };
const tags: GraphTags = { concepts:[{id:'topic',label:'話題'}], paragraphs: { a:{tags:['topic']}, b:{tags:['topic']}, c:{tags:[],excludeReason:'案内'} } };
const vectors = () => fakeCache(prepareGraph(corpus,tags));
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
    const stale=vectors();stale.articleEntries[0].textHash='outdated';expect(()=>assembleGraph(prepared,stale)).toThrow(/stale/i);
    const cache = vectors();
    for (const entry of cache.entries) entry.textHash = prepared.nodes.find(n=>n.id===entry.id)!.textHash;
    const data = assembleGraph(prepared,cache);
    expect(data.nodes).toHaveLength(2);
    expect(data.edges).toEqual([{source:'a',target:'b',kind:'semantic',score:1}]);
    expect(JSON.stringify(data)).not.toContain('textHash');
    expect(JSON.stringify(data)).not.toContain('\"vector\"');
    cache.entries[0].vector[0] = NaN;
    expect(()=>assembleGraph(prepared,cache)).toThrow(/vector/i);
  });
});

it('rejects an incompatible reference recipe even with a consistent state hash',()=>{
 const prepared=prepareGraph(corpus,tags), cache=vectors();
 const r=cache.reference;r.recipe='incompatible';
 const key=(v:number[])=>v.map(x=>x.toFixed(7)).join(',');
 r.id=createHash('sha256').update(r.recipe+'\n'+r.interpolation+'\n'+r.ids.map((id,i)=>id+'|'+key(r.vectors[i])+'|'+key(r.coordinates[i])).join('\n')).digest('hex');
 expect(()=>assembleGraph(prepared,cache)).toThrow(/recipe/i);
});
it('rejects coordinates inconsistent with the fixed reference for exact and interpolated vectors',()=>{
 const prepared=prepareGraph(corpus,tags);
 for(const interpolated of [false,true]) {
  const cache=vectors();
  if(interpolated)cache.entries[0].vector=[0,1,...Array(382).fill(0)];
  expect(()=>assembleGraph(prepared,cache)).not.toThrow();
  cache.entries[0].x+=100;
  expect(()=>assembleGraph(prepared,cache)).toThrow(/coordinates/i);
 }
 const cache=vectors();cache.articleEntries[0].y+=100;
 expect(()=>assembleGraph(prepared,cache)).toThrow(/coordinates/i);
});
