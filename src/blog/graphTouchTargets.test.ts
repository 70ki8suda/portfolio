import {describe,it,expect} from 'vitest';
import {touchTargets} from './graphTouchTargets';
describe('touch ambiguity',()=>{
 it('keeps every distinct nearby point, including exactly overlapping nodes',()=>{const a=[{id:'b',kind:'node',x:0,y:0},{id:'a',kind:'node',x:0,y:0},{id:'edge',kind:'node',x:22,y:0},{id:'outside',kind:'node',x:22.01,y:0}];expect(touchTargets(a,{x:0,y:0}).map(n=>n.id)).toEqual(['a','b','edge']);expect(a[0].id).toBe('b');});
 it('uses circular 44px diameter and returns no fabricated target',()=>{expect(touchTargets([{id:'a',kind:'node',x:20,y:20}],{x:0,y:0})).toEqual([]);});
});
