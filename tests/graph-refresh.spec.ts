import { test, expect } from '@playwright/test';
import type { GraphData } from '../src/blog/graphTypes';

function previous(data: GraphData): GraphData {
  const old = structuredClone(data);
  old.fingerprint = `before-${data.fingerprint}`;
  const slug = 'solarpunk-and-dacc';
  old.articles = old.articles.filter(a => a.slug !== slug);
  old.nodes = old.nodes.filter(n => n.slug !== slug);
  const ids = new Set(old.nodes.map(n => n.id));
  old.edges = old.edges.filter(e => ids.has(e.source) && ids.has(e.target));
  old.semanticNeighbors=Object.fromEntries(Object.entries(old.semanticNeighbors).filter(([id])=>ids.has(id)).map(([id,list])=>[id,list.filter(n=>ids.has(n.id))]));
  const articleIds=new Set(old.articles.map(a=>`article:${a.slug}`));
  old.articleNeighbors=Object.fromEntries(Object.entries(old.articleNeighbors).filter(([id])=>articleIds.has(id)).map(([id,list])=>[id,list.filter(n=>articleIds.has(n.id))]));
  old.conceptNeighbors = Object.fromEntries(Object.entries(old.conceptNeighbors).filter(([id]) => ids.has(id)).map(([id, list]) => [id, list.filter(id => ids.has(id))]));
  if(old.retrieval)old.retrieval.queries=Object.fromEntries(Object.entries(old.retrieval.queries).filter(([id])=>ids.has(id)).map(([id,value])=>[id,{...value,items:value.items.filter(item=>ids.has(item.id))}]));
  return old;
}

test('an open map revalidates on focus and applies new articles without reloading', async ({ page, request }) => {
  const data: GraphData = await (await request.get('/paragraph-graph.json')).json();
  let current = previous(data);
  let calls = 0;
  await page.route('**/paragraph-graph.json', route => { calls++; return route.fulfill({ json: current }); });
  await page.goto('/blog?view=graph');
  const canvas = page.locator('#main').getByTestId('graph-canvas');
  await expect(canvas).toHaveAttribute('data-nodes', String(data.articles.length - 1), { timeout: 30_000 });
  current = data;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(canvas).toHaveAttribute('data-nodes', String(data.articles.length), { timeout: 10_000 });
  await expect(page.locator('#main').locator('[data-hit="article:solarpunk-and-dacc"]')).toHaveCount(1);
  expect(calls).toBeGreaterThan(1);
  await expect(page).toHaveURL(/view=graph/);
});

test('failed or inconsistent refresh keeps the last valid map and recovers on reconnect', async ({ page, request }) => {
  const data: GraphData = await (await request.get('/paragraph-graph.json')).json();
  let mode: 'old' | 'failed' | 'broken' | 'new' = 'old';
  await page.route('**/paragraph-graph.json', route => {
    if (mode === 'failed') return route.fulfill({ status: 503 });
    if (mode === 'broken') return route.fulfill({ json: { ...data, edges: [...data.edges, { source: 'missing', target: data.nodes[0].id, kind: 'semantic' }] } });
    return route.fulfill({ json: mode === 'old' ? previous(data) : data });
  });
  await page.goto('/blog?view=graph');
  const canvas = page.locator('#main').getByTestId('graph-canvas');
  await expect(canvas).toHaveAttribute('data-nodes', String(data.articles.length - 1), { timeout: 30_000 });
  mode = 'failed';
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('graph viewの更新を確認できませんでした。')).toBeVisible();
  await expect(canvas).toHaveAttribute('data-nodes', String(data.articles.length - 1));
  mode = 'broken';
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(canvas).toHaveAttribute('data-nodes', String(data.articles.length - 1));
  mode = 'new';
  await page.getByRole('button', { name: '更新を再試行' }).click();
  await expect(canvas).toHaveAttribute('data-nodes', String(data.articles.length), { timeout: 10_000 });
});

test('refresh preserves a surviving selection and composing search, then clears a removed selection', async ({ page, request }) => {
  const data: GraphData = await (await request.get('/paragraph-graph.json')).json();
  const node = data.nodes.find(n => n.slug === 'solarpunk-and-dacc')!;
  let current = structuredClone(data), calls = 0;
  await page.route('**/paragraph-graph.json', route => { calls++; return route.fulfill({ json: current }); });
  await page.goto(`/blog?view=graph&node=${encodeURIComponent(node.id)}`);
  const live = page.locator('#main');
  await expect(live.getByTestId('graph-sheet')).toContainText(node.text, { timeout: 30_000 });
  await live.getByRole('button', { name: '探す', exact: true }).click();
  const search = live.getByRole('searchbox', { name: '段落を検索' });
  await search.fill('共同体'); await search.dispatchEvent('compositionstart');
  current.articles.find(a => a.slug === node.slug)!.title += ' 更新確認';
  const before = calls; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => calls).toBeGreaterThan(before);
  await expect(live.locator(`[data-hit="article:${node.slug}"]`)).toHaveAttribute('title', /更新確認/);
  await expect(search).toHaveValue('共同体');
  expect(new URL(page.url()).searchParams.get('node')).toBe(node.id);
  current = previous(data);
  await page.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  await expect.poll(() => new URL(page.url()).searchParams.get('node')).toBeNull();
  await expect(search).toHaveValue('共同体'); await search.dispatchEvent('compositionend');
});

test('a newer schema reloads the app once and offers the list if bundles still lag', async ({ page, request }) => {
  const data = await (await request.get('/paragraph-graph.json')).json();
  let next = false, documents = 0;
  page.on('request', r => { if (r.isNavigationRequest() && r.frame() === page.mainFrame()) documents++; });
  await page.route('**/paragraph-graph.json', r => r.fulfill({ json: next ? { ...data, version: 3 } : data }));
  await page.goto('/blog?view=graph');
  await expect(page.locator('#main').getByTestId('graph-canvas')).toBeVisible({ timeout: 30_000 });
  next = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#main').getByRole('alert')).toContainText('graph viewを読み込めませんでした');
  expect(documents).toBe(2);
  await page.locator('#main').getByRole('button', { name: '再読み込み', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('#main').getByRole('alert')).toBeVisible();
  expect(documents).toBe(2);
  await page.locator('#main').getByRole('link', { name: '一覧へ戻る' }).click();
  await expect(page).toHaveURL(/\/blog$/);
});
