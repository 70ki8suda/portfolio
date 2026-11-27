import {test,expect} from '@playwright/test';

for(const width of [320,390,1280])test(`analytics opt-out persists and can be cleared at ${width}`,async({browser,baseURL})=>{
 const context=await browser.newContext({baseURL,viewport:{width,height:850},isMobile:width<500,hasTouch:width<500});
 const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('/analytics-preferences/');
  await expect(page.getByRole('heading',{name:'アクセス計測の設定'})).toBeVisible();
  const status=page.getByRole('status');await expect(status).toContainText('通常の設定');
  const stop=page.getByRole('button',{name:'このブラウザの計測を停止',exact:true});
  expect((await stop.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await stop.focus();await page.keyboard.press('Enter');await expect(status).toContainText('計測停止の設定済み');
  const cookie=(await context.cookies()).find(c=>c.name==='site_analytics_optout')!;
  expect(cookie.value).toBe('1');expect(cookie.path).toBe('/');expect(cookie.sameSite).toBe('Lax');
  expect(cookie.expires-Date.now()/1000).toBeGreaterThan(3600*24*300);
  if(new URL(baseURL!).protocol==='https:')expect(cookie.secure).toBe(true);
  await page.reload();await expect(status).toContainText('計測停止の設定済み');
  // A normal hard navigation must send the cookie on the document request.
  const request=page.waitForRequest(r=>r.isNavigationRequest()&&new URL(r.url()).pathname==='/');
  await page.getByRole('link',{name:'サイトへ戻る',exact:true}).click();
  expect((await (await request).allHeaders()).cookie).toContain('site_analytics_optout=1');
  await page.goBack();await expect(status).toContainText('計測停止の設定済み');
  await page.getByRole('button',{name:'計測を再開',exact:true}).click();await expect(status).toContainText('通常の設定');
  expect((await context.cookies()).some(c=>c.name==='site_analytics_optout')).toBe(false);
  await page.reload();await expect(status).toContainText('通常の設定');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('script[src*="cloudflareinsights"],script[data-cf-beacon]').count()).toBe(0);
  expect(errors).toEqual([]);
 }finally{await context.close()}
});

test('explicit QA header is present from first navigation, including custom contexts',async({page,browser,baseURL})=>{
 for(const p of [page,await (await browser.newContext({baseURL})).newPage()]){
  await p.route('**/__qa-header-probe',async route=>{
   const headers=await route.request().allHeaders();await route.fulfill({contentType:'application/json',body:JSON.stringify(headers)});
  });
  await p.goto('/__qa-header-probe');expect(JSON.parse(await p.locator('body').innerText())['x-site-qa']).toBe('1');
 }
});

test('blocked cookie storage does not claim opt-out succeeded',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(document,'cookie',{configurable:true,get:()=>'',set:()=>{}}));
 await page.goto('/analytics-preferences/');await page.getByRole('button',{name:'このブラウザの計測を停止',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('保存できませんでした');
});
