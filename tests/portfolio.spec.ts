import { expect, test, type Locator } from '@playwright/test';

// The full-viewport canvas sits behind the title and the controls. Hide everything stacked
// over it so image comparisons measure the artwork rather than the overlaid UI.
// The server renders the canvas element; `data-ready` is set by the first frame drawn, so it
// also says that the page has hydrated and the controls are live.
const artworkReady = (canvas: Locator) => expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
const artworkScreenshot = (canvas: Locator) => canvas.screenshot({
  // `display`, not `visibility`: see INK_ONLY in fluid-backdrop.spec.ts.
  style: 'header, #top > div { display: none !important; }',
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
  await expect(page.getByTestId('fluid-canvas')).toBeVisible();
  // One canvas draws the whole artwork.
  await expect(page.locator('#top canvas')).toHaveCount(1);
  await expect(page.getByRole('radiogroup', { name: 'Change the state' })).toHaveCount(0);
  await expect(page.getByTestId('fluid-backdrop').locator(':scope > *')).toHaveCount(1);
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
  const canvas = page.getByTestId('fluid-canvas');
  await expect(canvas).toBeVisible();
  await artworkReady(canvas);
  const pause = page.getByRole('button', { name: 'Pause animation' });
  await pause.click();
  await expect(page.getByRole('button', { name: 'Resume animation' })).toBeVisible();

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
  await page.getByRole('slider', { name: 'Intensity' }).press('End');
  await expect(page.getByRole('slider', { name: 'Intensity' })).toHaveValue('100');
  await expect(page.getByRole('slider', { name: 'Intensity' })).toBeEnabled();
});

test('pause freezes the actual artwork including pointer motion and resumes it', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('fluid-canvas');
  await expect(canvas).toBeVisible();
  await artworkReady(canvas);
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await canvas.scrollIntoViewIfNeeded();
  // The button state can precede the last frame already scheduled.
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
  // Five page loads and two full captures: under the software renderer the wetland draws a few frames a second.
  test.setTimeout(120_000);
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
    if (width === 390 || width === 1440) {
      await expect(page.getByTestId('fluid-canvas')).toBeVisible();
      // The picture sits under the title: nothing of the artwork is stacked over the copy.
      const layers = await page.evaluate(() => {
        const order = (element: Element | null) => Number(getComputedStyle(element!).zIndex);
        const figure = document.querySelector('#top figure');
        return { picture: order(figure), copy: order(document.querySelector('#hero-title')!.parentElement!.parentElement), siblings: figure?.parentElement === document.querySelector('#top') };
      });
      expect(layers.siblings).toBe(true);
      expect(layers.copy).toBeGreaterThan(layers.picture);
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
    const intensity = page.getByRole('slider', { name: 'Intensity' });
    await intensity.scrollIntoViewIfNeeded();
    await expect(intensity).toBeInViewport();
    await intensity.press('Home');
    await expect(intensity).toHaveValue('0');
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
  // SSR exposes the controls before hydration; the backdrop's state confirms the client is running.
  await expect(page.getByTestId('fluid-backdrop')).toHaveAttribute('data-state', 'unavailable');
  await expect(page.getByTestId('fluid-canvas')).toBeHidden();
  const intensity = page.getByRole('slider', { name: 'Intensity' });
  await expect(intensity).toBeEnabled();
  await intensity.press('Home');
  await expect(intensity).toHaveValue('0');
  await expect(page.getByRole('link', { name: 'Explore Nodex', exact: true })).toHaveAttribute('href', 'https://github.com/70ki8suda/nodex');
  // What remains is the CSS wash on the backdrop, still under the figure's name.
  await expect(page.getByRole('figure', { name: 'A living future — interactive artwork' })).toBeVisible();
  expect(await page.getByTestId('fluid-backdrop').evaluate((node) => getComputedStyle(node).backgroundImage)).toContain('gradient');
});

test('shows the static backdrop if the running WebGL context is lost', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('fluid-canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await canvas.evaluate((node) => {
    const gl = (node as HTMLCanvasElement).getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Context loss extension unavailable');
    extension.loseContext();
  });
  await expect(page.getByTestId('fluid-backdrop')).toHaveAttribute('data-state', 'unavailable');
  await expect(canvas).toBeHidden();
  await expect(page.getByRole('group', { name: 'Artwork controls', exact: true })).toBeVisible();
});
