import {test,expect} from '@playwright/test';
for(const mobile of [false,true])test(`selection icon requires explicit open ${mobile?'mobile':'desktop'}`,async({browser})=>{
 const context=await browser.newContext({viewport:{width:mobile?390:1280,height:900},hasTouch:mobile,isMobile:mobile});const page=await context.newPage();
 await page.route('https://giscus.app/**',r=>r.fulfill({contentType:'text/html',body:'<button>GitHubでログイン</button>'}));
 await page.goto('http://127.0.0.1:'+ (process.env.PLAYWRIGHT_PORT??4173)+'/blog/postcapitalism-mason-gabriel');await expect(page.locator('[data-comments-ready="true"]')).toBeVisible();
 const icon=page.getByRole('button',{name:'選択した引用にコメントを開く',exact:true}),panel=page.locator('aside[aria-label="引用コメント"]');
 async function select(offset=0){await page.locator('[data-comment-article] p[id^="p-"]').first().scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.evaluate(offset=>{const p=document.querySelector('[data-comment-article] p[id^="p-"]')!;const n=document.createTreeWalker(p,NodeFilter.SHOW_TEXT).nextNode()!,r=document.createRange();r.setStart(n,offset);r.setEnd(n,offset+10);getSelection()!.removeAllRanges();getSelection()!.addRange(r);document.dispatchEvent(new Event('selectionchange'));return {quote:r.toString(),y:scrollY,url:location.href};},offset);}
 const initial=await select();await expect(icon).toBeVisible();await expect(panel).toHaveCount(0);await expect(page.locator('iframe[title="GitHubコメント"]')).toHaveCount(0);expect(page.url()).toBe(initial.url);expect(await page.evaluate(()=>getSelection()?.toString())).toBe(initial.quote);
 // Native pointer focus can collapse selection between pointerdown and click.
 await icon.evaluate(e=>e.addEventListener('pointerdown',()=>getSelection()!.removeAllRanges(),{once:true}));
 if(mobile)await icon.tap();else await icon.click();await expect(panel).toBeVisible();await expect(panel.locator('blockquote')).toHaveText(initial.quote);expect(await page.evaluate(()=>scrollY)).toBeCloseTo(initial.y,0);
 await page.getByRole('button',{name:'コメントを閉じる'}).click();await expect(panel).toHaveCount(0);
 const next=await select(2);await expect(icon).toBeVisible();await icon.focus();await page.keyboard.press('Enter');await expect(panel.locator('blockquote')).toHaveText(next.quote);await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);
 await select();await expect(icon).toBeVisible();await page.evaluate(()=>window.scrollBy(0,80));await expect(icon).toHaveCount(0);await expect(panel).toHaveCount(0);
 await select();await expect(icon).toBeVisible();await page.evaluate(()=>getSelection()!.removeAllRanges());await expect(icon).toHaveCount(0);
 await select();await expect(icon).toBeVisible();await page.goto('http://127.0.0.1:'+(process.env.PLAYWRIGHT_PORT??4173)+'/blog');await expect(icon).toHaveCount(0);await expect(panel).toHaveCount(0);
 await context.close();
});
test('abandoned icon press and changed selection cannot leave a stale icon',async({page})=>{
 await page.goto('/blog/postcapitalism-mason-gabriel');await expect(page.locator('[data-comments-ready="true"]')).toBeVisible();
 const p=page.locator('[data-comment-article] p[id^="p-"]').first();await p.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await p.evaluate(e=>{const n=document.createTreeWalker(e,NodeFilter.SHOW_TEXT).nextNode()!,r=document.createRange();r.setStart(n,0);r.setEnd(n,10);getSelection()!.removeAllRanges();getSelection()!.addRange(r);});
 const icon=page.getByRole('button',{name:'選択した引用にコメントを開く',exact:true});await expect(icon).toBeVisible();
 await icon.dispatchEvent('pointerdown',{pointerType:'mouse'});await page.evaluate(()=>document.body.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse'})));await page.evaluate(()=>getSelection()!.removeAllRanges());await expect(icon).toHaveCount(0);
 await p.evaluate(e=>{const n=document.createTreeWalker(e,NodeFilter.SHOW_TEXT).nextNode()!,r=document.createRange();r.setStart(n,2);r.setEnd(n,12);getSelection()!.addRange(r);});await expect(icon).toBeVisible();
 await page.keyboard.press('Shift+ArrowLeft');await expect(icon).toBeVisible();
 const quote=await page.evaluate(()=>getSelection()!.toString());expect(quote.length).toBeGreaterThan(0);expect(quote.length).not.toBe(10);
 await page.route('https://giscus.app/**',r=>r.fulfill({contentType:'text/html',body:'login'}));await icon.click();await expect(page.locator('aside blockquote')).toHaveText(quote);
});
