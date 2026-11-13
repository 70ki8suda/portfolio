import {authorRecipes} from './retrieval-author';
import {createIndexCacheRequest,type IndexCacheEntry,type IndexCacheRecipes} from './retrieval-index-cache';
import {unpackIndexCache,validateIndexCacheStore} from './retrieval-index-store';
import {retrievalHash,type RetrievalInput} from './retrieval-gate';
import type {VectorCache} from './graph-pipeline';
export const INDEX_CACHE_PATH='content/graph-index-cache.json';
export function indexCacheRecipes():IndexCacheRecipes {
 const {indexRecipe,indexReviewRecipe}=authorRecipes();
 return {indexRecipe,indexReviewRecipe,
  coverageRecipe:retrievalHash({version:1,task:'Read the full original article and index. Select raw heading subtrees including the own section and every dependency needed to justify subject, claim, question, speaker and qualifications. Pass only when all five fields are covered; contextSupport alone is insufficient.'}),
  impactRecipe:retrievalHash({version:1,task:'Compare full original and current articles directly, not through an intermediate revision. Check whether any changed passage outside the selected unchanged dependencies alters the index subject, claim, question, speaker or qualifications. Pass only if all five original fields remain faithful. Unknown or changed meaning fails.'})};
}
export function cacheRequest(snapshotHash:string,inputs:RetrievalInput[],cacheText:string|null,initialize:boolean) {
 if(cacheText===null&&!initialize)throw Error('Index cache initialization requires --init-index-cache, including reply application');
 let previous:Record<string,IndexCacheEntry>={};
 if(cacheText!==null){const cache=JSON.parse(cacheText);if(cache.version!==1||retrievalHash(cache.recipes)!==retrievalHash(indexCacheRecipes()))throw Error('Incompatible index cache');previous=unpackIndexCache(cache);}
 return createIndexCacheRequest(retrievalHash({snapshotHash,initialize,cacheText}),inputs,previous,indexCacheRecipes());
}
export function checkIndexCache(inputs:RetrievalInput[],vectors:VectorCache,cacheText:string|null|undefined) {
 if(cacheText==null)return;
 validateIndexCacheStore(inputs,vectors.entries,JSON.parse(cacheText),indexCacheRecipes());
}
