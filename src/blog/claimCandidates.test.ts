import {expect,it} from 'vitest';
import {claimCandidatePool,claimPairId,rankClaimPairs,type ClaimCandidate,type ClaimPairScore} from '../../scripts/claim-candidates';
const nodes:ClaimCandidate[]=[{id:'a',slug:'one',textHash:'a'.repeat(64),vector:[1,0]},{id:'b',slug:'two',textHash:'b'.repeat(64),vector:[.8,.6]},{id:'c',slug:'three',textHash:'c'.repeat(64),vector:[0,1]}];
const recipe='f'.repeat(64);
const score=(a:string,b:string,x:number):ClaimPairScore=>{const ids=[a,b].sort();return {id:claimPairId(a,b),ids,textHashes:ids.map(id=>nodes.find(n=>n.id===id)!.textHash),recipeHash:recipe,directions:[x,x],proofHash:'d'.repeat(64)};};
it('unions both directions of cross-article top24 and valid cached pairs, deterministically',()=>{
 const pool=claimCandidatePool(nodes,[],recipe);expect(pool.pairs).toHaveLength(3);expect(pool.missing).toHaveLength(3);
 expect(claimCandidatePool([...nodes].reverse(),[],recipe).hash).toBe(pool.hash);
 const reused=claimCandidatePool(nodes,[score('a','b',1)],recipe);expect(reused.reused).toHaveLength(1);expect(reused.missing).toHaveLength(2);
});
it('invalidates cached pairs for changed input/recipe or removed endpoints without interpreting them as score zero',()=>{
 const changed=structuredClone(nodes);changed[0].textHash='0'.repeat(64);
 expect(claimCandidatePool(changed,[score('a','b',1)],recipe).reused).toHaveLength(0);
 expect(claimCandidatePool(nodes,[score('a','b',1)],'e'.repeat(64)).missing).toHaveLength(3);
 expect(claimCandidatePool(nodes.slice(1),[score('a','b',1)],recipe).pairs).toHaveLength(1);
});
it('requires every candidate score before ranking and retains legitimate empty results',()=>{
 const pool=claimCandidatePool(nodes,[],recipe),rows=pool.pairs.map(p=>score(p.ids[0],p.ids[1],-10));
 expect(()=>rankClaimPairs(nodes,pool,rows,recipe)).toThrow('Incomplete');
 const final=claimCandidatePool(nodes,rows,recipe);expect(rankClaimPairs(nodes,final,rows,recipe)).toEqual({a:[],b:[],c:[]});
 rows[0].directions=[0,2];const withEdge=claimCandidatePool(nodes,rows,recipe);
 expect(Object.values(rankClaimPairs(nodes,withEdge,rows,recipe)).flat()).toHaveLength(2);
});
it('rejects duplicate/malformed complete records and bounds display to five without using tags',()=>{
 expect(()=>claimCandidatePool(nodes,[score('a','b',1),score('a','b',1)],recipe)).toThrow('Duplicate');
 const bad=score('a','b',1);bad.directions=[NaN,1];expect(()=>claimCandidatePool(nodes,[bad],recipe)).toThrow('Invalid');
 const large=Array.from({length:8},(_,i)=>({id:String(i),slug:String(i),textHash:'a'.repeat(64),vector:[1,0]}));
 const initial=claimCandidatePool(large,[],recipe);
 const rows:ClaimPairScore[]=initial.pairs.map(p=>({id:p.id,ids:p.ids,textHashes:['a'.repeat(64),'a'.repeat(64)],recipeHash:recipe,directions:[0,0],proofHash:'d'.repeat(64)}));
 const full=claimCandidatePool(large,rows,recipe);expect(Object.values(rankClaimPairs(large,full,rows,recipe)).every(x=>x.length===5)).toBe(true);
});
it('retains a valid cache-only pair outside both top24 lists, with deterministic ties',()=>{
 const many=Array.from({length:30},(_,i)=>({id:String(i).padStart(2,'0'),slug:String(i),textHash:'a'.repeat(64),vector:[1,0]}));
 const a='28',b='29',id=claimPairId(a,b),row:ClaimPairScore={id,ids:[a,b],textHashes:['a'.repeat(64),'a'.repeat(64)],recipeHash:recipe,directions:[0,0],proofHash:'d'.repeat(64)};
 const local=claimCandidatePool(many,[],recipe);expect(local.pairs.some(p=>p.id===id)).toBe(false);
 const union=claimCandidatePool(many,[row],recipe);expect(union.cacheAddedPairs).toBe(1);expect(union.pairs.some(p=>p.id===id)).toBe(true);
 expect(claimCandidatePool([...many].reverse(),[row],recipe).hash).toBe(union.hash);
});
