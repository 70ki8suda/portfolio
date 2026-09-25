import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Every post used here lives in tests/fixtures/posts and is served only because
// playwright.config.ts starts the dev server with BLOG_FIXTURES=1. content/posts
// holds just the published articles.
const VIDEO_POST = '/blog/fixture-video-part-1';
const SERIES_PART_2 = '/blog/fixture-video-part-2';
const FIELD_GUIDE = '/blog/fixture-markdown-field-guide';
const SLOW_POST = '/blog/fixture-writing-slowly';
const DRAFT = '/blog/fixture-unpublished-draft';
const FIELD_GUIDE_IMAGE = readFileSync(new URL('fixtures/signal-grid.svg', import.meta.url), 'utf8');

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  // Keep tests hermetic: never load the real YouTube player.
  await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' }));
  // The field guide's image is test-only, so it is served here instead of from public/.
  await page.route('**/fixtures/signal-grid.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: FIELD_GUIDE_IMAGE }));
});

test.describe('server rendering', () => {
  test('renders post content and metadata without JavaScript', async ({ request }) => {
    const response = await request.get(FIELD_GUIDE);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('<title>Fixture: A field guide to Markdown on this blog — 70ki8suda</title>');
    expect(html).toMatch(/<meta name="description" content="A test-only post that exercises every supported Markdown feature/);
    expect(html).toContain('<meta property="og:type" content="article"/>');
    expect(html).toMatch(/<h1[^>]*>Fixture: A field guide to Markdown on this blog<\/h1>/);
  });

  test('lists posts on the server, newest first, without drafts', async ({ request }) => {
    const html = await (await request.get('/blog')).text();
    expect(html).toContain('<title>Blog — 70ki8suda</title>');
    const guide = html.indexOf('Fixture: A field guide to Markdown on this blog');
    const slowly = html.indexOf('Fixture: Writing slowly, publishing plainly');
    expect(guide).toBeGreaterThan(-1);
    expect(slowly).toBeGreaterThan(guide);
    expect(html).not.toContain('Not yet published');
    expect(html).not.toContain('UNPUBLISHED-DRAFT-MARKER');
  });

  for (const path of [DRAFT, '/blog/does-not-exist', '/blog/Not_A_Slug', '/no-such-page']) {
    test(`responds 404 for ${path}`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(404);
      const html = await response.text();
      expect(html).toMatch(/not found/i);
      expect(html).not.toContain('UNPUBLISHED-DRAFT-MARKER');
    });
  }

  test('keeps the homepage document in English', async ({ request }) => {
    const html = await (await request.get('/')).text();
    expect(html).toMatch(/^<!DOCTYPE html><html lang="en">/);
    expect(html).toContain('<title>70ki8suda — Where spirit meets technology</title>');
  });
});

