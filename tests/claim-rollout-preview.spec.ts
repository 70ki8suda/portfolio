import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {GraphData} from '../src/blog/graphTypes';
const publicMode=process.env.CLAIM_PUBLIC_VERIFY==='1';
const route='/knowdes?view=graph'+(publicMode?'':'&preview=rollout');
test.skip(!process.env.CLAIM_ROLLOUT_DATA||(!publicMode&&process.env.GRAPH_CLAIM_PREVIEW!=='1'),'Needs a fixed schema4 payload and explicit preview or public verification');
test.setTimeout(120000);
for(const width of [1280,390])test(`schema4 staged claims preserve source links, hidden states and controls at ${width}`,async({browser})=>{
 const data:GraphData=JSON.parse(readFileSync(process.env.CLAIM_ROLLOUT_DATA!,'utf8'));
 const e=data.claims!.links,origin=e.queryIds.find(id=>e.neighbors[id].length>0)!;
 const endpoints=new Set(data.edges.flatMap(e=>[e.source,e.target]));
 const target=e.neighbors[origin][0].id;expect(data.version).toBe(4);
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'});
 const page=await context.newPage();await page.goto(`${route}&node=${encodeURIComponent(origin)}`);
 const main=page.locator('#main'),map=main.getByTestId('graph-canvas'),group=main.getByRole('region',{name:'探索用の接点'});
 await expect(map).toHaveAttribute('data-zoom',/\d/,{timeout:45000});
 await expect(main.getByRole('heading',{name:'選んだ主要主張',exact:true})).toBeVisible();
 if(publicMode){
  await expect(map).toHaveAttribute('data-visible-claims',String(endpoints.size));
  await expect(map).toHaveAttribute('data-hidden-claims',String(data.nodes.length-endpoints.size));
  await expect(main.getByRole('combobox',{name:'探索の起点'})).toHaveCount(0);
 }else await expect(main.getByRole('combobox',{name:'探索の起点'}).locator('option')).toHaveCount(endpoints.size+1);
 await expect(group.getByRole('heading')).toContainText(String(e.neighbors[origin].length));
 await expect(group).toContainText('支持や賛同の認定ではありません');
 await group.getByText('主張と条件を読む',{exact:true}).first().click();
 const first=e.neighbors[origin][0].id,firstNode=data.nodes.find(n=>n.id===first)!;
 await expect(group.getByRole('link',{name:'候補の原文へ ↗'}).first()).toHaveAttribute('href',`/knowdes/${firstNode.slug}#${data.claims!.summaries[first].evidence[0].anchor}`);
 await expect(group.locator('blockquote').first()).toHaveText(firstNode.text);
 if(!publicMode){const selectBox=(await main.getByRole('combobox',{name:'探索の起点'}).boundingBox())!;expect(selectBox.x+selectBox.width).toBeLessThanOrEqual(width-12);}
 await page.screenshot({path:`/tmp/claim-rollout-${width}.png`});
 const targetText=data.nodes.find(n=>n.id===target)!.text;
 await group.getByRole('button').filter({hasText:targetText.slice(0,40)}).click();
 await expect(group.getByRole('heading')).toHaveText(`探索用の接点 · ${e.neighbors[target].length}`);await expect(group).not.toContainText('未集計');
 const empty=e.queryIds.find(id=>!endpoints.has(id));
 if(empty){await page.goto(`${route}&node=${encodeURIComponent(empty)}`);
 await expect(main).toContainText('現在のgraph viewには表示していません');
 if(publicMode){
  await expect(map).toHaveAttribute('data-hidden-claims',String(data.nodes.length-endpoints.size));
  await main.getByRole('button',{name:'探す',exact:true}).click();
  await main.getByRole('searchbox',{name:'主張を検索'}).fill(data.nodes.find(n=>n.id===empty)!.text);
  await expect(main.getByRole('list',{name:'主張の検索結果'}).getByRole('button')).toHaveCount(0);
 }else await expect(main.getByRole('combobox',{name:'探索の起点'}).locator(`option[value="${empty}"]`)).toHaveCount(0);}
 expect(await page.evaluate(()=>innerWidth)).toBe(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const legacy=data.nodes.find(n=>n.id===origin)!;const anchor=data.claims!.summaries[origin].evidence.find(e=>!e.kind||e.kind==='paragraph')?.anchor;
 if(anchor){await page.goto(`${route}&node=${encodeURIComponent(legacy.slug+':'+anchor)}`);await expect(main).toContainText('以前の段落へのリンクです');await expect(main.getByRole('link',{name:'元の記事を読む ↗'})).toHaveAttribute('href',`/knowdes/${legacy.slug}#${anchor}`);}
 // Close the sheet and exercise the existing canvas, not a second UI.
 await page.goto(route);await expect(map).toHaveAttribute('data-zoom',/\d/);await expect(map).not.toHaveAttribute('data-moving','true');
 if(width===390){
  const box=(await map.boundingBox())!,c={x:box.x+box.width*.45,y:box.y+box.height*.5};
  expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,c)).toBe('CANVAS');
  const session=await context.newCDPSession(page),pts=(d:number)=>[{id:1,x:c.x-d/2,y:c.y},{id:2,x:c.x+d/2,y:c.y}];
  const before=Number(await map.getAttribute('data-zoom'));
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pts(70)});
  for(let i=1;i<=6;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pts(70+i*10)});await page.waitForTimeout(30);}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(map).not.toHaveAttribute('data-moving','true');expect(Number(await map.getAttribute('data-zoom'))/before).toBeCloseTo(130/70,1);
  expect(await page.evaluate(()=>visualViewport!.scale)).toBe(1);
 }
 await main.getByRole('group').first().focus();await page.keyboard.press('/');
 await expect(main.getByRole('dialog',{name:'主張を探す'})).toBeVisible();
 if(publicMode){
  const originText=data.nodes.find(n=>n.id===origin)!.text;
  await main.getByRole('searchbox',{name:'主張を検索'}).fill(originText);
  await main.getByRole('list',{name:'主張の検索結果'}).getByRole('button').filter({hasText:originText.slice(0,40)}).click();
  await expect(main.getByTestId('graph-sheet')).toContainText(originText);
  await expect.poll(()=>new URL(page.url()).searchParams.get('node')).toBe(origin);
 }
 await context.close();
});

