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
  zoom < 1.65 ? 'article' : zoom < 3.1 ? 'paragraph' : 'concept';
const pair = (a: string, b: string) => a < b ? [a, b] : [b, a];
const key = (a: string, b: string) => JSON.stringify(pair(a, b));

/** A stable navigation layout, deliberately not a plot of metric semantic distances. */
export function buildGraphLayout(data: GraphData): GraphLayout {
  const nodes = new Map(data.nodes.map(n => [n.id, n]));
  const articles = new Map<string, Point>();
  const paragraphs = new Map<string, Point>();
  const concepts = new Map<string, Point>();
  const ordered = [...data.articles].sort((a, b) =>
    Math.atan2(a.y - .5, a.x - .5) - Math.atan2(b.y - .5, b.x - .5) || a.slug.localeCompare(b.slug));
  // Equal spacing prevents coincident PCA centroids from obscuring entire articles.
  const radius = ordered.length < 2 ? 0 : Math.max(360, ordered.length * 85);
  ordered.forEach((a, index) => {
    const angle = index * Math.PI * 2 / ordered.length - Math.PI / 2;
    const hub = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    articles.set(a.slug, hub);
    const members = data.nodes.filter(n => n.slug === a.slug).sort((a,b) => a.order-b.order || a.id.localeCompare(b.id));
    const xs = members.map(n=>n.x), ys = members.map(n=>n.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const spanX = Math.max(...xs)-minX || 1, spanY = Math.max(...ys)-minY || 1;
    const positions = members.map(n => ({ x: (n.x-minX)/spanX*180-90, y: (n.y-minY)/spanY*180-90 }));
    // Resolve local collisions with deterministic pair forces; no continuously running simulation.
    for (let iteration = 0; iteration < 100; iteration++) {
      for (let i=0; i<positions.length; i++) {
        const p=positions[i];
        for(let j=i+1;j<positions.length;j++) {
          const q=positions[j];
          let dx=p.x-q.x, dy=p.y-q.y, distance=Math.hypot(dx,dy);
          if(distance<.001) { const angle=(i*7+j)*2.399963; dx=Math.cos(angle);dy=Math.sin(angle);distance=1; }
          if(distance<16) { const force=(16-distance)*.5; p.x+=dx/distance*force;p.y+=dy/distance*force;q.x-=dx/distance*force;q.y-=dy/distance*force; }
        }
        const distance=Math.hypot(p.x,p.y);
        if(distance<32) { const angle=distance>.01?Math.atan2(p.y,p.x):i*2.399963;p.x=Math.cos(angle)*32;p.y=Math.sin(angle)*32; }
        if(distance>155) {p.x*=155/distance;p.y*=155/distance;}
      }
    }
    members.forEach((n,i)=>paragraphs.set(n.id,{x:hub.x+positions[i].x,y:hub.y+positions[i].y}));
  });

  for(const concept of [...data.concepts].sort((a,b)=>a.id.localeCompare(b.id))) {
    const members=data.nodes.filter(n=>n.tags.includes(concept.id)).map(n=>paragraphs.get(n.id)).filter((p):p is Point=>!!p);
    if(!members.length) continue;
    const center={x:members.reduce((sum,p)=>sum+p.x,0)/members.length,y:members.reduce((sum,p)=>sum+p.y,0)/members.length};
    let p=center;
    // Keep labels/hit areas away from article hubs, paragraphs and other concepts.
    for(let step=0;step<240;step++) {
      const occupied=[...articles.values(),...concepts.values()];
      if(occupied.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>65)
        && [...paragraphs.values()].every(q=>Math.hypot(p.x-q.x,p.y-q.y)>25)) break;
      const angle=step*2.399963, r=12*Math.sqrt(step+1);
      p={x:center.x+Math.cos(angle)*r,y:center.y+Math.sin(angle)*r};
    }
    concepts.set(concept.id,p);
  }

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
