import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { collectPosts } from './parsePost';
import { collectTags, filterByTag, filterByListGroup, isLegacyTag } from './posts';
import editorial from '../../content/graph-editorial.json';
const sources = Object.fromEntries(readdirSync('content/posts').filter(f=>f.endsWith('.md')).map(f=>[f,readFileSync(`content/posts/${f}`,'utf8')]));
const posts = collectPosts(sources, {includeDrafts:false}).map(p=>({...p,...((editorial.articles as Record<string,{category:string}>)[p.slug].category==='current-affairs'?{listGroup:'current-economy' as const}:{})}));
describe('topic and editorial listing filters',()=>{
 it('partitions the three current economy articles and keeps music in essays',()=>{
  const economy=filterByListGroup(posts,'current-economy'),essays=filterByListGroup(posts);
  expect(economy.map(p=>p.slug).sort()).toEqual(['anthropic-financials-and-valuation','dalio-ai-bubble-and-japan-economy','memory-stocks-cycle-and-valuation']);
  expect(essays.some(p=>p.slug==='solarpunk-three-tracks')).toBe(true);
  expect(new Set([...essays,...economy].map(p=>p.slug)).size).toBe(posts.length);
  expect(essays.some(p=>economy.includes(p))).toBe(false);
 });
 it('provides eighteen topics without broad name-only tags and preserves old URLs',()=>{
  expect(collectTags(posts)).toHaveLength(18);
  expect(collectTags(posts)).not.toContain('Garys Economics');
  expect(filterByTag(posts,'Garys Economics').map(p=>p.slug)).toEqual(['garys-economics-guide']);
  expect(isLegacyTag('Garys Economics')).toBe(true);
  expect(filterByTag(posts,'nothing-here')).toEqual([]);
  for (const inherited of ['constructor','toString','__proto__']) {
   expect(filterByTag(posts,inherited)).toEqual([]);
   expect(isLegacyTag(inherited)).toBe(false);
  }
  expect(filterByTag(posts,'地方分散').map(p=>p.slug)).toEqual(['kazenotani-and-matagi-drive']);
 });
 it('combines categories with current and legacy topics without changing graph eligibility',()=>{
  expect(filterByListGroup(filterByTag(posts,'AI投資'))).toEqual([]);
  expect(filterByListGroup(filterByTag(posts,'AI投資'),'current-economy')).toHaveLength(3);
  expect(filterByListGroup(filterByTag(posts,'株式市場'),'current-economy')).toHaveLength(3);
  expect(filterByListGroup(posts,'current-economy').every(p=>p.graph===false)).toBe(true);
  expect(filterByTag(posts,'成長と限界')).toHaveLength(2);
  expect(filterByTag(posts,'労働と余暇')).toHaveLength(3);
  expect(posts.some(p=>p.slug==='essential-work-rents-and-abundance')).toBe(false);
 });
});
