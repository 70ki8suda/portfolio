import { expect, test, type Page } from '@playwright/test';

test.describe('nature video backdrop', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // These media checks isolate video playback from the separate WebGL artwork.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
        if (contextId === 'webgl' || contextId === 'webgl2') return null;
        return Reflect.apply(original, this, [contextId, options]);
      } as typeof original;
    });
  });

  async function openPlaying(page: Page) {
    await page.goto('/');
    const backdrop = page.getByTestId('nature-backdrop');
    await expect(backdrop).toHaveAttribute('data-state', 'playing', { timeout: 10_000 });
    await expect(backdrop).toHaveAttribute('data-clip', 'water');
    return backdrop;
  }

  async function visibleFrame(page: Page) {
    return page.locator('video[data-active="true"]').evaluate((node) => {
      const video = node as HTMLVideoElement;
      return { clip: video.dataset.clip, time: video.currentTime, paused: video.paused };
    });
  }

  test('plays real muted inline footage and cuts through a two-video buffer', async ({ page }) => {
    const requested = new Set<string>();
    page.on('request', (request) => {
      if (/\/media\/nature-.*\.mp4/.test(request.url())) requested.add(request.url());
    });
    const backdrop = await openPlaying(page);
    await expect(backdrop.locator('video')).toHaveCount(2);
    const media = await backdrop.locator('video').evaluateAll((nodes) => nodes.map((node) => {
      const video = node as HTMLVideoElement;
      return { muted: video.muted, inline: video.playsInline, controls: video.controls };
    }));
    expect(media.every((video) => video.muted && video.inline && !video.controls)).toBe(true);
    expect(requested.size).toBeLessThanOrEqual(2);
    await expect(backdrop).toHaveAttribute('data-clip', 'green', { timeout: 7000 });
    await expect(backdrop.locator('video[data-active="true"]')).toHaveCSS('opacity', '1');
    await expect(backdrop).toHaveAttribute('data-clip', 'sky', { timeout: 7000 });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where spirit meets technology.');
  });

  test('the shared pause control freezes both playback and editorial cuts', async ({ page }) => {
    const backdrop = await openPlaying(page);
    await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
    await expect(backdrop).toHaveAttribute('data-state', 'paused');
    const before = await visibleFrame(page);
    expect(before.paused).toBe(true);
    await page.waitForTimeout(3700);
    const after = await visibleFrame(page);
    expect(after.clip).toBe(before.clip);
    expect(Math.abs(after.time - before.time)).toBeLessThan(0.08);
    await page.getByRole('button', { name: 'Resume animation', exact: true }).click();
    await expect(backdrop).toHaveAttribute('data-state', 'playing');
    await expect.poll(async () => (await visibleFrame(page)).paused).toBe(false);
  });

  test('reduced motion renders the poster and makes no video requests', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const requests: string[] = [];
    page.on('request', (request) => {
      if (/\/media\/nature-.*\.mp4/.test(request.url())) requests.push(request.url());
    });
    await page.goto('/');
    const backdrop = page.getByTestId('nature-backdrop');
    await expect(backdrop).toHaveAttribute('data-state', 'static');
    await expect(backdrop.locator('video')).toHaveCount(0);
    await expect.poll(async () => backdrop.locator('img').evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(requests).toEqual([]);
  });

  test('offscreen and hidden states suspend playback and the cut clock', async ({ page }) => {
    const backdrop = await openPlaying(page);
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await expect(backdrop).toHaveAttribute('data-state', 'offscreen');
    const before = await visibleFrame(page);
    await page.waitForTimeout(3300);
    const after = await visibleFrame(page);
    expect(after.clip).toBe(before.clip);
    expect(after.paused).toBe(true);
    expect(Math.abs(after.time - before.time)).toBeLessThan(0.08);
    await page.locator('#top').scrollIntoViewIfNeeded();
    await expect(backdrop).toHaveAttribute('data-state', 'playing');

    // Dispatch the document lifecycle event deterministically in the test tab.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(backdrop).toHaveAttribute('data-state', 'hidden');
    expect((await visibleFrame(page)).paused).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(backdrop).toHaveAttribute('data-state', 'playing');
  });

  test('keeps the current footage visible until the next clip is decoded', async ({ page }) => {
    let releaseNext!: () => void;
    const nextAllowed = new Promise<void>((resolve) => { releaseNext = resolve; });
    await page.route('**/media/nature-green.mp4', async (route) => {
      await nextAllowed;
      await route.continue();
    });
    try {
      const backdrop = await openPlaying(page);
      await page.waitForTimeout(3600);
      await expect(backdrop).toHaveAttribute('data-clip', 'water');
      await expect(backdrop.locator('video[data-active="true"]')).toHaveCSS('opacity', '1');
      releaseNext();
      await expect(backdrop).toHaveAttribute('data-clip', 'green', { timeout: 7000 });
    } finally {
      releaseNext();
    }
  });

  test('unavailable media and autoplay refusal retain a static usable hero', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/media/nature-*.mp4', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto('/');
    await expect(page.getByTestId('nature-backdrop')).toHaveAttribute('data-state', 'unavailable');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.unroute('**/media/nature-*.mp4');
    await page.addInitScript(() => {
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Autoplay denied for this test', 'NotAllowedError'));
    });
    await page.reload();
    const backdrop = page.getByTestId('nature-backdrop');
    await expect(backdrop).toHaveAttribute('data-state', 'blocked');
    await expect.poll(async () => backdrop.locator('img').evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await backdrop.locator('video').evaluateAll((nodes) => nodes.every((node) => (node as HTMLVideoElement).paused))).toBe(true);
    expect(errors).toEqual([]);
  });
});
