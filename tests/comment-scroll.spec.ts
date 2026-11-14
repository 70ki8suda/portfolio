import {test,expect,type Page} from '@playwright/test';

async function stableScroll(page:Page,y:number){
 // Observe beyond router resolution, iframe load and any smooth-scroll animation.
 await page.waitForTimeout(900);
 const state=await page.evaluate(()=>({y:scrollY,hash:location.hash,active:document.activeElement?.tagName,iframe:!!document.querySelector('iframe[title="GitHubコメント"]'),readerState:history.state.commentScrollReader,queryKeys:[...new URL(location.href).searchParams.keys()]}));
 console.log(JSON.stringify({expectedY:y,...state}));
 expect(state.y).toBeCloseTo(y,0);
 expect(state.readerState).toEqual({chapter:'saved',offset:42});
}
for(const width of [1280,390])for(const hash of ['', '#videos'])test(`comment URL updates preserve reading position ${width} ${hash||'no hash'}`,async({page})=>{
 test.setTimeout(60000);
 await page.setViewportSize({width,height:900});
 await page.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><p>video</p>'}));
 await page.route('https://giscus.app/**',async r=>{await new Promise(resolve=>setTimeout(resolve,150));await r.fulfill({contentType:'text/html',body:'<!doctype html><button>GitHubでログイン</button><script>setTimeout(()=>parent.postMessage({giscus:{resizeHeight:1200}},"*"),100)</script>'});});
 await page.route('https://raw.githubusercontent.com/**/annotations.json',r=>r.fulfill({status:503,body:'unavailable'}));
 const url='/blog/amodei-altman-ai-futures';await page.goto(url+hash);await expect(page.locator('[data-comments-ready="true"]')).toBeVisible();
 // Finish the initial deep-link scroll before moving to another reading position.
 if(hash)await expect.poll(()=>page.locator('#videos').evaluate(e=>Math.abs(e.getBoundingClientRect().top-64))).toBeLessThan(3);
 const initialState=await page.evaluate(async()=>{
  const router=(window as unknown as {__TSR_ROUTER__:{navigate:(options:Record<string,unknown>)=>Promise<void>;state:{location:{state:Record<string,unknown>}}}}).__TSR_ROUTER__;
  const before={browser:history.state.commentScrollReader,router:router.state.location.state.commentScrollReader};
  await router.navigate({href:location.pathname+location.search+location.hash,replace:true,resetScroll:false,hashScrollIntoView:false,state:{...history.state,commentScrollReader:{chapter:'saved',offset:42}}});
  return {before,browser:history.state.commentScrollReader,router:router.state.location.state.commentScrollReader};
 });
 console.log(JSON.stringify({phase:'before-popup',...initialState}));
 expect(initialState.browser).toEqual({chapter:'saved',offset:42});expect(initialState.router).toEqual(initialState.browser);
 const frame=page.locator('iframe[title="GitHubコメント"]');let encoded='',term='';
 for(const fraction of [0,.5,.95]){
  const before=await page.evaluate(fraction=>{
   getSelection()!.removeAllRanges();const paragraphs=document.querySelectorAll('[data-comment-article] p[id^="p-"]');const p=paragraphs[Math.floor((paragraphs.length-1)*fraction)];p.scrollIntoView({block:'center',behavior:'instant'});
   const n=document.createTreeWalker(p,NodeFilter.SHOW_TEXT).nextNode()!,r=document.createRange();r.setStart(n,0);r.setEnd(n,Math.min(10,n.textContent!.length));getSelection()!.addRange(r);document.dispatchEvent(new Event('selectionchange'));return {y:scrollY,quote:r.toString()};
  },fraction);
  await expect(frame).toHaveCount(1);await expect(frame).toHaveCSS('height','1200px');await stableScroll(page,before.y);
  expect(new URL(page.url()).hash).toBe(hash);expect(await page.evaluate(()=>getSelection()?.toString())).toBe(before.quote);expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('IFRAME');
  encoded=new URL(page.url()).searchParams.get('annotation')!;term=new URL((await frame.getAttribute('src'))!).searchParams.get('term')!;
  await page.getByRole('button',{name:'コメントを閉じる'}).click();await expect(frame).toHaveCount(0);await stableScroll(page,before.y);expect(new URL(page.url()).searchParams.has('annotation')).toBe(false);
 }
 await page.evaluate(()=>getSelection()!.removeAllRanges());
 const article=page.getByRole('button',{name:'GitHubでコメントする',exact:true});await article.scrollIntoViewIfNeeded();const bottom=await page.evaluate(()=>scrollY);
 await article.click();await expect(frame).toHaveCount(1);await stableScroll(page,bottom);await expect(page.getByRole('heading',{name:'選択した対象へのコメント'})).toBeFocused();expect(new URL(page.url()).hash).toBe(hash);
 await page.keyboard.press('Escape');await expect(frame).toHaveCount(0);await stableScroll(page,bottom);await expect(article).toBeFocused();
 const now=new Date().toISOString(),annotation=JSON.parse(Buffer.from(encoded,'base64url').toString());
 const entry={id:'D_scroll',number:777,url:'https://github.com/70ki8suda/portfolio/discussions/777',updatedAt:now,term,annotation,comments:1,replies:0};
 await page.route('https://raw.githubusercontent.com/**/annotations.json',r=>r.fulfill({json:{version:1,repo:'70ki8suda/portfolio',complete:true,startedAt:now,generatedAt:now,sourceSha:'a'.repeat(40),generation:'1:1',entries:[entry]}}));
 await page.route('https://giscus.app/api/discussions?**',r=>r.fulfill({json:{id:entry.id,url:entry.url}}));
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow')));const existing=page.getByRole('button',{name:'会話 #777（1件）'});await expect(existing).toBeVisible();await existing.scrollIntoViewIfNeeded();const existingY=await page.evaluate(()=>scrollY);
 await existing.click();await expect(frame).toHaveAttribute('src',/number=777/);await stableScroll(page,existingY);expect(new URL(page.url()).hash).toBe(hash);
 await page.getByRole('button',{name:'コメントを閉じる'}).click();await expect(frame).toHaveCount(0);await stableScroll(page,existingY);await expect(existing).toBeFocused();
 // Ordinary in-article navigation must still scroll, even after a popup was closed.
 await page.locator('a[href="#amodei"]').click();await expect(page).toHaveURL(/#amodei$/);await expect.poll(()=>page.locator('#amodei').evaluate(e=>Math.abs(e.getBoundingClientRect().top-64))).toBeLessThan(3);
});
