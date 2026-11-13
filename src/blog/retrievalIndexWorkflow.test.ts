import {expect,it} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {applyGraphReply,planGraphUpdate} from '../../scripts/graph-update-plan';
import {assembleGraph} from '../../scripts/graph-pipeline';
import {indexReviewTarget} from '../../scripts/retrieval-gate';
import {fakeCache} from './graphTestFixtures';
function sandbox(){
 const dir=mkdtempSync(join(tmpdir(),'index-workflow-')),request=dir+'-request.json';
 const source='---\ntitle: 所有\ndate: 2026-11-13\ndescription: 所有\ntags: []\ndraft: false\n---\n地域で設備を所有する。';
 const snapshot={sources:{'a.md':source},editorial:{version:1 as const,articles:{}},tags:{concepts:[{id:'ownership',label:'所有',description:'所有'}],paragraphs:{}},vectors:'',artifact:''};
 const plan=planGraphUpdate(snapshot),a=plan.articles[0];
 const state=applyGraphReply(snapshot,{requestHash:plan.requestHash,articles:[{slug:'a',sourceHash:a.sourceHash,category:'long-term',decision:'include',reason:'所有の論点',paragraphs:Object.fromEntries(a.paragraphs.map(p=>[p.id,{tags:['ownership'],stance:'author',context:'筆者'}]))}]});
 const cache=fakeCache(state.prepared);
 mkdirSync(join(dir,'content/posts'),{recursive:true});mkdirSync(join(dir,'public'));
 const put=(p:string,v:unknown)=>writeFileSync(join(dir,p),typeof v==='string'?v:JSON.stringify(v)+'\n');
 put('content/posts/a.md',state.sources['a.md']);put('content/graph-editorial.json',JSON.stringify(state.editorial,null,2)+'\n');put('content/graph-tags.json',JSON.stringify(state.tags,null,2)+'\n');put('content/graph-vectors.json',cache);put('public/paragraph-graph.json',assembleGraph(state.prepared,cache));
 const run=(args:string[]=[],env=process.env)=>execFileSync(resolve('node_modules/.bin/tsx'),[resolve('scripts/update-graph.ts'),'--request',request,...args],{cwd:dir,env,stdio:'pipe'}).toString();
 expect(()=>run(['--init-index-cache'])).toThrow();
 const req=JSON.parse(readFileSync(request+'.index-cache.json','utf8')),input=req.inputs[0];
 const index={subject:'所有',claim:input.text,question:'誰が所有するか',speaker:'筆者',qualifications:'',support:input.text,contextSupport:''};
 const reply=join(dir,'reply.json');put('reply.json',{requestHash:req.requestHash,entries:{[input.id]:{version:1,origin:input,index,recipe:req.recipes.indexRecipe,review:{targetHash:indexReviewTarget(input,index,req.recipes.indexRecipe),reviewRecipe:req.recipes.indexReviewRecipe,reviewer:'fixture',verdict:'pass',note:'fixture'}}}});
 const encoder=join(dir,'encoder');writeFileSync(encoder,`#!${process.execPath}\nconst fs=require('fs'),p=JSON.parse(fs.readFileSync(process.argv[3]));fs.writeFileSync(process.argv[5],JSON.stringify({recipe:p.recipe,entries:p.entries.map(e=>({...e,vector:[1,...Array(383).fill(0)],tokens:1,chunks:1,ranges:[[0,1]]}))}));`,{mode:0o700});
 return {dir,request,put,run,args:['--init-index-cache','--index-cache-reply',reply,'--python',encoder],close(){rmSync(dir,{recursive:true,force:true});rmSync(request,{force:true});rmSync(request+'.index-cache.json',{force:true});}};
}
it('rolls back failed initial cache publication and later detects cache edits across build',()=>{
 const s=sandbox();try{
  const before=readFileSync(join(s.dir,'public/paragraph-graph.json'),'utf8');
  const hook=join(s.dir,'fail.cjs');s.put('fail.cjs',`const fs=require('fs'),original=fs.renameSync;fs.renameSync=(a,b)=>{if(b==='content/graph-index-cache.json')throw Error('cache rename failed');return original(a,b)};require('node:module').syncBuiltinESMExports();`);
  expect(()=>s.run(s.args,{...process.env,NODE_OPTIONS:'--require='+hook})).toThrow(/cache rename/);
  expect(existsSync(join(s.dir,'content/graph-index-cache.json'))).toBe(false);expect(readFileSync(join(s.dir,'public/paragraph-graph.json'),'utf8')).toBe(before);
  expect(s.run(s.args)).toContain('complete');expect(s.run(['--python','/missing'])).toContain('complete');
  mkdirSync(join(s.dir,'node_modules/typescript/bin'),{recursive:true});mkdirSync(join(s.dir,'node_modules/vite/bin'),{recursive:true});s.put('node_modules/typescript/bin/tsc','');s.put('node_modules/vite/bin/vite.js',"require('fs').appendFileSync('content/graph-index-cache.json',' ')");
  expect(()=>s.run(['--build'])).toThrow(/Inputs changed during build/);
  expect(readFileSync(join(s.dir,'content/graph-index-cache.json'),'utf8').endsWith(' ')).toBe(true);
 }finally{s.close();}
});
it('rejects cache creation between request and reply and preserves the intervening bytes',()=>{
 const s=sandbox();try{
  s.put('content/graph-index-cache.json','{"version":1,"recipes":{}}');
  expect(()=>s.run(s.args)).toThrow(/Incompatible/);expect(readFileSync(join(s.dir,'content/graph-index-cache.json'),'utf8')).toBe('{"version":1,"recipes":{}}');
 }finally{s.close();}
});
it('detects lockfile and prompt contract changes during build while preserving the new contract state',()=>{
 for(const contract of ['package-lock.json','scripts/retrieval-recipes/index-prompt.txt']){
  const s=sandbox();try{
   expect(s.run(s.args)).toContain('complete');
   const actual=resolve(contract),marker=join(s.dir,'contract-edited'),hook=join(s.dir,'contract-hook.cjs');
   // Virtual file edit isolates the repository: each later read sees changed bytes.
   s.put('contract-hook.cjs',`const fs=require('fs'),read=fs.readFileSync;fs.readFileSync=(p,...args)=>{const result=read(p,...args);if(String(p)===${JSON.stringify(actual)}&&fs.existsSync(${JSON.stringify(marker)}))return typeof result==='string'?result+' ':Buffer.concat([result,Buffer.from(' ')]);return result;};require('node:module').syncBuiltinESMExports();`);
   mkdirSync(join(s.dir,'node_modules/typescript/bin'),{recursive:true});mkdirSync(join(s.dir,'node_modules/vite/bin'),{recursive:true});s.put('node_modules/typescript/bin/tsc','');s.put('node_modules/vite/bin/vite.js',`require('fs').writeFileSync(${JSON.stringify(marker)},'changed')`);
   expect(()=>s.run(['--build'],{...process.env,NODE_OPTIONS:'--require='+hook})).toThrow(/Inputs changed during build/);
   expect(readFileSync(marker,'utf8')).toBe('changed');
  }finally{s.close();}
 }
});