test.describe('blog listing', () => {
  test('filters by tag and returns to all posts', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/blog');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Blog.');
    const posts = page.getByRole('main').getByRole('heading', { level: 2 });
    const total = await posts.count();
    expect(total).toBeGreaterThanOrEqual(4);

    const filters = page.getByRole('navigation', { name: 'Filter posts by tag' });
    await filters.getByRole('link', { name: 'fixture-markdown', exact: true }).click();
    await expect(page).toHaveURL(/\/blog\?tag=fixture-markdown$/);
    await expect(posts).toHaveCount(1);
    await expect(posts.first()).toHaveText('Fixture: A field guide to Markdown on this blog');
    await expect(filters.getByRole('link', { name: 'fixture-markdown', exact: true })).toHaveAttribute('aria-current', 'page');

    await filters.getByRole('link', { name: 'All', exact: true }).click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(posts).toHaveCount(total);
    expect(errors).toEqual([]);
  });

  test('explains an unknown tag instead of showing everything', async ({ page }) => {
    await page.goto('/blog?tag=nothing-here');
    await expect(page.getByText('No posts are tagged “nothing-here”.')).toBeVisible();
    await page.getByRole('link', { name: /Show all posts/ }).click();
    await expect(page).toHaveURL(/\/blog$/);
  });

  test('navigates client-side from the homepage to a post and back', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Blog' }).click();
    await expect(page).toHaveURL(/\/blog$/);
    await page.getByRole('link', { name: 'Fixture: Writing slowly, publishing plainly' }).click();
    await expect(page).toHaveURL(new RegExp(`${SLOW_POST}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fixture: Writing slowly, publishing plainly');
    await expect(page).toHaveTitle('Fixture: Writing slowly, publishing plainly — 70ki8suda');
    await page.getByRole('link', { name: 'All posts' }).first().click();
    await expect(page).toHaveURL(/\/blog$/);
    expect(errors).toEqual([]);
  });

  test('shows the not-found page when navigating client-side to a draft', async ({ page }) => {
    await page.goto('/blog');
    await page.evaluate((path) => {
      history.pushState({}, '', path);
      dispatchEvent(new PopStateEvent('popstate'));
    }, DRAFT);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Post not found.');
    await expect(page.getByText('UNPUBLISHED-DRAFT-MARKER')).toHaveCount(0);
  });
});

test.describe('article rendering', () => {
  test('renders Markdown safely: GFM, code, images, and no raw HTML or script URLs', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(SERIES_PART_2);
    const article = page.getByRole('article');
    await expect(article.locator('iframe')).toHaveCount(1); // only the validated YouTube embed
    await expect(article.locator('iframe[src*="evil.example"]')).toHaveCount(0);
    await expect(article.locator('script')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).__fixtureScriptRan)).toBeUndefined();
    const hrefs = await article.locator('a').evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    expect(hrefs.some((href) => /^\s*javascript:/i.test(href))).toBe(false);

    await page.goto(FIELD_GUIDE);
    const body = page.getByRole('article');
    await expect(body.getByRole('heading', { level: 2, name: 'Code' })).toBeVisible();
    await expect(body.getByRole('heading', { level: 3, name: 'A smaller heading' })).toBeVisible();
    await expect(body.getByRole('table')).toBeVisible();
    await expect(body.getByRole('checkbox')).toHaveCount(2);
    const image = body.getByRole('img', { name: 'A square grid crossed by one diagonal, with a blue and an amber node' });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    await expect(body.getByRole('link', { name: 'the Nodex repository' })).toHaveAttribute('href', 'https://github.com/70ki8suda/nodex');
    await expect(body.locator('del')).toHaveText('strikethrough');
    await expect(body.locator('span[style]')).toHaveCount(0);
    await expect(body.locator('code[data-language="ts"]')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('keeps long code inside a keyboard-scrollable block', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FIELD_GUIDE);
    const code = page.locator('pre').first();
    const { scrollWidth, clientWidth } = await code.evaluate((node) => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    expect(scrollWidth).toBeGreaterThan(clientWidth);
    await code.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => code.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  });

  test('shows a clear keyboard focus ring on article links', async ({ page }) => {
    await page.goto(FIELD_GUIDE);
    const link = page.getByRole('link', { name: 'All posts' }).first();
    // A key press first makes Chromium treat the following focus as keyboard focus (:focus-visible).
    await page.keyboard.press('Tab');
    await link.focus();
    await expect(link).toBeFocused();
    const outline = await link.evaluate((node) => {
      const style = getComputedStyle(node);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('ordinary posts have no video player', async ({ page }) => {
    await page.goto(FIELD_GUIDE);
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveAttribute('lang', 'en');
  });
});

test.describe('YouTube posts', () => {
  test('embeds the validated video privately, lazily, and without autoplay', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(VIDEO_POST);
    const frame = page.locator('iframe');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/bReS9FLpgT4');
    await expect(frame).toHaveAttribute('title', 'YouTube video: Understand the Economy Part 1: What is wealth?');
    await expect(frame).toHaveAttribute('loading', 'lazy');
    await expect(frame).toHaveAttribute('allowfullscreen', '');
    expect(await frame.getAttribute('allow')).not.toContain('autoplay');

    const box = await frame.boundingBox();
    if (!box) throw new Error('iframe has no box');
    expect(Math.abs(box.width / box.height - 16 / 9)).toBeLessThan(0.02);

    const source = page.getByRole('link', { name: /Understand the Economy Part 1: What is wealth\?/ });
    await expect(source).toHaveAttribute('href', 'https://www.youtube.com/watch?v=bReS9FLpgT4');
    await expect(source).toHaveAttribute('target', '_blank');
    await expect(page.locator('figcaption time')).toHaveAttribute('datetime', '2024-01-15');
    expect(errors).toEqual([]);
  });

  test('marks Japanese post text as lang="ja" while the page chrome stays English', async ({ page }) => {
    await page.goto(VIDEO_POST);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const article = page.getByRole('article');
    await expect(article).toHaveAttribute('lang', 'ja');
    await expect(article.getByRole('heading', { level: 1 })).toHaveText('テスト用：動画解説 第1回');
    await page.goto('/blog?tag=fixture');
    for (const item of await page.getByRole('main').getByRole('article').all()) {
      await expect(item).toHaveAttribute('lang', 'ja');
    }
  });

  test('links the parts of a series in order', async ({ page }) => {
    await page.goto(VIDEO_POST);
    await expect(page.getByText('Part 1 of 2')).toBeVisible();
    const series = page.getByRole('navigation', { name: /Series/ });
    await expect(series.getByRole('listitem')).toHaveCount(2);
    await expect(series.locator('[aria-current="page"]')).toHaveText('テスト用：動画解説 第1回');
    await series.getByRole('link', { name: 'テスト用：動画解説 第2回' }).click();
    await expect(page).toHaveURL(new RegExp(`${SERIES_PART_2}$`));
    await expect(page.locator('iframe')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/TflnQb9E6lw');
    await expect(page.getByText('Part 2 of 2')).toBeVisible();
  });
});

test('blog pages fit small mobile screens without horizontal overflow', async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/blog', FIELD_GUIDE, VIDEO_POST, '/blog/does-not-exist']) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const dimensions = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      expect(dimensions.content, `horizontal overflow at ${width}px on ${path}`).toBeLessThanOrEqual(dimensions.viewport);
    }
    await page.goto(VIDEO_POST);
    const box = await page.locator('iframe').boundingBox();
    expect(box && box.width <= width).toBe(true);
  }
});