for(const width of [1280,390])test(`public embedded claims preserve page boundaries and source selection at ${width}`,async({browser})=>{
 test.skip(!publicMode,'Public manifest verification only');
 const data:GraphData=JSON.parse(readFileSync(process.env.CLAIM_ROLLOUT_DATA!,'utf8'));
 const endpoints=new Set(data.edges.flatMap(e=>[e.source,e.target]));
 const selected=data.nodes.find(n=>endpoints.has(n.id))!;
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'});
 const page=await context.newPage();await page.goto('/');
 const host=page.getByTestId('home-graph');await host.scrollIntoViewIfNeeded();
 const map=host.getByTestId('graph-canvas');
 await expect(map).toHaveAttribute('data-visible-claims',String(endpoints.size),{timeout:45000});
 const box=(await host.boundingBox())!;expect(box.width).toBeLessThanOrEqual(width);expect(box.height).toBeLessThan(900);
 await host.getByRole('button',{name:'graph viewを操作',exact:true}).click();
 await host.getByRole('button',{name:'主張',exact:true}).click();
 await host.getByRole('button',{name:'探す',exact:true}).click();
 await host.getByRole('searchbox',{name:'主張を検索'}).fill(selected.text.slice(0,24));
 await host.getByRole('list',{name:'主張の検索結果'}).getByRole('button').first().click();
 await expect(host.getByTestId('graph-sheet')).toContainText(selected.text);
 await expect(page).toHaveURL(/\/$/);
 await host.getByRole('button',{name:'ページ操作へ'}).click();
 await expect(host.getByRole('button',{name:'graph viewを操作',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByTestId('home-blog-link').click();await expect(page).toHaveURL(/\/knowdes$/);
 await context.close();
});
