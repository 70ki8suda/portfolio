import {expect,it} from 'vitest';
import {cosineNeighbors,validateCoverage} from '../../scripts/semantic-cache';
it('ranks original cosine without a shared tag gate and keeps outgoing topK directed',()=>{
 const rows=[{id:'a',slug:'A',vector:[1,0]},{id:'b',slug:'B',vector:[.8,.6]},{id:'c',slug:'C',vector:[0,1]},{id:'d',slug:'A',vector:[1,0]}];
 const n=cosineNeighbors(rows,(a,b)=>a.slug!==b.slug,1);
 expect(n.a).toEqual([{id:'b',score:.8}]);expect(n.c).toEqual([{id:'b',score:.6}]);expect(n.b).toEqual([{id:'a',score:.8}]);
});
it('rejects article coverage gaps and missing tail even when chunk count matches',()=>{
 const e={id:'article:a',textHash:'hash',vector:[1,0],x:0,y:0,chunks:2,tokens:481,ranges:[[0,480],[480,481]] as [number,number][]};
 expect(()=>validateCoverage(e)).not.toThrow();
 expect(()=>validateCoverage({...e,ranges:[[0,479],[480,481]]})).toThrow(/coverage/);
 expect(()=>validateCoverage({...e,tokens:482})).toThrow(/coverage/);
});
