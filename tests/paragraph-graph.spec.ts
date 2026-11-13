import { expect, test, type Locator, type Page } from '@playwright/test';
import type { GraphData } from '../src/blog/graphTypes';

// The map is drawn by Reagraph on a WebGL canvas. Its text (article names, link chips, concept names) and every
// control are ordinary DOM, so the tests read state from the DOM and from data-* attributes on the canvas root.
const excluded = ['anthropic-financials-and-valuation', 'memory-stocks-cycle-and-valuation', 'solarpunk-three-tracks'];
const GARY = 'garys-economics-guide';

test.beforeEach(async ({ page }) => {
  await page.route('https://www.youtube-nocookie.com/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title>' }));
});

// During a page transition the site briefly shows a visual copy of the page. The copy has no ids, so everything
// here is looked up inside the live `#main`; a second map would be a real bug and fails the count below.
const live = (page: Page) => page.locator('#main');
const canvas = (page: Page) => live(page).getByTestId('graph-canvas');
async function open(page: Page, query = '') {
  await page.goto(`/blog?view=graph${query}`);
  await expect(canvas(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(canvas(page)).toBeVisible({ timeout: 30_000 });
  await expect(canvas(page)).toHaveAttribute('data-zoom', /\d/, { timeout: 30_000 });
  await expect(canvas(page)).not.toHaveAttribute('data-moving', 'true');
}
const state = async (page: Page) => ({
  level: await canvas(page).getAttribute('data-level'),
  zoom: Number(await canvas(page).getAttribute('data-zoom')),
  nodes: Number(await canvas(page).getAttribute('data-nodes')),
  edges: Number(await canvas(page).getAttribute('data-edges')),
});
/**
 * Where a label's point is on the map. The label's own box is not used for this: near the edge of the screen a
 * label slides inwards to stay readable, so its box moves less than the map does.
 */
const pointOf = (locator: Locator) => locator.evaluate(element => { const r = element.parentElement!.getBoundingClientRect(); return { x: r.x, y: r.y }; });
/** Map labels let pointer events through to the canvas (so a drag can start on them); click them by position. */
async function clickAt(page: Page, locator: Locator) {
  // Labels follow the camera a frame behind it; wait until this one has stopped before aiming at it.
  let box = (await locator.boundingBox())!;
  await expect.poll(async () => {
    await page.waitForTimeout(120);
    const next = (await locator.boundingBox())!;
    const shift = Math.hypot(next.x - box.x, next.y - box.y);
    box = next;
    return shift;
  }).toBeLessThan(0.5);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function wheel(page: Page, deltaY: number, times: number) {
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < times; i++) { await page.mouse.wheel(0, deltaY); await page.waitForTimeout(60); }
}

test('keeps the normal list and tag URLs, and only loads the map after switching', async ({ page, request }) => {
  const graphRequests: string[] = [];
  page.on('request', r => { if (r.url().includes('/paragraph-graph.json')) graphRequests.push(r.url()); });
  await page.goto('/blog');
  for (const slug of excluded) await expect(page.locator(`main a[href="/blog/${slug}"]`)).toBeVisible();
  expect(graphRequests).toHaveLength(0);
  await page.goto('/blog?tag=fixture-markdown');
  await expect(live(page).getByRole('heading', { level: 2 })).toHaveText('Fixture: A field guide to Markdown on this blog');
  await live(page).getByRole('navigation', { name: 'ブログの表示' }).getByRole('link', { name: '地図', exact: true }).click();
  await expect(canvas(page)).toBeVisible({ timeout: 30_000 });
  expect(graphRequests).toHaveLength(1);
  await live(page).getByRole('link', { name: '一覧', exact: true }).click();
  await expect(page).toHaveURL(/tag=fixture-markdown/);
  await expect(live(page).getByRole('heading', { level: 2 })).toHaveText('Fixture: A field guide to Markdown on this blog');
  for (const slug of excluded) expect((await request.get(`/blog/${slug}`)).status()).toBe(200);
});

test('serves only opted-in graph data and never finds excluded articles', async ({ page, request }) => {
  const raw = await (await request.get('/paragraph-graph.json')).text();
  for (const slug of excluded) expect(raw).not.toContain(slug);
  expect(raw).not.toContain('solarpunk-shared-future');
  expect((await request.get('/blog/solarpunk-shared-future', { maxRedirects: 0 })).status()).toBe(404);
  expect(await (await request.get('/blog')).text()).not.toContain('/blog/solarpunk-shared-future');
  const data = JSON.parse(raw) as GraphData;
  expect(data.articles).toHaveLength(10);
  const ids = new Set(data.nodes.map(n => n.id));
  for (const edge of data.edges) { expect(ids.has(edge.source)).toBe(true); expect(ids.has(edge.target)).toBe(true); }
  await open(page);
  await live(page).getByRole('button', { name: '探す', exact: true }).click();
  const results = live(page).getByRole('list', { name: '段落の検索結果' }).getByRole('button');
  for (const term of ['anthropic-financials-and-valuation', 'memory-stocks-cycle-and-valuation', 'メモリ株', 'solarpunk-shared-future', '豊かさは誰の持ち物になるのか']) {
    await live(page).getByRole('searchbox', { name: '段落を検索' }).fill(term);
    await expect(live(page).getByTestId('graph-find').getByRole('status')).toHaveText('0 段落');
    await expect(results).toHaveCount(0);
  }
  await expect(live(page).getByRole('list', { name: '記事に近づく' }).getByRole('button')).toHaveCount(10);
});

test('fills the viewport and starts with articles and their evidence-backed links only', async ({ page, request }) => {
  const data = await (await request.get('/paragraph-graph.json')).json() as GraphData;
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const box = (await canvas(page).boundingBox())!;
  const header = (await page.locator('header').boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(1280);
  expect(Math.abs(box.y - (header.y + header.height))).toBeLessThanOrEqual(2);
  expect(Math.abs(box.y + box.height - 800)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('footer')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(1);
  expect(await state(page)).toMatchObject({ level: 'article', nodes: data.articles.length });
  const labels = live(page).getByTestId('graph-labels');
  await expect(labels.locator('[data-kind="article"]')).toHaveCount(10);
  await expect(labels.locator('[data-kind="paragraph-tag"], [data-kind="concept"]')).toHaveCount(0);
  // Every drawn article link is backed by real cross-article paragraph pairs, and none is invented.
  const pairs = new Map<string, number>();
  const slug = new Map(data.nodes.map(n => [n.id, n.slug]));
  for (const edge of data.edges) if (edge.kind === 'semantic') {
    const key = [slug.get(edge.source), slug.get(edge.target)].sort().join('|');
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  const chips = labels.locator('[data-kind="article-edge"]');
  await expect(chips).toHaveCount(43);
  for (const [key, count] of pairs) await expect(labels.locator(`[data-hit="link:${key}"]`)).toHaveAttribute('aria-label', new RegExp(`意味 ${count}(?!\\d)`));
  // The markers stay quiet: no count text sits on the map until a link is chosen.
  await expect(chips.filter({ hasText: /\S/ })).toHaveCount(0);
  // Long titles are shortened on the map but stay available in full.
  await expect(labels.locator(`[data-hit="article:${GARY}"]`)).toHaveAttribute('title', /富と格差の経済学/);
});

test('wheel zoom changes what is drawn: articles, then paragraphs, then concepts', async ({ page, request }) => {
  const data = await (await request.get('/paragraph-graph.json')).json() as GraphData;
  await open(page);
  const start = await state(page);
  await wheel(page, -120, 6);
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  expect((await state(page)).nodes).toBe(data.articles.length + data.nodes.length);
  await wheel(page, -120, 7);
  await expect(canvas(page)).toHaveAttribute('data-level', 'concept');
  const deep = await state(page);
  expect(deep.nodes).toBe(data.articles.length + data.nodes.length + data.concepts.length);
  expect(deep.zoom).toBeGreaterThan(3.1);
  await expect(live(page).getByTestId('graph-labels').locator('[data-kind="concept"]')).toHaveCount(data.concepts.length);
  await wheel(page, 120, 20);
  await expect(canvas(page)).toHaveAttribute('data-level', 'article');
  expect((await state(page)).nodes).toBe(start.nodes);
  // One wheel step never skips a level.
  await open(page);
  await wheel(page, -120, 1);
  expect((await state(page)).zoom).toBeLessThan(1.3);
});

test('a link between articles explains itself with the paragraph pairs behind it', async ({ page }) => {
  await open(page);
  const chip = live(page).getByTestId('graph-labels').locator('[data-kind="article-edge"][aria-label*="意味 2"]').first();
  await clickAt(page, chip);
  const sheet = live(page).getByTestId('graph-sheet');
  await expect(sheet).toContainText('記事どうしのつながり');
  await expect(chip).toContainText('意味 2');
  await expect(sheet.getByRole('region', { name: '意味が近い段落の組' })).toContainText('類似度');
  await expect(sheet.getByRole('region', { name: '同じ概念で近い段落の組' })).toContainText('数はつながりの強さを表しません');
  await sheet.getByRole('region', { name: '意味が近い段落の組' }).getByRole('button', { name: /1組目/ }).first().click();
  await expect(page).toHaveURL(/node=/);
  await expect(sheet).toContainText('選んだ段落');
  await expect(sheet.getByRole('region', { name: '意味が近い段落' })).toBeVisible();
});

test('focusing an article keeps the other articles, and back returns to the whole map', async ({ page, request }) => {
  const data = await (await request.get('/paragraph-graph.json')).json() as GraphData;
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  await clickAt(page, live(page).locator(`[data-hit="article:${GARY}"]`));
  await expect(page).toHaveURL(new RegExp(`article=${GARY}`));
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  await expect(canvas(page)).not.toHaveAttribute('data-moving', 'true');
  // Paragraphs of every article are still drawn, and the others stay reachable from the edge of the screen.
  expect((await state(page)).nodes).toBe(data.articles.length + data.nodes.length);
  await expect(live(page).getByTestId('graph-offscreen').first()).toBeVisible();
  await page.goBack();
  await expect(page).not.toHaveURL(/article=/);
  await expect(canvas(page)).toHaveAttribute('data-level', 'article');
  await page.goForward();
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  await live(page).getByRole('button', { name: '全体', exact: true }).click();
  await expect(page).not.toHaveURL(/article=/);
  await expect(canvas(page)).toHaveAttribute('data-level', 'article');
});

test('an explicit article link is not overridden by a remembered position, and resizing keeps the level', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, `&article=${GARY}`);
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  await open(page);
  expect(await state(page)).toMatchObject({ level: 'article', zoom: 1 });
  await open(page, '&article=solarpunk-introduction');
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  const before = (await state(page)).zoom;
  await page.setViewportSize({ width: 390, height: 760 });
  await expect(canvas(page)).not.toHaveAttribute('data-moving', 'true');
  await page.waitForTimeout(400);
  const after = await state(page);
  expect(after.level).toBe('paragraph');
  expect(Math.abs(after.zoom - before)).toBeLessThan(0.05);
});

test('finds a paragraph, reads it at its source anchor, and restores it on browser back', async ({ page, request }) => {
  const data = await (await request.get('/paragraph-graph.json')).json() as GraphData;
  const node = data.nodes.find(n => data.edges.some(e => e.kind === 'semantic' && (e.source === n.id || e.target === n.id)))!;
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  await live(page).getByRole('button', { name: '探す', exact: true }).click();
  await live(page).getByRole('searchbox', { name: '段落を検索' }).fill(node.text.slice(0, 25));
  const results = live(page).getByRole('list', { name: '段落の検索結果' }).getByRole('button');
  await expect(results).toHaveCount(1);
  await results.click();
  const sheet = live(page).getByTestId('graph-sheet');
  await expect(sheet.getByRole('heading', { name: '選んだ段落' })).toBeFocused();
  await expect(sheet.getByText(node.text, { exact: true })).toBeVisible();
  await expect(sheet.getByRole('region', { name: '意味が近い段落' })).toContainText('賛成・反対や因果は表しません');
  await expect(canvas(page)).not.toHaveAttribute('data-level', 'article');
  const graphURL = page.url();
  await sheet.getByRole('link', { name: '元の記事でこの段落を読む' }).click();
  await expect(page).toHaveURL(new RegExp(`/blog/${node.slug}#${node.anchor}$`));
  await expect(page.locator(`#${node.anchor}`)).toBeInViewport();
  await page.goBack();
  await expect(page).toHaveURL(graphURL);
  // Exactly one live map comes back, with the same paragraph and a camera that still shows paragraphs.
  await expect(canvas(page)).toHaveCount(1);
  await expect(live(page).getByTestId('graph-sheet').getByText(node.text, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(canvas(page)).not.toHaveAttribute('data-level', 'article', { timeout: 15_000 });
  // The transition's visual copy is gone once the page has settled.
  await expect(page.getByTestId('graph-canvas')).toHaveCount(1, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('works from the keyboard: zoom, pan, search, step back with Escape', async ({ page }) => {
  await open(page);
  await canvas(page).focus();
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await expect.poll(async () => (await state(page)).zoom).toBeGreaterThan(1.6);
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  const hub = live(page).locator(`[data-hit="article:${GARY}"]`);
  const before = (await pointOf(hub));
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await pointOf(hub)).x).toBeLessThan(before.x - 40);
  await page.keyboard.press('0');
  await expect(canvas(page)).toHaveAttribute('data-level', 'article');
  await page.keyboard.press('/');
  await expect(live(page).getByRole('searchbox', { name: '段落を検索' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(live(page).getByTestId('graph-find')).toHaveCount(0);
  // Article names are real buttons, so the map is reachable without a pointer.
  await hub.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`article=${GARY}`));
  await live(page).getByRole('button', { name: '地図の読み方' }).click();
  await expect(live(page).getByTestId('graph-help')).toContainText('賛成どうしとは限りません');
});

test('dragging pans the map without selecting or losing the selection', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, `&article=${GARY}`);
  const hub = live(page).locator(`[data-hit="article:${GARY}"]`);
  const before = (await pointOf(hub));
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.mouse.move(330, 380, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await pointOf(hub)).x - before.x).toBeGreaterThan(90);
  expect((await pointOf(hub)).y - before.y).toBeGreaterThan(50);
  await expect(page).not.toHaveURL(/node=/);
  await expect(page).toHaveURL(new RegExp(`article=${GARY}`));
  // The pointers at the edge of the screen do not get in the way either: a drag that starts on one pans the map,
  // and a plain click on one still goes to that article.
  const pointer = live(page).getByTestId('graph-offscreen').first();
  await expect(pointer).toBeVisible();
  const from = (await pointer.boundingBox())!;
  const resting = await pointOf(hub);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 90, from.y + from.height / 2 + 50, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await pointOf(hub)).x - resting.x).toBeLessThan(-80);
  await expect(page).toHaveURL(new RegExp(`article=${GARY}`));
  await expect(canvas(page)).not.toHaveAttribute('data-moving', 'true');
  await expect(pointer).toBeVisible();
  await clickAt(page, pointer);
  await expect(page).not.toHaveURL(new RegExp(`article=${GARY}`));
  await expect(page).toHaveURL(/article=/);
});

test('dragged paragraphs and articles stay consistent: the drawn dot, its label, and the focus all follow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, '&article=deep-utopia-and-solarpunk');
  await live(page).getByRole('button', { name: '概念', exact: true }).click();
  await expect(canvas(page)).toHaveAttribute('data-level', 'concept');
  await expect(canvas(page)).not.toHaveAttribute('data-moving', 'true');
  const hub = live(page).locator('[data-hit="article:deep-utopia-and-solarpunk"]');
  const anchorOf = (locator: Locator) => locator.evaluate(element => { const r = element.parentElement!.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  const settle = async () => { await page.waitForTimeout(350); await expect(canvas(page)).not.toHaveAttribute('data-moving', 'true'); };
  const drag = async (from: { x: number; y: number }, dx: number, dy: number) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
    await page.mouse.up();
    await settle();
  };
  // A labelled paragraph of this article that has room around it and is clear of the corner controls.
  const candidates = await live(page).locator('[data-kind="paragraph-tag"]').evaluateAll(elements => elements.map(element => {
    const r = element.parentElement!.getBoundingClientRect();
    return { id: (element as HTMLElement).dataset.node!, x: r.x, y: r.y };
  }));
  const hubAt = await anchorOf(hub);
  const pick = candidates.filter(c => c.id.startsWith('deep-utopia-and-solarpunk:') && c.x > 200 && c.x < 800 && c.y > 220 && c.y < 620
    && Math.hypot(c.x - hubAt.x, c.y - hubAt.y) > 60 && candidates.every(o => o === c || Math.hypot(o.x - c.x, o.y - c.y) > 34))[0];
  expect(pick).toBeTruthy();
  const tag = live(page).locator(`[data-kind="paragraph-tag"][data-node="${pick.id}"]`);

  // A drag that started on empty space would pan the whole map and move every label alike. These two stay put
  // when a single node is dragged, which is how the test tells the two apart.
  const other = live(page).locator('[data-hit="article:solarpunk-introduction"]');
  const otherAt = await anchorOf(other);

  // 1. Drag the paragraph on its own.
  await drag(pick, 46, -34);
  const moved = await anchorOf(tag);
  const still = await anchorOf(hub);
  expect(Math.hypot(still.x - hubAt.x, still.y - hubAt.y)).toBeLessThan(1);
  expect(Math.abs(moved.x - (pick.x + 46))).toBeLessThan(6);
  expect(Math.abs(moved.y - (pick.y - 34))).toBeLessThan(6);
  await expect(page).not.toHaveURL(/node=/);

  // 2. Drag its article. Every paragraph, including the one already moved, travels with it.
  const hubBefore = await anchorOf(hub);
  await drag(hubBefore, -70, 44);
  const hubAfter = await anchorOf(hub);
  expect(Math.abs(hubAfter.x - (hubBefore.x - 70))).toBeLessThan(6);
  expect(Math.abs(hubAfter.y - (hubBefore.y + 44))).toBeLessThan(6);
  const otherAfter = await anchorOf(other);
  expect(Math.hypot(otherAfter.x - otherAt.x, otherAfter.y - otherAt.y)).toBeLessThan(1);
  const carried = await anchorOf(tag);
  expect(Math.abs(carried.x - (moved.x - 70))).toBeLessThan(6);
  expect(Math.abs(carried.y - (moved.y + 44))).toBeLessThan(6);

  // Node drags switch panning off for their own gesture only: empty space still pans the whole map afterwards.
  const beforePan = await anchorOf(other);
  await drag({ x: 150, y: 420 }, 60, 40);
  const afterPan = await anchorOf(other);
  expect(Math.abs(afterPan.x - beforePan.x - 60)).toBeLessThan(3);
  expect(Math.abs(afterPan.y - beforePan.y - 40)).toBeLessThan(3);
  carried.x += 60;
  carried.y += 40;

  // 3. The dot drawn on the canvas is where its label says: clicking there selects that very paragraph.
  await page.mouse.click(carried.x, carried.y);
  await expect(page).toHaveURL(new RegExp(`node=${encodeURIComponent(pick.id)}`));
  await canvas(page).focus();
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/node=/);

  // 4. Focusing the article again centres on where it is now, not where it used to be.
  await settle();
  await clickAt(page, hub);
  await settle();
  await expect.poll(async () => { const a = await anchorOf(hub); await page.waitForTimeout(200); const b = await anchorOf(hub); return Math.hypot(a.x - b.x, a.y - b.y); }).toBeLessThan(0.5);
  const box = (await canvas(page).boundingBox())!;
  const centred = await anchorOf(hub);
  expect(Math.hypot(centred.x - (box.x + box.width / 2), centred.y - (box.y + box.height / 2))).toBeLessThan(24);
});

test('on a phone: fits without scrolling, pinch changes the level, pan moves, and a tap near a dot selects it', async ({ browser }) => {
  // SwiftShader plus tracing can stretch each 30 ms touch pause past 2 s as the corpus grows.
  // Keep every gesture and assertion; allow the complete phone interaction sequence to finish.
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await open(page);
  expect(await page.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight])).toEqual([0, 0]);
  const box = (await canvas(page).boundingBox())!;
  expect(box.width).toBe(390);
  expect(Math.abs(box.y + box.height - 844)).toBeLessThanOrEqual(1);
  await expect(live(page).getByRole('list', { name: '線の凡例' })).toBeHidden();
  const cdp = await context.newCDPSession(page);
  const pinch = async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 85, y: 250, id: 1 }, { x: 135, y: 250, id: 2 }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 85 - i * 8, y: 250, id: 1 }, { x: 135 + i * 8, y: 250, id: 2 }] });
      await page.waitForTimeout(30);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
  };
  for (let i = 0; i < 6 && (await state(page)).level !== 'concept'; i++) await pinch();
  await expect(canvas(page)).toHaveAttribute('data-level', 'concept');
  // Zooming with the level buttons brings paragraphs into view for the tap test.
  await live(page).getByRole('button', { name: '全体', exact: true }).tap();
  await expect(canvas(page)).toHaveAttribute('data-level', 'article');
  await clickAt(page, live(page).locator('[data-hit="article:deep-utopia-and-solarpunk"]'));
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  const hub = live(page).locator('[data-hit="article:deep-utopia-and-solarpunk"]');
  // Let the focus move finish so the pan is measured from a resting map.
  await expect.poll(async () => { const a = (await pointOf(hub)).x; await page.waitForTimeout(250); return Math.abs((await pointOf(hub)).x - a); }).toBeLessThan(0.5);
  const before = (await pointOf(hub));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 60, y: 300, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 60 + i * 8, y: 300 + i * 6, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await pointOf(hub)).x - before.x).toBeGreaterThan(30);
  await expect(page).not.toHaveURL(/node=/);
  await live(page).getByRole('button', { name: '概念', exact: true }).tap();
  await expect(canvas(page)).toHaveAttribute('data-level', 'concept');
  const tag = live(page).locator('[data-kind="paragraph-tag"]').first();
  await expect(tag).toBeVisible();
  await expect(canvas(page)).not.toHaveAttribute('data-moving', 'true');
  const dot = await tag.evaluate(element => { const r = element.parentElement!.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await page.touchscreen.tap(dot.x + 9, dot.y + 7);
  await expect(page).toHaveURL(/node=/);
  await expect(live(page).getByTestId('graph-sheet')).toContainText('選んだ段落');
  // After a touch that chose a node, one finger still pans and two fingers still zoom.
  await expect(canvas(page)).not.toHaveAttribute('data-moving', 'true');
  const hubNow = (await pointOf(hub));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 40, y: 200, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 40 + i * 8, y: 200, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await pointOf(hub)).x - hubNow.x).toBeGreaterThan(50);
  const zoomBefore = (await state(page)).zoom;
  await pinch();
  await expect.poll(async () => (await state(page)).zoom).toBeGreaterThan(zoomBefore * 1.1);
  expect(errors).toEqual([]);
  await context.close();
});

test('reports a failed or malformed data load and recovers on retry', async ({ page }) => {
  let mode: 'fail' | 'broken' | 'ok' = 'fail';
  await page.route('**/paragraph-graph.json', async route => {
    if (mode === 'fail') return route.fulfill({ status: 503, body: 'down' });
    if (mode === 'broken') {
      const response = await route.fetch();
      const body = await response.json() as Record<string, unknown>;
      delete body.conceptNeighbors;
      return route.fulfill({ response, json: body });
    }
    return route.continue();
  });
  await page.goto('/blog?view=graph');
  await expect(live(page).getByRole('alert')).toContainText('地図を読み込めませんでした');
  await expect(live(page).getByRole('alert').getByRole('link', { name: '一覧へ戻る' })).toBeVisible();
  mode = 'broken';
  await live(page).getByRole('button', { name: '再読み込み' }).click();
  await expect(live(page).getByRole('alert')).toContainText('地図を読み込めませんでした');
  mode = 'ok';
  await live(page).getByRole('button', { name: '再読み込み' }).click();
  await expect(canvas(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/view=graph/);
});
