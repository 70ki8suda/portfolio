import { expect, test, type Page } from '@playwright/test';

// VFX-JS page transitions (src/transitions). Posts come from tests/fixtures/posts,
// served because playwright.config.ts starts the dev server with BLOG_FIXTURES=1.
// Headless Chromium has no html-in-canvas, so these runs use the dom-to-canvas capture,
// which is also what today's stable browsers use.
const SLOW_POST = '/blog/fixture-writing-slowly';
const FIELD_GUIDE = '/blog/fixture-markdown-field-guide';
const VIDEO_POST = '/blog/fixture-video-part-1';

interface TransitionEvent { phase: 'start' | 'end' | 'skip' | 'abort'; reason?: string; capture?: string; played?: boolean }
declare global {
  interface Window {
    __transitions: TransitionEvent[];
    __blobUrls: { created: string[]; revoked: string[] };
    __encoding?: boolean;
  }
}

const stage = (page: Page) => page.locator('[data-page-transition="stage"]');
const output = (page: Page) => page.locator('canvas[data-page-transition="output"]');
const events = (page: Page) => page.evaluate(() => window.__transitions);
const postLink = (page: Page, title: RegExp) => page.locator('h2 a', { hasText: title });

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

/** Waits until `count` navigations have finished their transition, one way or another. */
async function settled(page: Page, count = 1) {
  await page.waitForFunction(
    (expected) => window.__transitions.filter((event) => event.phase !== 'start').length >= expected,
    count,
    { timeout: 15_000 },
  );
  return events(page);
}

async function expectAtRest(page: Page) {
  await expect(output(page)).toBeHidden();
  await expect(stage(page)).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-page-transition-state');
  expect(await page.evaluate(() => document.documentElement.style.scrollBehavior)).toBe('');
}

async function openBlog(page: Page, path = '/blog') {
  await page.goto(path);
  // The router subscription is made in an effect, after hydration.
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  await page.waitForTimeout(500);
}

// A cold dev server compiles routes and the renderer on first use, which would time the
// first transition out. Visit both page types once before anything is measured.
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await page.goto('/blog');
  await page.waitForTimeout(1000);
  await page.locator('h2 a', { hasText: /Writing slowly/ }).click();
  await page.getByRole('heading', { level: 1, name: /Writing slowly/ }).waitFor();
  await page.waitForTimeout(3000);
  await page.close();
});

test.beforeEach(async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' }));
  await page.route('**/fixtures/signal-grid.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>' }));
  await page.addInitScript(() => {
    window.__transitions = [];
    window.addEventListener('pagetransition', (event) => window.__transitions.push((event as CustomEvent).detail));
  });
});

