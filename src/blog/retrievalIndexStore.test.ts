import {expect,it,vi} from 'vitest';
import {packIndexCache,unpackIndexCache,completeIndexCacheStore,validateIndexCacheStore} from '../../scripts/retrieval-index-store';
import {createIndexCacheRequest,type IndexCacheEntry} from '../../scripts/retrieval-index-cache';
import {retrievalHash,indexReviewTarget,type RetrievalInput} from '../../scripts/retrieval-gate';
import {RETRIEVAL_ENCODER,indexEmbeddingText} from '../../scripts/retrieval-embeddings';
const recipes={indexRecipe:'i',indexReviewRecipe:'r',coverageRecipe:'c',impactRecipe:'m'};
const input=(id:string):RetrievalInput=>({id,slug:id,text:'本文',textHash:'t',title:'題',section:'',previous:'',next:'',articleBody:'本文',stance:'author',context:'筆者'});
function entry(i:RetrievalInput):IndexCacheEntry {const index={subject:'主題',claim:'本文',question:'問い',speaker:'筆者',qualifications:'',support:'本文',contextSupport:''};return {version:1,origin:i,index,recipe:'i',review:{targetHash:indexReviewTarget(i,index,'i'),reviewRecipe:'r',reviewer:'reviewer',verdict:'pass',note:'確認'}};}
const vector=(at=0)=>Array.from({length:384},(_,i)=>i===at?1:0);
const raw=(inputs:RetrievalInput[])=>inputs.map(i=>({id:i.id,textHash:i.textHash,vector:vector()}));
function fixture(ids=['a','b']){const inputs=ids.map(input),entries=Object.fromEntries(inputs.map(i=>[i.id,entry(i)]));const embeddings={recipe:RETRIEVAL_ENCODER,entries:inputs.map(i=>({id:i.id,textHash:retrievalHash(indexEmbeddingText(entries[i.id].index)),vector:vector(),tokens:1,chunks:1,ranges:[[0,1] as [number,number]]}))};return {inputs,entries,embeddings};}
it('deduplicates full original bodies and rejects altered or unresolved body references',()=>{
 const f=fixture(),packed=packIndexCache(f.entries);expect(Object.keys(packed.bodies)).toHaveLength(1);
 expect(unpackIndexCache(packed)).toEqual(f.entries);
 const bad=structuredClone(packed);bad.bodies[Object.keys(bad.bodies)[0]]='changed';expect(()=>unpackIndexCache(bad)).toThrow();
 delete bad.bodies[Object.keys(bad.bodies)[0]];expect(()=>unpackIndexCache(bad)).toThrow();
});
it('unchanged inputs require zero encoder calls, recompute candidates and reject tampering',async()=>{
 const f=fixture(),request=createIndexCacheRequest('s',f.inputs,f.entries,recipes),encode=vi.fn();
 const store=await completeIndexCacheStore(request,{requestHash:request.requestHash,entries:f.entries},raw(f.inputs),f.embeddings,encode);
 expect(encode).not.toHaveBeenCalled();expect(Object.keys(store.candidates)).toEqual(['a','b']);
 expect(()=>validateIndexCacheStore(f.inputs,raw(f.inputs),store,recipes)).not.toThrow();
 store.candidates.a.fingerprint='bad';expect(()=>validateIndexCacheStore(f.inputs,raw(f.inputs),store,recipes)).toThrow();
});
it('removes deleted references without encoding and recomputes old queries when readded',async()=>{
 const f=fixture(),encode=vi.fn(),one=[f.inputs[0]],request=createIndexCacheRequest('s',one,f.entries,recipes);
 const store=await completeIndexCacheStore(request,{requestHash:request.requestHash,entries:{a:f.entries.a}},raw(one),f.embeddings,encode);
 expect(encode).not.toHaveBeenCalled();expect(store.embeddings.entries.map(e=>e.id)).toEqual(['a']);expect(store.candidates.a.candidates).toEqual([]);
 const next=createIndexCacheRequest('s2',f.inputs,unpackIndexCache(store),recipes);expect(next.work.b.kind).toBe('index');
 const restored=await completeIndexCacheStore(next,{requestHash:next.requestHash,entries:f.entries},raw(f.inputs),f.embeddings,encode);
 expect(restored.candidates.a.candidates.map(c=>c.id)).toEqual(['b']);expect(encode).not.toHaveBeenCalled();
});
it('rejects stale raw source before computing candidates or loading an encoder',async()=>{
 const f=fixture(),request=createIndexCacheRequest('s',f.inputs,f.entries,recipes),encode=vi.fn();
 await expect(completeIndexCacheStore(request,{requestHash:request.requestHash,entries:f.entries},[{...raw(f.inputs)[0],textHash:'stale'}],f.embeddings,encode)).rejects.toThrow();expect(encode).not.toHaveBeenCalled();
});

import {completeIndexEntries} from '../../scripts/retrieval-index-author';
it('index-only author makes zero calls on unchanged input and only index/review calls on one direct edit',async()=>{
 const f=fixture(),generate=vi.fn(),request=createIndexCacheRequest('s',f.inputs,f.entries,recipes);
 await completeIndexEntries(request,generate,'reviewer');expect(generate).not.toHaveBeenCalled();
 const inputs=[{...f.inputs[0],previous:'留保'},f.inputs[1]],next=createIndexCacheRequest('s2',inputs,f.entries,recipes);
 generate.mockImplementation(async(kind,packet)=>kind==='index'?{entries:packet.targets.map((t:{id:string})=>({id:t.id,...f.entries[t.id].index}))}:{reviews:packet.tasks.map((t:{id:string;targetHash:string})=>({...t,verdict:'pass',note:'照合'}))});
 const result=await completeIndexEntries(next,generate,'reviewer');
 expect(generate.mock.calls.map(c=>c[0])).toEqual(['index','index-review']);expect(result.entries.b).toEqual(f.entries.b);
 expect(result.entries.a.origin.previous).toBe('留保');
});
