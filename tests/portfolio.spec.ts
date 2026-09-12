import { expect, test } from '@playwright/test';

test('renders the portfolio and keeps every navigation destination real', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('SIGNAL/BLOOM');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Interference' })).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Intensity' })).toHaveValue('65');

  for (const [name, destination] of [['Work', '#work'], ['Practice', '#practice'], ['Contact', '#contact']] as const) {
    await page.getByRole('navigation').getByRole('link', { name, exact: false }).click();
    await expect(page).toHaveURL(new RegExp(`${destination}$`));
    await expect(page.locator(destination)).toBeInViewport();
  }

  const externalLinks = await page.locator('a[href^="https:"]').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
  expect(externalLinks.length).toBeGreaterThan(0);
  expect(externalLinks.every((url) => ['https://github.com/70ki8suda', 'https://github.com/70ki8suda/nodex'].includes(url))).toBe(true);
  expect(errors).toEqual([]);
});

test('controls support keyboard input and visibly change the artwork', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const pause = page.getByRole('button', { name: 'Pause animation' });
  await pause.click();
  await expect(page.getByRole('button', { name: 'Resume animation' })).toBeVisible();

  const geometry = page.getByRole('radio', { name: 'Geometry', exact: true });
  await geometry.click();
  await expect(geometry).toBeChecked();
  const geometryImage = await canvas.screenshot();
  await geometry.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Bloom', exact: true })).toBeChecked();
  await expect.poll(async () => (await canvas.screenshot()).equals(geometryImage)).toBe(false);

  await page.getByRole('radio', { name: 'Interference', exact: true }).click();
  const intensity = page.getByRole('slider', { name: 'Intensity' });
  await intensity.focus();
  await intensity.press('Home');
  await expect(intensity).toHaveValue('0');
  const lowIntensity = await canvas.screenshot();
  await intensity.press('End');
  await expect(intensity).toHaveValue('100');
  await expect.poll(async () => (await canvas.screenshot()).equals(lowIntensity)).toBe(false);

  await page.getByRole('button', { name: 'Resume animation' }).click();
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible();
});

test('honors reduced motion while leaving form controls usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const pause = page.getByRole('button', { name: 'Animation paused for reduced motion' });
  await expect(pause).toBeDisabled();
  await expect(page.getByRole('group', { name: 'Artwork controls', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Geometry', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Geometry', exact: true })).toBeChecked();
  await expect(page.getByRole('slider', { name: 'Intensity' })).toBeEnabled();
});

test('pause freezes the actual artwork including pointer motion and resumes it', async ({ page }) => {
  await page.goto('/');
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await canvas.scrollIntoViewIfNeeded();
  const frozen = await canvas.screenshot();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounds');
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  // A temporal assertion: a paused frame must remain identical over time.
  await page.waitForTimeout(600);
  expect((await canvas.screenshot()).equals(frozen)).toBe(true);
  await page.getByRole('button', { name: 'Resume animation' }).click();
  await expect.poll(async () => (await canvas.screenshot()).equals(frozen)).toBe(false);
});

test('fits small mobile, tablet, and wide screens without horizontal overflow', async ({ page }, testInfo) => {
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    if (width === 390 || width === 1440) {
      await expect(page.locator('canvas')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`portfolio-${width}.png`), fullPage: width === 390 });
    }
    const modes = page.getByRole('radiogroup', { name: 'Change the state' });
    await modes.scrollIntoViewIfNeeded();
    await expect(modes).toBeInViewport();
    await page.getByRole('radio', { name: 'Geometry', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Geometry', exact: true })).toBeChecked();
  }
});

test('keeps the content and controls usable when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
      if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') return null;
      return Reflect.apply(getContext, this, [contextId, options]);
    } as typeof getContext;
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Bloom', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Bloom', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Bloom', exact: true })).toBeChecked();
  await expect(page.getByRole('link', { name: 'Explore Nodex', exact: true })).toHaveAttribute('href', 'https://github.com/70ki8suda/nodex');
  await expect(page.getByTestId('scene-fallback')).toBeVisible();
});

test('shows the static artwork if the running WebGL context is lost', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
  await page.locator('canvas').evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss extension unavailable');
    extension.loseContext();
  });
  await expect(page.getByTestId('scene-fallback')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Artwork controls', exact: true })).toBeVisible();
});
