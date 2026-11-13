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

export type LocalIndexSummary = {subject:string;claim:string;question:string;speaker:string;qualifications:string};
/** Local scores describe model ranking, never human or pair-level review. */
export interface LocalRetrieval {
  version:2;
  mode:'local-index';
  corpusHash:string;
  recipeHash:string;
  indices:Record<string,LocalIndexSummary & {inputHash:string;indexHash:string}>;
  queries:Record<string,{rankingHash:string;items:{id:string;score:number}[]}>;
}
type RelatedState = {state:'legacy'} | {state:'invalid'} | {state:'reviewed';items:{id:string;reason:string}[]}
  | {state:'local';index:LocalIndexSummary;items:{id:string;score:number;index:LocalIndexSummary}[]};
const object = (v: unknown): v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const hash = (v: unknown) => typeof v==='string' && /^[a-f0-9]{64}$/.test(v);
/** Validate the entire update before displaying any query from it. Never treat malformed new data as legacy. */
export function readRelatedParagraphs(value: unknown, nodes: {id:string;slug:string}[], query: string): RelatedState {
  if (value===undefined) return {state:'legacy'};
  if (object(value) && value.version===2) return readLocal(value,nodes,query);
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

const summaryLimits={subject:90,claim:180,question:90,speaker:100,qualifications:140} as const;
const exactKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
function readLocal(value:Record<string,unknown>,nodes:{id:string;slug:string}[],query:string):RelatedState {
  const invalid={state:'invalid'} as const;
  if(!exactKeys(value,['version','mode','corpusHash','recipeHash','indices','queries']) || value.mode!=='local-index'
    || !hash(value.corpusHash) || !hash(value.recipeHash) || !object(value.indices) || !object(value.queries))return invalid;
  const ids=new Map(nodes.map(n=>[n.id,n.slug]));
  if(ids.size!==nodes.length || !ids.has(query) || Object.keys(value.indices).length!==ids.size || Object.keys(value.queries).length!==ids.size)return invalid;
  for(const [id,index] of Object.entries(value.indices)) {
    if(!ids.has(id)||!object(index)||!exactKeys(index,['inputHash','indexHash',...Object.keys(summaryLimits)])||!hash(index.inputHash)||!hash(index.indexHash))return invalid;
    for(const [key,limit] of Object.entries(summaryLimits)) {
      const text=index[key];
      if(typeof text!=='string'||[...text].length>limit||(key!=='qualifications'&&!text.trim()))return invalid;
    }
  }
  for(const [id,entry] of Object.entries(value.queries)) {
    if(!ids.has(id)||!object(entry)||!exactKeys(entry,['rankingHash','items'])||!hash(entry.rankingHash)||!Array.isArray(entry.items)||entry.items.length>5)return invalid;
    const seen=new Set<string>();let previous:{id:string;score:number}|undefined;
    for(const item of entry.items) {
      if(!object(item)||!exactKeys(item,['id','score'])||typeof item.id!=='string'||!ids.has(item.id)||ids.get(item.id)===ids.get(id)||seen.has(item.id)
        ||typeof item.score!=='number'||!Number.isFinite(item.score))return invalid;
      if(previous&&(item.score>previous.score||(item.score===previous.score&&item.id<previous.id)))return invalid;
      seen.add(item.id);previous={id:item.id,score:item.score};
    }
  }
  const data=value as unknown as LocalRetrieval;
  const summary=(id:string):LocalIndexSummary=>{
    const {subject,claim,question,speaker,qualifications}=data.indices[id];
    return {subject,claim,question,speaker,qualifications};
  };
  return {state:'local',index:summary(query),items:data.queries[query].items.map(item=>({...item,index:summary(item.id)}))};
}
