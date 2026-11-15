import { createHash } from 'node:crypto';
import {claimSource} from './claim-source';
import type { GraphData, GraphNode } from '../src/blog/graphTypes';
import type { ClaimSummary } from '../src/blog/claimPreview';
import { digest } from './graph-corpus';
import { MODEL, ALGORITHM, type VectorCache } from './graph-pipeline';
import { referenceProjector, validateCoordinates, validateReference } from './semantic-cache';
import { isGraphPayload } from '../src/blog/graphRefresh';

export const CLAIM_PREVIEW_SLUGS = ['less-is-more-and-more-from-less', 'solarpunk-and-dacc', 'garys-economics-guide'];
export interface ClaimDraft {
  version: 2;
  articles: {slug:string;sourceHash:string;claims:{key:string;sectionId:string;label?:string;summary:string;speaker:string;stance:NonNullable<GraphNode['stance']>;conditions:string[];evidence:({anchor:string;quote:string}|{blockId:string;quote:string})[];additionalSections?:string[]}[];
    coverage:{sectionId:string;claimKeys:string[];note:string}[]}[];
}
export const sha = (text:string) => createHash('sha256').update(text).digest('hex');
const fail = (message:string):never => {throw new Error(message);};
/** Source identity and every cited span are checked before summaries can become graph data. */
export function prepareClaims(draft:ClaimDraft, sources:Record<string,string>, base:GraphData) {
  if(draft.version!==2 || !Array.isArray(draft.articles) || draft.articles.length!==3
    || new Set(draft.articles.map(a=>a.slug)).size!==3 || draft.articles.some(a=>!CLAIM_PREVIEW_SLUGS.includes(a.slug))) fail('Expected exact three articles');
  const claims:Record<string,ClaimSummary>={};
  const nodes: (GraphNode & {textHash:string;embeddingText:string})[]=[];
  for(const article of draft.articles) {
    const raw=sources[article.slug];
    if(!raw || sha(raw)!==article.sourceHash) fail(`Stale source: ${article.slug}`);
    const inventory=claimSource(raw),paragraphs=inventory.paragraphs;
    const sections=new Set(inventory.sections.map(s=>s.id));
    const coverage=new Map(article.coverage.map(c=>[c.sectionId,c]));
    if(coverage.size!==article.coverage.length || sections.size!==coverage.size || [...sections].some(s=>!coverage.has(s))) fail(`Incomplete section inventory: ${article.slug}`);
    const keys=new Set(article.claims.map(c=>c.key));
    if(!keys.size || keys.size!==article.claims.length || article.coverage.some(c=>!c.note.trim() || c.claimKeys.some(k=>!keys.has(k)))) fail('Invalid coverage');
    for(const c of article.claims) {
      if(!/^[a-zA-Z0-9_-]+$/.test(c.key)||!c.summary.trim()||!c.speaker.trim()||!sections.has(c.sectionId)
        ||!['source','author','critic','mixed'].includes(c.stance)||!Array.isArray(c.conditions)||c.conditions.some(x=>typeof x!=='string'||!x.trim())
        ||!Array.isArray(c.evidence)||!c.evidence.length||!coverage.get(c.sectionId)?.claimKeys.includes(c.key)) fail('Invalid claim');
      const evidence=c.evidence.map(e=>{
        if('blockId' in e){
          const block=inventory.blocks.find(b=>b.id===e.blockId);
          if(!block||!e.quote.trim()||!block.text.includes(e.quote)||!block.anchor)fail(`Block evidence mismatch: ${article.slug}/${c.key}`);
          return {anchor:block!.anchor,text:block!.text,kind:'block' as const,sourceHash:article.sourceHash,startByte:block!.startByte,endByte:block!.endByte};
        }
        const p=paragraphs.find(p=>p.anchor===e.anchor);
        if(!p||!e.quote.trim()||!p.text.includes(e.quote))fail(`Evidence mismatch: ${article.slug}/${c.key}/${e.anchor}`);
        return {anchor:e.anchor,text:p!.text,kind:'paragraph' as const};
      }).filter((e,i,all)=>all.findIndex(x=>x.anchor===e.anchor&&x.text===e.text)===i);
      const anchor=`claim-${sha(JSON.stringify([article.slug,c.key,c.summary,c.speaker,c.conditions,c.evidence])).slice(0,20)}`;
      const id=`${article.slug}:${anchor}`;
      const primary=paragraphs.find(p=>p.anchor===evidence[0].anchor)??paragraphs.find(p=>p.sectionId===c.sectionId);
      if(!primary)fail(`Missing source location: ${c.key}`);
      // Tags remain navigation aids, never a candidate gate. Use reviewed evidence tags only.
      const tags=[...new Set(evidence.flatMap(e=>base.nodes.find(n=>n.slug===article.slug&&n.anchor===e.anchor)?.tags??[]))].slice(0,3);
      const embeddingText=[c.summary,`話者：${c.speaker}`,...c.conditions].join('\n');
      claims[id]={label:c.label,speaker:c.speaker,conditions:c.conditions,evidence};
      nodes.push({id,slug:article.slug,anchor,section:inventory.sections.find(s=>s.id===c.sectionId)!.path,sectionId:c.sectionId,kind:'paragraph',order:primary!.order,text:c.summary,
        context:c.speaker,stance:c.stance,tags,x:0,y:0,textHash:digest(embeddingText),embeddingText});
    }
  }
  return {nodes,claims};
}

