import { collectPosts } from '../src/blog/parsePost';
import { isGraphPost } from '../src/blog/posts';
import { graphCorpus, digest } from './graph-corpus';
import type { RetrievalInput } from './retrieval-gate';
type Adopted = {id:string;slug:string;text:string;textHash:string;stance?:string;context?:string};
/** Use all extracted paragraphs for adjacency, including paragraphs excluded from the graph. */
export function retrievalInputs(sources: Record<string,string>, adopted: Adopted[]): RetrievalInput[] {
  const posts=new Map(collectPosts(sources,{includeDrafts:false}).filter(isGraphPost).map(p=>[p.slug,p]));
  const corpus=graphCorpus(sources), ids=new Set<string>();
  return adopted.map(node=>{
    const post=posts.get(node.slug), all=corpus.nodes.filter(n=>n.slug===node.slug);
    const at=all.findIndex(n=>n.id===node.id), original=all[at];
    if (!post || !original || original.text!==node.text || digest(original.text)!==node.textHash || !node.stance || !node.context || ids.has(node.id)) throw new Error(`Stale or incomplete retrieval source: ${node.id}`);
    ids.add(node.id);
    const same=all.filter(n=>n.section===original.section), local=same.findIndex(n=>n.id===node.id);
    return {id:node.id,slug:node.slug,text:node.text,textHash:node.textHash,title:post.title,section:original.section,
      previous:same[local-1]?.text??'',next:same[local+1]?.text??'',articleBody:post.body,stance:node.stance,context:node.context};
  });
}
