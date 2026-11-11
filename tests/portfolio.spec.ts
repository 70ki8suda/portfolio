import { expect, test, type Locator } from '@playwright/test';

// The full-viewport canvas sits behind the controls. Exclude their hover/label
// changes so image comparisons measure the artwork rather than the overlaid UI.
const artworkScreenshot = (canvas: Locator) => canvas.screenshot({
  style: 'header, [aria-label="Artwork controls"] { visibility: hidden !important; }',
});

test('renders the portfolio and keeps every navigation destination real', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where spirit meets technology.');
  await expect(page.locator('#hero-message')).toContainText('A sustainable world where spirituality and technology coexist.');
  await expect(page.locator('canvas[data-engine]')).toBeVisible();
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
  const canvas = page.locator('canvas[data-engine]');
  await expect(canvas).toBeVisible();
  const pause = page.getByRole('button', { name: 'Pause animation' });
  await pause.click();
  await expect(page.getByRole('button', { name: 'Resume animation' })).toBeVisible();

  const geometry = page.getByRole('radio', { name: 'Geometry', exact: true });
  await geometry.click();
  await expect(geometry).toBeChecked();
  const geometryImage = await artworkScreenshot(canvas);
  await geometry.press('ArrowLeft');
  await expect(page.getByRole('radio', { name: 'Bloom', exact: true })).toBeChecked();
  await expect.poll(async () => (await artworkScreenshot(canvas)).equals(geometryImage)).toBe(false);

  await page.getByRole('radio', { name: 'Interference', exact: true }).click();
  const intensity = page.getByRole('slider', { name: 'Intensity' });
  await intensity.focus();
  await intensity.press('Home');
  await expect(intensity).toHaveValue('0');
  const lowIntensity = await artworkScreenshot(canvas);
  await intensity.press('End');
  await expect(intensity).toHaveValue('100');
  await expect.poll(async () => (await artworkScreenshot(canvas)).equals(lowIntensity)).toBe(false);

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
  const canvas = page.locator('canvas[data-engine]');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await canvas.scrollIntoViewIfNeeded();
  // The button state precedes the final demand-rendered frame and scroll resize.
  // Establish a stable frame before testing that pointer motion cannot disturb it.
  let frozen = await artworkScreenshot(canvas);
  let stableFrames = 0;
  await expect.poll(async () => {
    const next = await artworkScreenshot(canvas);
    stableFrames = next.equals(frozen) ? stableFrames + 1 : 0;
    frozen = next;
    return stableFrames;
  }).toBeGreaterThanOrEqual(2);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas has no bounds');
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  // A temporal assertion: a paused frame must remain identical over time.
  await page.waitForTimeout(600);
  expect((await artworkScreenshot(canvas)).equals(frozen)).toBe(true);
  await page.getByRole('button', { name: 'Resume animation' }).click();
  await expect.poll(async () => (await artworkScreenshot(canvas)).equals(frozen)).toBe(false);
});

test('fits small mobile, tablet, and wide screens without horizontal overflow', async ({ page }, testInfo) => {
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
    expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    const artwork = await page.getByRole('figure', { name: 'A living future — interactive artwork' }).boundingBox();
    expect(artwork?.x).toBe(0);
    expect(artwork?.y).toBe(0);
    expect(artwork?.width).toBe(width);
    expect(artwork?.height).toBe(900);
    const message = await page.locator('#hero-message').boundingBox();
    const controlGroup = await page.getByRole('group', { name: 'Artwork controls', exact: true }).boundingBox();
    expect(message && controlGroup && message.y + message.height <= controlGroup.y).toBe(true);
    if (width === 320) {
      // The three modes stay on one row even on the narrowest phone.
      const rows = await page.getByRole('radio').evaluateAll((radios) => radios.map((radio) => Math.round(radio.getBoundingClientRect().top)));
      expect(new Set(rows).size).toBe(1);
    }
    if (width === 390 || width === 1440) {
      await expect(page.locator('canvas[data-engine]')).toBeVisible();
      // The art area's core must stay clear of the title and the introduction.
      const sceneRoot = page.locator('[data-art-x]');
      await expect(sceneRoot).toHaveAttribute('data-art-core', /^[1-9]\d*$/);
      const core = await sceneRoot.evaluate((element) => {
        const data = (element as HTMLElement).dataset;
        return { x: Number(data.artX), y: Number(data.artY), radius: Number(data.artCore) };
      });
      for (const selector of ['#hero-title', '#hero-message']) {
        const box = await page.locator(selector).boundingBox();
        if (!box) throw new Error(`${selector} has no bounds`);
        const dx = core.x - Math.max(box.x, Math.min(core.x, box.x + box.width));
        const dy = core.y - Math.max(box.y, Math.min(core.y, box.y + box.height));
        expect(Math.hypot(dx, dy), `art area overlaps ${selector} at ${width}px`).toBeGreaterThan(core.radius);
      }
    }
    if (width === 1440) {
      // The hero title leads the page typographically and sets in two lines.
      const sizes = await page.evaluate(() => ({
        hero: parseFloat(getComputedStyle(document.querySelector('#hero-title')!).fontSize),
        work: parseFloat(getComputedStyle(document.querySelector('#work h2')!).fontSize),
        lines: document.querySelector('#hero-title')!.getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('#hero-title')!).lineHeight),
      }));
      expect(sizes.hero).toBeGreaterThanOrEqual(sizes.work);
      expect(Math.round(sizes.lines)).toBe(2);
    }
    if (width === 390 || width === 1440) {
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
  // SSR exposes the controls before hydration; the client-only fallback confirms readiness.
  await expect(page.getByTestId('scene-fallback')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Bloom', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Bloom', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Bloom', exact: true })).toBeChecked();
  await expect(page.getByRole('link', { name: 'Explore Nodex', exact: true })).toHaveAttribute('href', 'https://github.com/70ki8suda/nodex');
  await expect(page.getByTestId('scene-fallback')).toBeVisible();
});

test('shows the static artwork if the running WebGL context is lost', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas[data-engine]')).toBeVisible();
  await expect(page.locator('canvas[data-engine]')).toHaveAttribute('data-scene-ready', 'true');
  await page.locator('canvas[data-engine]').evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss extension unavailable');
    extension.loseContext();
  });
  await expect(page.getByTestId('scene-fallback')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Artwork controls', exact: true })).toBeVisible();
});
