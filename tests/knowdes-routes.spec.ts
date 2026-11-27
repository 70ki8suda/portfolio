import { test, expect } from '@playwright/test';
import { legacyGarysChapters } from '../src/blog/legacyPosts';

const slug='game-theory-economic-behavior';
const query='?x=1&x=2&empty=&space=%20&annotation=not-valid';
test('permanent redirects keep raw query and new canonical/404 contracts',async({request})=>{
 for(const path of ['/blog','/blog/',`/blog/${slug}`,'/blog/essential-work-rents-and-abundance','/blog/missing-article']){
  const r=await request.get(path+query,{maxRedirects:0});expect(r.status()).toBe(301);expect(r.headers().location).toBe(path.replace('/blog','/knowdes')+query);
 }
 for(const prefix of ['/blog','/knowdes']){
  const r=await request.get(`${prefix}/%67arys-compound-interest${query}`,{maxRedirects:0});expect(r.status()).toBe(301);expect(r.headers().location).toBe('/knowdes/garys-economics-guide'+query+'#compound-interest');
 }
 for(const prefix of ['/blog','/knowdes'])for(const [old,chapter] of Object.entries(legacyGarysChapters)){
  const r=await request.get(`${prefix}/${old}${query}`,{maxRedirects:0});expect(r.status()).toBe(301);expect(r.headers().location).toBe('/knowdes/garys-economics-guide'+query+'#'+chapter);
 }
 for(const path of ['/knowdes/essential-work-rents-and-abundance','/knowdes/missing-article','/blog/extra/path','/blogger','/knowdes/garys%2Fcompound-interest'])expect((await request.get(path)).status()).toBe(404);
 // Invalid UTF-8 is rejected by Start as 400, as on the old route; it is not an article.
 expect((await request.get('/knowdes/%E0%A4%A')).status()).toBe(400);
 for(const path of ['/knowdes',`/knowdes/${slug}`]){
  const r=await request.get(path+'?tag=x&view=graph');expect(r.status()).toBe(200);const html=await r.text();expect(html).toContain(`rel="canonical" href="https://70ki8suda.com${path}"`);expect(html).toContain(`property="og:url" content="https://70ki8suda.com${path}"`);
 }
});
for(const width of [1280,390])test(`legacy fragments and related/comment links survive at ${width}`,async({browser})=>{
 const c=await browser.newContext({viewport:{width,height:850},isMobile:width===390,hasTouch:width===390,reducedMotion:'reduce',extraHTTPHeaders:{'X-Site-QA':'1'}});
 const p=await c.newPage(),errors:string[]=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  await p.goto(`/blog/${slug}${query}#poker`);await p.locator('#post-title').waitFor();expect(new URL(p.url()).pathname).toBe('/knowdes/'+slug);expect(new URL(p.url()).hash).toBe('#poker');expect(new URL(p.url()).searchParams.getAll('x')).toEqual(['1','2']);await expect(p.locator('#poker')).toBeVisible();
  await expect(p.locator('article a[href="/knowdes/craving-and-enough#mahjong"]')).toBeVisible();
  await p.locator('[data-article-related-state="ready"]').waitFor();const button=p.locator('button[data-related-anchor]').first();await button.scrollIntoViewIfNeeded();const y=await p.evaluate(()=>scrollY),url=p.url();await button.click();await p.getByRole('dialog',{name:'関連する別記事の主張',exact:true}).waitFor();expect(Math.abs(await p.evaluate(()=>scrollY)-y)).toBeLessThan(2);expect(p.url()).toBe(url);await p.getByRole('button',{name:'関連する主張を閉じる',exact:true}).click();
  await p.goto(`/blog/${slug}?comment=article#poker`);await expect(p.locator('iframe[title="GitHubコメント"]')).toBeVisible();const frame=new URL((await p.locator('iframe[title="GitHubコメント"]').getAttribute('src'))!);expect(frame.searchParams.get('term')).toBe('article:'+slug);expect(frame.searchParams.get('description')).toContain('/knowdes/'+slug);expect(new URL(p.url()).hash).toBe('#poker');
  const before=await p.evaluate(()=>scrollY);await p.keyboard.press('Escape');await expect(p.locator('iframe[title="GitHubコメント"]')).toHaveCount(0);expect(new URL(p.url()).hash).toBe('#poker');expect(Math.abs(await p.evaluate(()=>scrollY)-before)).toBeLessThan(2);
  await p.goto('/blog/garys-compound-interest?x=1#ignored');await p.locator('#post-title').waitFor();expect(new URL(p.url()).hash).toBe('#compound-interest');expect(new URL(p.url()).pathname).toBe('/knowdes/garys-economics-guide');
  await p.goto('/');await p.getByTestId('home-blog-link').click();await expect(p).toHaveURL(/\/knowdes$/);await p.goBack();await expect(p).toHaveURL(/\/$/);await p.goForward();await expect(p).toHaveURL(/\/knowdes$/);
  expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 }finally{await c.close();}
});

test('a saved range and a legacy client history entry retain their targets',async({page})=>{
 await page.route('https://giscus.app/**',r=>r.fulfill({contentType:'text/html',body:'login'}));
 await page.goto(`/knowdes/${slug}`);await page.locator('[data-comments-ready="true"]').waitFor();
 const paragraph=page.locator('[data-comment-article] p[id^="p-"]').first();await paragraph.scrollIntoViewIfNeeded();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const quote=await paragraph.evaluate(el=>{const n=document.createTreeWalker(el,NodeFilter.SHOW_TEXT).nextNode()!;const r=document.createRange();r.setStart(n,0);r.setEnd(n,10);getSelection()!.removeAllRanges();getSelection()!.addRange(r);document.dispatchEvent(new Event('selectionchange'));return r.toString();});
 await page.getByRole('button',{name:'選択した引用にコメントを開く',exact:true}).click();const frame=page.locator('iframe[title="GitHubコメント"]');await frame.waitFor();const term=new URL((await frame.getAttribute('src'))!).searchParams.get('term');const saved=new URL(page.url());expect(saved.searchParams.has('annotation')).toBe(true);
 saved.pathname=saved.pathname.replace('/knowdes/','/blog/');await page.goto(saved.toString());await frame.waitFor();expect(new URL((await frame.getAttribute('src'))!).searchParams.get('term')).toBe(term);await expect(page.locator('aside[aria-label="引用コメント"] blockquote')).toHaveText(quote);
 await page.getByRole('button',{name:'コメントを閉じる',exact:true}).click();
 await page.evaluate(path=>history.pushState(history.state,'',path),`/blog/${slug}?x=1&x=2&empty=&space=%20#poker`);
 await expect(page).toHaveURL(new RegExp(`/knowdes/${slug}\\?x=1&x=2&empty=&space=%20#poker$`));await page.locator('#poker').waitFor();
});
