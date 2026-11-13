import { createHash } from 'node:crypto';

export type RetrievalInput = {
  id: string; slug: string; text: string; textHash: string; title: string; section: string;
  previous: string; next: string; articleBody: string; stance: string; context: string;
};
export type RetrievalIndex = {
  subject: string; claim: string; question: string; speaker: string; qualifications: string;
  support: string; contextSupport: string;
};
export type ReviewReceipt = {
  targetHash: string; reviewRecipe: string; reviewer: string; verdict: 'pass' | 'fail'; note: string;
};
export type PairDecision = {
  query: string; candidate: string; queryTarget: string; candidateTarget: string;
  grade: number; reason: string; recipe: string;
};
export type Candidate = { id: string; indexScore: number; rawScore: number };
export type SearchRow = { id: string; slug: string; indexVector: number[]; rawVector: number[] };

// Object insertion order is not semantic; candidate array order is.
export function retrievalHash(value: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('Nonfinite retrieval hash input');
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)]));
    if (v === undefined) throw new Error('Undefined retrieval hash input');
    return v;
  };
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function indexReviewTarget(input: RetrievalInput, index: RetrievalIndex, recipe: string) {
  return retrievalHash({kind:'index-fidelity',input,index,recipe});
}
export function pairReviewTarget(pair: PairDecision) {
  return retrievalHash({kind:'pair-fidelity',...pair});
}
export function requireReview(targetHash: string, receipt: ReviewReceipt | undefined, reviewRecipe: string): void {
  if (!receipt || receipt.targetHash !== targetHash || receipt.reviewRecipe !== reviewRecipe || receipt.verdict !== 'pass' || !receipt.reviewer?.trim() || !receipt.note?.trim()) {
    throw new Error(`Missing, failed or stale fidelity review: ${targetHash}`);
  }
}
function cosine(a: number[], b: number[]) {
  let dot=0, aa=0, bb=0;
  for (let i=0;i<a.length;i++) { dot+=a[i]*b[i]; aa+=a[i]*a[i]; bb+=b[i]*b[i]; }
  return dot/Math.sqrt(aa*bb);
}
const byId = (a: {id:string},b: {id:string}) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export function candidateLists(rows: SearchRow[], indexCount=12, rawCount=8): Record<string,{candidates:Candidate[];fingerprint:string}> {
  if (!Number.isSafeInteger(indexCount) || indexCount<1 || !Number.isSafeInteger(rawCount) || rawCount<1) throw new Error('Invalid candidate counts');
  const ids=new Set<string>(), indexDim=rows[0]?.indexVector.length, rawDim=rows[0]?.rawVector.length;
  for (const row of rows) {
    if (!row.id || !row.slug || ids.has(row.id)) throw new Error('Invalid or duplicate search ID');
    ids.add(row.id);
    for (const [vector,dimension] of [[row.indexVector,indexDim],[row.rawVector,rawDim]] as const) {
      if (!vector.length || vector.length!==dimension || !vector.every(Number.isFinite) || vector.reduce((s,v)=>s+v*v,0)<=0) throw new Error('Invalid search vector');
    }
  }
  return Object.fromEntries([...rows].sort(byId).map(query=>{
    const scored=rows.filter(r=>r.slug!==query.slug).map(r=>({id:r.id,indexScore:cosine(query.indexVector,r.indexVector),rawScore:cosine(query.rawVector,r.rawVector)}));
    const indexRank=[...scored].sort((a,b)=>b.indexScore-a.indexScore||byId(a,b));
    const rawRank=[...scored].sort((a,b)=>b.rawScore-a.rawScore||byId(a,b));
    const selected=new Set([...indexRank.slice(0,indexCount),...rawRank.slice(0,rawCount)].map(r=>r.id));
    const candidates=indexRank.filter(r=>selected.has(r.id));
    return [query.id,{candidates,fingerprint:retrievalHash({query:query.id,indexCount,rawCount,candidates})}];
  }));
}
export function selectRelated(candidates: Candidate[], decisions: {id:string;grade:number;reason:string}[]) {
  const byCandidate=new Map(decisions.map(d=>[d.id,d]));
  if (byCandidate.size!==decisions.length || decisions.length!==candidates.length || candidates.some(c=>!byCandidate.has(c.id))) throw new Error('Incomplete candidate decision coverage');
  for (const d of decisions) if (!Number.isInteger(d.grade) || d.grade<0 || d.grade>3 || !validRelatedReason(d.reason)) throw new Error('Invalid candidate grade or reason');
  return candidates.map(c=>({...c,...byCandidate.get(c.id)!})).filter(d=>d.grade>=2).sort((a,b)=>b.grade-a.grade||b.indexScore-a.indexScore||byId(a,b)).slice(0,5);
}

