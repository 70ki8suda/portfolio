import type { GraphData, GraphNode } from './graphTypes';

export type ClaimPreviewMode = 'paragraphs' | 'claims';
export interface ClaimEvidence { anchor: string; text: string; kind?: 'paragraph' | 'block'; sourceHash?:string; startByte?:number; endByte?:number }
export interface ClaimSummary { label?:string; speaker: string; conditions: string[]; evidence: ClaimEvidence[] }
export interface ClaimPreview {
  version: 1;
  mode: ClaimPreviewMode;
  baselineCount: number;
  claims: Record<string, ClaimSummary>;
}
export function claimPreviewMode(value: unknown, enabled: boolean): ClaimPreviewMode | undefined {
  return enabled && (value === 'paragraphs' || value === 'claims') ? value : undefined;
}
export const claimPreviewUrl = (mode: ClaimPreviewMode) => `/__claim-preview/${mode}.json`;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
/** Development metadata must be complete; an empty valid candidate list is not a malformed dataset. */
export function validClaimPreview(value: unknown, nodes: GraphNode[]): value is ClaimPreview {
  if (!record(value) || value.version !== 1 || !claimPreviewMode(value.mode, true)
    || !Number.isInteger(value.baselineCount) || (value.baselineCount as number) < 1 || !record(value.claims)) return false;
  if (value.mode === 'paragraphs') return Object.keys(value.claims).length === 0 && value.baselineCount === nodes.length;
  const ids = new Set(nodes.map(n => n.id));
  return Object.keys(value.claims).length === nodes.length && Object.entries(value.claims).every(([id, c]) => ids.has(id) && record(c)
    && text(c.speaker) && Array.isArray(c.conditions) && c.conditions.every(text)
    && Array.isArray(c.evidence) && c.evidence.length > 0 && c.evidence.every(e => record(e)
      && typeof e.anchor === 'string' && /^(?:p-[a-f0-9]{16}(?:-[0-9]+)?(?:-p)*|[a-z][a-z0-9-]*)$/.test(e.anchor) && text(e.text)
      && (e.kind === undefined || e.kind === 'paragraph' || (e.kind === 'block' && typeof e.sourceHash==='string' && /^[a-f0-9]{64}$/.test(e.sourceHash) && Number.isSafeInteger(e.startByte) && Number.isSafeInteger(e.endByte) && (e.startByte as number)>=0 && (e.endByte as number)>(e.startByte as number)))));
}
export const originalAnchor = (data: GraphData, node: GraphNode) => data.preview?.claims[node.id]?.evidence[0]?.anchor ?? node.anchor;
export const claimSearchText = (data: GraphData, node: GraphNode) => {
  const c = data.preview?.claims[node.id];
  return c ? `${c.speaker} ${c.conditions.join(' ')} ${c.evidence.map(e => e.text).join(' ')}` : '';
};
