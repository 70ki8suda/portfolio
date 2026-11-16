import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Page} from '@playwright/test';
const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
/** Preserve explicit raw compatibility scenarios after the public default changes to claims. */
export async function mockGraphManifest(page:Page,current:()=>any){
 await page.route('**/graph-view.json',route=>{
  const data=current(),claims=data.version>=4,sources=data.claims?Object.entries(data.claims.sources).sort(([a],[b])=>a<b?-1:a>b?1:0):data.articles.map((a:any)=>a.slug).sort();
  return route.fulfill({json:{version:1,mode:claims?'claims':'raw',schema:data.version,payloadUrl:claims?'/claim-graph.json':'/paragraph-graph.json',payloadHash:hash(JSON.stringify(data)),sourceSetHash:hash(JSON.stringify(sources))}});
 });
}
export async function useRawGraphFixture(page:Page){
 const data=JSON.parse(readFileSync('public/paragraph-graph.json','utf8'));
 await mockGraphManifest(page,()=>data);
 await page.route('**/paragraph-graph.json',route=>route.fulfill({json:data}));
}
