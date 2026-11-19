import {test,expect} from '@playwright/test';

test.setTimeout(90000);
for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[390,500],[844,390]]) {
 test(`mobile artwork and graph controls fit ${width}x${height}`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.goto('/');
  const hero=page.locator('#top'),next=hero.getByRole('link',{name:'KNo(w)des'});
  await expect(next).toBeInViewport();expect((await hero.boundingBox())!.height).toBeLessThanOrEqual(height);
  await next.tap();const host=page.getByTestId('home-graph');await expect(host).toBeInViewport();
  await host.getByRole('button',{name:'graph viewを操作',exact:true}).tap();
  for(const embedded of [true,false]) {
   if(!embedded)await page.goto('/blog?view=graph');
   const scope=embedded?host:page.locator('#main'),map=scope.getByTestId('graph-canvas');
   await expect(map).toHaveAttribute('data-zoom',/\d/,{timeout:30000});
   await scope.getByRole('button',{name:'探す',exact:true}).tap();
   const find=scope.getByTestId('graph-find');await expect(find).toBeVisible();
   if(!embedded)expect((await page.locator('header').boundingBox())!.height).toBe(height<=500?52:64);
   else expect((await scope.boundingBox())!.height).toBeCloseTo(height<=500?height*.86:Math.max(320,Math.min(680,height*.74)),0);
   const bounds=(await find.boundingBox())!;expect(bounds.height).toBeGreaterThan(180);
   expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
   const article=find.getByRole('list',{name:'記事に近づく'}).getByRole('button').first();
   if(width<=680||height<=500)expect((await article.boundingBox())!.height).toBeGreaterThanOrEqual(44);
   await article.tap();await expect(find).toBeHidden();await expect(scope.getByTestId('graph-sheet')).toBeVisible();
   await expect(scope.getByTestId('graph-sheet').getByRole('button',{name:'閉じる',exact:true})).toBeInViewport();
   const sheet=scope.getByTestId('graph-sheet'),body=sheet.locator(':scope > div').last();
   await body.evaluate(e=>{e.scrollTop=e.scrollHeight});expect(await body.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
   await sheet.getByRole('button',{name:'閉じる',exact:true}).tap();await expect(sheet).toBeHidden();
   if(embedded){await host.getByRole('button',{name:'ページ操作へ',exact:true}).tap();await expect(host.getByRole('button',{name:'graph viewを操作',exact:true})).toBeVisible();}
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await context.close();
 });
}

test('artwork and inactive embedded graph leave one-finger vertical scroll to the page',async({browser})=>{
 const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();await p.goto('/');
 const session=await c.newCDPSession(p);
 const swipe=async(x:number,y:number)=>{await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let i=1;i<=8;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*20,id:1}]});await p.waitForTimeout(30);}await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
 await swipe(160,400);await expect.poll(()=>p.evaluate(()=>scrollY)).toBeGreaterThan(80);
 const host=p.getByTestId('home-graph');await host.scrollIntoViewIfNeeded();const box=(await host.boundingBox())!,before=await p.evaluate(()=>scrollY);
 await swipe(box.x+30,box.y+box.height*.65);await expect.poll(()=>p.evaluate(()=>scrollY)).toBeGreaterThan(before+30);
 await c.close();
});

for(const embedded of [true,false])test(`search remains usable when the visible viewport shrinks (${embedded?'home':'blog'})`,async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),page=await context.newPage();await page.goto(embedded?'/':'/blog?view=graph');
 const scope=embedded?page.getByTestId('home-graph'):page.locator('#main');
 if(embedded){await scope.scrollIntoViewIfNeeded();await scope.getByRole('button',{name:'graph viewを操作',exact:true}).tap();}
 const map=scope.getByTestId('graph-canvas');await expect(map).toHaveAttribute('data-zoom',/\d/,{timeout:30000});
 await scope.getByRole('button',{name:'探す',exact:true}).tap();const input=scope.getByRole('searchbox');await input.fill('AI');
 // Viewport resize emulates the reduced available area, not an actual iOS/Android keyboard.
 await page.setViewportSize({width:390,height:390});await expect(input).toHaveValue('AI');await input.scrollIntoViewIfNeeded();await expect(input).toBeInViewport();
 await expect(scope.getByTestId('graph-find').getByRole('button',{name:'閉じる',exact:true})).toBeInViewport();
 await input.press('Escape');await expect(scope.getByTestId('graph-find')).toBeHidden();await expect(map).toBeFocused();
 await page.setViewportSize({width:390,height:844});await expect(map).toHaveAttribute('data-zoom',/\d/);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await context.close();
});

for(const height of [844,390])test(`a long claim stays above its detail sheet at 390x${height}`,async({browser})=>{
 const {readFileSync}=await import('node:fs');const data=JSON.parse(readFileSync('public/claim-graph.json','utf8'));
 const nodes=data.nodes.filter((n:any)=>data.claims.links.neighbors[n.id]?.length).sort((a:any,b:any)=>b.text.length-a.text.length),node=nodes[0];
 const c=await browser.newContext({viewport:{width:390,height},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();await p.goto('/blog?view=graph&node='+encodeURIComponent(node.id));
 const map=p.getByTestId('graph-canvas'),sheet=p.getByTestId('graph-sheet');await expect(sheet).toBeVisible();await expect(map).toHaveAttribute('data-zoom',/\d/);await expect(map).not.toHaveAttribute('data-moving','true');
 const point=()=>map.evaluate((el,n)=>{const a=[...el.querySelectorAll<HTMLElement>('[data-wx][data-wy]')].map(e=>({wx:Number(e.dataset.wx),wy:Number(e.dataset.wy),r:e.getBoundingClientRect()})).sort((a,b)=>a.wx-b.wx);const first=a[0],last=a.at(-1)!;const scale=(last.r.x-first.r.x)/(last.wx-first.wx);return {x:first.r.x+(n.x*1800-first.wx)*scale,y:first.r.y+(n.y*1800-first.wy)*scale};},node);
 await expect.poll(async()=>{const at=await point(),r=(await sheet.boundingBox())!;return r.y-at.y;}).toBeGreaterThan(16);
 const at=await point(),box=(await map.boundingBox())!;expect(at.x).toBeGreaterThan(box.x);expect(at.x).toBeLessThan(box.x+box.width);expect(at.y).toBeGreaterThan(box.y+64);await c.close();
});

test('offscreen cleanup waits for a focused search field to finish',async({browser})=>{
 const c=await browser.newContext({viewport:{width:390,height:390},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),p=await c.newPage();await p.goto('/');
 const host=p.getByTestId('home-graph');await host.scrollIntoViewIfNeeded();await host.getByRole('button',{name:'graph viewを操作',exact:true}).tap();await expect(host.getByTestId('graph-canvas')).toHaveAttribute('data-zoom',/\d/);
 await host.getByRole('button',{name:'探す',exact:true}).tap();const input=host.getByRole('searchbox');await input.fill('AI');
 // Deliberately move it fully outside the viewport while keeping native focus.
 await p.evaluate(()=>scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
 await expect(host).not.toBeInViewport();await expect(input).toBeAttached();await expect(input).toHaveValue('AI');
 await p.locator('footer a').first().focus();await expect(host.getByTestId('graph-canvas')).toHaveCount(0);await c.close();
});
