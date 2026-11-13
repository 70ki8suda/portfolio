import projectionRecipe from './projection-recipe.json';
const MODEL=projectionRecipe.model;
import { retrievalHash, type RetrievalIndex } from './retrieval-gate';
export const RETRIEVAL_ENCODER={...MODEL,algorithm:'index-subject-claim-question-chunk480-weighted-mean-l2-v1',chunkTokens:480};
export type RetrievalEmbedding={id:string;textHash:string;vector:number[];tokens:number;chunks:number;ranges:[number,number][]};
export type RetrievalEmbeddingCache={recipe:typeof RETRIEVAL_ENCODER;entries:RetrievalEmbedding[]};
export function indexEmbeddingText(index:RetrievalIndex) { return `対象: ${index.subject}\n主張: ${index.claim}\n問い: ${index.question}`; }
export function validateRetrievalEmbeddings(input:{id:string;text:string}[],value:unknown): asserts value is RetrievalEmbeddingCache {
  if (!value || typeof value!=='object') throw new Error('Missing retrieval embedding cache');
  const cache=value as RetrievalEmbeddingCache;
  if (retrievalHash(cache.recipe)!==retrievalHash(RETRIEVAL_ENCODER)) throw new Error('Stale retrieval encoder recipe');
  if (!Array.isArray(cache.entries) || cache.entries.length!==input.length || new Set(cache.entries.map(e=>e.id)).size!==input.length || new Set(input.map(e=>e.id)).size!==input.length) throw new Error('Invalid retrieval embedding coverage');
  const wanted=new Map(input.map(i=>[i.id,retrievalHash(i.text)]));
  for(const e of cache.entries) {
    if(!wanted.has(e.id) || e.textHash!==wanted.get(e.id)) throw new Error(`Stale indexed text embedding: ${e.id}`);
    if(!Array.isArray(e.vector) || e.vector.length!==MODEL.dim || !e.vector.every(Number.isFinite) || Math.abs(Math.hypot(...e.vector)-1)>.001) throw new Error('Invalid indexed vector');
    if(!Number.isSafeInteger(e.tokens) || e.tokens<1 || !Array.isArray(e.ranges) || !e.ranges.length || e.ranges.length!==e.chunks) throw new Error('Missing index token coverage');
    let end=0;
    for(const range of e.ranges) {
      if(!Array.isArray(range) || range.length!==2 || range[0]!==end || !Number.isSafeInteger(range[1]) || range[1]<=range[0] || range[1]-range[0]>480) throw new Error('Invalid index token coverage');
      end=range[1];
    }
    if(end!==e.tokens) throw new Error('Truncated index token coverage');
  }
}
