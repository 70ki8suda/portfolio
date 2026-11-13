import { expect, test } from '@playwright/test';

// Includes SwiftShader context teardown after the interaction assertions.
test.setTimeout(90_000);

test('places a lazy, bounded map between the hero and blog link without taking page scroll', async ({ page }) => {
  let graphRequests = 0;
  page.on('request', r => { if (r.url().includes('/paragraph-graph.json')) graphRequests++; });
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto('/');
  await expect(page.getByTestId('fluid-backdrop')).not.toHaveAttribute('data-state', 'idle');
  const host = page.getByTestId('home-graph');
  await expect(host).toHaveCount(1);
  const order = await page.evaluate(() => {
    const hero = document.querySelector('#top')!, map = document.querySelector('[data-testid="home-graph"]')!, link = document.querySelector('[data-testid="home-blog-link"]')!, contact = document.querySelector('#contact')!;
    return [hero.compareDocumentPosition(map), map.compareDocumentPosition(link), link.compareDocumentPosition(contact)].every(n => (n & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
  });
  expect(order).toBe(true);
  if ((await host.boundingBox())!.y >= 600) expect(graphRequests).toBe(0);
  await host.scrollIntoViewIfNeeded();
  await expect(host.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  await expect(host.getByRole('button', { name: 'graph viewを操作', exact: true })).toBeVisible();
  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, Math.max(20, Math.min(550, box.y + box.height / 2)));
  const before = await page.evaluate(() => scrollY); await page.mouse.wheel(0, 180);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
  await host.scrollIntoViewIfNeeded(); await host.getByRole('button', { name: 'graph viewを操作', exact: true }).click();
  await host.getByRole('button', { name: '段落', exact: true }).click(); await expect(host.getByTestId('graph-canvas')).toHaveAttribute('data-level', 'paragraph');
  await host.getByRole('button', { name: '探す', exact: true }).click();
  await host.getByRole('searchbox', { name: '段落を検索' }).fill('宣言が描く分散した共同体');
  await host.getByRole('list', { name: '段落の検索結果' }).getByRole('button').first().click();
  await expect(host.getByTestId('graph-sheet')).toContainText('選んだ段落');
  await expect(page).toHaveURL(/\/$/);
  await host.getByRole('button', { name: 'ページ操作へ' }).click();
  await expect(host.getByRole('button', { name: 'graph viewを操作', exact: true })).toBeVisible();
  await expect(page.getByTestId('home-blog-link')).toHaveText('ブログの記事一覧へ');
  await page.getByTestId('home-blog-link').click(); await expect(page).toHaveURL(/\/blog$/);
});

test('embedded mobile map has scroll margins and explicit touch control', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(); await page.goto('/');
  await expect(page.getByTestId('fluid-backdrop')).not.toHaveAttribute('data-state', 'idle');
  const host = page.getByTestId('home-graph'); await host.scrollIntoViewIfNeeded();
  await expect(host.getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  const box = (await host.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(12); expect(box.width).toBeLessThanOrEqual(366); expect(box.height).toBeLessThan(700);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await host.getByRole('button', { name: 'graph viewを操作', exact: true }).tap();
  await host.getByRole('button', { name: '段落', exact: true }).tap(); await expect(host.getByTestId('graph-canvas')).toHaveAttribute('data-level', 'paragraph');
  await host.getByRole('button', { name: 'ページ操作へ' }).tap();
  const cdp = await context.newCDPSession(page); const start = await page.evaluate(() => scrollY);
  const p = (await host.boundingBox())!; const y = Math.min(600, p.y + p.height - 50);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y, id: 1 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: y - i * 18, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(start);
  await context.close();
});

test('inactive embedded map cannot take keyboard focus and restores the activation button', async ({ page }) => {
  // Test focus order without competing continuous SwiftShader hero rendering.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByTestId('fluid-backdrop')).not.toHaveAttribute('data-state', 'idle');
  const host = page.getByTestId('home-graph'); await host.scrollIntoViewIfNeeded();
  const canvas = host.getByTestId('graph-canvas'); await expect(canvas).toBeVisible({ timeout: 30_000 });
  const activate = host.getByRole('button', { name: 'graph viewを操作', exact: true });
  await activate.focus(); await page.keyboard.press('Shift+Tab');
  expect(await host.locator('[inert]').evaluate(el => el.contains(document.activeElement))).toBe(false);
  await activate.focus(); await page.keyboard.press('Tab');
  await expect(page.getByTestId('home-blog-link')).toBeFocused();
  await activate.focus(); await page.keyboard.press('Enter'); await expect(canvas).toBeFocused();
  await host.getByRole('button', { name: '探す', exact: true }).click();
  await host.getByRole('searchbox', { name: '段落を検索' }).fill('共同体');
  await host.getByRole('button', { name: 'ページ操作へ' }).click(); await expect(activate).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.getByTestId('home-blog-link')).toBeFocused();
  expect(await host.locator('[inert]').evaluate(el => el.contains(document.activeElement))).toBe(false);
});
