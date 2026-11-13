import { createHash } from 'node:crypto';
import recipe from './projection-recipe.json';
const sorted=(value:unknown):unknown=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sorted(v)])):value;
export const PROJECTION_RECIPE=JSON.stringify(sorted(recipe));
export const INTERPOLATION = 'cosine-knn8-inverse4-eps1e-6-vector7-coordinate7-v1';
export interface ReferenceState { id:string; recipe:string; interpolation:string; ids:string[]; vectors:number[][]; coordinates:number[][] }
export interface EmbeddingEntry { id:string;textHash:string;vector:number[];x:number;y:number;chunks?:number;tokens?:number;ranges?:[number,number][] }
const key=(row:number[])=>row.map(x=>Math.abs(x)<.00000005?'0.0000000':x.toFixed(7)).join(',');
export function validateReference(state:ReferenceState,dim:number) {
  if(state?.recipe!==PROJECTION_RECIPE)throw new Error('Incompatible projection recipe; explicit refresh required');
  if(!state || state.interpolation!==INTERPOLATION || typeof state.recipe!=='string' || !Array.isArray(state.ids) || !state.ids.length
    || state.ids.some((id,i)=>typeof id!=='string'||(i>0&&state.ids[i-1]>=id)) || !Array.isArray(state.vectors) || !Array.isArray(state.coordinates)
    || state.ids.length!==state.vectors.length || state.ids.length!==state.coordinates.length)throw new Error('Corrupt projection state; explicit refresh required');
  for(let i=0;i<state.ids.length;i++) {
    const v=state.vectors[i],p=state.coordinates[i];
    if(!Array.isArray(v)||v.length!==dim||v.some(x=>!Number.isFinite(x))||Math.abs(Math.hypot(...v)-1)>.001||!Array.isArray(p)||p.length!==2||p.some(x=>!Number.isFinite(x)))throw new Error('Invalid reference vector/coordinates');
  }
  if(new Set(state.vectors.map(key)).size!==state.ids.length)throw new Error('Duplicate reference vectors');
  const body=state.recipe+'\n'+INTERPOLATION+'\n'+state.ids.map((id,i)=>id+'|'+key(state.vectors[i])+'|'+key(state.coordinates[i])).join('\n');
  if(createHash('sha256').update(body).digest('hex')!==state.id)throw new Error('Corrupt projection hash; explicit refresh required');
}
export function validateCoverage(entry:EmbeddingEntry) {
  if(!Number.isSafeInteger(entry.tokens)||entry.tokens!<0||!Array.isArray(entry.ranges)||entry.ranges.length!==entry.chunks||!entry.ranges.length)throw new Error('Missing article token coverage');
  let end=0;
  for(const r of entry.ranges) {
    if(!Array.isArray(r)||r.length!==2||r[0]!==end||!Number.isSafeInteger(r[1])||r[1]<r[0]||r[1]-r[0]>480)throw new Error('Invalid article token coverage');
    end=r[1];
  }
  if(end!==entry.tokens)throw new Error('Truncated article token coverage');
}
export function cosineNeighbors<T extends {id:string;vector:number[]}>(entries:T[],eligible:(a:T,b:T)=>boolean,k=5) {
  return Object.fromEntries(entries.map(a=>[a.id,entries.filter(b=>b.id!==a.id&&eligible(a,b)).map(b=>({id:b.id,score:a.vector.reduce((s,x,i)=>s+x*b.vector[i],0)}))
    .sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,k).map(n=>({...n,score:Math.max(-1,Math.min(1,Number(n.score.toFixed(6))))}))]));
}

// Match Python's fixed-reference transform; never fit or consult the current corpus.
export function referenceProjector(state:ReferenceState) {
 const exact=new Map(state.vectors.map((v,i)=>[key(v),state.coordinates[i]]));
 const refs=state.vectors.map(v=>{const norm=Math.hypot(...v);return v.map(x=>x/norm);});
 return (vector:number[])=>{
  const canonical=key(vector), hit=exact.get(canonical);
  if(hit)return hit;
  const raw=canonical.split(',').map(Number),norm=Math.hypot(...raw),row=raw.map(x=>x/norm);
  const nearest=refs.map((v,i)=>({i,d:Math.max(0,1-v.reduce((s,x,j)=>s+x*row[j],0))}))
   .sort((a,b)=>a.d-b.d||a.i-b.i).slice(0,8);
  const weights=nearest.map(n=>1/(n.d+1e-6)**4),total=weights.reduce((a,b)=>a+b,0);
  return [0,1].map(axis=>Number((nearest.reduce((sum,n,i)=>sum+state.coordinates[n.i][axis]*weights[i],0)/total).toFixed(7)));
 };
}
export function validateCoordinates(entry:EmbeddingEntry,project:(vector:number[])=>number[]) {
 const point=project(entry.vector);
 if(![entry.x,entry.y].every((x,i)=>Number.isFinite(x)&&Math.abs(x-point[i])<0.000000051))
  throw new Error(`Inconsistent projected coordinates: ${entry.id}`);
}
