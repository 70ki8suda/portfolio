import {expect,test} from '@playwright/test';
const parent='/knowdes/fixture-markdown-field-guide',child='/knowdes/fixture-subarticle';
test('subarticle SSR is public while all ordinary listing projections omit it',async({request})=>{
 const response=await request.get(child);expect(response.status()).toBe(200);const html=await response.text();
 expect(html).toContain('SUBARTICLE-PUBLIC-BODY');expect(html).toContain(`href="${parent}"`);expect(html).toContain('id="detail"');
 const parentHtml=await (await request.get(parent)).text();expect(parentHtml).toContain(`href="${child}"`);expect(parentHtml).not.toContain('SUBARTICLE-DRAFT-SECRET');expect(parentHtml).not.toContain('fixture-subarticle-draft');
 expect((await request.get('/knowdes/fixture-subarticle-draft')).status()).toBe(404);
 for(const url of ['/knowdes','/knowdes?category=engineering','/knowdes?category=current-economy','/knowdes?tag=subarticle-only','/knowdes?tag=subarticle-only&category=engineering']){
  const body=await (await request.get(url)).text();expect(body).not.toContain('Fixture companion detail');expect(body).not.toContain('SUBARTICLE-PUBLIC-BODY');
 }
});
for(const width of [1280,390])test(`parent child navigation and listing counts ${width}`,async({page})=>{
 await page.setViewportSize({width,height:850});await page.goto(parent);
 const nav=page.getByRole('navigation',{name:'この記事を掘り下げる'});await expect(nav.getByRole('link')).toHaveCount(1);
 const linkBox=await nav.getByRole('link').boundingBox(),navBox=await nav.boundingBox();expect(linkBox!.width).toBeGreaterThan(navBox!.width*0.8);
 await nav.getByRole('link',{name:'Fixture companion detail'}).click();await expect(page).toHaveURL(new RegExp(child+'$'));await expect(page.getByRole('heading',{name:'Fixture companion detail',exact:true})).toBeVisible();
 await page.getByRole('link',{name:/元の記事へ：/}).click();await expect(page).toHaveURL(new RegExp(parent+'$'));
 await page.goto('/knowdes?category=engineering&tag=subarticle-only');await expect(page.getByText('0 posts',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Fixture companion detail'})).toHaveCount(0);
 await expect(page.getByRole('navigation',{name:'Filter posts by tag'}).getByRole('link',{name:'subarticle-only',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
