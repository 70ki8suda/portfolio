/** Public graph payload: no models, raw vectors, drafts or non-opted-in articles. */
export interface GraphNode {
  id: string;
  slug: string;
  anchor: string;
  section: string;
  sectionId?: string;
  kind: 'paragraph' | 'quote';
  order: number;
  text: string;
  tags: string[];
  context?: string;
  stance?: 'source' | 'author' | 'critic' | 'mixed';
  x: number;
  y: number;
}
export interface GraphConcept { id: string; label: string; description?: string; group?: string }
export interface GraphData {
  version: 1;
  fingerprint: string;
  model: { id: string; revision: string; dim: number; license: string; prefix: string };
  projection: { method: string; explainedVariance: number[] };
  articles: { slug: string; title: string; tags: string[]; x: number; y: number }[];
  concepts: GraphConcept[];
  nodes: GraphNode[];
  edges: { source: string; target: string; kind: 'semantic' | 'sequence' | 'explicit'; score?: number }[];
}
export interface GraphTags {
  concepts: GraphConcept[];
  paragraphs: Record<string, { tags: string[]; context?: string; stance?: GraphNode['stance']; excludeReason?: string }>;
}
