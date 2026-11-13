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
