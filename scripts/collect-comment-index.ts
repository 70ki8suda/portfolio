import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {collectCommentSnapshot} from './comment-index-collect';
const args=process.argv.slice(2),local=args.includes('--local-readonly');
function arg(name:string){const i=args.indexOf(name);if(i<0||!args[i+1])throw new Error(`Missing ${name}`);return args[i+1];}
const output=arg('--output'),sourceSha=arg('--source'),generation=arg('--generation');
const graphql=async(query:string,variables:Record<string,unknown>)=>{
 let response:unknown;
 if(local){
  response=JSON.parse(execFileSync('gh',['api','graphql','--input','-'],{input:JSON.stringify({query,variables}),encoding:'utf8',maxBuffer:8*1024*1024}));
 }else{
  const token=process.env.GITHUB_TOKEN;if(!token)throw new Error('Missing built-in Actions token');
  const result=await fetch('https://api.github.com/graphql',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(30000)});
  if(!result.ok)throw new Error(`GraphQL HTTP ${result.status}`);
  response=await result.json();
 }
 const raw=response as {errors?:unknown;data?:unknown};
 if(raw.errors||!raw.data)throw new Error('GraphQL error or missing data; previous snapshot must be retained');
 return raw.data;
};
const snapshot=await collectCommentSnapshot(graphql,{sourceSha,generation});
const content=JSON.stringify(snapshot,null,2)+'\n';
writeFileSync(output,content);
writeFileSync(output+'.manifest.json',JSON.stringify({sourceSha,generation,startedAt:snapshot.startedAt,generatedAt:snapshot.generatedAt,sha256:createHash('sha256').update(content).digest('hex')},null,2)+'\n');
console.log(JSON.stringify({entries:snapshot.entries.length,complete:snapshot.complete,generatedAt:snapshot.generatedAt,sourceSha,generation}));
