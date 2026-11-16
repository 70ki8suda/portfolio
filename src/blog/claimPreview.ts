import type { GraphData, GraphNode } from './graphTypes';

export type ClaimPreviewMode = 'paragraphs' | 'claims' | 'exploratory' | 'rollout';
export interface ClaimEvidence { anchor: string; text: string; kind?: 'paragraph' | 'block'; sourceHash?:string; startByte?:number; endByte?:number }
export interface ClaimRelatedPoint {text:string;speaker:string;conditions:string[];evidence:ClaimEvidence[]}
export interface ClaimSummary {relatedPoints?:ClaimRelatedPoint[]; label?:string; speaker: string; conditions: string[]; evidence: ClaimEvidence[] }
export interface ExploratoryLinks {
  /** v1 is the saved six-origin comparison; v2 covers all 53 origins. */
  version: 1 | 2;
  model: 'bge-reranker-v2-m3';
  threshold: number;
  queryIds: string[];
  neighbors: Record<string, {id:string;score:number}[]>;
  sourceHashes: string[];
}
export const isClaimPreview = (mode?: ClaimPreviewMode) => mode === 'claims' || mode === 'exploratory' || mode === 'rollout';
export interface ClaimPreview {
  exploration?: ExploratoryLinks;
  version: 1;
  mode: ClaimPreviewMode;
  baselineCount: number;
  ranking: {threshold:0.89;maxCandidates:5};
  claims: Record<string, ClaimSummary>;
}
export function claimPreviewMode(value: unknown, enabled: boolean): ClaimPreviewMode | undefined {
  return enabled && (value === 'paragraphs' || value === 'claims' || value === 'exploratory' || value === 'rollout') ? value : undefined;
}
export const claimPreviewUrl = (mode: ClaimPreviewMode) => `/__claim-preview/${mode}.json`;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const validEvidence=(e:unknown) => record(e) && typeof e.anchor === 'string'
  && /^(?:p-[a-f0-9]{16}(?:-[0-9]+)?(?:-p)*|[a-z][a-z0-9-]*)$/.test(e.anchor) && text(e.text)
  && (e.kind === undefined || e.kind === 'paragraph' || (e.kind === 'block' && typeof e.sourceHash==='string'
    && /^[a-f0-9]{64}$/.test(e.sourceHash) && Number.isSafeInteger(e.startByte) && Number.isSafeInteger(e.endByte)
    && (e.startByte as number)>=0 && (e.endByte as number)>(e.startByte as number)));
const validPoint=(c:unknown) => record(c) && text(c.speaker) && Array.isArray(c.conditions) && c.conditions.every(text)
  && Array.isArray(c.evidence) && c.evidence.length>0 && c.evidence.every(validEvidence);
export const validClaimSummary=(c:unknown):c is ClaimSummary => record(c) && validPoint(c) && (c.label===undefined||text(c.label))
  && (c.relatedPoints===undefined || Array.isArray(c.relatedPoints)&&c.relatedPoints.every(p=>record(p)&&text(p.text)&&validPoint(p)));
/** Development metadata must be complete; an empty valid candidate list is not a malformed dataset. */
export function validClaimPreview(value: unknown, nodes: GraphNode[]): value is ClaimPreview {
  if (!record(value) || value.version !== 1 || value.mode === 'rollout' || !claimPreviewMode(value.mode, true)
    || !Number.isInteger(value.baselineCount) || (value.baselineCount as number) < 1 || !record(value.claims)
    || !record(value.ranking) || value.ranking.threshold!==.89 || value.ranking.maxCandidates!==5) return false;
  if (value.mode === 'exploratory' ? !validExploration(value.exploration,nodes) : value.exploration !== undefined) return false;
  if (value.mode === 'paragraphs') return Object.keys(value.claims).length === 0 && value.baselineCount === nodes.length;
  const ids = new Set(nodes.map(n => n.id));
  return Object.keys(value.claims).length === nodes.length && Object.entries(value.claims).every(([id,c]) => ids.has(id)
    && record(c) && validPoint(c) && (c.label===undefined||text(c.label))
    && (c.relatedPoints===undefined || Array.isArray(c.relatedPoints)&&c.relatedPoints.every(p=>record(p)&&text(p.text)&&validPoint(p))));
}
export const originalAnchor = (data: GraphData, node: GraphNode) => (data.claims?.summaries??data.preview?.claims)?.[node.id]?.evidence[0]?.anchor ?? node.anchor;
export const claimSearchText = (data: GraphData, node: GraphNode) => {
  const c = (data.claims?.summaries??data.preview?.claims)?.[node.id];
  return c ? `${c.speaker} ${c.conditions.join(' ')} ${c.evidence.map(e => e.text).join(' ')} ${(c.relatedPoints??[]).map(p=>[p.text,p.speaker,...p.conditions,...p.evidence.map(e=>e.text)].join(' ')).join(' ')}` : '';
};

function validExploration(value: unknown, nodes: GraphNode[]): value is ExploratoryLinks {
  if (!record(value) || (value.version !== 1 && value.version !== 2) || value.model !== 'bge-reranker-v2-m3' || nodes.length !== 53
    || typeof value.threshold !== 'number' || !Number.isFinite(value.threshold)
    || !Array.isArray(value.sourceHashes) || value.sourceHashes.length!==3 || !value.sourceHashes.every(h=>typeof h==='string' && /^[a-f0-9]{64}$/.test(h))
    || !Array.isArray(value.queryIds) || value.queryIds.length!==(value.version===2?53:6) || new Set(value.queryIds).size!==(value.version===2?53:6) || !record(value.neighbors)) return false;
  const map=new Map(nodes.map(n=>[n.id,n]));
  if(!value.queryIds.every(id=>typeof id==='string' && map.has(id)) || Object.keys(value.neighbors).length!==(value.version===2?53:6)) return false;
  return Object.entries(value.neighbors).every(([id,list])=>value.queryIds instanceof Array && value.queryIds.includes(id)
    && Array.isArray(list) && list.length<=5 && new Set(list.map(n=>n?.id)).size===list.length
    && list.every((n,i)=>record(n)&&typeof n.id==='string' && map.has(n.id) && map.get(n.id)!.slug!==map.get(id)!.slug
      && typeof n.score==='number' && Number.isFinite(n.score) && n.score >= (value.threshold as number)
      && (i===0 || list[i-1].score>=n.score)));
}
