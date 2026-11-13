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
  await live(page).getByRole('navigation', { name: 'ブログの表示' }).getByRole('link', { name: 'graph view', exact: true }).click();
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
  expect(data.articles).toHaveLength(14);
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
  await expect(live(page).getByRole('list', { name: '記事に近づく' }).getByRole('button')).toHaveCount(14);
});

test('fills the viewport with actual article coordinates and no unselected edges', async ({ page, request }) => {
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
  await expect(labels.locator('[data-kind="article"]')).toHaveCount(14);
  await expect(labels.locator('[data-kind="paragraph-tag"], [data-kind="concept"]')).toHaveCount(0);
  expect((await state(page)).edges).toBe(0);
  await expect(labels.locator('[data-kind="article-edge"]')).toHaveCount(0);
  for(const article of data.articles){const anchor=labels.locator(`[data-hit="article:${article.slug}"]`).locator('..');await expect(anchor).toHaveAttribute('data-wx',String(article.x*1800));await expect(anchor).toHaveAttribute('data-wy',String(article.y*1800));}
  // Long titles are shortened on the map but stay available in full.
  await expect(labels.locator(`[data-hit="article:${GARY}"]`)).toHaveAttribute('title', /富と格差の経済学/);
});

test('wheel zoom reveals paragraphs without changing the common meaning coordinates', async ({ page, request }) => {
  const data = await (await request.get('/paragraph-graph.json')).json() as GraphData;
  await open(page);
  const start = await state(page);
  await wheel(page, -120, 6);
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  expect((await state(page)).nodes).toBe(data.articles.length + data.nodes.length);
  await wheel(page, -120, 7);
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  const deep = await state(page);
  expect(deep.nodes).toBe(data.articles.length + data.nodes.length);
  expect(deep.zoom).toBeGreaterThan(3.1);
  await expect(live(page).getByTestId('graph-labels').locator('[data-kind="concept"]')).toHaveCount(0);
  await wheel(page, 120, 20);
  await expect(canvas(page)).toHaveAttribute('data-level', 'article');
  expect((await state(page)).nodes).toBe(start.nodes);
  // One wheel step never skips a level.
  await open(page);
  await wheel(page, -120, 1);
  expect((await state(page)).zoom).toBeLessThan(1.3);
});

test('a selected paragraph exposes original cosine neighbors across articles and source anchors', async ({page,request})=>{
 const data:GraphData=await(await request.get('/paragraph-graph.json')).json();const node=data.nodes[0];
 await open(page,'&node='+encodeURIComponent(node.id));const sheet=live(page).getByTestId('graph-sheet');
 await expect(sheet).toContainText(node.text);const group=sheet.getByRole('region',{name:'意味が近い段落'});
 await expect(group.getByRole('button')).toHaveCount(data.semanticNeighbors[node.id].length);
 const neighbor=data.nodes.find(n=>n.id===data.semanticNeighbors[node.id][0].id)!;
 await group.getByRole('button').first().click();await expect(sheet).toContainText(neighbor.text);
 await sheet.getByRole('link',{name:/元の記事で/}).click();await expect(page).toHaveURL(new RegExp('/blog/'+neighbor.slug+'#'+neighbor.anchor));
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

test('an explicit article link is not overridden by a remembered position, and resizing keeps world scale', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, `&article=${GARY}`);
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  await open(page);
  expect(await state(page)).toMatchObject({ level: 'article', zoom: 1 });
  await open(page, '&article=solarpunk-introduction');
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  const distance = async () => {
    const a=await pointOf(live(page).locator('[data-hit="article:deep-utopia-and-solarpunk"]'));
    const b=await pointOf(live(page).locator(`[data-hit="article:${GARY}"]`));
    return Math.hypot(a.x-b.x,a.y-b.y);
  };
  const before = await distance();
  await page.setViewportSize({ width: 390, height: 760 });
  await expect(canvas(page)).not.toHaveAttribute('data-moving', 'true');
  // Wait beyond the initial camera settling window: a delayed fit must not move the map.
  await page.waitForTimeout(9000);
  const after = await state(page);
  expect(after.level).toBe('paragraph');
  // Relative data-zoom changes with viewport fit; actual world-unit pixel scale must not.
  expect(Math.abs(await distance() - before)).toBeLessThan(1);
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
  await live(page).getByRole('button', { name: 'graph viewの読み方' }).click();
  await expect(live(page).getByTestId('graph-help')).toContainText('賛同や因果を示すものではありません');
});

