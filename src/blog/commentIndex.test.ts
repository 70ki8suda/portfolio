import {expect,it} from 'vitest';
import {createAnnotation,annotationHash} from './commentAnnotations';
import {rangeCommentTarget} from './githubComments';
import {readCommentIndex} from './commentIndex';
async function fixture(){
 const post={slug:'example',title:'記事',body:'引用本文'};
 const annotation=await createAnnotation(post.slug,await annotationHash(post.body),[{anchor:'p-1111111111111111',text:post.body}],[{anchor:'p-1111111111111111',start:0,end:2}]);
 const target=await rangeCommentTarget(post,annotation);
 return {version:1,repo:'70ki8suda/portfolio',complete:true,startedAt:'2026-11-13T10:00:00Z',generatedAt:'2026-11-13T10:01:00Z',sourceSha:'a'.repeat(40),generation:'1:1',entries:[{id:'D_1',number:1,url:'https://github.com/70ki8suda/portfolio/discussions/1',updatedAt:'2026-11-13T10:00:00Z',term:target.term,annotation,comments:1,replies:0}]};
}
const now=Date.parse('2026-11-13T10:02:00Z');
it('retains distinct discussions for the same range and distinguishes fresh zero from unknown',async()=>{
 const f=await fixture();f.entries.push({...f.entries[0],id:'D_2',number:2,url:'https://github.com/70ki8suda/portfolio/discussions/2'});
 const result=await readCommentIndex(f,now);expect(result.state).toBe('fresh');expect(result.entries).toHaveLength(2);
 expect((await readCommentIndex({...f,entries:[]},now)).state).toBe('fresh');
 expect((await readCommentIndex(undefined,now)).state).toBe('unknown');
});
it('rejects identity mismatches and incomplete snapshots, and marks old snapshots stale',async()=>{
 const f=await fixture();
 expect((await readCommentIndex({...f,complete:false},now)).state).toBe('unknown');
 expect((await readCommentIndex({...f,entries:[{...f.entries[0],term:'wrong'}]},now)).state).toBe('unknown');
 expect((await readCommentIndex({...f,entries:[f.entries[0],f.entries[0]]},now)).state).toBe('unknown');
 expect((await readCommentIndex(f,now+3*3600000)).state).toBe('stale');
 expect((await readCommentIndex(f,now-600000)).state).toBe('unknown');
});
