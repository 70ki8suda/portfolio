import { expect, it } from 'vitest';
import { RETRIEVAL_ENCODER, indexEmbeddingText, validateRetrievalEmbeddings } from '../../scripts/retrieval-embeddings';
import { retrievalHash } from '../../scripts/retrieval-gate';
const index={subject:'対象',claim:'条件付きの主張',question:'具体的な問い',speaker:'筆者',qualifications:'条件',support:'対象',contextSupport:''};
it('preserves fixed field order and binds embedding cache to exact indexed text',()=>{
 const text=indexEmbeddingText(index);expect(text).toBe('対象: 対象\n主張: 条件付きの主張\n問い: 具体的な問い');
 const vector=Array.from({length:384},(_,i)=>i===0?1:0);
 const input=[{id:'a:p',text}],entry={id:'a:p',textHash:retrievalHash(text),vector,tokens:500,chunks:2,ranges:[[0,480],[480,500]]};
 const cache={recipe:RETRIEVAL_ENCODER,entries:[entry]};expect(()=>validateRetrievalEmbeddings(input,cache)).not.toThrow();
 for(const broken of [{...cache,recipe:{...RETRIEVAL_ENCODER,prefix:'passage: '}},{...cache,entries:[{...entry,textHash:'old'}]},{...cache,entries:[{...entry,ranges:[[0,480],[480,490]]}]},{...cache,entries:[{...entry,vector:vector.slice(1)}]},{...cache,entries:[]},{...cache,entries:[entry,entry]}]) expect(()=>validateRetrievalEmbeddings(input,broken)).toThrow();
 expect(()=>validateRetrievalEmbeddings([{id:'a:p',text:text+'変化'}],cache)).toThrow();
});
