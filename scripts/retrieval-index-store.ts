import {applyIndexCacheReply,indexCacheWork,type IndexCacheEntry,type IndexCacheRequest,type IndexCacheRecipes} from './retrieval-index-cache';
import {candidateLists,CANDIDATE_RECIPE,retrievalHash,type RetrievalInput} from './retrieval-gate';
import {indexEmbeddingText,validateRetrievalEmbeddings,type RetrievalEmbeddingCache} from './retrieval-embeddings';
type PackedEntries={bodies:Record<string,string>;entries:Record<string,Omit<IndexCacheEntry,'origin'>&{origin:Omit<RetrievalInput,'articleBody'>;bodyHash:string}>};
export type IndexCacheStore=PackedEntries&{version:1;recipes:IndexCacheRecipes;candidateRecipe:string;embeddings:RetrievalEmbeddingCache;candidates:ReturnType<typeof candidateLists>};
type Raw={id:string;textHash:string;vector:number[]}[];
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export function packIndexCache(entries:Record<string,IndexCacheEntry>):PackedEntries {
 const bodies:Record<string,string>={},packed:PackedEntries['entries']={};
 for(const [id,entry] of Object.entries(entries)){
  if(id!==entry.origin.id)throw Error('Index cache ID mismatch');
  const {articleBody,...origin}=entry.origin,bodyHash=retrievalHash(articleBody);
  bodies[bodyHash]=articleBody;packed[id]={...entry,origin,bodyHash};
 }
 return {bodies,entries:packed};
}
export function unpackIndexCache(value:unknown):Record<string,IndexCacheEntry> {
 if(!record(value)||!record(value.bodies)||!record(value.entries))throw Error('Invalid index cache bodies/entries');
 const bodies=value.bodies,used=new Set<string>(),entries:Record<string,IndexCacheEntry>={};
 for(const [hash,body] of Object.entries(bodies))if(typeof body!=='string'||retrievalHash(body)!==hash)throw Error('Altered cache body');
 for(const [id,entry] of Object.entries(value.entries)){
  if(!record(entry)||!record(entry.origin)||typeof entry.bodyHash!=='string'||!Object.hasOwn(bodies,entry.bodyHash)||entry.origin.id!==id||Object.hasOwn(entry.origin,'articleBody'))throw Error('Invalid cache origin');
  const {bodyHash,...rest}=entry;used.add(bodyHash);
  entries[id]={...rest,origin:{...entry.origin,articleBody:bodies[bodyHash]}} as IndexCacheEntry;
 }
 if(used.size!==Object.keys(bodies).length)throw Error('Unreferenced cache body');
 return entries;
}
function searchRows(inputs:RetrievalInput[],embeddings:RetrievalEmbeddingCache,raw:Raw) {
 const embedded=new Map(embeddings.entries.map(e=>[e.id,e.vector])),original=new Map(raw.map(e=>[e.id,e]));
 if(original.size!==raw.length||original.size!==inputs.length)throw Error('Raw cache coverage mismatch');
 return inputs.map(i=>{const r=original.get(i.id);if(!r||r.textHash!==i.textHash)throw Error('Stale raw input');return {id:i.id,slug:i.slug,indexVector:embedded.get(i.id)!,rawVector:r.vector};});
}
function checkRaw(inputs:RetrievalInput[],raw:Raw){
 if(raw.length!==inputs.length||new Set(raw.map(r=>r.id)).size!==raw.length)throw Error('Raw cache coverage mismatch');
 const map=new Map(raw.map(r=>[r.id,r]));
 for(const i of inputs){const r=map.get(i.id);if(!r||r.textHash!==i.textHash||r.vector.length!==384||!r.vector.every(Number.isFinite)||Math.abs(Math.hypot(...r.vector)-1)>.001)throw Error('Stale or invalid raw input');}
}
/** Source vectors must additionally have passed assembleGraph's full model/projection gate. */
export function validateIndexCacheStore(inputs:RetrievalInput[],raw:Raw,value:unknown,recipes:IndexCacheRecipes):asserts value is IndexCacheStore {
 if(!record(value)||value.version!==1||value.candidateRecipe!==CANDIDATE_RECIPE||retrievalHash(value.recipes)!==retrievalHash(recipes))throw Error('Incompatible index cache recipes');
 const store=value as IndexCacheStore,entries=unpackIndexCache(store);
 if(Object.keys(entries).length!==inputs.length||inputs.some(i=>!Object.hasOwn(entries,i.id)||indexCacheWork(i,entries[i.id],recipes).kind!=='reuse'))throw Error('Stale or unreviewed index cache');
 checkRaw(inputs,raw);validateRetrievalEmbeddings(inputs.map(i=>({id:i.id,text:indexEmbeddingText(entries[i.id].index)})),store.embeddings);
 const expected=candidateLists(searchRows(inputs,store.embeddings,raw));
 if(retrievalHash(expected)!==retrievalHash(store.candidates))throw Error('Stale local candidates');
}
export async function completeIndexCacheStore(request:IndexCacheRequest,reply:unknown,raw:Raw,previous:RetrievalEmbeddingCache,encode:(input:{id:string;text:string;textHash:string}[],previous:RetrievalEmbeddingCache)=>Promise<RetrievalEmbeddingCache>):Promise<IndexCacheStore> {
 const entries=applyIndexCacheReply(request,reply);checkRaw(request.inputs,raw);
 const wanted=request.inputs.map(i=>({id:i.id,text:indexEmbeddingText(entries[i.id].index)})),ids=new Set(wanted.map(i=>i.id));
 // Delete-only updates do not require a model invocation.
 let embeddings={...previous,entries:previous.entries.filter(e=>ids.has(e.id))};
 try{validateRetrievalEmbeddings(wanted,embeddings);}catch{
  embeddings=await encode(wanted.map(i=>({...i,textHash:retrievalHash(i.text)})),embeddings);validateRetrievalEmbeddings(wanted,embeddings);
 }
 const store:IndexCacheStore={version:1,recipes:request.recipes,candidateRecipe:CANDIDATE_RECIPE,...packIndexCache(entries),embeddings,candidates:candidateLists(searchRows(request.inputs,embeddings,raw))};
 validateIndexCacheStore(request.inputs,raw,store,request.recipes);return store;
}
