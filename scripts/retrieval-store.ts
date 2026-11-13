import { indexReviewTarget, publishRetrieval, requireReview, retrievalHash, validateIndex, type RetrievalInput, type RetrievalIndex, type ReviewReceipt, type ReviewedPair, type RetrievalRecipes } from './retrieval-gate';
import { indexEmbeddingText, validateRetrievalEmbeddings, type RetrievalEmbeddingCache } from './retrieval-embeddings';
export type { RetrievalRecipes } from './retrieval-gate';
export type RetrievalStore={
  version:1; recipes:RetrievalRecipes;
  indices:Record<string,{inputHash:string;text:string;textHash:string;index:RetrievalIndex;review?:ReviewReceipt}>;
  embeddings:RetrievalEmbeddingCache;
  pairs:ReviewedPair[];
};
export function retrievalWork(inputs:RetrievalInput[],store:RetrievalStore|undefined,recipes:RetrievalRecipes) {
  const index:string[]=[],indexReview:string[]=[];
  for(const input of inputs) {
    const entry=store?.indices?.[input.id];
    if(!entry || store?.version!==1 || store.recipes.indexRecipe!==recipes.indexRecipe || entry.inputHash!==retrievalHash(input) || entry.text!==input.text || entry.textHash!==input.textHash) {index.push(input.id);continue;}
    try {validateIndex(input,entry.index);}catch{index.push(input.id);continue;}
    try {requireReview(indexReviewTarget(input,entry.index,recipes.indexRecipe),entry.review,recipes.indexReviewRecipe);}catch{indexReview.push(input.id);}
  }
  return {index,indexReview};
}
/** Source extraction and existing graph vector validation must precede this final publication gate. */
export function readRetrievalStore(inputs:RetrievalInput[],raw:{id:string;textHash:string;vector:number[]}[],store:RetrievalStore,recipes:RetrievalRecipes) {
  if(!store || store.version!==1 || retrievalHash(store.recipes)!==retrievalHash(recipes)) throw new Error('Missing or stale retrieval store recipe');
  const work=retrievalWork(inputs,store,recipes);
  if(work.index.length)throw new Error(`Index decisions required: ${work.index.join(', ')}`);
  if(work.indexReview.length)throw new Error(`Index fidelity reviews required: ${work.indexReview.join(', ')}`);
  if(Object.keys(store.indices).length!==inputs.length)throw new Error('Stale removed retrieval indices');
  validateRetrievalEmbeddings(inputs.map(i=>({id:i.id,text:indexEmbeddingText(store.indices[i.id].index)})),store.embeddings);
  const rawMap=new Map(raw.map(e=>[e.id,e])),embedded=new Map(store.embeddings.entries.map(e=>[e.id,e]));
  if(rawMap.size!==inputs.length||rawMap.size!==raw.length)throw new Error('Invalid raw vector coverage');
  const indices=inputs.map(input=>{
    const original=rawMap.get(input.id);
    if(!original||original.textHash!==input.textHash)throw new Error(`Stale raw paragraph vector: ${input.id}`);
    const saved=store.indices[input.id];return {input,index:saved.index,recipe:recipes.indexRecipe,review:saved.review,indexVector:embedded.get(input.id)!.vector,rawVector:original.vector};
  });
  return publishRetrieval(inputs,indices,store.pairs,recipes);
}
