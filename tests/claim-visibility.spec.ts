import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {GraphData} from '../src/blog/graphTypes';
test.skip(process.env.GRAPH_CLAIM_PREVIEW!=='1','Development preview only');
test.setTimeout(90000);
for(const width of [1280,390])test(`isolated claims hide, restore on new incoming edge and survive invalid refresh at ${width}`,async({browser})=>{
 const original:GraphData=JSON.parse(readFileSync('/tmp/section-claim-memory-fix-v1/graph.json','utf8'));
 let payload=structuredClone(original),requests=0;
 const ends=new Set(original.edges.flatMap(e=>[e.source,e.target]));
 const hidden=original.nodes.find(n=>!ends.has(n.id))!,source=original.nodes.find(n=>n.slug!==hidden.slug&&ends.has(n.id))!;
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'}),page=await context.newPage();
 await page.route('**/__claim-preview/exploratory.json',route=>{requests++;return route.fulfill({json:payload});});
 await page.goto(`/blog?view=graph&preview=exploratory&node=${encodeURIComponent(hidden.id)}`);
 const main=page.locator('#main'),map=main.getByTestId('graph-canvas'),select=main.getByRole('combobox',{name:'探索の起点'});
 await expect(map).toHaveAttribute('data-visible-claims',String(ends.size));
 await expect(map).toHaveAttribute('data-hidden-claims',String(53-ends.size));
 await expect(main).toContainText('現在のgraph viewには表示していません');
 await expect(main.getByRole('link',{name:'元の記事でこの箇所を読む ↗'})).toHaveAttribute('href',`/blog/${hidden.slug}#${original.preview!.claims[hidden.id].evidence[0].anchor}`);
 expect(new URL(page.url()).searchParams.get('node')).toBe(hidden.id);
 await expect(select.locator(`option[value="${hidden.id}"]`)).toHaveCount(0);
 await main.getByRole('button',{name:'探す',exact:true}).click();
 const find=main.getByRole('dialog',{name:'主張を探す'});
 await find.getByRole('searchbox').fill(hidden.text);
 await expect(find.getByRole('list',{name:'主張の検索結果'}).getByRole('button')).toHaveCount(0);
 // Add only an incoming edge to the hidden claim. Its outgoing list remains empty.
 payload.preview!.exploration!.neighbors[source.id]=[{id:hidden.id,score:0}];
 payload.edges=Object.entries(payload.preview!.exploration!.neighbors).flatMap(([source,ns])=>ns.map(n=>({source,target:n.id,kind:'semantic' as const,score:n.score})));
 payload.fingerprint+='-incoming';
 const newEnds=new Set(payload.edges.flatMap(e=>[e.source,e.target]));
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(map).toHaveAttribute('data-visible-claims',String(newEnds.size));
 await expect(select.locator(`option[value="${hidden.id}"]`)).toHaveCount(1);
 await expect(main.getByRole('heading',{name:'選んだ主要主張',exact:true})).toBeVisible();
 await expect(find.getByRole('list',{name:'主張の検索結果'})).toContainText(hidden.text.slice(0,84));
 expect(payload.preview!.exploration!.neighbors[hidden.id]).toEqual([]);
 await find.getByRole('button',{name:'閉じる'}).click();
 // An invalid response is a refresh failure, not a valid empty dataset.
 delete payload.preview!.exploration!.neighbors[hidden.id];const before=requests;
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(()=>requests).toBeGreaterThan(before);
 await expect(main.getByRole('button',{name:'更新を再試行'})).toBeVisible();
 await expect(map).toHaveAttribute('data-visible-claims',String(newEnds.size));
 await expect(select.locator(`option[value="${hidden.id}"]`)).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/claim-hide-${width}.png`});await context.close();
});

test('a valid all-empty view retains source URLs without article or node fallback',async({page})=>{
 const data:GraphData=JSON.parse(readFileSync('/tmp/section-claim-memory-fix-v1/graph.json','utf8'));
 data.edges=[];data.preview!.exploration!.neighbors=Object.fromEntries(data.nodes.map(n=>[n.id,[]]));data.fingerprint+='-empty';
 await page.route('**/__claim-preview/exploratory.json',route=>route.fulfill({json:data}));
 await page.goto(`/blog?view=graph&preview=exploratory&article=${data.articles[0].slug}`);
 const main=page.locator('#main');await expect(main.getByTestId('graph-canvas')).toHaveAttribute('data-visible-claims','0');
 await expect(main).toContainText('この記事には現在表示できる主張がありません');
 await expect(main.getByRole('link',{name:'記事を読む ↗'})).toHaveAttribute('href',`/blog/${data.articles[0].slug}`);
 await expect(main.getByRole('combobox',{name:'探索の起点'}).locator('option')).toHaveCount(1);
 await expect(main.getByRole('alert')).toHaveCount(0);
});
