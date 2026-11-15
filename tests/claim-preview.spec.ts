import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {GraphData} from '../src/blog/graphTypes';
test.skip(process.env.GRAPH_CLAIM_PREVIEW!=='1','Development-only comparison dataset');
test.setTimeout(120000);
for(const width of [1280,390])test(`existing graph renders both comparison datasets at ${width}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'});
 const page=await context.newPage();
 for(const mode of ['paragraphs','claims'] as const){
  const data:GraphData=JSON.parse(readFileSync(`/tmp/section-claim-existing-graph/${mode==='claims'?'graph-claims':'paragraphs'}.json`,'utf8'));
  const node=data.nodes[0];
  await page.goto(`/blog?view=graph&preview=${mode}&node=${encodeURIComponent(node.id)}`);
  const main=page.locator('#main'),map=main.getByTestId('graph-canvas');
  await expect(map).toHaveAttribute('data-zoom',/\d/,{timeout:45000});
  await expect(main.getByRole('combobox',{name:'比較用データ'})).toHaveValue(mode);
  await expect(main.getByRole('heading',{name:mode==='claims'?'選んだ主要主張':'選んだ段落',exact:true})).toBeVisible();
  const anchor=data.preview?.claims[node.id]?.evidence[0]?.anchor??node.anchor;
  await expect(main.getByRole('link',{name:/元の記事でこの段落を読む/})).toHaveAttribute('href',`/blog/${node.slug}#${anchor}`);
  if(mode==='claims'){
   await main.getByText(/^原文の根拠を読む/).click();
   await expect(main.getByRole('link',{name:'記事のこの箇所へ ↗'}).first()).toHaveAttribute('href',`/blog/${node.slug}#${anchor}`);
  }
  expect(await page.evaluate(()=>innerWidth)).toBe(width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await context.close();
});
test('preview mode switch resets selection and cannot silently fall back on missing data',async({page})=>{
 await page.goto('/blog?view=graph&preview=paragraphs');
 const main=page.locator('#main');await expect(main.getByTestId('graph-canvas')).toHaveAttribute('data-zoom',/\d/,{timeout:45000});
 await main.getByRole('combobox',{name:'比較用データ'}).selectOption('claims');
 await expect(page).toHaveURL(/preview=claims/);await expect(main.getByTestId('graph-canvas')).toHaveAttribute('data-zoom',/\d/,{timeout:45000});
 expect(new URL(page.url()).searchParams.has('node')).toBe(false);
 await page.route('**/__claim-preview/claims.json',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.reload();await expect(main.getByRole('alert')).toContainText('読み込めませんでした');
 await expect(main.getByTestId('graph-canvas')).toHaveCount(0);
});
