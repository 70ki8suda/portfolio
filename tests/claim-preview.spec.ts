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
  await page.goto(`/knowdes?view=graph&preview=${mode}&node=${encodeURIComponent(node.id)}`);
  const main=page.locator('#main'),map=main.getByTestId('graph-canvas');
  await expect(map).toHaveAttribute('data-zoom',/\d/,{timeout:45000});
  await expect(main.getByRole('combobox',{name:'比較用データ'})).toHaveValue(mode);
  await expect(main.getByRole('heading',{name:mode==='claims'?'選んだ主要主張':'選んだ段落',exact:true})).toBeVisible();
  await expect(main.getByRole('button',{name:mode==='claims'?'主張':'段落',exact:true})).toBeVisible();
  await expect(main.getByRole('group').first()).toHaveAttribute('aria-label',new RegExp(`スラッシュで${mode==='claims'?'主張':'段落'}を探す`));
  const anchor=data.preview?.claims[node.id]?.evidence[0]?.anchor??node.anchor;
  await expect(main.getByRole('link',{name:/元の記事でこの段落を読む/})).toHaveAttribute('href',`/knowdes/${node.slug}#${anchor}`);
  if(mode==='claims'){
   await main.getByText(/^原文の根拠を読む/).click();
   await expect(main.getByRole('link',{name:'記事のこの箇所へ ↗'}).first()).toHaveAttribute('href',`/knowdes/${node.slug}#${anchor}`);
  }
  expect(await page.evaluate(()=>innerWidth)).toBe(width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await context.close();
});
test('preview mode switch resets selection and cannot silently fall back on missing data',async({page})=>{
 await page.goto('/knowdes?view=graph&preview=paragraphs');
 const main=page.locator('#main');await expect(main.getByTestId('graph-canvas')).toHaveAttribute('data-zoom',/\d/,{timeout:45000});
 await main.getByRole('combobox',{name:'比較用データ'}).selectOption('claims');
 await expect(page).toHaveURL(/preview=claims/);await expect(main.getByTestId('graph-canvas')).toHaveAttribute('data-zoom',/\d/,{timeout:45000});
 expect(new URL(page.url()).searchParams.has('node')).toBe(false);
 await page.route('**/__claim-preview/claims.json',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.reload();await expect(main.getByRole('alert')).toContainText('読み込めませんでした');
 await expect(main.getByTestId('graph-canvas')).toHaveCount(0);
});

test('claim dataset retains native pinch, one-finger pan and keyboard search',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const page=await context.newPage();await page.goto('/knowdes?view=graph&preview=claims');
 const main=page.locator('#main'),map=main.getByTestId('graph-canvas');
 await expect(map).toHaveAttribute('data-zoom',/\d/);await expect(map).not.toHaveAttribute('data-moving','true');
 const box=(await map.boundingBox())!,center={x:box.x+box.width*.47,y:box.y+box.height*.42};
 expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,center)).toBe('CANVAS');
 const cdp=await context.newCDPSession(page),zoom=async()=>Number(await map.getAttribute('data-zoom'));
 const points=(d:number)=>[{x:center.x-d/2,y:center.y,id:1},{x:center.x+d/2,y:center.y,id:2}];
 const before=await zoom();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(80)});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(80+i*10)});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[points(160)[1]]});
 await expect(map).not.toHaveAttribute('data-moving','true');expect(await zoom()/before).toBeCloseTo(2,1);
 const position=()=>map.locator('[data-wx][data-wy]').first().evaluate(el=>el.getBoundingClientRect().x);
 const x=await position();for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:center.x-80+i*5,y:center.y,id:1}]});await page.waitForTimeout(30);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(map).not.toHaveAttribute('data-moving','true');
 expect(await position()-x).toBeGreaterThan(20);expect(await page.evaluate(()=>visualViewport!.scale)).toBe(1);
 await expect(main.getByTestId('graph-sheet')).toBeHidden();
 const group=main.getByRole('group').first();await group.focus();await page.keyboard.press('/');
 await expect(main.getByRole('dialog',{name:'主張を探す'})).toBeVisible();
 await main.getByRole('searchbox',{name:'主張を検索'}).fill('資産');
 const results=main.getByRole('list',{name:'主張の検索結果'});await expect(results.getByRole('button').first()).toBeVisible();
 await results.getByRole('button').first().click();await expect(main.getByRole('heading',{name:'選んだ主要主張',exact:true})).toBeVisible();
 expect(new URL(page.url()).searchParams.get('preview')).toBe('claims');await context.close();
});
