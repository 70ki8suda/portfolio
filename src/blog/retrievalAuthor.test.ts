import {expect,it} from 'vitest';
import {completeRetrieval, authorRecipes} from '../../scripts/retrieval-author';
import {retrievalHash} from '../../scripts/retrieval-gate';
import {RETRIEVAL_ENCODER} from '../../scripts/retrieval-embeddings';
const input={id:'a:p',slug:'a',text:'設備を共同で所有する。',textHash:'raw',title:'共同所有',section:'節',previous:'',next:'',articleBody:'設備を共同で所有する。',stance:'author',context:'筆者の提案'};
const vector=Array.from({length:384},(_,i)=>i===0?1:0);
const index={subject:'共同所有',claim:input.text,question:'設備を誰が所有するか',speaker:'筆者',qualifications:'',support:input.text,contextSupport:''};
const request=()=>({version:1 as const,requestHash:'request',recipes:authorRecipes(),inputs:[input],raw:[{id:input.id,textHash:'raw',vector,x:0,y:0}],work:{index:[input.id],indexReview:[]},previous:undefined,instructions:''});
it('completes source indexing, exact review and encoding; reuses a fresh store without AI',async()=>{
 const calls:string[]=[];
 const generate=async(kind:string,packet:any)=>{calls.push(kind);if(kind==='index')return {entries:[{id:input.id,...index}]};return {reviews:packet.tasks.map((t:any)=>({id:t.id,targetHash:t.targetHash,verdict:'pass',note:'原文照合'}))};};
 const encode=async(entries:{id:string;text:string;textHash:string}[])=>({recipe:RETRIEVAL_ENCODER,entries:entries.map(e=>({id:e.id,textHash:e.textHash,vector,tokens:20,chunks:1,ranges:[[0,20]] as [number,number][]}))});
 const first=await completeRetrieval(request(),{generate,encode});
 expect(calls).toEqual(['index','index-review']);expect(first.indices[input.id].inputHash).toBe(retrievalHash(input));
 calls.length=0;await completeRetrieval({...request(),previous:first},{generate,encode});expect(calls).toEqual([]);
});
it('fails on unsupported recipes and failed review instead of producing a zero-result success',async()=>{
 const r=request();r.recipes.indexRecipe='f'.repeat(64);
 const noCall=async()=>{throw Error('must not call');};
 await expect(completeRetrieval(r,{generate:noCall,encode:noCall})).rejects.toThrow(/recipe/i);
 const generate=async(kind:string,packet:any)=>kind==='index'?{entries:[{id:input.id,...index}]}:{reviews:packet.tasks.map((t:any)=>({id:t.id,targetHash:t.targetHash,verdict:'fail',note:'帰属不正'}))};
 await expect(completeRetrieval(request(),{generate,encode:noCall})).rejects.toThrow(/review/i);
});
it('recomputes untouched queries after adding an article and reuses only exact reviewed pairs',async()=>{
 const make=(slug:string)=>({...input,id:slug+':p',slug,text:slug+'の設備を共同で所有する。',articleBody:slug+'の設備を共同で所有する。',textHash:slug});
 const calls:{kind:string;packet:any}[]=[];
 const generate=async(kind:string,packet:any)=>{
  calls.push({kind,packet});
  if(kind==='index')return {entries:packet.targets.map((t:any)=>({id:t.id,...index,claim:t.text,support:t.text}))};
  if(kind==='pair')return {pairs:packet.candidates.map((c:any)=>({id:c.id,grade:2,relation:'useful-context',reason:'両者は設備の共同所有を提案する。',querySupport:packet.query.text,candidateSupport:c.text}))};
  return {reviews:packet.tasks.map((t:any)=>({id:t.id,targetHash:t.targetHash,verdict:'pass',note:'原文の共有論点を確認'}))};
 };
 const encode=async(entries:{id:string;text:string;textHash:string}[])=>({recipe:RETRIEVAL_ENCODER,entries:entries.map(e=>({id:e.id,textHash:e.textHash,vector,tokens:20,chunks:1,ranges:[[0,20]] as [number,number][]}))});
 const inputs=[make('a'),make('b')],raw=inputs.map(i=>({id:i.id,textHash:i.textHash,vector,x:0,y:0}));
 const first=await completeRetrieval({...request(),inputs,raw},{generate,encode});expect(first.pairs).toHaveLength(2);
 calls.length=0;const added=make('c');
 const next=await completeRetrieval({...request(),inputs:[...inputs,added],raw:[...raw,{id:added.id,textHash:added.textHash,vector,x:0,y:0}],previous:first},{generate,encode});
 expect(next.pairs).toHaveLength(6);expect(calls.filter(c=>c.kind==='index')).toHaveLength(1);
 expect(calls.filter(c=>c.kind==='pair').map(c=>[c.packet.query.id,c.packet.candidates.map((v:any)=>v.id)])).toEqual([['a:p',['c:p']],['b:p',['c:p']],['c:p',['b:p','a:p']]]);
 expect(next.pairs.filter(p=>p.query!=='c:p'&&p.candidate!=='c:p')).toEqual(first.pairs);
});
