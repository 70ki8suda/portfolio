import {describe,it,expect} from 'vitest';
import {parsePost} from './parsePost';
import {postListGroup,filterByListGroup,filterByTag,isGraphPost,toSummary} from './posts';
const source=(category?:string,graph=false)=>`---\ntitle: Technical notes\ndate: 2026-11-15\nupdatedAt: 2026-11-15\ndescription: A test article.\ntags: [AIと社会]\ngraph: ${graph}\n${category===undefined?'':`category: ${category}\n`}---\nBody.\n`;
describe('listing categories are independent from graph editorial purpose',()=>{
 it('preserves absent metadata and legacy classifications',()=>{
  const p=parsePost('plain.md',source());expect(p).not.toHaveProperty('category');
  expect(postListGroup(p,'current-affairs')).toBe('current-economy');
  for(const c of ['long-term','curation','other',undefined])expect(postListGroup(p,c)).toBeUndefined();
 });
 it('validates explicit metadata and carries it to summaries',()=>{
  for(const category of ['engineering','future-research','current-economy']){
   const p=parsePost('a.md',source(category));expect(toSummary(p).category).toBe(category);
   expect(postListGroup(p,'current-affairs')).toBe(category==='future-research'?undefined:category);
  }
  for(const value of ['tech','null','[engineering]','42','true','constructor'])expect(()=>parsePost('a.md',source(value))).toThrow('category');
 });
 it('partitions all three groups and combines topic filtering without opt-in inference',()=>{
  const posts=[undefined,'current-economy','engineering'].map((c,i)=>{const p=parsePost(`p-${i}.md`,source(c,true));return {...p,listGroup:postListGroup(p)};});
  for(const c of [undefined,'current-economy','engineering'] as const){const found=filterByListGroup(filterByTag(posts,'AIと社会'),c);expect(found).toHaveLength(1);expect(isGraphPost(found[0])).toBe(true);}
  const p=parsePost('technical.md',source('engineering'));expect(isGraphPost(p)).toBe(false);
  expect(isGraphPost({...p,graph:true,draft:true})).toBe(false);
 });
});
