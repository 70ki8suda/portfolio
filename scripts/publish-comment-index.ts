import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readCommentIndex,COMMENT_INDEX_MAX_BYTES} from '../src/blog/commentIndex';
const path=process.argv[2];if(!path)throw new Error('Missing annotation artifact');
const content=readFileSync(path);if(content.length>COMMENT_INDEX_MAX_BYTES)throw new Error('Annotation artifact too large');
const manifest=JSON.parse(readFileSync(path+'.manifest.json','utf8')) as {sourceSha:string;generation:string;sha256:string;startedAt:string;generatedAt:string};
const sourceSha=process.env.GITHUB_SHA,generation=`${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`;
const snapshot=JSON.parse(content.toString('utf8'));
if(manifest.sourceSha!==sourceSha||manifest.generation!==generation||snapshot.sourceSha!==sourceSha||snapshot.generation!==generation||manifest.startedAt!==snapshot.startedAt||manifest.generatedAt!==snapshot.generatedAt||manifest.sha256!==createHash('sha256').update(content).digest('hex')||(await readCommentIndex(snapshot)).state!=='fresh')throw new Error('Artifact provenance or schema mismatch');
const token=process.env.GITHUB_TOKEN;if(!token)throw new Error('Missing built-in Actions token');
const base='https://api.github.com/repos/70ki8suda/portfolio';
async function api(path:string,method='GET',body?:unknown,allowMissing=false){
 const response=await fetch(base+path,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 if(allowMissing&&response.status===404)return null;
 if(!response.ok)throw new Error(`Comment index publication ${method} ${response.status}; no retry performed`);
 return await response.json();
}
const ref=await api('/git/ref/heads/comment-index','GET',undefined,true),parent=ref?.object.sha as string|undefined;
if(parent){
 const oldCommit=await api(`/git/commits/${parent}`),tree=await api(`/git/trees/${oldCommit.tree.sha}`);
 if(tree.truncated||tree.tree.some((e:{path:string;type:string})=>e.type!=='blob'||!['annotations.json','annotations.json.manifest.json'].includes(e.path)))throw new Error('Unexpected contents on dedicated index branch');
 const oldEntry=tree.tree.find((e:{path:string})=>e.path==='annotations.json');if(!oldEntry)throw new Error('Previous annotation index missing');
 const blob=await api(`/git/blobs/${oldEntry.sha}`),old=JSON.parse(Buffer.from(blob.content,'base64').toString('utf8'));
 if((await readCommentIndex(old)).state==='unknown'||Date.parse(old.generatedAt)>=Date.parse(snapshot.generatedAt))throw new Error('Refusing invalid or newer index generation overwrite');
}
const files=[['annotations.json',content.toString('utf8')],['annotations.json.manifest.json',JSON.stringify(manifest,null,2)+'\n']];
const entries=[];
for(const [path,content] of files){const blob=await api('/git/blobs','POST',{content,encoding:'utf-8'});entries.push({path,mode:'100644',type:'blob',sha:blob.sha});}
const tree=await api('/git/trees','POST',{tree:entries});
const commit=await api('/git/commits','POST',{message:`Update public annotation index (${generation})`,tree:tree.sha,parents:parent?[parent]:[]});
// A competing update is not a parent of this commit: force:false rejects it.
if(parent)await api('/git/refs/heads/comment-index','PATCH',{sha:commit.sha,force:false});
else await api('/git/refs','POST',{ref:'refs/heads/comment-index',sha:commit.sha});
const verified=await api('/git/ref/heads/comment-index');if(verified.object.sha!==commit.sha)throw new Error('Published index ref changed before confirmation');
console.log(JSON.stringify({branch:'comment-index',commit:commit.sha,entries:snapshot.entries.length,generation}));
