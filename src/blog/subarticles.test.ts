import {describe,it,expect} from 'vitest';
import {collectPosts,parsePost} from './parsePost';
import {listedPosts,articleFamily,isGraphPost,collectTags,toSummary} from './posts';
const source=(extra='')=>`---\ntitle: Article\ndate: 2026-11-18\ndescription: Description\ntags: [shared]\n${extra}\n---\nBody.\n`;
describe('subarticles',()=>{
 it('parses an explicit parent while preserving ordinary posts',()=>{
  expect(parsePost('child.md',source('parentArticle: parent')).parentArticle).toBe('parent');
  expect(parsePost('parent.md',source())).not.toHaveProperty('parentArticle');
  for(const v of ['null','42','[parent]','""','../parent','https://example.com','Parent'])expect(()=>parsePost('child.md',source(`parentArticle: ${v}`))).toThrow('parentArticle');
 });
 it('rejects absent, self, unpublished and cyclic parents before visibility filtering',()=>{
  expect(()=>collectPosts({'child.md':source('parentArticle: missing\ndraft: true')},{includeDrafts:false})).toThrow(/parentArticle.*missing/);
  expect(()=>collectPosts({'child.md':source('parentArticle: child')},{includeDrafts:false})).toThrow(/parentArticle.*self/);
  expect(()=>collectPosts({'child.md':source('parentArticle: parent'),'parent.md':source('draft: true')},{includeDrafts:true})).toThrow(/parentArticle.*draft/);
  expect(()=>collectPosts({'a.md':source('parentArticle: b'),'b.md':source('parentArticle: a')},{includeDrafts:false})).toThrow(/parentArticle.*cycle/);
 });
 it('rejects ambiguous parent slugs',()=>{
  expect(()=>collectPosts({'one/parent.md':source(),'two/parent.md':source(),'child.md':source('parentArticle: parent')},{includeDrafts:false})).toThrow(/duplicate slug/);
 });
 it('keeps public children directly available and graph eligible, but not listed or counted as tags',()=>{
  const posts=collectPosts({'parent.md':source(),'child.md':source('parentArticle: parent\ngraph: true').replace('[shared]','[child-only]')},{includeDrafts:false});
  expect(posts.map(p=>p.slug).sort()).toEqual(['child','parent']);
  expect(listedPosts(posts).map(p=>p.slug)).toEqual(['parent']);
  expect(collectTags(listedPosts(posts))).toEqual(['shared']);
  expect(isGraphPost(posts.find(p=>p.slug==='child')!)).toBe(true);
  expect(toSummary(posts.find(p=>p.slug==='child')!).parentArticle).toBe('parent');
  expect(articleFamily(posts,posts.find(p=>p.slug==='child')!).parent?.slug).toBe('parent');
  expect(articleFamily(posts,posts.find(p=>p.slug==='parent')!).children.map(p=>p.slug)).toEqual(['child']);
 });
 it('never advertises draft children even in a local draft preview',()=>{
  const posts=collectPosts({'parent.md':source(),'child.md':source('parentArticle: parent\ndraft: true')},{includeDrafts:true});
  expect(articleFamily(posts,posts.find(p=>p.slug==='parent')!).children).toEqual([]);
  expect(articleFamily(posts,posts.find(p=>p.slug==='child')!).parent?.slug).toBe('parent');
 });
});
