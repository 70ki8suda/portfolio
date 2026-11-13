import { test, expect } from '@playwright/test';
for (const width of [1280,390]) test(`editorial tabs and topic URLs at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/blog');
 const main=page.locator('#main'),groups=main.getByRole('navigation',{name:'記事の区分'});
 const essays=groups.getByRole('link',{name:'探究・エッセイ'}),economy=groups.getByRole('link',{name:'時事経済'});
 await expect(essays).toHaveAttribute('aria-current','page');
 await expect(main.locator('h2 a[href="/blog/dalio-ai-bubble-and-japan-economy"]')).toHaveCount(0);
 await expect(main.locator('h2 a[href="/blog/solarpunk-three-tracks"]')).toBeVisible();
 await economy.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/category=current-economy/);
 await expect(economy).toHaveAttribute('aria-current','page');await expect(main.locator('h2')).toHaveCount(3);
 await main.getByRole('navigation',{name:'Filter posts by tag'}).getByRole('link',{name:'AI投資',exact:true}).click();
 await expect(main.locator('h2')).toHaveCount(3);await expect(page).toHaveURL(/tag=/);
 await essays.click();await expect(main.locator('h2')).toHaveCount(0);await expect(main.getByRole('link',{name:'時事経済にも3件'})).toBeVisible();
 await page.goBack();await expect(economy).toHaveAttribute('aria-current','page');await expect(main.locator('h2')).toHaveCount(3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await main.locator('h2 a[href="/blog/dalio-ai-bubble-and-japan-economy"]').click();await expect(main.getByRole('heading',{level:1})).toBeVisible();
 await page.goto('/blog?tag=Garys%20Economics');await expect(main.locator('h2')).toHaveCount(1);await expect(main.getByText('以前のタグ「Garys Economics」が付いていた記事を表示しています。')).toBeVisible();
});
