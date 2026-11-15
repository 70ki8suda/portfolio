import {claimSource} from './claim-source';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { CLAIM_PREVIEW_SLUGS, prepareClaims, previewGraph, sha, type ClaimDraft } from './claim-preview-data';
import { graphCorpus } from './graph-corpus';
import { MODEL, ALGORITHM, type VectorCache } from './graph-pipeline';
import { digest } from './graph-corpus';
import type { GraphData } from '../src/blog/graphTypes';
const root='/tmp/section-claim-existing-graph';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
if(!process.argv.includes('--inventory')) {
  const frozen:Record<string,string>=read(`${root}/baseline-hashes.json`);
  for(const [path,hash] of Object.entries(frozen)) if(sha(readFileSync(path,'utf8'))!==hash)throw Error(`Baseline changed: ${path}`);
}
const base:GraphData=read('public/paragraph-graph.json');
const cache:VectorCache=read('content/graph-vectors.json');
const sources=Object.fromEntries(CLAIM_PREVIEW_SLUGS.map(slug=>[slug,readFileSync(`content/posts/${slug}.md`,'utf8')]));
const corpus=graphCorpus(Object.fromEntries(Object.entries(sources).map(([slug,s])=>[`${slug}.md`,s])));
if(process.argv.includes('--inventory')) {
  writeFileSync(`${root}/source-inventory-v2.json`,JSON.stringify(Object.fromEntries(Object.entries(sources).map(([slug,raw])=>[slug,claimSource(raw)])),null,2)+'\n');
  writeFileSync(`${root}/source-inventory.json`,JSON.stringify({sources:Object.fromEntries(Object.entries(sources).map(([slug,text])=>[slug,{text,hash:sha(text)}])),paragraphs:corpus.nodes},null,2)+'\n');
} else if(process.argv.includes('--raw')) {
  const nodes=base.nodes.filter(n=>CLAIM_PREVIEW_SLUGS.includes(n.slug));
  const output=previewGraph(base,nodes,cache,'paragraphs',{},Object.fromEntries(nodes.map(n=>[n.id,digest(n.text)])));
  writeFileSync(`${root}/paragraphs.json`,JSON.stringify(output)+'\n');
  console.log(`${nodes.length} raw nodes; fixed cutoff .89, max5; development output only`);
} else {
  const draft:ClaimDraft=read(`${root}/claims.json`);
  const prepared=prepareClaims(draft,sources,base);
  if(process.argv.includes('--prepare')) {
    if(existsSync(`${root}/claim-vectors.json`))throw Error('Existing claim vectors preserved; use a new run rather than overwriting');
    const articles=corpus.articles.map(a=>({...a,id:`article:${a.slug}`,textHash:digest({text:a.text,extraction:a.extraction})}));
    writeFileSync(`${root}/embedding-input.json`,JSON.stringify({model:MODEL,algorithm:ALGORITHM,articles,nodes:prepared.nodes.map(n=>({id:n.id,text:n.embeddingText,textHash:n.textHash}))})+'\n');
    writeFileSync(`${root}/claim-vectors.json`,JSON.stringify(cache)+'\n');
    console.log(`${prepared.nodes.length} claims prepared; no model run`);
  } else if(process.argv.includes('--assemble')) {
    const vectors:VectorCache=read(`${root}/claim-vectors.json`);
    const nodes=prepared.nodes.map(({textHash:_h,embeddingText:_e,...n})=>n);
    const output=previewGraph(base,nodes,vectors,'claims',prepared.claims,Object.fromEntries(prepared.nodes.map(n=>[n.id,n.textHash])));
    writeFileSync(`${root}/graph-claims.json`,JSON.stringify(output)+'\n');
    console.log(`${nodes.length} claim nodes; fixed cutoff .89, max5; development output only`);
  } else throw Error('Expected --inventory, --raw, --prepare or --assemble');
}
