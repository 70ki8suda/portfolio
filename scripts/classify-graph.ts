import { parseDocument, isScalar } from 'yaml';
import { parsePost } from '../src/blog/parsePost';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { editorialHash, effectiveDecision, readEditorialPosts, readEditorialManifest, validateEditorial, type EditorialManifest } from './graph-editorial';
const posts=readEditorialPosts();
const manifest:EditorialManifest=existsSync('content/graph-editorial.json')?readEditorialManifest():{version:1,articles:{}};
if (process.argv.includes('--sync')) {
  const slugs=process.argv.slice(process.argv.indexOf('--sync')+1);
  if (!slugs.length) throw new Error('Specify reviewed article slugs explicitly: npm run graph:sync-optin -- my-article');
  for (const slug of slugs) if (!posts.some(p=>p.slug===slug && !p.draft)) throw new Error(`Unknown or draft article: ${slug}`);
  // Validate the entire editorial ledger before any mutation; a partial update cannot
  // accidentally stamp stale AI decisions as current. Only named files are written.
  validateEditorial(posts,manifest,false);
  const updates = posts.filter(p=>slugs.includes(p.slug)).map(post => {
    const value=effectiveDecision(manifest.articles[post.slug])==='include';
    const path=`content/posts/${post.slug}.md`;
    const source=readFileSync(path,'utf8');
    const match=/^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/.exec(source);
    if (!match) throw new Error(`Missing frontmatter: ${post.slug}`);
    const newline=match[1].includes('\r\n')?'\r\n':'\n';
    const scalar=parseDocument(match[2]).get('graph',true);
    let front:string;
    if (scalar === undefined) front=`${match[2].trimEnd()}${newline}graph: ${value}`;
    else {
      if (!isScalar(scalar) || !scalar.range) throw new Error(`Unsupported graph YAML value: ${post.slug}`);
      front=match[2].slice(0,scalar.range[0])+String(value)+match[2].slice(scalar.range[1]);
    }
    const body=source.slice(match[0].length);
    const output=`${match[1]}${front}${match[3]}${body}`;
    const parsed=parsePost(path,output);
    if (parsed.graph!==value || parsed.body!==post.body || editorialHash(parsed)!==editorialHash(post)) throw new Error(`Unsafe opt-in edit: ${post.slug}`);
    return {path,output,post,value};
  });
  for (const {path,output,post,value} of updates) {
    writeFileSync(path,output);
    console.log(`${post.slug}: graph=${value}${manifest.articles[post.slug].override?' (human override)':''}`);
  }
} else if(process.argv.includes('--check')) {
  validateEditorial(posts,manifest);
  console.log(`Editorial decisions fresh: ${posts.filter(p=>!p.draft).length} public articles`);
} else {
  const path=process.argv[2]??'/tmp/graph-editorial-input.json';
  // This local authoring artifact may contain drafts; it never enters public/ or the client.
  writeFileSync(path,JSON.stringify({instructions:'Read full articles and record purpose/category/reason in content/graph-editorial.json. Preserve human overrides. Uncertain → review. Do not infer from slug/date/topic words.',articles:posts.map(post=>({...post,sourceHash:editorialHash(post),previous:manifest.articles[post.slug]??null,status:!manifest.articles[post.slug]?'new':manifest.articles[post.slug].sourceHash===editorialHash(post)?'unchanged':'changed'}))},null,2)+'\n');
  console.log(`Local AI classification input: ${path}. ${posts.length} articles; may include private drafts.`);
}
