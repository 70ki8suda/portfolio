import {test,expect} from '@playwright/test';
for(const width of [320,375,390,1280])test(`related controls leave prose full width and never cover text ${width}`,async({browser},testInfo)=>{
 const context=await browser.newContext({baseURL:testInfo.project.use.baseURL,viewport:{width,height:850},isMobile:width<680,hasTouch:width<680,reducedMotion:'reduce'}),page=await context.newPage();
 await page.goto('/blog/organizing-intelligence-ai-economy');
 await expect(page.locator('[data-article-related-state]')).toHaveAttribute('data-article-related-state','ready');
 const content=page.locator('[data-comment-article]'),before=await content.locator('p[id],h2[id],h3[id]').allTextContents();
 async function check(expectedWidth:number){
  await expect.poll(()=>page.evaluate(()=>{
   const root=document.querySelector('[data-article-related-state]')!,source=root.firstElementChild!;
   const buttons=Array.from(root.querySelectorAll<HTMLElement>('[data-related-anchor]'));
   const walker=document.createTreeWalker(source,NodeFilter.SHOW_TEXT);const rects:DOMRect[]=[];let node:Node|null;
   while((node=walker.nextNode())){if(!node.textContent?.trim())continue;const r=document.createRange();r.selectNodeContents(node);rects.push(...Array.from(r.getClientRects()).filter(r=>r.width&&r.height));}
   const overlap=buttons.filter(b=>{const a=b.getBoundingClientRect();return rects.some(r=>a.left<r.right-.5&&a.right>r.left+.5&&a.top<r.bottom-.5&&a.bottom>r.top+.5);}).length;
   return {overlap,padding:parseFloat(getComputedStyle(source).paddingRight),overflow:document.documentElement.scrollWidth>innerWidth,buttons:buttons.length};
  })).toMatchObject({overlap:0,padding:expectedWidth<=680?0:40,overflow:false});
  expect(await page.locator('[data-related-anchor]').count()).toBeGreaterThan(0);
 }
 await check(width);
 const buttons=page.locator('[data-related-anchor]'),count=await buttons.count();
 await page.evaluate(()=>{for(const p of document.querySelectorAll<HTMLElement>('[data-comment-article] p,[data-comment-article] h2')){p.style.fontFamily='monospace';p.style.fontSize='21px';}});
 await check(width);await page.setViewportSize({width:width<=680?1280:375,height:850});await check(width<=680?1280:375);
 await page.setViewportSize({width,height:850});await check(width);expect(await buttons.count()).toBe(count);expect(await content.locator('p[id],h2[id],h3[id]').allTextContents()).toEqual(before);
 const button=buttons.first();await button.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const state=await page.evaluate(()=>({y:scrollY,url:location.href}));if(width<680)await button.tap();else await button.click();
 const dialog=page.getByRole('dialog',{name:'関連する別記事の主張'});await expect(dialog).toBeVisible();expect(await page.evaluate(()=>scrollY)).toBe(state.y);expect(page.url()).toBe(state.url);
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(button).toBeFocused();
 const link=content.locator('p a').first();await link.scrollIntoViewIfNeeded();await expect.poll(()=>link.evaluate(a=>{const r=a.getClientRects()[0];return document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2)?.closest('a')===a;})).toBe(true);
 const p=content.locator('p[id]').first();await p.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const quote=await p.evaluate(p=>{const n=document.createTreeWalker(p,NodeFilter.SHOW_TEXT).nextNode()!,r=document.createRange();r.setStart(n,0);r.setEnd(n,10);const s=getSelection()!;s.removeAllRanges();s.addRange(r);document.dispatchEvent(new Event('selectionchange'));return r.toString();});
 await expect(page.getByRole('button',{name:'選択した引用にコメントを開く'})).toBeVisible();expect(await page.evaluate(()=>getSelection()?.toString())).toBe(quote);await expect(dialog).not.toBeVisible();
 expect(await content.locator('[data-related-anchor]').count()).toBe(0);
 await page.goto('/blog');await expect(page.locator('[data-related-anchor-space]')).toHaveCount(0);
 await context.close();
});
