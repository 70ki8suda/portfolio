import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {GraphData} from '../src/blog/graphTypes';
test.skip(process.env.GRAPH_CLAIM_PREVIEW!=='1','Local saved-score preview only');
test.setTimeout(120000);
for(const width of [1280,390])test(`all-origin exploratory links preserve calculated states and controls at ${width}`,async({browser})=>{
 const data:GraphData=JSON.parse(readFileSync('/tmp/section-claim-memory-fix-v1/graph.json','utf8'));
 const e=data.preview!.exploration!,origin=e.queryIds.find(id=>e.neighbors[id].length>0)!;
 const endpoints=new Set(data.edges.flatMap(e=>[e.source,e.target]));
 const target=e.neighbors[origin][0].id;
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce'});
 const page=await context.newPage();await page.goto(`/knowdes?view=graph&preview=exploratory&node=${encodeURIComponent(origin)}`);
 const main=page.locator('#main'),map=main.getByTestId('graph-canvas'),group=main.getByRole('region',{name:'探索用の接点'});
 await expect(map).toHaveAttribute('data-zoom',/\d/,{timeout:45000});
 await expect(main.getByRole('heading',{name:'選んだ主要主張',exact:true})).toBeVisible();
 await expect(main.getByRole('combobox',{name:'探索の起点'}).locator('option')).toHaveCount(endpoints.size+1);
 await expect(group.getByRole('heading')).toContainText(String(e.neighbors[origin].length));
 await expect(group).toContainText('支持や賛同の認定ではありません');
 await group.getByText('主張と条件を読む',{exact:true}).first().click();
 const first=e.neighbors[origin][0].id,firstNode=data.nodes.find(n=>n.id===first)!;
 await expect(group.getByRole('link',{name:'候補の原文へ ↗'}).first()).toHaveAttribute('href',`/knowdes/${firstNode.slug}#${data.preview!.claims[first].evidence[0].anchor}`);
 await expect(group.locator('blockquote').first()).toHaveText(firstNode.text);
 const selectBox=(await main.getByRole('combobox',{name:'探索の起点'}).boundingBox())!;expect(selectBox.x+selectBox.width).toBeLessThanOrEqual(width-12);
 await page.screenshot({path:`/tmp/section-claim-expanded-${width}.png`});
 const targetText=data.nodes.find(n=>n.id===target)!.text;
 await group.getByRole('button').filter({hasText:targetText.slice(0,40)}).click();
 await expect(group.getByRole('heading')).toHaveText(`探索用の接点 · ${e.neighbors[target].length}`);await expect(group).not.toContainText('未集計');
 const empty=e.queryIds.find(id=>!endpoints.has(id));
 if(empty){await page.goto(`/knowdes?view=graph&preview=exploratory&node=${encodeURIComponent(empty)}`);
 await expect(main).toContainText('現在のgraph viewには表示していません');
 await expect(main.getByRole('combobox',{name:'探索の起点'}).locator(`option[value="${empty}"]`)).toHaveCount(0);}
 expect(await page.evaluate(()=>innerWidth)).toBe(width);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // Close the sheet and exercise the existing canvas, not a second UI.
 await page.goto('/knowdes?view=graph&preview=exploratory');await expect(map).toHaveAttribute('data-zoom',/\d/);await expect(map).not.toHaveAttribute('data-moving','true');
 if(width===390){
  const box=(await map.boundingBox())!,c={x:box.x+box.width*.45,y:box.y+box.height*.5};
  expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,c)).toBe('CANVAS');
  const session=await context.newCDPSession(page),pts=(d:number)=>[{id:1,x:c.x-d/2,y:c.y},{id:2,x:c.x+d/2,y:c.y}];
  const before=Number(await map.getAttribute('data-zoom'));
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:pts(70)});
  for(let i=1;i<=6;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:pts(70+i*10)});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(map).not.toHaveAttribute('data-moving','true');expect(Number(await map.getAttribute('data-zoom'))/before).toBeCloseTo(130/70,1);
  expect(await page.evaluate(()=>visualViewport!.scale)).toBe(1);
 }
 await main.getByRole('group').first().focus();await page.keyboard.press('/');
 await expect(main.getByRole('dialog',{name:'主張を探す'})).toBeVisible();
 await context.close();
});
