import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {acceptGraphDelivery,type GraphDelivery} from './graphDelivery';
const bytes=readFileSync('public/paragraph-graph.json','utf8'),graph=JSON.parse(bytes);
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const manifest=():GraphDelivery=>({version:1,mode:'raw',schema:2,payloadUrl:'/paragraph-graph.json',payloadHash:hash(bytes),sourceSetHash:hash(JSON.stringify(graph.articles.map((a:{slug:string})=>a.slug).sort()))});
it('accepts only the complete manifest/payload generation, preserving legitimate raw delivery',async()=>{
 expect((await acceptGraphDelivery(manifest(),bytes)).fingerprint).toBe(graph.fingerprint);
 for(const mutate of [(m:GraphDelivery)=>{m.payloadHash='0'.repeat(64);},(m:GraphDelivery)=>{m.sourceSetHash='0'.repeat(64);},(m:GraphDelivery)=>{m.mode='claims';m.schema=4;m.payloadUrl='/claim-graph.json';}]){const m=manifest();mutate(m);await expect(acceptGraphDelivery(m,bytes)).rejects.toThrow();}
 await expect(acceptGraphDelivery(manifest(),bytes+' ')).rejects.toThrow();
});
it('rejects malformed manifests and arbitrary endpoints, not as an empty graph',async()=>{
 for(const bad of [{},null,{...manifest(),payloadUrl:'https://example.com/graph.json'},{...manifest(),schema:9}])await expect(acceptGraphDelivery(bad,bytes)).rejects.toThrow();
});
