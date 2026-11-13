import {describe,it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {inferUpdatedAt, withUpdatedAt} from '../../scripts/post-dates';
import {parsePost} from './parsePost';
const source=(body='初めの本文。',extra='')=>`---\ntitle: Example\ndate: "2026-01-01"\ndescription: Example\ntags: []\n${extra}---\n\n${body}\n`;
describe('content update dates',()=>{
 it('changes only frontmatter when the body contains date metadata examples',()=>{
  const input=source('```yaml\nupdatedAt: "2000-01-01"\ndate: "2000-01-02"\n```');
  const actual=withUpdatedAt('post.md',input,'2026-01-03');
  expect(parsePost('post.md',actual).updatedAt).toBe('2026-01-03');
  expect(parsePost('post.md',actual).body).toBe(parsePost('post.md',input).body);
 });
 it('fails closed for unreadable HEAD blobs instead of treating them as new files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'post-broken-date-'));
  const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,stdio:'pipe'}).toString().trim();
  try {
   git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');
   writeFileSync(join(dir,'post.md'),source());git('add','.');git('commit','-qm','initial');
   const oid=git('rev-parse','HEAD:post.md');unlinkSync(join(dir,'.git','objects',oid.slice(0,2),oid.slice(2)));
   expect(()=>inferUpdatedAt('post.md',source(),'2026-01-01',undefined,'2026-01-20',dir)).toThrow();
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
 it('validates an optional real update date without inventing a fallback',()=>{
  expect(parsePost('post.md',source()).updatedAt).toBeUndefined();
  expect(parsePost('post.md',source('本文。','updatedAt: "2026-01-02"\n')).updatedAt).toBe('2026-01-02');
  for(const day of ['2026-02-30','2025-12-31'])expect(()=>parsePost('post.md',source('本文。',`updatedAt: "${day}"\n`))).toThrow(/updatedAt/);
 });
 it('ignores tag-only history and updates only a changed body, retaining published dates',()=>{
  const dir=mkdtempSync(join(tmpdir(),'post-date-test-'));const git=(...args:string[])=>execFileSync('git',args,{cwd:dir,stdio:'pipe'}).toString();
  const commit=(day:string)=>execFileSync('git',['commit','-qm','content'],{cwd:dir,env:{...process.env,GIT_AUTHOR_DATE:day+'T12:00:00+09:00',GIT_COMMITTER_DATE:day+'T12:00:00+09:00'}});
  try {
   git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');
   writeFileSync(join(dir,'post.md'),source());git('add','.');commit('2026-01-02');
   const tagged=source().replace('tags: []','tags: [新タグ]');writeFileSync(join(dir,'post.md'),tagged);git('add','.');commit('2026-01-10');
   expect(inferUpdatedAt('post.md',tagged,'2026-01-01',undefined,'2026-01-20',dir)).toBe('2026-01-02');
   expect(inferUpdatedAt('post.md',tagged,'2026-01-01','2026-01-02','2026-01-20',dir)).toBe('2026-01-02');
   expect(inferUpdatedAt('post.md',source('本文が変わった。'),'2026-01-01','2026-01-02','2026-01-20',dir)).toBe('2026-01-20');
   expect(inferUpdatedAt('new.md',source(),'2026-01-15',undefined,'2026-01-20',dir)).toBe('2026-01-15');
   expect(inferUpdatedAt('post.md',tagged,'2026-02-01',undefined,'2026-01-20',dir)).toBe('2026-02-01');
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
});
