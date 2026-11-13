import { existsSync,readFileSync } from 'node:fs';
import { assembleGraph, type prepareGraph, type VectorCache } from './graph-pipeline';
import { retrievalInputs } from './retrieval-corpus';
import { CANDIDATE_RECIPE, retrievalHash, type RetrievalRecipes } from './retrieval-gate';
import { readRetrievalStore, retrievalWork, type RetrievalStore } from './retrieval-store';
export const RETRIEVAL_PATHS = ['content/graph-retrieval-config.json','content/graph-retrieval.json'] as const;
export type RetrievalFiles = {config:string|null;store:string|null};
type Prepared = ReturnType<typeof prepareGraph>;
export function retrievalConfig(files:RetrievalFiles): {version:1;recipes:RetrievalRecipes}|null {
  if(files.config===null) {
    if(files.store!==null)throw new Error('Retrieval store exists without configuration');
    return null;
  }
  const value=JSON.parse(files.config), keys=['indexRecipe','pairRecipe','indexReviewRecipe','pairReviewRecipe','candidateRecipe'];
  if(!value || value.version!==1 || !value.recipes || Object.keys(value).some(k=>!['version','recipes'].includes(k)) || Object.keys(value.recipes).length!==keys.length || keys.some(k=>typeof value.recipes[k]!=='string'||!/^[a-f0-9]{64}$/.test(value.recipes[k])))throw new Error('Invalid retrieval configuration');
  if(value.recipes.candidateRecipe!==CANDIDATE_RECIPE)throw new Error('Incompatible candidate policy configuration');
  return value;
}
/** Validate original embeddings and fixed coordinates before using vectors for retrieval. */
export function assembleReviewedGraph(sources:Record<string,string>,prepared:Prepared,vectors:VectorCache,files:RetrievalFiles) {
  const graph=assembleGraph(prepared,vectors),config=retrievalConfig(files);
  if(!config)return graph;
  if(files.store===null)throw new Error('Retrieval store required; run graph:update with reviewed retrieval decisions');
  const retrieval=readRetrievalStore(retrievalInputs(sources,prepared.nodes),vectors.entries,JSON.parse(files.store),config.recipes);
  return {...graph,fingerprint:retrievalHash({graph:graph.fingerprint,retrieval}),retrieval};
}
export function retrievalRequest(snapshotHash:string,sources:Record<string,string>,prepared:Prepared,vectors:VectorCache,files:RetrievalFiles) {
  assembleGraph(prepared,vectors);
  const config=retrievalConfig(files);
  if(!config)throw new Error('Retrieval configuration required');
  const inputs=retrievalInputs(sources,prepared.nodes),previous=files.store===null?undefined:JSON.parse(files.store) as RetrievalStore;
  const requestHash=retrievalHash({version:1,snapshotHash,sources,inputs,vectors,files});
  return {version:1 as const,requestHash,recipes:config.recipes,inputs,raw:vectors.entries,
    work:retrievalWork(inputs,previous,config.recipes),previous,
    instructions:'Read full article context. Generate only missing or changed indices, review their exact target hashes, embed all chunks locally, recompute candidates for every query, review every candidate decision including rejected pairs. Preserve recipe provenance. Return a complete store; missing or failed fidelity reviews block publication.'};
}
export function applyRetrievalReply(request:ReturnType<typeof retrievalRequest>,reply:unknown):RetrievalStore {
  if(!reply || typeof reply!=='object' || !('requestHash' in reply) || reply.requestHash!==request.requestHash)throw new Error('Stale retrieval reply; regenerate from the current request');
  if(!('store' in reply))throw new Error('Retrieval store missing from reply');
  const store=reply.store as RetrievalStore;
  readRetrievalStore(request.inputs,request.raw,store,request.recipes);
  return store;
}

export function readRetrievalFiles():RetrievalFiles {
 const read=(p:string)=>existsSync(p)?readFileSync(p,'utf8'):null;
 return {config:read(RETRIEVAL_PATHS[0]),store:read(RETRIEVAL_PATHS[1])};
}