test('server HTML carries no transition markup and hydrates without errors', async ({ page, request }) => {
  const html = await (await request.get('/blog')).text();
  expect(html).toContain('Fixture: Writing slowly, publishing plainly');
  expect(html).not.toContain('data-page-transition');
  expect(html).not.toContain('vfx');

  const errors = collectErrors(page);
  await openBlog(page);
  // Nothing is created until a navigation needs it.
  await expect(stage(page)).toHaveCount(0);
  await expect(output(page)).toHaveCount(0);
  expect(await events(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('plays the VFX-JS shader between the list and a post, then leaves the live page', async ({ page }) => {
  const errors = collectErrors(page);
  await openBlog(page);
  const listAtRest = await page.screenshot();

  await postLink(page, /Writing slowly/).click();
  await expect(page.locator('html')).toHaveAttribute('data-page-transition-state', 'running');
  await expect(stage(page)).toHaveCount(1);
  // The copy is inert and hidden from assistive technology.
  await expect(stage(page)).toHaveAttribute('aria-hidden', 'true');
  expect(await stage(page).locator('> div').evaluate((element) => (element as HTMLElement).inert)).toBe(true);

  // Frames differ while the shader mixes the two pages.
  const frames = new Set<string>();
  while ((await events(page)).every((event) => event.phase === 'start')) {
    frames.add((await page.screenshot()).toString('base64'));
  }
  const log = await settled(page);
  expect(log).toEqual([
    { phase: 'start', capture: 'dom-to-canvas' },
    { phase: 'end', capture: 'dom-to-canvas', played: true },
  ]);
  expect(frames.size).toBeGreaterThanOrEqual(3);

  await expect(page).toHaveURL(SLOW_POST);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fixture: Writing slowly, publishing plainly');
  await expectAtRest(page);
  // VFX-JS rendered into its own WebGL canvas, which is kept for the next navigation.
  await expect(output(page)).toHaveCount(1);
  expect(await output(page).evaluate((canvas: HTMLCanvasElement) => canvas.width > 0 && canvas.height > 0)).toBe(true);
  const postAtRest = await page.screenshot();
  expect(postAtRest.equals(listAtRest)).toBe(false);

  // The live page is the real one: its links work and focus is not trapped.
  await page.getByRole('link', { name: /All posts/ }).first().click();
  await settled(page, 2);
  await expect(page).toHaveURL('/blog');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Blog.');
  await expectAtRest(page);
  expect((await events(page)).at(-1)).toMatchObject({ phase: 'end', played: true });
  expect(errors).toEqual([]);
});

test('back and forward restore the scroll position of a long article', async ({ page }) => {
  await openBlog(page, FIELD_GUIDE);
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
  await page.waitForTimeout(300);
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(600);

  await page.locator('aside').getByRole('link', { name: /All posts/ }).click();
  await settled(page);
  await expect(page).toHaveURL('/blog');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expectAtRest(page);

  await page.goBack();
  await settled(page, 2);
  await expect(page).toHaveURL(FIELD_GUIDE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fixture: A field guide to Markdown on this blog');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(scrolled, -1);
  await expectAtRest(page);

  await page.goForward();
  await settled(page, 3);
  await expect(page).toHaveURL('/blog');
  await expectAtRest(page);
  // Each of the three navigations either played or fell back; none was left hanging.
  expect((await events(page)).filter((event) => event.phase !== 'start')).toHaveLength(3);
});

test('tag filters and hash links navigate without a transition', async ({ page }) => {
  await openBlog(page);
  await page.getByRole('navigation', { name: 'Filter posts by tag' }).getByRole('link', { name: 'fixture-notes' }).click();
  await expect(page).toHaveURL(/\/blog\?tag=fixture-notes$/);
  await expect(page.locator('h2 a')).toHaveCount(1);

  await page.getByRole('link', { name: /Back to top/ }).click();
  await expect(page).toHaveURL(/#main$/);
  await page.waitForTimeout(400);

  expect(await events(page)).toEqual([]);
  await expect(stage(page)).toHaveCount(0);
  await expect(output(page)).toHaveCount(0);
});

test('a modifier-click is left to the browser', async ({ page, context }) => {
  await openBlog(page);
  await postLink(page, /Writing slowly/).click({ modifiers: ['ControlOrMeta'] });
  // The browser opens the post in a new tab (when the platform does so); this page stays put.
  await page.waitForTimeout(800);
  for (const tab of context.pages().filter((other) => other !== page)) await expect(tab).toHaveURL(SLOW_POST);
  await expect(page).toHaveURL('/blog');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Blog.');
  expect(await events(page)).toEqual([]);
  await expect(stage(page)).toHaveCount(0);
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('navigates plainly and never creates the renderer', async ({ page }) => {
    await openBlog(page);
    await postLink(page, /Writing slowly/).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fixture: Writing slowly, publishing plainly');
    expect(await settled(page)).toEqual([{ phase: 'skip', reason: 'reduced motion' }]);
    await expect(stage(page)).toHaveCount(0);
    await expect(output(page)).toHaveCount(0);
  });
});

test('turning reduced motion on mid-transition cancels it', async ({ page }) => {
  await openBlog(page);
  await postLink(page, /Writing slowly/).click();
  await expect(stage(page)).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const log = await settled(page);
  expect(log.at(-1)).toEqual({ phase: 'abort', reason: 'reduced motion' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fixture: Writing slowly, publishing plainly');
  await expectAtRest(page);
});

test('a second navigation during a transition cancels it and still lands correctly', async ({ page }) => {
  const errors = collectErrors(page);
  await openBlog(page);
  await postLink(page, /Writing slowly/).click();
  await expect(stage(page)).toHaveCount(1);
  await page.goBack();

  const log = await settled(page);
  expect(log.at(-1)).toEqual({ phase: 'abort', reason: 'superseded by another navigation' });
  await expect(page).toHaveURL('/blog');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Blog.');
  await expectAtRest(page);

  // The adapter recovers: the next navigation plays again.
  await postLink(page, /field guide/).click();
  expect((await settled(page, 2)).at(-1)).toMatchObject({ phase: 'end', played: true });
  await expect(page).toHaveURL(FIELD_GUIDE);
  await expectAtRest(page);
  expect(errors).toEqual([]);
});

test('a page showing an embedded video frame is never put through the shader', async ({ page }) => {
  await openBlog(page);
  // Entering: the copy is dropped as soon as the new page turns out to show the frame.
  await postLink(page, /動画解説 第1回/).click();
  let log = await settled(page);
  expect(log.at(-1)).toEqual({ phase: 'abort', reason: 'new page shows iframe' });
  await expect(page).toHaveURL(VIDEO_POST);
  const frame = page.locator('iframe');
  await expect(frame).toBeVisible();
  await expectAtRest(page);

  // Leaving: nothing is staged at all.
  await page.locator('aside').getByRole('link', { name: /All posts/ }).click();
  log = await settled(page, 2);
  expect(log.at(-1)).toEqual({ phase: 'skip', reason: 'page shows iframe' });
  await expect(page).toHaveURL('/blog');
  await expectAtRest(page);
});

test.describe('without WebGL', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith('webgl')) return null;
        return (getContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof getContext;
    });
  });

  test('navigation completes and later navigations skip at once', async ({ page }) => {
    await openBlog(page);
    await postLink(page, /Writing slowly/).click();
    expect(await settled(page)).toEqual([{ phase: 'abort', reason: 'renderer unavailable' }]);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fixture: Writing slowly, publishing plainly');
    await expectAtRest(page);
    await expect(output(page)).toHaveCount(0);

    await page.getByRole('link', { name: /All posts/ }).first().click();
    expect((await settled(page, 2)).at(-1)).toEqual({ phase: 'skip', reason: 'renderer unavailable' });
    await expect(page).toHaveURL('/blog');
    await expectAtRest(page);
  });
});

test('navigation completes when the renderer fails to load', async ({ page }) => {
  await page.route(/vfx-js/, (route) => route.abort());
  await openBlog(page);
  await postLink(page, /Writing slowly/).click();
  expect(await settled(page)).toEqual([{ phase: 'abort', reason: 'renderer unavailable' }]);
  await expect(page).toHaveURL(SLOW_POST);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fixture: Writing slowly, publishing plainly');
  await expectAtRest(page);
});

test.describe('canvas stills', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__blobUrls = { created: [], revoked: [] };
      const create = URL.createObjectURL.bind(URL);
      const revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (source: Blob | MediaSource) => {
        const url = create(source);
        window.__blobUrls.created.push(url);
        return url;
      };
      URL.revokeObjectURL = (url: string) => {
        window.__blobUrls.revoked.push(url);
        revoke(url);
      };
    });
  });

  /**
   * Adds a painted 2D canvas, standing in for the homepage artwork. It is fixed to the
   * viewport inside the blog layout, so it is on screen before and after the navigation.
   */
  async function addCanvas(page: Page) {
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 120;
      canvas.style.cssText = 'position:fixed;left:0;top:0;z-index:5;width:200px;height:120px;';
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#366b87';
      context.fillRect(0, 0, 200, 120);
      document.querySelector('main')!.prepend(canvas);
    });
  }

  test('a visible canvas is carried through the shader as a still, and its blob URL is released', async ({ page }) => {
    await openBlog(page);
    await addCanvas(page);
    await postLink(page, /Writing slowly/).click();
    const log = await settled(page);
    expect(log.at(-1)).toMatchObject({ phase: 'end', played: true });
    const urls = await page.evaluate(() => window.__blobUrls);
    // One still per copy: the page that was left and the page that was entered.
    expect(urls.created).toHaveLength(2);
    expect(urls.revoked).toEqual(expect.arrayContaining(urls.created));
    await expectAtRest(page);
  });

  test('cancelling while a still is being encoded leaks no blob URL', async ({ page }) => {
    await page.addInitScript(() => {
      const toBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (this: HTMLCanvasElement, callback: BlobCallback, ...rest: unknown[]) {
        window.__encoding = true;
        (toBlob as (...args: unknown[]) => void).call(this, (blob: Blob | null) => setTimeout(() => callback(blob), 900), ...rest);
      } as typeof toBlob;
    });
    await openBlog(page);
    await addCanvas(page);
    await postLink(page, /Writing slowly/).click();
    // Cancel only once the encode has started, so its result arrives after the run is gone.
    await page.waitForFunction(() => window.__encoding === true);
    await expect(stage(page)).toHaveCount(1);
    await page.goBack();
    const log = await settled(page);
    expect(log.at(-1)).toEqual({ phase: 'abort', reason: 'superseded by another navigation' });
    await expectAtRest(page);

    await page.waitForTimeout(1300); // past the delayed encode
    const urls = await page.evaluate(() => window.__blobUrls);
    expect(urls.created.filter((url) => !urls.revoked.includes(url))).toEqual([]);
    await expect(page).toHaveURL('/blog');
    await expect(stage(page)).toHaveCount(0);
  });

  test('a canvas whose picture cannot be read keeps the navigation plain', async ({ page }) => {
    await openBlog(page);
    // Never painted, so there is nothing faithful to show: like a WebGL canvas read outside its frame.
    await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;left:0;top:0;z-index:5;width:200px;height:120px;';
      document.querySelector('main')!.prepend(canvas);
    });
    await postLink(page, /Writing slowly/).click();
    expect(await settled(page)).toEqual([{ phase: 'skip', reason: 'page shows canvas' }]);
    await expect(page).toHaveURL(SLOW_POST);
    await expectAtRest(page);
  });
});