test('dragging pans the map without selecting or losing the selection', async ({ page }) => {
  const focused='solarpunk-introduction';
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page, `&article=${focused}`);
  const hub = live(page).locator(`[data-hit="article:${focused}"]`);
  const before = (await pointOf(hub));
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.mouse.move(330, 380, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await pointOf(hub)).x - before.x).toBeGreaterThan(90);
  expect((await pointOf(hub)).y - before.y).toBeGreaterThan(50);
  await expect(page).not.toHaveURL(/node=/);
  await expect(page).toHaveURL(new RegExp(`article=${focused}`));
  // The pointers at the edge of the screen do not get in the way either: a drag that starts on one pans the map,
  // and a plain click on one still goes to that article.
  // A detail sheet can cover an offscreen label's box. Aim at a label whose
  // physical hit target is the canvas, rather than dragging a sheet button.
  const visiblePointer = async () => {
    const pointers=live(page).locator(`[data-testid="graph-offscreen"]:not([data-hit="go:a:${focused}"])`);
    let index=-1;
    await expect.poll(async()=>index=await pointers.evaluateAll(elements=>elements.findIndex(element=>{
      const r=element.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return hit instanceof HTMLCanvasElement;
    }))).toBeGreaterThanOrEqual(0);
    return pointers.nth(index);
  };
  const pointer = await visiblePointer();
  await expect(pointer).toBeVisible();
  const from = (await pointer.boundingBox())!;
  const resting = await pointOf(hub);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 - 90, from.y + from.height / 2 + 50, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await pointOf(hub)).x - resting.x).toBeLessThan(-80);
  await expect(page).toHaveURL(new RegExp(`article=${focused}`));
  await expect(canvas(page)).not.toHaveAttribute('data-moving', 'true');
  await expect(pointer).toBeVisible();
  await clickAt(page, await visiblePointer());
  await expect(page).not.toHaveURL(new RegExp(`article=${focused}`));
  await expect(page).toHaveURL(/article=/);
});

test('pan and zoom never rearrange article or paragraph world coordinates',async({page,request})=>{
 const data:GraphData=await(await request.get('/paragraph-graph.json')).json();await open(page);
 const coordinates=()=>live(page).getByTestId('graph-labels').locator('[data-kind="article"]').evaluateAll(es=>es.map(e=>[e.parentElement!.dataset.wx,e.parentElement!.dataset.wy]));
 const before=await coordinates();const box=(await canvas(page).boundingBox())!;
 await page.mouse.move(box.x+40,box.y+box.height*.65);await page.mouse.down();await page.mouse.move(box.x+150,box.y+box.height*.55,{steps:10});await page.mouse.up();
 await wheel(page,-120,8);expect(await coordinates()).toEqual(before);expect((await state(page)).nodes).toBe(data.nodes.length+data.articles.length);
 await live(page).getByRole('button',{name:'探す',exact:true}).click();await live(page).getByRole('searchbox',{name:'段落を検索'}).fill('所有');expect(await coordinates()).toEqual(before);
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
  for (let i = 0; i < 6 && (await state(page)).level !== 'paragraph'; i++) await pinch();
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
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
  // The article sheet covers the bottom level controls; pinch already reached
  // paragraph mode. Select a physical canvas target above the sheet.
  await expect(canvas(page)).toHaveAttribute('data-level', 'paragraph');
  const tags=live(page).locator('[data-kind="paragraph-tag"]');
  const tagIndex=await tags.evaluateAll(elements=>elements.findIndex(element=>{
    const r=element.parentElement!.getBoundingClientRect();
    return document.elementFromPoint(r.x+9,r.y+7) instanceof HTMLCanvasElement;
  }));
  expect(tagIndex).toBeGreaterThanOrEqual(0);
  const tag = tags.nth(tagIndex);
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
  await expect(live(page).getByRole('alert')).toContainText('graph viewを読み込めませんでした');
  await expect(live(page).getByRole('alert').getByRole('link', { name: '一覧へ戻る' })).toBeVisible();
  mode = 'broken';
  await live(page).getByRole('button', { name: '再読み込み' }).click();
  await expect(live(page).getByRole('alert')).toContainText('graph viewを読み込めませんでした');
  mode = 'ok';
  await live(page).getByRole('button', { name: '再読み込み' }).click();
  await expect(canvas(page)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/view=graph/);
});
