import { assembleReviewedGraph, readRetrievalFiles } from './graph-retrieval';
import { readFileSync, writeFileSync } from 'node:fs';
import { readEditorialPosts, readEditorialManifest, validateEditorial } from './graph-editorial';
import { graphCorpus, readSources } from './graph-corpus';
import { ALGORITHM, MODEL, prepareGraph, type VectorCache } from './graph-pipeline';
import type { GraphTags } from '../src/blog/graphTypes';
validateEditorial(readEditorialPosts(),readEditorialManifest());
const tags: GraphTags = JSON.parse(readFileSync('content/graph-tags.json','utf8'));
const prepared = prepareGraph(graphCorpus(),tags);
if (process.argv.includes('--prepare')) {
  const path = process.argv[process.argv.indexOf('--prepare')+1];
  writeFileSync(path,JSON.stringify({model:MODEL,algorithm:ALGORITHM,articles:prepared.articles,nodes:prepared.nodes.map(({id,text,textHash})=>({id,text,textHash}))}));
  console.log(`Prepared ${prepared.nodes.length} opted-in, reviewed paragraphs → ${path}`);
} else {
  const cache: VectorCache = JSON.parse(readFileSync('content/graph-vectors.json','utf8'));
  const output = JSON.stringify(assembleReviewedGraph(readSources(),prepared,cache,readRetrievalFiles()))+'\n';
  if (process.argv.includes('--check')) {
    if (readFileSync('public/paragraph-graph.json','utf8')!==output) throw new Error('Stale public graph. Run npm run graph:build after reviewing source changes.');
    console.log(`Graph fresh: ${prepared.nodes.length} nodes, ${Buffer.byteLength(output)} bytes`);
  } else {
    writeFileSync('public/paragraph-graph.json',output);
    console.log(`Published static graph: ${prepared.nodes.length} nodes, ${Buffer.byteLength(output)} bytes`);
  }
}
