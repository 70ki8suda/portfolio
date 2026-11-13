import {expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {createAnnotation,annotationHash} from './commentAnnotations';
import {rangeCommentTarget} from './githubComments';
import {indexDiscussion} from '../../scripts/comment-index-build';
async function fixture(){
 const post={slug:'example',title:'記事',body:'引用本文'};
 const a=await createAnnotation(post.slug,await annotationHash(post.body),[{anchor:'p-1111111111111111',text:post.body}],[{anchor:'p-1111111111111111',start:0,end:2}]);
 const target=await rangeCommentTarget(post,a);
 return {id:'D_1',number:1,url:'https://github.com/70ki8suda/portfolio/discussions/1',title:target.term,body:`# ${target.term}\n\n${target.description}\n\n<!-- sha1: ${createHash('sha1').update(target.term).digest('hex')} -->`,updatedAt:'2026-11-13T10:00:00Z',author:{id:'MDM6Qm90ODEwMjY4OTU=',__typename:'Bot'},category:{id:'DIC_kwDOUZpL2s4DLB2i'},comments:1,replies:2};
}
it('indexes only verified giscus-created range bodies and actual counts',async()=>{
 const d=await fixture();const e=await indexDiscussion(d);expect(e?.comments).toBe(1);expect(e?.replies).toBe(2);expect(e?.annotation.quote).toBe('引用');
 expect(await indexDiscussion({...d,title:'ordinary discussion'})).toBeNull();
 expect(await indexDiscussion({...d,author:{id:'someone',__typename:'User'}})).toBeNull();
});
it('fails closed for corrupted bot range metadata instead of publishing an empty index',async()=>{
 const d=await fixture();await expect(indexDiscussion({...d,title:d.title+'x'})).rejects.toThrow();
 await expect(indexDiscussion({...d,body:d.body.replace('<!-- sha1:','<!-- wrong:')})).rejects.toThrow();
 await expect(indexDiscussion({...d,body:d.body+'\n'+d.body})).rejects.toThrow();
});