/** Same singleton/bundle ranking for the display and frozen evaluation. Vectors use the production L2, 7-decimal wire representation. */
export function rankClaimCandidates(queries:number[][], candidates:{id:string;slug:string;vector:number[]}[], slug:string) {
  if(!queries.length)fail('Missing query bundle');
  return candidates.filter(c=>c.slug!==slug).map(c=>({id:c.id,score:Math.max(...queries.map(q=>Math.max(-1,Math.min(1,q.reduce((s,x,i)=>s+x*c.vector[i],0)))))}))
    .sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
export const displayClaimCandidates = (ranked:{id:string;score:number}[]) => ranked.filter(c=>c.score>=.89).slice(0,5);

/** Both modes use the identical fixed cross-article ranking and cutoff; no edited edges or pair judgments. */
export function previewGraph(base:GraphData,nodes:GraphNode[],cache:VectorCache,mode:'paragraphs'|'claims',claims:Record<string,ClaimSummary>={}, expectedHashes?:Record<string,string>):GraphData {
  if(JSON.stringify(cache.model)!==JSON.stringify(MODEL)||cache.algorithm!==ALGORITHM)fail('Incompatible model');
  validateReference(cache.reference,MODEL.dim);
  if(cache.reference.id!==base.projection.id)fail('Projection changed');
  const vectors=new Map(cache.entries.map(e=>[e.id,e])); const project=referenceProjector(cache.reference);
  for(const n of nodes){const v=vectors.get(n.id);if(!v||v.vector.length!==MODEL.dim||v.vector.some(x=>!Number.isFinite(x))||Math.abs(Math.hypot(...v.vector)-1)>.001)fail('Missing vector');
    if(expectedHashes && v!.textHash!==expectedHashes[n.id])fail('Stale vector');validateCoordinates(v!,project);}
  const articles=base.articles.filter(a=>CLAIM_PREVIEW_SLUGS.includes(a.slug));
  const articleVectors=new Map(cache.articleEntries.map(e=>[e.id,e]));
  for(const a of articles){const v=articleVectors.get(`article:${a.slug}`);if(!v||v.x!==a.x||v.y!==a.y)fail('Article coordinates changed');validateCoordinates(v!,project);}
  const articleNeighbors=Object.fromEntries(articles.map(a=>[`article:${a.slug}`,articles.filter(b=>b.slug!==a.slug).map(b=>({id:`article:${b.slug}`,score:Math.max(-1,Math.min(1,articleVectors.get(`article:${a.slug}`)!.vector.reduce((s,x,i)=>s+x*articleVectors.get(`article:${b.slug}`)!.vector[i],0)))})).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id))]));
  const candidates=nodes.map(n=>({id:n.id,slug:n.slug,vector:vectors.get(n.id)!.vector}));
  const ranked=Object.fromEntries(nodes.map(n=>[n.id,displayClaimCandidates(rankClaimCandidates([vectors.get(n.id)!.vector],candidates,n.slug))]));
  const result:GraphData={...base,version:2,preview:{version:1,mode,baselineCount:base.nodes.filter(n=>CLAIM_PREVIEW_SLUGS.includes(n.slug)).length,claims},
    fingerprint:digest({mode,nodes,ranked,claims}),retrieval:undefined,articles,nodes:nodes.map(n=>({...n,x:vectors.get(n.id)!.x,y:vectors.get(n.id)!.y})),
    concepts:base.concepts.filter(c=>nodes.some(n=>n.tags.includes(c.id))),semanticNeighbors:ranked,
    conceptNeighbors:Object.fromEntries(nodes.map(n=>[n.id,[]])),articleNeighbors,
    edges:Object.entries(ranked).flatMap(([source,list])=>list.map(({id:target,score})=>({source,target,score,kind:'semantic' as const})))};
  if(!isGraphPayload(result))fail('Invalid preview payload');return result;
}
