import {claimLinks} from './claimGraph';
import type {GraphData} from './graphTypes';
import {isGraphPayload} from './graphRefresh';

/** Render-only projection. Keep the validated source and its evaluation population intact. */
export function claimVisibility(source: GraphData | undefined) {
 const hidden = new Set<string>();
 if (source && claimLinks(source)) {
  if (!isGraphPayload(source)) throw new Error('Invalid exploratory source');
  const e=claimLinks(source)!;
  const endpoints=new Set(source.edges.flatMap(edge=>[edge.source,edge.target]));
  for (const id of e.queryIds) if (e.neighbors[id].length===0 && !endpoints.has(id)) hidden.add(id);
 }
 const nodes=source?.nodes.filter(n=>!hidden.has(n.id))??[];
 const slugs=new Set(nodes.map(n=>n.slug));
 return {hidden,nodes:hidden.size?nodes:source?.nodes??[],
  articles:hidden.size?source!.articles.filter(a=>slugs.has(a.slug)):source?.articles??[],
  edges:hidden.size?source!.edges.filter(e=>!hidden.has(e.source)&&!hidden.has(e.target)):source?.edges??[]};
}
