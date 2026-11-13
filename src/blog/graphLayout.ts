import type { GraphData } from './graphTypes';

export interface Point { x: number; y: number }
export interface Relation {
  source: string;
  target: string;
  kind: 'semantic' | 'concept' | 'sequence' | 'explicit';
  score?: number;
}
export interface ArticleRelation {
  source: string;
  target: string;
  semanticCount: number;
  conceptCount: number;
  explicitCount: number;
  /** Complete deduplicated underlying evidence, not fabricated article similarity. */
  examples: Relation[];
}
export interface GraphLayout {
  articles: Map<string, Point>;
  paragraphs: Map<string, Point>;
  concepts: Map<string, Point>;
  articleEdges: ArticleRelation[];
  paragraphEdges: Relation[];
  bounds: { x: number; y: number; width: number; height: number };
}
export const semanticLevel = (zoom: number): 'article' | 'paragraph' | 'concept' =>
  zoom < 1.65 ? 'article' : 'paragraph';
const pair = (a: string, b: string) => a < b ? [a, b] : [b, a];
const key = (a: string, b: string) => JSON.stringify(pair(a, b));

/** One isotropic world transform for both article and paragraph semantic coordinates. */
export function buildGraphLayout(data: GraphData): GraphLayout {
  const nodes = new Map(data.nodes.map(n=>[n.id,n]));
  const point=(p:Point)=>({x:p.x*1800,y:p.y*1800});
  const articles=new Map(data.articles.map(a=>[a.slug,point(a)]));
  const paragraphs=new Map(data.nodes.map(n=>[n.id,point(n)]));
  const concepts=new Map<string,Point>(); // Tags are filters, not a second geometric space.
  const unique = new Map<string, Relation>();
  const add = (relation: Relation) => {
    if(relation.source===relation.target || !nodes.has(relation.source) || !nodes.has(relation.target)) return;
    const [source,target]=pair(relation.source,relation.target);
    const id=`${relation.kind}:${key(source,target)}`;
    if(!unique.has(id)) unique.set(id,{...relation,source,target});
  };
  for(const edge of data.edges) add(edge);
  for(const [source,neighbors] of Object.entries(data.conceptNeighbors)) for(const target of neighbors) {
    const a=nodes.get(source), b=nodes.get(target);
    if(a&&b&&a.slug!==b.slug&&a.tags.some(tag=>b.tags.includes(tag))) add({source,target,kind:'concept'});
  }
  const paragraphEdges=[...unique.values()].sort((a,b)=>`${a.kind}:${a.source}:${a.target}`.localeCompare(`${b.kind}:${b.source}:${b.target}`));
  const aggregate=new Map<string,ArticleRelation>();
  for(const edge of paragraphEdges) {
    const a=nodes.get(edge.source)!, b=nodes.get(edge.target)!;
    if(a.slug===b.slug || edge.kind==='sequence' || !articles.has(a.slug) || !articles.has(b.slug)) continue;
    const [source,target]=pair(a.slug,b.slug), id=key(source,target);
    let group=aggregate.get(id);
    if(!group) {group={source,target,semanticCount:0,conceptCount:0,explicitCount:0,examples:[]};aggregate.set(id,group);}
    if(edge.kind==='semantic') group.semanticCount++;
    if(edge.kind==='concept') group.conceptCount++;
    if(edge.kind==='explicit') group.explicitCount++;
    group.examples.push(edge);
  }
  const positions=[...articles.values(),...paragraphs.values(),...concepts.values()];
  const minX=Math.min(0,...positions.map(p=>p.x))-85, maxX=Math.max(0,...positions.map(p=>p.x))+85;
  const minY=Math.min(0,...positions.map(p=>p.y))-85, maxY=Math.max(0,...positions.map(p=>p.y))+85;
  return {articles,paragraphs,concepts,articleEdges:[...aggregate.values()],paragraphEdges,bounds:{x:minX,y:minY,width:maxX-minX,height:maxY-minY}};
}

export const selectedEdgeId = (edge: Pick<Relation, "kind" | "source" | "target">) => `selected:${edge.kind}:${edge.source}:${edge.target}`;
