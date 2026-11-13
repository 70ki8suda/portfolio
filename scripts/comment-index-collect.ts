import {canonicalAnnotation} from '../src/blog/commentAnnotations';
import {readCommentIndex,type CommentIndex} from '../src/blog/commentIndex';
import {indexDiscussion,type DiscussionRecord} from './comment-index-build';
type ObjectValue=Record<string,unknown>;
export type GraphQL=(query:string,variables:Record<string,unknown>)=>Promise<unknown>;
function object(v:unknown):ObjectValue {if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Incomplete GraphQL response');return v as ObjectValue;}
const page='totalCount pageInfo {hasNextPage endCursor}';
async function pages(fetchPage:(after:string|null)=>Promise<unknown>):Promise<ObjectValue[]>{
 const rows:ObjectValue[]=[],ids=new Set<string>(),cursors=new Set<string>();let after:string|null=null,total:number|undefined;
 for(let n=0;n<500;n++){
  const c=object(await fetchPage(after)),info=object(c.pageInfo);
  if(!Number.isSafeInteger(c.totalCount)||(c.totalCount as number)<0||!Array.isArray(c.nodes)||typeof info.hasNextPage!=='boolean')throw new Error('Invalid GraphQL connection');
  if(total!==undefined&&total!==c.totalCount)throw new Error('Connection changed during pagination');total=c.totalCount as number;
  for(const raw of c.nodes){const row=object(raw);if(typeof row.id!=='string'||ids.has(row.id))throw new Error('Duplicate or invalid GraphQL identity');ids.add(row.id);rows.push(row);}
  if(rows.length>50000)throw new Error('Comment index collection limit');
  if(!info.hasNextPage){if(rows.length!==total)throw new Error('Incomplete GraphQL pages');return rows;}
  if(typeof info.endCursor!=='string'||!info.endCursor||cursors.has(info.endCursor))throw new Error('Stalled GraphQL cursor');
  cursors.add(info.endCursor);after=info.endCursor;
 }
 throw new Error('GraphQL page limit');
}
async function scan(graphql:GraphQL){
 const discussions=await pages(async after=>object(object(await graphql(`query($after:String){repository(owner:"70ki8suda",name:"portfolio"){discussions(first:100,after:$after,categoryId:"DIC_kwDOUZpL2s4DLB2i"){${page} nodes{id number url title body updatedAt author{__typename ... on Bot{id}} category{id} comments{totalCount}}}}}`,{after})).repository).discussions);
 const evidence:unknown[]=[],entries=[];
 for(const raw of discussions){
  if(typeof raw.title!=='string'||typeof raw.body!=='string'||typeof raw.updatedAt!=='string')throw new Error('Incomplete discussion');
  const base={...raw,comments:0,replies:0} as unknown as DiscussionRecord;
  // Ignore ordinary discussions, but reject corrupted range metadata from the app.
  if(!await indexDiscussion(base))continue;
  const comments=await pages(async after=>object(object(await graphql(`query($id:ID!,$after:String){node(id:$id){... on Discussion{comments(first:100,after:$after){${page} nodes{id updatedAt replies{totalCount}}}}}}`,{id:raw.id,after})).node).comments);
  if(comments.length!==object(raw.comments).totalCount)throw new Error('Discussion comment count changed');
  const replyEvidence=[];let replies=0;
  for(const comment of comments){
   const rows=await pages(async after=>object(object(await graphql(`query($id:ID!,$after:String){node(id:$id){... on DiscussionComment{replies(first:100,after:$after){${page} nodes{id updatedAt}}}}}`,{id:comment.id,after})).node).replies);
   if(rows.length!==object(comment.replies).totalCount)throw new Error('Reply count changed');
   replies+=rows.length;replyEvidence.push({id:comment.id,updatedAt:comment.updatedAt,replies:rows});
  }
  evidence.push({discussion:raw,comments:replyEvidence});
  entries.push((await indexDiscussion({...base,comments:comments.length,replies}))!);
  if(entries.length>5000)throw new Error('Annotation count limit');
 }
 return {entries:entries.sort((a,b)=>a.number-b.number),fingerprint:canonicalAnnotation({discussions,evidence})};
}
/** Two matching full reads detect change; they are not a transactional snapshot. */
export async function collectCommentSnapshot(graphql:GraphQL,meta:{sourceSha:string;generation:string}):Promise<CommentIndex>{
 const startedAt=new Date().toISOString();
 for(let attempt=0;attempt<2;attempt++){
  const first=await scan(graphql),second=await scan(graphql);
  if(first.fingerprint!==second.fingerprint)continue;
  const result:CommentIndex={version:1,repo:'70ki8suda/portfolio',complete:true,startedAt,generatedAt:new Date().toISOString(),...meta,entries:second.entries};
  if((await readCommentIndex(result)).state!=='fresh')throw new Error('Invalid completed comment snapshot');
  return result;
 }
 throw new Error('Comments changed during both collection attempts; previous snapshot must be retained');
}
