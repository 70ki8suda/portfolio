import { expect, test } from '@playwright/test';

// Warm the dev route/renderer chunks before deliberately delaying capture; otherwise
// cold compilation can exhaust the transition's watchdog before the test reaches it.
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('/blog');
  await page.locator('h2 a[href="/blog/garys-economics-guide"]').click();
  await page.waitForTimeout(2500);
  await page.close();
});

for (const input of ['wheel', 'touch', 'keyboard'] as const) {
  test(`${input} scrolling interrupts a pending page capture and reaches the live article`, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ body: '<html></html>', contentType: 'text/html' }));
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        // Hold capture long enough to exercise scrolling while the navigation overlay exists.
        original.call(this, blob => setTimeout(() => callback(blob), 2000), type, quality);
      };
    });
    await page.goto('/blog');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 60; canvas.height = 60;
      canvas.style.cssText = 'position:fixed;left:0;top:0;width:60px;height:60px;';
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#366b87'; context.fillRect(0, 0, 60, 60);
      document.querySelector('main')!.prepend(canvas);
    });
    await page.locator('h2 a[href="/blog/garys-economics-guide"]').click();
    await expect(page).toHaveURL(/garys-economics-guide$/);
    const overlay = page.locator('[data-page-transition="stage"]');
    await expect(overlay).toHaveCount(1);
    if (input === 'wheel') {
      await page.mouse.move(800, 500);
      await page.mouse.wheel(0, 550);
    } else if (input === 'keyboard') {
      await page.keyboard.press('PageDown');
    } else {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 800, y: 600, id: 1 }] });
      for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 800, y: 600 - i * 40, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await expect(overlay).toHaveCount(0, { timeout: 700 });
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 1000 }).toBeGreaterThan(100);
    await expect(page.locator('html')).not.toHaveAttribute('data-page-transition-state');
    // Late capture completion must not restore the blocking layer.
    await page.waitForTimeout(2200);
    await expect(overlay).toHaveCount(0);
    const before = await page.evaluate(() => scrollY);
    await page.mouse.move(800, 500);
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 100);
  });
}
