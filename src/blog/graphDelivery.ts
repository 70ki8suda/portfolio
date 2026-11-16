import type {GraphData} from './graphTypes';
import {isGraphPayload} from './graphRefresh';
export interface GraphDelivery {version:1;mode:'raw'|'claims';schema:2|3|4;payloadUrl:'/paragraph-graph.json'|'/claim-graph.json';payloadHash:string;sourceSetHash:string}
const hashPattern=/^[a-f0-9]{64}$/;
export function validGraphDelivery(value:unknown):value is GraphDelivery {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as GraphDelivery;
 return v.version===1&&hashPattern.test(v.payloadHash)&&hashPattern.test(v.sourceSetHash)
  &&(v.mode==='claims'?v.schema===4&&v.payloadUrl==='/claim-graph.json':v.mode==='raw'&&[2,3].includes(v.schema)&&v.payloadUrl==='/paragraph-graph.json');
}
export function unknownGraphDeliverySchema(value:unknown):number|undefined {
 if(!value||typeof value!=='object'||Array.isArray(value))return;
 const v=value as Record<string,unknown>;
 if(v.version===1&&v.mode==='claims'&&v.payloadUrl==='/claim-graph.json'&&typeof v.payloadHash==='string'&&hashPattern.test(v.payloadHash)&&typeof v.sourceSetHash==='string'&&hashPattern.test(v.sourceSetHash)&&Number.isSafeInteger(v.schema)&&(v.schema as number)>4)return v.schema as number;
}
export const graphSourceSet=(data:GraphData)=>JSON.stringify(data.claims?Object.entries(data.claims.sources).sort(([a],[b])=>a<b?-1:a>b?1:0):data.articles.map(a=>a.slug).sort());
export async function graphBytesHash(text:string){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
/** Manifest and exact payload bytes form one atomic acceptance unit, including an explicit rollback. */
export async function acceptGraphDelivery(manifest:unknown,bytes:string):Promise<GraphData>{
 if(!validGraphDelivery(manifest))throw new Error('Invalid graph delivery manifest');
 if(await graphBytesHash(bytes)!==manifest.payloadHash)throw new Error('Graph delivery generation mismatch');
 const data:unknown=JSON.parse(bytes);
 if(!isGraphPayload(data)||data.preview!==undefined||data.version!==manifest.schema||(manifest.mode==='claims')!==!!data.claims)throw new Error('Invalid graph delivery payload');
 if(await graphBytesHash(graphSourceSet(data))!==manifest.sourceSetHash)throw new Error('Graph source generation mismatch');
 return data;
}
