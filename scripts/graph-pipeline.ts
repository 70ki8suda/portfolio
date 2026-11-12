import type { GraphData, GraphTags } from '../src/blog/graphTypes';
import { digest, graphCorpus } from './graph-corpus';
export const MODEL = { id: 'intfloat/multilingual-e5-small', revision: '614241f622f53c4eeff9890bdc4f31cfecc418b3', dim: 384, license: 'MIT', prefix: 'query: ' };
export const ALGORITHM = 'e5-chunk480-mean-l2-pca-full-v2';
export const SEMANTIC_THRESHOLD = 0.89;
export const TOP_K = 3;
type Corpus = ReturnType<typeof graphCorpus>;
export function prepareGraph(corpus: Corpus, tags: GraphTags) {
  const concepts = new Set(tags.concepts.map(c=>c.id));
  if (concepts.size !== tags.concepts.length || tags.concepts.some(c=>!c.id || !c.label)) throw new Error('Invalid or duplicate concept');
  const ids = new Set(corpus.nodes.map(n=>n.id));
  if (ids.size !== corpus.nodes.length) throw new Error('Duplicate paragraph IDs');
  for (const key of Object.keys(tags.paragraphs)) if (!ids.has(key)) throw new Error(`Stale tag: ${key}. Reconcile removed/edited/opted-out paragraphs.`);
  const nodes = corpus.nodes.flatMap(node => {
    const entry = tags.paragraphs[node.id];
    if (!entry) throw new Error(`Missing tag: ${node.id}. Read and classify this paragraph.`);
    if (!Array.isArray(entry.tags) || entry.tags.some(t=>!concepts.has(t)) || new Set(entry.tags).size !== entry.tags.length) throw new Error(`Unknown/duplicate concept: ${node.id}`);
    if (entry.excludeReason) {
      if (entry.tags.length) throw new Error(`Excluded paragraph has tags: ${node.id}`);
      return [];
    }
    if (entry.tags.length < 1 || entry.tags.length > 3) throw new Error(`Expected 1–3 concepts: ${node.id}`);
    return [{...node, ...entry, textHash:digest(node.text)}];
  });
  return { articles: corpus.articles.filter(a=>nodes.some(n=>n.slug===a.slug)), nodes,
    concepts: tags.concepts.filter(c=>nodes.some(n=>n.tags.includes(c.id))), fingerprint:digest({corpus,tags,MODEL,ALGORITHM,SEMANTIC_THRESHOLD,TOP_K}) };
}
export interface VectorCache {
  model: typeof MODEL;
  algorithm: string;
  entries: {id:string;textHash:string;vector:number[];x:number;y:number;chunks?:number}[];
  explainedVariance: number[];
}
export function assembleGraph(prepared: ReturnType<typeof prepareGraph>, cache: VectorCache): GraphData {
  if (JSON.stringify(cache.model) !== JSON.stringify(MODEL)) throw new Error('Stale embedding model');
  if (cache.algorithm !== ALGORITHM) throw new Error('Stale embedding algorithm');
  const vectors = new Map(cache.entries.map(e=>[e.id,e]));
  if (vectors.size !== cache.entries.length || vectors.size !== prepared.nodes.length) throw new Error('Stale vector coverage');
  for (const node of prepared.nodes) {
    const v = vectors.get(node.id);
    if (!v || v.textHash !== node.textHash) throw new Error(`Stale vector for ${node.id}`);
    if (v.vector.length !== MODEL.dim || v.vector.some(x=>!Number.isFinite(x)) || Math.abs(Math.hypot(...v.vector)-1)>0.001) throw new Error(`Invalid vector for ${node.id}`);
    if (![v.x,v.y].every(x=>Number.isFinite(x) && x>=0 && x<=1)) throw new Error('Invalid projected coordinates');
  }
  if (cache.explainedVariance.length !== 2 || cache.explainedVariance.some(x=>!Number.isFinite(x)||x<0||x>1)) throw new Error('Invalid projection metadata');
  const nodes = prepared.nodes.map(({ links:_links, textHash:_hash, excludeReason:_reason, ...node }) => ({...node, x:vectors.get(node.id)!.x,y:vectors.get(node.id)!.y}));
  const edges: GraphData['edges'] = [];
  const pairs = new Set<string>();
  const conceptNeighbors: Record<string,string[]> = {};
  // Cross-article candidates only; a shared editorial concept is a separate relevance gate,
  // never presented as the similarity score. Full-dimensional cosine determines ranking.
  for (const node of nodes) {
    const v = vectors.get(node.id)!.vector;
    const candidates = nodes.filter(other=>other.slug!==node.slug && other.tags.some(t=>node.tags.includes(t)))
      .map(other=>({other,score:v.reduce((sum,x,i)=>sum+x*vectors.get(other.id)!.vector[i],0)}))
      .sort((a,b)=>b.score-a.score || a.other.id.localeCompare(b.other.id));
    conceptNeighbors[node.id]=candidates.slice(0,TOP_K).map(c=>c.other.id);
    for (const {other,score} of candidates.filter(c=>c.score>=SEMANTIC_THRESHOLD).slice(0,TOP_K)) {
      const [source,target] = [node.id,other.id].sort();
      const key = `${source}\0${target}`;
      if (!pairs.has(key)) { pairs.add(key); edges.push({source,target,kind:'semantic',score: Math.min(1,Number(score.toFixed(6)))}); }
    }
  }
  for (const article of prepared.articles) {
    const rows = nodes.filter(n=>n.slug===article.slug).sort((a,b)=>a.order-b.order);
    for (let i=1;i<rows.length;i++) {
      // Do not bridge excluded prose or headings and call it an adjacent paragraph.
      if (rows[i].order===rows[i-1].order+1 && rows[i].section===rows[i-1].section)
        edges.push({source:rows[i-1].id,target:rows[i].id,kind:'sequence'});
    }
  }
  for (const node of prepared.nodes) for (const link of node.links) {
    // Only an exact paragraph link is a paragraph-to-paragraph relation. An article
    // or section citation does not imply a connection to every paragraph in it.
    const url = new URL(link, `https://70ki8suda.com/blog/${node.slug}`);
    if (url.origin!=='https://70ki8suda.com' || !url.hash) continue;
    const target = nodes.find(n=>url.pathname===`/blog/${n.slug}` && url.hash===`#${n.anchor}`);
    if (target && target.id!==node.id && !edges.some(e=>e.source===node.id&&e.target===target.id&&e.kind==='explicit')) edges.push({source:node.id,target:target.id,kind:'explicit'});
  }
  return {version:1,fingerprint:prepared.fingerprint,model:MODEL,similarity:{threshold:SEMANTIC_THRESHOLD,topK:TOP_K},
    projection:{method:'PCA (full SVD, deterministic sign, normalized 0–1)',explainedVariance:cache.explainedVariance},
    articles:prepared.articles.map(a=>{const rows=nodes.filter(n=>n.slug===a.slug);return {...a,x:rows.reduce((s,n)=>s+n.x,0)/rows.length,y:rows.reduce((s,n)=>s+n.y,0)/rows.length};}),
    concepts:prepared.concepts,conceptNeighbors,nodes,edges};
}
