import { expect, it } from 'vitest';
import { commentTarget, widgetUrl, discussionUrl, captureCommentSession, type SessionEnvironment } from './githubComments';
const post={slug:'example',title:'例 [見出し](https://evil.test)',body:'## 節\n\n同じ文です。\n'};
it('separates paragraph threads across edits while keeping article thread stable',async()=>{
 const p=await commentTarget(post,{anchor:'p-0123456789abcdef',section:'節',text:'同じ文です。'});
 for(const body of ['同じ文です。\n'+post.body,post.body.replace('節','別節'),post.body.replace('同じ文','> 同じ文'),post.body+'[参照](https://example.com)']) {
  const changed=await commentTarget({...post,body},{anchor:'p-0123456789abcdef',section:'節',text:'同じ文です。'});expect(changed.term).not.toBe(p.term);
 }
 expect((await commentTarget(post)).term).toBe((await commentTarget({...post,body:'変更'})).term);
 expect(p.term).toMatch(/^paragraph:example:[a-f0-9]{64}:p-/);
});
it('initializes exact target and escaped context with an explicit versioned paragraph link',async()=>{
 const target=await commentTarget(post,{anchor:'p-0123456789abcdef',section:'節',text:'[偽リンク](https://evil.test)\n<script>bad</script>'});
 const url=new URL(widgetUrl(target,'session-value','https://70ki8suda.com/blog/example?giscus=secret#p-0123456789abcdef'));
 expect(url.origin).toBe('https://giscus.app');expect(url.searchParams.get('strict')).toBe('1');expect(url.searchParams.get('term')).toBe(target.term);
 expect(url.searchParams.get('description')).toContain('\\[偽リンク\\]');expect(url.searchParams.get('description')).not.toContain('<script>');
 expect(url.searchParams.get('description')).toContain('#p-0123456789abcdef');expect(url.searchParams.get('description')).toContain('comment=');
 expect(url.searchParams.get('origin')).not.toContain('giscus=');expect(target.backLink).not.toContain('session-value');
});
it('accepts only numeric discussions in the exact repository',()=>{
 expect(discussionUrl('https://github.com/70ki8suda/portfolio/discussions/12')).toBe('https://github.com/70ki8suda/portfolio/discussions/12');
 for(const url of ['https://github.com/evil/portfolio/discussions/12','https://github.com/70ki8suda/portfolio/discussions/12?secret=x','javascript:alert(1)','https://github.com.evil.test/70ki8suda/portfolio/discussions/12']) expect(discussionUrl(url)).toBeNull();
});
it('removes OAuth query before routing without losing target/hash/history, even if storage is denied',()=>{
 const replaced:unknown[]=[]; const state={router:{key:1}};
 const env: SessionEnvironment={href:'https://70ki8suda.com/blog/example?tag=x&comment=article&giscus=auth-value#p-123',state,replace:(s,u)=>replaced.push([s,u]),storage:{getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('denied');},removeItem:()=>{throw Error('denied');}}};
 expect(captureCommentSession(env)).toBe('auth-value');expect(replaced).toEqual([[state,'https://70ki8suda.com/blog/example?tag=x&comment=article#p-123']]);
});
it('uses official JSON session format and rejects malformed saved data',()=>{
 let stored=''; const env:SessionEnvironment={href:'https://70ki8suda.com/blog/example?giscus=auth-value',state:null,replace:()=>{},storage:{getItem:()=>stored,setItem:(_k,v)=>{stored=v;},removeItem:()=>{stored='';}}};
 captureCommentSession(env);expect(stored).toBe('"auth-value"');env.href='https://70ki8suda.com/blog/example';expect(captureCommentSession(env)).toBe('auth-value');stored='{}';expect(captureCommentSession(env)).toBe('');
});

it('binds a range to its full selector and preserves it through OAuth origin', async () => {
  const {createAnnotation,annotationHash,encodeAnnotation}=await import('./commentAnnotations');
  const {rangeCommentTarget}=await import('./githubComments');
  const post={slug:'example',title:'記事',body:'日本語の本文'};
  const annotation=await createAnnotation(post.slug,await annotationHash(post.body),[{anchor:'p-1111111111111111',text:post.body}],[{anchor:'p-1111111111111111',start:0,end:3}]);
  const target=await rangeCommentTarget(post,annotation);
  expect(target.term).toMatch(/^range:example:[a-f0-9]{64}:[a-f0-9]{64}$/);
  expect(target.description).toContain(`<!-- portfolio-annotation-v1:${encodeAnnotation(annotation)} -->`);
  expect(new URL(target.backLink).searchParams.get('annotation')).toBe(encodeAnnotation(annotation));
  const url=new URL(widgetUrl(target,'',target.backLink));
  expect(new URL(url.searchParams.get('origin')!).searchParams.get('annotation')).toBe(encodeAnnotation(annotation));
  expect(()=>widgetUrl(target,'x'.repeat(8000),target.backLink)).toThrow();
});
