import {verifyStructuredEvents,TRANSPORT_VERSION,makeTransportCache,readTransportCache} from './retrieval-author-transport';
import {completeIndexEntries} from './retrieval-index-author';
import {indexCacheRecipes} from './graph-index-cache';
import type {IndexCacheRequest} from './retrieval-index-cache';
import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,symlinkSync,readlinkSync,unlinkSync,rmSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {authorDefinition,authorRecipes,completeRetrieval,type AuthorKind} from './retrieval-author';
import {retrievalHash} from './retrieval-gate';
import type {retrievalRequest} from './graph-retrieval';
import {RETRIEVAL_ENCODER} from './retrieval-embeddings';
const scriptRoot=dirname(fileURLToPath(import.meta.url));
function atomic(path:string,value:unknown){const stage=path+'.stage';writeFileSync(stage,JSON.stringify(value)+'\n',{mode:0o600});renameSync(stage,path);}
export async function runRetrievalAuthor(requestPath:string,workPath:string,python:string):Promise<string> {
 return runAuthor(requestPath,workPath,python,false);
}
export async function runIndexCacheAuthor(requestPath:string,workPath:string):Promise<string> {
 return runAuthor(requestPath,workPath,'',true);
}
async function runAuthor(requestPath:string,workPath:string,python:string,indexOnly:boolean):Promise<string> {
 const owner=resolve('/tmp',`graph-retrieval-owner-${process.pid}-${randomUUID()}.json`);
 const lock=resolve('/tmp',`graph-retrieval-author-${retrievalHash(resolve('.')).slice(0,20)}.lock`);
 atomic(owner,{pid:process.pid,workPath:resolve(workPath),requestPath:resolve(requestPath)});
 try{symlinkSync(owner,lock);}catch(error){rmSync(owner,{force:true});throw new Error(`Another retrieval author owns ${lock}; inspect its recorded PID before recovering an interrupted run. ${String(error)}`);}
 try{return await completeInWorkspace(requestPath,workPath,python,indexOnly);}finally{
  if(readlinkSync(lock)===owner)unlinkSync(lock);
  rmSync(owner,{force:true});
 }
}
async function completeInWorkspace(requestPath:string,workPath:string,python:string,indexOnly:boolean):Promise<string> {
 const directory=resolve(workPath),repo=resolve('.');
 if(directory===repo||directory.startsWith(repo+'/'))throw Error('Retrieval AI working files must be outside the repository');
 mkdirSync(directory,{recursive:true,mode:0o700});
 const request=JSON.parse(readFileSync(requestPath,'utf8')) as ReturnType<typeof retrievalRequest>,recipes=indexOnly?indexCacheRecipes():authorRecipes();
 if(retrievalHash(request.recipes)!==retrievalHash(recipes))throw Error('Author recipe differs from approved configuration');
 const progressPath=join(directory,'store-progress.json');
 if(!indexOnly&&existsSync(progressPath))request.previous=JSON.parse(readFileSync(progressPath,'utf8'));
 const env={...process.env};delete env.OPENAI_API_KEY;delete env.CODEX_API_KEY;
 const version=execFileSync('codex',['--version'],{env,encoding:'utf8'}).trim();
 if(version!=='codex-cli 0.167.2')throw Error(`Unverified AI CLI version: ${version}. Re-evaluate its recipe before use.`);
 const generate=async(kind:AuthorKind,packet:Record<string,unknown>)=>{
  if(indexOnly&&kind!=='index'&&kind!=='index-review')throw Error('Pair generation is disabled for index cache');
  const definition=authorDefinition(kind);let prompt=definition.prompt;
  if(kind==='index')prompt+='\n全記事:\n'+packet.articleBody+'\n対象:\n'+JSON.stringify(packet.targets);
  else if(kind==='index-review')prompt+='\n全記事:\n'+packet.articleBody+'\n検査対象:\n'+JSON.stringify(packet.tasks);
  else prompt+=JSON.stringify(kind==='pair-review'?packet.tasks:packet);
  const key=retrievalHash({transport:TRANSPORT_VERSION,kind,prompt,schema:definition.schema,recipes}),cache=join(directory,key+'.validated.json');
  if(existsSync(cache))return readTransportCache(JSON.parse(readFileSync(cache,'utf8')),key);
  // Preserve every failed attempt; a stale response file cannot satisfy a later run.
  const base=join(directory,key+'-'+randomUUID());
  atomic(base+'.request.json',{key,kind,packet,recipes});atomic(base+'.schema.json',definition.schema);
  const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','-m','gpt-6.1-sol','-c','model_reasoning_effort="medium"','-c','forced_login_method="chatgpt"','-c','features.shell_tool=false','-c','agents.enabled=false','-c','features.multi_agent=false','-c','web_search="disabled"','--output-schema',base+'.schema.json','--json','-o',base+'.response.json','-'];
  let events:string;
  try{events=execFileSync('codex',args,{input:prompt,encoding:'utf8',env,cwd:directory,timeout:420000,maxBuffer:16*1024*1024});}
  catch(error){
   const failure=error as {stdout?:string|Buffer;stderr?:string|Buffer};
   writeFileSync(base+'.events.jsonl',failure.stdout??'',{mode:0o600});writeFileSync(base+'.stderr.log',failure.stderr??'',{mode:0o600});
   throw new Error(`AI ${kind} failed; no publication. Preserved attempt: ${base}.request.json / .events.jsonl / .stderr.log`);
  }
  writeFileSync(base+'.events.jsonl',events,{mode:0o600});
  verifyStructuredEvents(events);
  const response=JSON.parse(readFileSync(base+'.response.json','utf8'));
  // Cache is only a transport result; every caller still validates source coverage and review targets.
  atomic(cache,makeTransportCache(key,response,events,base));return response;
 };
 if(indexOnly){
  const reply=await completeIndexEntries(request as unknown as IndexCacheRequest,generate,'codex:gpt-6.1-sol:medium:cli0.167.2');
  const replyPath=join(directory,'index-cache-reply.json');atomic(replyPath,reply);return replyPath;
 }
 const store=await completeRetrieval(request,{generate,checkpoint:s=>atomic(progressPath,s),encode:async(entries,previous)=>{
  const input=join(directory,'embedding-input.json'),output=join(directory,'embeddings.json');atomic(input,{recipe:RETRIEVAL_ENCODER,entries});atomic(output,previous);
  execFileSync(python,[join(scriptRoot,'embed-retrieval.py'),input,'--output',output],{stdio:'inherit'});return JSON.parse(readFileSync(output,'utf8'));
 }});
 const replyPath=join(directory,'reply.json');atomic(replyPath,{requestHash:request.requestHash,store});return replyPath;
}
