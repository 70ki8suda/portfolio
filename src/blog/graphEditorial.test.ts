import { describe, expect, it } from 'vitest';
import { editorialHash, validateEditorial, effectiveDecision } from '../../scripts/graph-editorial';
import { parsePost } from './parsePost';
const source = (body='持続する制度と共同体を考える。',graph=true,draft=false) => `---\ntitle: Example\ndate: 2026-01-01\ndescription: Example\ntags: []\ngraph: ${graph}\ndraft: ${draft}\n---\n${body}`;
const post = parsePost('a.md',source());
const record = {sourceHash:'',category:'long-term' as const,decision:'include' as const,reason:'制度と所有の長期的な関係を本文の主目的としている。',decidedBy:'ai' as const};
describe('AI editorial workflow gates',()=>{
  it('detects stale classification after body changes, even when paragraphs remain',()=>{
    const entry={...record,sourceHash:editorialHash(post)};
    expect(()=>validateEditorial([post],{version:1,articles:{a:entry}})).not.toThrow();
    const changed=parsePost('a.md',source('変化した本文。'));
    expect(()=>validateEditorial([changed],{version:1,articles:{a:entry}})).toThrow(/stale/i);
  });
  it('respects human overrides and keeps ambiguous review separate from publication',()=>{
    const excluded={...record,sourceHash:editorialHash(post),override:{decision:'exclude' as const,reason:'ユーザー指定'}};
    expect(effectiveDecision(excluded)).toBe('exclude');
    expect(()=>validateEditorial([post],{version:1,articles:{a:excluded}})).toThrow(/opt-in/i);
    const publicReview=parsePost('a.md',source('持続する制度と共同体を考える。',false));
    const review={...record,sourceHash:editorialHash(publicReview),category:'uncertain' as const,decision:'review' as const};
    expect(()=>validateEditorial([publicReview],{version:1,articles:{a:review}})).not.toThrow();
    expect(publicReview.draft).toBe(false);
  });
  it('fails closed on missing/invalid decisions and does not leak draft classification',()=>{
    expect(()=>validateEditorial([post],{version:1,articles:{}})).toThrow(/missing/i);
    expect(()=>validateEditorial([post],{version:1,articles:{a:{...record,sourceHash:editorialHash(post),reason:''}}})).toThrow(/reason/i);
    expect(()=>validateEditorial([parsePost('private.md',source('Private',true,true))],{version:1,articles:{}})).not.toThrow();
  });
});

// Exercise the authoring CLI against isolated real Markdown, including its exact
// write path. This catches a gate that passes while sync writes stale metadata.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
it('syncs only named reviewed articles and preserves prose and a human override',()=>{
  const dir=mkdtempSync(join(tmpdir(),'graph-editorial-test-'));
  try {
    mkdirSync(join(dir,'content/posts'),{recursive:true});
    const a=source(); const b=source('変更しない本文。',false);
    writeFileSync(join(dir,'content/posts/a.md'),a);
    writeFileSync(join(dir,'content/posts/b.md'),b);
    const pa=parsePost('a.md',a),pb=parsePost('b.md',b);
    writeFileSync(join(dir,'content/graph-editorial.json'),JSON.stringify({version:1,articles:{
      a:{...record,sourceHash:editorialHash(pa),override:{decision:'exclude',reason:'人が除外'}},
      b:{...record,sourceHash:editorialHash(pb),decision:'exclude'},
    }}));
    execFileSync(resolve('node_modules/.bin/tsx'),[resolve('scripts/classify-graph.ts'),'--sync','a'],{cwd:dir});
    const after=parsePost('a.md',readFileSync(join(dir,'content/posts/a.md'),'utf8'));
    expect(after.graph).toBe(false);
    expect(after.body).toBe(pa.body);
    expect(editorialHash(after)).toBe(editorialHash(pa));
    expect(readFileSync(join(dir,'content/posts/b.md'),'utf8')).toBe(b);
    execFileSync(resolve('node_modules/.bin/tsx'),[resolve('scripts/classify-graph.ts'),'--check'],{cwd:dir});
  } finally {rmSync(dir,{recursive:true,force:true});}
});
