import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const argv=process.argv;let folder='';
afterEach(()=>{process.argv=argv;vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetModules();if(folder)rmSync(folder,{recursive:true,force:true});});
function fixture(){folder=mkdtempSync(join(tmpdir(),'annotation-publish-test-'));const file=join(folder,'annotations.json'),sourceSha='a'.repeat(40),date=new Date().toISOString();const snapshot={version:1,repo:'70ki8suda/portfolio',complete:true,sourceSha,generation:'1:1',startedAt:date,generatedAt:date,entries:[]};const content=JSON.stringify(snapshot);writeFileSync(file,content);writeFileSync(file+'.manifest.json',JSON.stringify({sourceSha,generation:'1:1',startedAt:date,generatedAt:date,sha256:createHash('sha256').update(content).digest('hex')}));process.argv=['node','script',file];vi.stubEnv('GITHUB_SHA',sourceSha);vi.stubEnv('GITHUB_RUN_ID','1');vi.stubEnv('GITHUB_RUN_ATTEMPT','1');vi.stubEnv('GITHUB_TOKEN','synthetic-test-token');return {file,snapshot};}
it('rejects artifact mismatch before any external request',async()=>{
 const {file}=fixture();writeFileSync(file,'{}');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await expect(import('../../scripts/publish-comment-index')).rejects.toThrow('provenance');expect(fetcher).not.toHaveBeenCalled();
});
it('creates only a dedicated orphan index branch and confirms its ref',async()=>{
 fixture();const calls:{path:string;method:string;body:Record<string,unknown>}[]=[];let ref=false;
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{const path=new URL(url).pathname,method=options.method!,body=options.body?JSON.parse(options.body as string):{};calls.push({path,method,body});let result:unknown={sha:'b'.repeat(40)};
 if(path.endsWith('/git/ref/heads/comment-index')){if(!ref)return new Response('{}',{status:404});result={object:{sha:'b'.repeat(40)}};}
 if(path.endsWith('/git/refs')&&method==='POST')ref=true;
 return new Response(JSON.stringify(result),{status:200});});
 await import('../../scripts/publish-comment-index');
 expect(calls.find(c=>c.path.endsWith('/git/commits'))?.body.parents).toEqual([]);
 expect(calls.find(c=>c.path.endsWith('/git/refs'))?.body.ref).toBe('refs/heads/comment-index');
 expect(calls.some(c=>c.path.includes('/main'))).toBe(false);
});
it('rejects a competing branch advance without retry or force',async()=>{
 const {snapshot}=fixture();const old={...snapshot,generatedAt:new Date(Date.now()-10000).toISOString(),startedAt:new Date(Date.now()-20000).toISOString()};const mutations:Record<string,unknown>[]=[];
 vi.stubGlobal('fetch',async(url:string,options:RequestInit)=>{const path=new URL(url).pathname;let result:unknown={sha:'b'.repeat(40)};
 if(path.endsWith('/git/ref/heads/comment-index'))result={object:{sha:'c'.repeat(40)}};
 if(path.endsWith('/git/commits/'+'c'.repeat(40)))result={tree:{sha:'tree'}};
 if(path.endsWith('/git/trees/tree'))result={truncated:false,tree:[{path:'annotations.json',type:'blob',sha:'old'}]};
 if(path.endsWith('/git/blobs/old'))result={content:Buffer.from(JSON.stringify(old)).toString('base64')};
 if(options.method==='PATCH'){mutations.push(JSON.parse(options.body as string));return new Response('{}',{status:422});}
 return new Response(JSON.stringify(result),{status:200});});
 await expect(import('../../scripts/publish-comment-index')).rejects.toThrow('422');expect(mutations).toHaveLength(1);expect(mutations[0].force).toBe(false);
});
