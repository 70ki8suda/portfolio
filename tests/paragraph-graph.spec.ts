import { expect, test } from '@playwright/test';
import type { GraphData } from '../src/blog/graphTypes';

const excluded = ['anthropic-financials-and-valuation', 'memory-stocks-cycle-and-valuation', 'solarpunk-three-tracks'];

test.beforeEach(async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' }));
});

test('keeps the normal list and tag URLs, and only loads graph data after switching', async ({ page, request }) => {
  const graphRequests: string[] = [];
  page.on('request', r => { if (r.url().includes('/paragraph-graph.json')) graphRequests.push(r.url()); });
  await page.goto('/blog');
  await expect(page.getByRole('navigation', { name: 'ブログの表示' })).toBeVisible();
  for (const slug of excluded) await expect(page.locator(`main a[href="/blog/${slug}"]`)).toBeVisible();
  expect(graphRequests).toHaveLength(0);
  await page.goto('/blog?tag=fixture-markdown');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Fixture: A field guide to Markdown on this blog');
  await page.getByRole('navigation', { name: 'ブログの表示' }).getByRole('link', { name: '地図', exact: true }).click();
  await expect(page.getByRole('region', { name: '段落の地図' })).toBeVisible();
  expect(graphRequests).toHaveLength(1);
  await page.getByRole('navigation', { name: 'ブログの表示' }).getByRole('link', { name: '一覧', exact: true }).click();
  await expect(page).toHaveURL(/tag=fixture-markdown/);
  await expect(page.getByRole('heading', { level: 2 })).toHaveText('Fixture: A field guide to Markdown on this blog');
  for (const slug of excluded) expect((await request.get(`/blog/${slug}`)).status()).toBe(200);
});

test('serves only opted-in graph data and searches only graph paragraphs', async ({ page, request }) => {
  const response = await request.get('/paragraph-graph.json');
  expect(response.ok()).toBe(true);
  const raw = await response.text();
  for (const slug of excluded) expect(raw).not.toContain(slug);
  const data = JSON.parse(raw) as GraphData;
  expect(data.articles).toHaveLength(4);
  expect(data.nodes.length).toBeGreaterThan(50);
  const ids = new Set(data.nodes.map(n => n.id));
  for (const edge of data.edges) { expect(ids.has(edge.source)).toBe(true); expect(ids.has(edge.target)).toBe(true); }
  await page.goto('/blog?view=graph');
  await page.getByRole('searchbox', { name: '段落を検索' }).fill('anthropic-financials-and-valuation');
  await expect(page.getByText('条件に合う段落がありません。検索語や絞り込みを変えてみてください。')).toBeVisible();
  await page.getByRole('searchbox', { name: '段落を検索' }).fill('memory-stocks-cycle-and-valuation');
  await expect(page.getByRole('list', { name: '段落の検索結果' }).getByRole('button')).toHaveCount(0);
});

test('filters, selects, reads the exact source paragraph and restores selection on browser back', async ({ page, request }) => {
  const data = await (await request.get('/paragraph-graph.json')).json() as GraphData;
  const node = data.nodes.find(n => data.edges.some(e => e.kind === 'semantic' && (e.source === n.id || e.target === n.id)))!;
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/blog?view=graph');
  await page.getByRole('combobox', { name: '記事', exact: true }).selectOption(node.slug);
  await page.getByRole('combobox', { name: '概念', exact: true }).selectOption(node.tags[0]);
  await page.getByRole('searchbox', { name: '段落を検索' }).fill(node.text.slice(0, 25));
  await expect(page.getByRole('list', { name: '段落の検索結果' }).getByRole('button')).toHaveCount(1);
  await page.getByRole('list', { name: '段落の検索結果' }).getByRole('button').click();
  await expect(page.getByRole('heading', { name: '選んだ段落', exact: true })).toBeFocused();
  await expect(page.getByRole('region', { name: '選んだ段落' }).getByText(node.text, { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '意味が近い段落' })).toBeVisible();
  const graphURL = page.url();
  await page.getByRole('link', { name: '元の記事でこの段落を読む' }).click();
  await expect(page).toHaveURL(new RegExp(`/blog/${node.slug}#${node.anchor}$`));
  await expect(page.locator(`#${node.anchor}`)).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(graphURL);
  await expect(page.getByRole('searchbox', { name: '段落を検索' })).toHaveValue(node.text.slice(0, 25));
  await expect(page.getByRole('list', { name: '段落の検索結果' }).getByRole('button', { pressed: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'リセット', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: '段落を検索' })).toBeEmpty();
  await expect(page.getByRole('combobox', { name: '記事', exact: true })).toHaveValue('');
  expect(errors).toEqual([]);
});

test('supports keyboard pan and zoom, mouse pan, and selecting with the equivalent list', async ({ page }) => {
  await page.goto('/blog?view=graph');
  const map = page.getByRole('img', { name: /^段落の意味地図/ });
  await expect(map).toBeVisible();
  const plane = page.getByTestId('graph-plane');
  const initial = await plane.getAttribute('transform');
  await map.focus();
  await page.keyboard.press('ArrowRight');
  await expect(plane).not.toHaveAttribute('transform', initial!);
  await page.keyboard.press('+');
  await expect(page.getByText(/拡大率 120%/)).toBeVisible();
  await page.keyboard.press('Home');
  await expect(plane).toHaveAttribute('transform', initial!);
  const box = await map.boundingBox();
  if (!box) throw new Error('Map has no bounding box');
  await page.mouse.move(box.x + 20, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 65, { steps: 5 });
  await page.mouse.up();
  await expect(plane).not.toHaveAttribute('transform', initial!);
  const first = page.getByRole('list', { name: '段落の検索結果' }).getByRole('button').first();
  await first.focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: '元の記事でこの段落を読む' })).toBeVisible();
});

test('fits mobile, leaves vertical touch scrolling enabled and honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/blog?view=graph');
    const map = page.getByRole('img', { name: /^段落の意味地図/ });
    await expect(map).toBeVisible();
    expect(await map.evaluate(node => getComputedStyle(node).touchAction)).toBe('pan-y');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '地図を拡大', exact: true }).click();
    await expect(page.getByText(/拡大率 125%/)).toBeVisible();
    await page.getByRole('button', { name: 'リセット', exact: true }).click();
    await page.getByRole('list', { name: '段落の検索結果' }).getByRole('button').first().click();
    await expect(page.getByRole('link', { name: '元の記事でこの段落を読む' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('reports a failed data load and retries without losing the graph route', async ({ page }) => {
  let calls = 0;
  await page.route('**/paragraph-graph.json', async route => {
    if (calls++ === 0) await route.fulfill({ status: 503, body: 'Temporarily unavailable' });
    else await route.continue();
  });
  await page.goto('/blog?view=graph');
  await expect(page.getByRole('alert')).toContainText('地図を読み込めませんでした');
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.getByRole('region', { name: '段落の地図' })).toBeVisible();
});