import { validRelatedReason, type ReviewedRetrieval } from '../src/blog/relatedParagraphs';
export type ReviewedIndex = {
  input: RetrievalInput; index: RetrievalIndex; recipe: string; review?: ReviewReceipt;
  indexVector: number[]; rawVector: number[];
};
export type ReviewedPair = PairDecision & { review?: ReviewReceipt };
export const INDEX_LIMITS = {subject:90,claim:180,question:90,speaker:100,qualifications:140,support:160,contextSupport:160} as const;
export function validateIndex(input: RetrievalInput, index: RetrievalIndex): void {
  for (const [key,limit] of Object.entries(INDEX_LIMITS)) {
    const value=index[key as keyof RetrievalIndex];
    if (typeof value!=='string' || [...value].length>limit || (!['qualifications','contextSupport'].includes(key) && !value.trim())) throw new Error(`Invalid retrieval index ${key}`);
  }
  if (!input.text.includes(index.support) || (index.contextSupport && !input.articleBody.includes(index.contextSupport))) throw new Error('Invented retrieval support');
}
export function publishRetrieval(inputs: RetrievalInput[], indices: ReviewedIndex[], pairs: ReviewedPair[], recipes: {indexRecipe:string;pairRecipe:string;reviewRecipe:string}): ReviewedRetrieval {
  const indexed=new Map(indices.map(r=>[r.input.id,r]));
  if (new Set(inputs.map(i=>i.id)).size!==inputs.length || indexed.size!==indices.length || indices.length!==inputs.length) throw new Error('Invalid index input coverage');
  const targets=new Map<string,string>();
  for (const input of inputs) {
    const entry=indexed.get(input.id);
    if (!entry || retrievalHash(entry.input)!==retrievalHash(input)) throw new Error(`Stale index input: ${input.id}`);
    if (entry.recipe!==recipes.indexRecipe) throw new Error('Stale index recipe');
    validateIndex(input,entry.index);
    const target=indexReviewTarget(input,entry.index,entry.recipe);
    requireReview(target,entry.review,recipes.reviewRecipe); targets.set(input.id,target);
  }
  const lists=candidateLists(indices.map(e=>({id:e.input.id,slug:e.input.slug,indexVector:e.indexVector,rawVector:e.rawVector})));
  const pairMap=new Map<string,ReviewedPair>();
  for (const pair of pairs) {
    const key=JSON.stringify([pair.query,pair.candidate]);
    if (pairMap.has(key)) throw new Error('Duplicate pair judgment');
    // Stale pairs may be retained in a temporary response, but never in a publication cache.
    if (!targets.has(pair.query) || !targets.has(pair.candidate)) throw new Error('Removed pair ID');
    pairMap.set(key,pair);
  }
  const queries: ReviewedRetrieval['queries']={};
  for (const input of inputs) {
    const list=lists[input.id], reviews:string[]=[];
    const decisions=list.candidates.map(candidate=>{
      const pair=pairMap.get(JSON.stringify([input.id,candidate.id]));
      if (!pair || pair.queryTarget!==targets.get(input.id) || pair.candidateTarget!==targets.get(candidate.id) || pair.recipe!==recipes.pairRecipe) throw new Error(`Missing or stale pair: ${input.id} → ${candidate.id}`);
      const {review,...decision}=pair;
      const target=pairReviewTarget(decision); requireReview(target,review,recipes.reviewRecipe); reviews.push(target);
      return {id:candidate.id,grade:pair.grade,reason:pair.reason};
    });
    queries[input.id]={candidateFingerprint:list.fingerprint,reviewHash:retrievalHash({index:targets.get(input.id),reviews}),items:selectRelated(list.candidates,decisions).map(({id,reason})=>({id,reason}))};
  }
  return {version:1,corpusHash:retrievalHash(inputs),recipeHash:retrievalHash(recipes),queries};
}
