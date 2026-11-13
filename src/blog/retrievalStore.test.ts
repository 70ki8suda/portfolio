import {CANDIDATE_RECIPE} from '../../scripts/retrieval-gate';
import { expect,it } from 'vitest';
import { readRetrievalStore, retrievalWork, type RetrievalStore } from '../../scripts/retrieval-store';
import { retrievalHash, indexReviewTarget, type RetrievalInput } from '../../scripts/retrieval-gate';
import { RETRIEVAL_ENCODER,indexEmbeddingText } from '../../scripts/retrieval-embeddings';
const input:RetrievalInput={id:'a:p',slug:'a',title:'問い',section:'節',text:'問いの説明です。',textHash:'original',previous:'',next:'',articleBody:'問いの説明です。',stance:'author',context:'筆者'};
const recipes={candidateRecipe:CANDIDATE_RECIPE,indexRecipe:'index',pairRecipe:'pair',indexReviewRecipe:'review',pairReviewRecipe:'review'};
const index={subject:'問い',claim:'問いの説明です。',question:'どんな問いか',speaker:'筆者',qualifications:'',support:'問いの説明です。',contextSupport:''};
const vector=Array.from({length:384},(_,i)=>i===0?1:0);
function store():RetrievalStore{return {version:1,recipes,indices:{'a:p':{inputHash:retrievalHash(input),text:input.text,textHash:input.textHash,index,review:{targetHash:indexReviewTarget(input,index,recipes.indexRecipe),reviewRecipe:recipes.indexReviewRecipe,reviewer:'independent',verdict:'pass',note:'原文照合'}}},embeddings:{recipe:RETRIEVAL_ENCODER,entries:[{id:'a:p',textHash:retrievalHash(indexEmbeddingText(index)),vector,tokens:20,chunks:1,ranges:[[0,20]]}]},pairs:[]};}
it('accepts fully reviewed no-cross-article corpus and rejects stale embedding provenance',()=>{
 const s=store();expect(readRetrievalStore([input],[{id:input.id,textHash:input.textHash,vector}],s,recipes).queries['a:p'].items).toEqual([]);
 s.embeddings.entries[0].textHash='stale';expect(()=>readRetrievalStore([input],[{id:input.id,textHash:input.textHash,vector}],s,recipes)).toThrow();
});
it('plans explicit missing decisions and invalidates article context changes',()=>{
 expect(retrievalWork([input],undefined,recipes).index).toEqual(['a:p']);
 expect(retrievalWork([input],store(),recipes).index).toEqual([]);
 expect(retrievalWork([{...input,articleBody:input.articleBody+'別節の追加'}],store(),recipes).index).toEqual(['a:p']);
 const s=store();s.indices['a:p'].review=undefined;expect(retrievalWork([input],s,recipes).indexReview).toEqual(['a:p']);
});
it('cannot publish with raw vector text from another paragraph or missing receipts',()=>{
 const s=store();expect(()=>readRetrievalStore([input],[{id:input.id,textHash:'other',vector}],s,recipes)).toThrow(/raw/i);
 s.indices['a:p'].review=undefined;expect(()=>readRetrievalStore([input],[{id:input.id,textHash:input.textHash,vector}],s,recipes)).toThrow(/review/i);
});
