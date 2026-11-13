import {expect,it} from 'vitest';
import {createAnnotation,validateAnnotation,encodeAnnotation,decodeAnnotation} from './commentAnnotations';
const body='a'.repeat(64),paragraphs=[{anchor:'p-1111111111111111',text:'同じ文章。同じ文章。日本語😀の引用。'},{anchor:'p-2222222222222222',text:'次の段落。強調とリンクを含みます。'}];
it('preserves duplicate occurrences and Unicode offsets with exact surrounding text',async()=>{
 const a=await createAnnotation('example',body,paragraphs,[{anchor:paragraphs[0].anchor,start:5,end:10}]);
 expect(a.segments[0].exact).toBe('同じ文章。');expect(a.segments[0].prefix).toBe('同じ文章。');
 expect(await validateAnnotation(a,'example',body,paragraphs)).toBe(true);
 expect(await validateAnnotation(a,'example','b'.repeat(64),paragraphs)).toBe(false);
 expect(await validateAnnotation({...a,segments:[{...a.segments[0],start:0,end:5}]},'example',body,paragraphs)).toBe(false);
 expect(await decodeAnnotation(encodeAnnotation(a),'example',body,paragraphs)).toEqual(a);
});
it('preserves a multi-paragraph quote and rejects ambiguous or modified selectors',async()=>{
 const a=await createAnnotation('example',body,paragraphs,[{anchor:paragraphs[0].anchor,start:10,end:paragraphs[0].text.length},{anchor:paragraphs[1].anchor,start:0,end:5}]);
 expect(a.quote).toBe('日本語😀の引用。\n\n次の段落。');
 expect(await validateAnnotation(a,'example',body,paragraphs)).toBe(true);
 expect(await validateAnnotation(a,'example',body,[{...paragraphs[0],text:'変更'},paragraphs[1]])).toBe(false);
 expect(await decodeAnnotation('not-json','example',body,paragraphs)).toBeNull();
});
it('rejects empty, excessive and split-surrogate selections without truncation',async()=>{
 await expect(createAnnotation('example',body,paragraphs,[{anchor:paragraphs[0].anchor,start:0,end:0}])).rejects.toThrow();
 await expect(createAnnotation('example',body,paragraphs,[{anchor:paragraphs[0].anchor,start:14,end:15}])).rejects.toThrow();
 await expect(createAnnotation('example',body,[{anchor:paragraphs[0].anchor,text:'文'.repeat(241)}],[{anchor:paragraphs[0].anchor,start:0,end:241}])).rejects.toThrow();
});
it('rejects unordered and noncontiguous ranges and extra selector fields',async()=>{
 const a=await createAnnotation('example',body,paragraphs,[{anchor:paragraphs[0].anchor,start:0,end:5}]);
 expect(await validateAnnotation({...a,other:true},'example',body,paragraphs)).toBe(false);
 await expect(createAnnotation('example',body,paragraphs,[{anchor:paragraphs[1].anchor,start:0,end:5},{anchor:paragraphs[0].anchor,start:0,end:5}])).rejects.toThrow();
 await expect(createAnnotation('example',body,paragraphs,[{anchor:paragraphs[0].anchor,start:0,end:5},{anchor:paragraphs[1].anchor,start:0,end:5}])).rejects.toThrow();
});
it('parses archived selectors without pretending to validate their placement in the current article',async()=>{
 const {parseAnnotation}=await import('./commentAnnotations');
 const a=await createAnnotation('example',body,paragraphs,[{anchor:paragraphs[0].anchor,start:0,end:5}]);
 expect(parseAnnotation(encodeAnnotation(a))).toEqual(a);
 expect(parseAnnotation(encodeAnnotation({...a,segments:[{...a.segments[0],end:999}]}))).toBeNull();
 expect(parseAnnotation(encodeAnnotation({...a,quote:'違う引用'}))).toBeNull();
});
