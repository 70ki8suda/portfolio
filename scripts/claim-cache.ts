import {claimSource} from './claim-source';
import {prepareClaims,sha,type ClaimDraft} from './claim-preview-data';
import type {GraphData} from '../src/blog/graphTypes';

type Article=ClaimDraft['articles'][number];
export interface ClaimReview {slug:string;targetHash:string;reportHash:string;required:number;reviewer:string}
export interface ClaimOverride {slug:string;targetHash:string;scope:'claim'|'coverage';claimKeys:string[];reason:string}
export interface ClaimCache {
 version:1;state:'staging'|'active';recipeHash:string;articles:Article[];
 reviews:ClaimReview[];overrides:ClaimOverride[];
}
const hashPattern=/^[a-f0-9]{64}$/;
/** Sort object keys; array order remains part of the editorial contract. */
function canonical(value:unknown):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
 return `{${Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}
/** The report covers the whole article, including labels, coverage and supplementary arguments. */
export function claimReviewTarget(article:Article,raw:string,recipeHash:string) {
 return sha(canonical({schema:2,recipeHash,sourceHash:sha(raw),inventory:claimSource(raw),article}));
}
/** Shared pre-embedding/publication gate. Human decisions cannot exempt mechanical checks. */
export function checkClaimCache(cache:ClaimCache,sources:Record<string,string>,base:GraphData,eligibleSlugs:readonly string[],reports:Record<string,string>,expectedRecipeHash:string) {
 if(!hashPattern.test(expectedRecipeHash)||cache.recipeHash!==expectedRecipeHash)throw new Error('Expected recipe mismatch');
 if(cache.version!==1||!['staging','active'].includes(cache.state)||!hashPattern.test(cache.recipeHash)
  ||!Array.isArray(cache.articles)||!Array.isArray(cache.reviews)||!Array.isArray(cache.overrides))throw new Error('Invalid claim cache');
 if(new Set(eligibleSlugs).size!==eligibleSlugs.length)throw new Error('Duplicate eligible article');
 const slugs=cache.articles.map(a=>a.slug);
 if(new Set(slugs).size!==slugs.length)throw new Error('Duplicate claim article');
 if(slugs.some(s=>!eligibleSlugs.includes(s)))throw new Error('Ineligible claim article');
 const pendingSlugs=eligibleSlugs.filter(s=>!slugs.includes(s)).sort();
 if(cache.state==='active'&&pendingSlugs.length)throw new Error('Incomplete active claim dataset');
 if(cache.reviews.length!==slugs.length||new Set(cache.reviews.map(r=>r.slug)).size!==slugs.length||cache.reviews.some(r=>!slugs.includes(r.slug)))throw new Error('Incomplete claim reviews');
 for(const article of cache.articles){
  const raw=sources[article.slug];
  if(!raw||sha(raw)!==article.sourceHash)throw new Error(`Stale claim source: ${article.slug}`);
  const target=claimReviewTarget(article,raw,cache.recipeHash),review=cache.reviews.find(r=>r.slug===article.slug)!;
  if(review.targetHash!==target||review.required!==0||typeof review.reviewer!=='string'||!review.reviewer.trim())throw new Error(`Review target mismatch: ${article.slug}`);
  if(!hashPattern.test(review.reportHash)||typeof reports[review.reportHash]!=='string'||sha(reports[review.reportHash])!==review.reportHash)throw new Error(`Review report mismatch: ${article.slug}`);
 }
 for(const override of cache.overrides){
  const article=cache.articles.find(a=>a.slug===override.slug),review=cache.reviews.find(r=>r.slug===override.slug);
  if(!article||!review||override.targetHash!==review.targetHash||!['claim','coverage'].includes(override.scope)
   ||typeof override.reason!=='string'||!override.reason.trim()||!Array.isArray(override.claimKeys)||!override.claimKeys.length
   ||new Set(override.claimKeys).size!==override.claimKeys.length||override.claimKeys.some(k=>!article.claims.some(c=>c.key===k)))throw new Error('Override target mismatch');
 }
 const prepared=slugs.length?prepareClaims({version:2,articles:cache.articles},sources,base,slugs):{nodes:[],claims:{}};
 return {pendingSlugs,prepared};
}
