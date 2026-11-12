import { writeFileSync } from 'node:fs';
import { graphCorpus } from './graph-corpus';
const path = process.argv[2] ?? '/tmp/paragraph-graph-corpus.json';
const corpus = graphCorpus();
writeFileSync(path, JSON.stringify(corpus, null, 2) + '\n');
console.log(`${corpus.articles.length} articles / ${corpus.nodes.length} paragraphs → ${path}`);
