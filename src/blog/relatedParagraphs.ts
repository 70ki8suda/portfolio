export const RELATED_REASON_MAX_LENGTH=1000;
export const validRelatedReason=(value:unknown):value is string=>typeof value==='string' && !!value.trim() && value.length<=RELATED_REASON_MAX_LENGTH;
/** Explicitly reviewed results; an empty items array is a completed decision, not a fallback signal. */
export interface ReviewedRetrieval {
  version: 1;
  corpusHash: string;
  recipeHash: string;
  queries: Record<string, {
    candidateFingerprint: string;
    reviewHash: string;
    items: { id: string; reason: string }[];
  }>;
}

type RelatedState = {state:'legacy'} | {state:'invalid'} | {state:'reviewed';items:{id:string;reason:string}[]};
const object = (v: unknown): v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const hash = (v: unknown) => typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
/** Validate the entire update before displaying any query from it. Never treat malformed new data as legacy. */
export function readRelatedParagraphs(value: unknown, nodes: {id:string;slug:string}[], query: string): RelatedState {
  if (value===undefined) return {state:'legacy'};
  if (!object(value) || value.version!==1 || !hash(value.corpusHash) || !hash(value.recipeHash) || !object(value.queries)) return {state:'invalid'};
  const ids=new Map(nodes.map(n=>[n.id,n.slug]));
  if (ids.size!==nodes.length || Object.keys(value.queries).length!==ids.size || !ids.has(query)) return {state:'invalid'};
  for (const [id,entry] of Object.entries(value.queries)) {
    if (!ids.has(id) || !object(entry) || !hash(entry.candidateFingerprint) || !hash(entry.reviewHash) || !Array.isArray(entry.items) || entry.items.length>5) return {state:'invalid'};
    const seen=new Set<string>();
    for (const item of entry.items) {
      if (!object(item) || typeof item.id!=='string' || !ids.has(item.id) || ids.get(item.id)===ids.get(id) || seen.has(item.id) || !validRelatedReason(item.reason)) return {state:'invalid'};
      seen.add(item.id);
    }
  }
  return {state:'reviewed',items:(value.queries[query] as unknown as ReviewedRetrieval['queries'][string]).items};
}
