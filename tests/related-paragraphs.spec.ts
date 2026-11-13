import {readFileSync} from 'node:fs';
import {expect,test} from '@playwright/test';
import type {GraphData} from '../src/blog/graphTypes';
const graph:GraphData=JSON.parse(readFileSync('public/paragraph-graph.json','utf8'));
const selected=graph.nodes[0],other=graph.nodes.find(n=>n.slug!==selected.slug)!;
for(const width of [1280,390])for(const count of [0,1])test(`reviewed retrieval ${count} result at ${width}px preserves raw lookup without fallback`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const data=structuredClone(graph),h='a'.repeat(64),reason='所有の条件を比較するが、話者と提案の範囲は異なります。';
 data.retrieval={version:1,corpusHash:h,recipeHash:h,queries:Object.fromEntries(data.nodes.map(n=>[n.id,{candidateFingerprint:h,reviewHash:h,items:[]}]))};
 data.retrieval.queries[selected.id].items=count?[{id:other.id,reason}]:[];
 await page.route('**/paragraph-graph.json',route=>route.fulfill({json:data}));
 await page.goto('/blog?view=graph&node='+encodeURIComponent(selected.id));
 const sheet=page.locator('#main').getByTestId('graph-sheet');await expect(sheet).toContainText(selected.text);
 const related=sheet.getByRole('region',{name:'関連する論点',exact:true});await expect(related).toBeVisible();
 await expect(related.getByRole('button')).toHaveCount(count);
 await expect(related).not.toContainText(/類似度|cosine/);
 await test.info().attach('reviewed-retrieval',{body:await page.screenshot(),contentType:'image/png'});
 if(count){await expect(related).toContainText(reason);await related.getByRole('button').click();await expect(page).toHaveURL(new RegExp(encodeURIComponent(other.id)));await expect(sheet).toContainText(other.text);}
 else await expect(related).toContainText('この段落との具体的な接点を確認できた候補はありません。');
 const raw=sheet.locator('details').filter({hasText:'元ベクトルの近傍（未審査）'});await expect(raw).toBeVisible();
 await raw.locator('summary').click();await expect(raw.getByRole('button')).toHaveCount(data.semanticNeighbors[count?other.id:selected.id].length);
 await expect(raw).toContainText('確率ではありません');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
for(const width of [1280,390])test(`open map adopts reviewed results without resetting selection or camera at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const legacy=structuredClone(graph);delete legacy.retrieval;let current:unknown=legacy,documents=0;
 page.on('request',r=>{if(r.isNavigationRequest()&&r.frame()===page.mainFrame())documents++;});
 await page.route('**/paragraph-graph.json',route=>route.fulfill({json:current}));
 await page.goto('/blog?view=graph&node='+encodeURIComponent(selected.id));
 const live=page.locator('#main'),sheet=live.getByTestId('graph-sheet'),canvas=live.getByTestId('graph-canvas');
 await expect(sheet).toContainText(selected.text);await expect(canvas).toHaveAttribute('data-level','paragraph');await expect(canvas).not.toHaveAttribute('data-moving','true');
 const distance=()=>live.locator('[data-hit="article:deep-utopia-and-solarpunk"], [data-hit="article:garys-economics-guide"]').evaluateAll(elements=>{const [a,b]=elements.map(el=>el.parentElement!.getBoundingClientRect());return Math.hypot(a.x-b.x,a.y-b.y);});
 // The sheet can render before the lazy WebGL scene. Measure projected world anchors, not text labels.
 await expect.poll(()=>live.locator('[data-hit="article:deep-utopia-and-solarpunk"], [data-hit="article:garys-economics-guide"]').evaluateAll(elements=>elements.length===2&&elements.every(el=>(el.parentElement as HTMLElement).style.visibility==='visible'&&(el.parentElement as HTMLElement).style.transform.startsWith('translate(')))).toBe(true);
 const anchor=()=>live.locator('[data-hit="article:deep-utopia-and-solarpunk"]').evaluate(el=>{const {x,y}=el.parentElement!.getBoundingClientRect();return {x,y};});
 const before=await distance(),origin=await anchor(),zoom=await canvas.getAttribute('data-zoom');
 const next=structuredClone(graph),h='b'.repeat(64);next.retrieval={version:1,corpusHash:h,recipeHash:h,queries:Object.fromEntries(next.nodes.map(n=>[n.id,{candidateFingerprint:h,reviewHash:h,items:[]}]))};
 current=next;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 const related=sheet.getByRole('region',{name:'関連する論点',exact:true});await expect(related).toContainText('候補はありません');await expect(related.getByRole('button')).toHaveCount(0);
 current={...next,retrieval:{}};await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(live.getByText('graph viewの更新を確認できませんでした。')).toBeVisible();await expect(related.getByRole('button')).toHaveCount(0);
 const reason='更新後も元段落の帰属を保った比較です。';next.retrieval.queries[selected.id].items=[{id:other.id,reason}];current=next;
 await live.getByRole('button',{name:'更新を再試行'}).click();await expect(related).toContainText(reason);
 await expect(canvas).not.toHaveAttribute('data-moving','true');expect(Math.abs(await distance()-before)).toBeLessThan(1);await expect(canvas).toHaveAttribute('data-zoom',zoom!);
 const after=await anchor();expect(Math.hypot(after.x-origin.x,after.y-origin.y)).toBeLessThan(1);
 expect(new URL(page.url()).searchParams.get('node')).toBe(selected.id);expect(documents).toBe(1);
});
