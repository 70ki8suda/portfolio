import {expect,it} from 'vitest';
import {collectCommentSnapshot} from '../../scripts/comment-index-collect';
const empty={totalCount:0,nodes:[],pageInfo:{hasNextPage:false,endCursor:null}};
it('requires two complete matching reads before publishing a known empty snapshot',async()=>{
 let calls=0;const result=await collectCommentSnapshot(async()=>{calls++;return {repository:{discussions:empty}};},{sourceSha:'a'.repeat(40),generation:'1:1'});
 expect(calls).toBe(2);expect(result.complete).toBe(true);expect(result.entries).toEqual([]);
});
it('rejects missing pages, repeated cursors and incomplete connection counts',async()=>{
 await expect(collectCommentSnapshot(async()=>({repository:{discussions:{...empty,totalCount:1}}}),{sourceSha:'a'.repeat(40),generation:'1:1'})).rejects.toThrow();
 await expect(collectCommentSnapshot(async()=>({repository:{discussions:{...empty,pageInfo:{hasNextPage:true,endCursor:null}}}}),{sourceSha:'a'.repeat(40),generation:'1:1'})).rejects.toThrow();
 await expect(collectCommentSnapshot(async()=>({errors:[{message:'denied'}]}),{sourceSha:'a'.repeat(40),generation:'1:1'})).rejects.toThrow();
});
it('does not publish a changing corpus after the bounded consistency retry',async()=>{
 let calls=0;
 await expect(collectCommentSnapshot(async()=>({repository:{discussions:{totalCount:1,nodes:[{id:'D_1',title:'ordinary',body:String(++calls),updatedAt:'2026-11-13T10:00:00Z'}],pageInfo:{hasNextPage:false,endCursor:null}}}}),{sourceSha:'a'.repeat(40),generation:'1:1'})).rejects.toThrow('both collection attempts');
 expect(calls).toBe(4);
});
