import { expect, test } from '@playwright/test';

test('hero and canvas depend on width, not viewport height', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const canvas = page.getByTestId('fluid-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  for (const width of [320, 375, 390, 430, 600, 680, 681, 1024, 1440]) {
    let baseline: number | undefined;
    for (const height of [667, 844, 932]) {
      await page.setViewportSize({ width, height });
      // Viewport units can update a frame after the element's available width.
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect.poll(async () => (await page.locator('#top').boundingBox())!.width).toBe(width);
      const hero = await page.locator('#top').boundingBox();
      expect(hero).not.toBeNull();
      baseline ??= hero!.height;
      expect(hero!.height).toBe(baseline);
      if (width === 390) expect(hero!.height).toBeCloseTo(844, 0);
      if (width === 1440) expect(hero!.height).toBeCloseTo(900, 0);
      await expect.poll(async () => (await canvas.boundingBox())!.height).toBe(baseline);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      for (const link of await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link').all()) {
        const box = (await link.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        if (width <= 680) expect(box.width).toBeGreaterThanOrEqual(44);
      }
    }
  }
});

test('returning from the blog restores the WebGL canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 667 });
  await page.goto('/');
  await expect(page.locator('#main').getByTestId('fluid-canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Blog', exact: true }).click();
  await expect(page).toHaveURL(/\/blog$/);
  await expect(page.locator('#main').getByTestId('fluid-canvas')).toHaveCount(0);
  await page.goBack();
  await expect(page.locator('#main').getByTestId('fluid-canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#main').getByTestId('fluid-backdrop')).toHaveAttribute('data-state', 'running');
});
