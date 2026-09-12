import { expect, test, type Page } from '@playwright/test';
import { nextAnimeHoldMs } from '../src/scene/animeTiles';

test('each hold samples a random duration between three and eight seconds', () => {
  expect(nextAnimeHoldMs(() => 0)).toBe(3000);
  expect(nextAnimeHoldMs(() => 0.5)).toBe(5500);
  expect(nextAnimeHoldMs(() => 0.9999)).toBeCloseTo(7999.5);
});

const visible = (page: Page) => page.locator('video[data-anime-visible="true"]');
const frames = (page: Page) => visible(page).evaluateAll((nodes) => nodes.map((node) => {
  const video = node as HTMLVideoElement;
  return { clip: video.dataset.animeClip, cell: video.dataset.cell, time: video.currentTime, paused: video.paused };
}));

test('two different supplied loops occupy distinct grid cells and rotate together', async ({ page }) => {
  await page.goto('/');
  await expect(visible(page)).toHaveCount(2);
  const before = await frames(page);
  expect(new Set(before.map((frame) => frame.clip)).size).toBe(2);
  expect(new Set(before.map((frame) => frame.cell)).size).toBe(2);
  expect(before.every((frame) => Number(frame.cell) >= 0 && Number(frame.cell) < 40)).toBe(true);
  const boxes = await visible(page).evaluateAll((nodes) => nodes.map((node) => {
    const bounds = node.getBoundingClientRect();
    const parent = node.parentElement!.getBoundingClientRect();
    return { width: bounds.width / parent.width, height: bounds.height / parent.height };
  }));
  boxes.forEach((box) => { expect(box.width).toBeCloseTo(1 / 8); expect(box.height).toBeCloseTo(1 / 5); });
  await expect.poll(async () => (await frames(page)).map((frame) => frame.clip).join(','), { timeout: 9000 }).not.toBe(before.map((frame) => frame.clip).join(','));
  await expect(visible(page)).toHaveCount(2);
});

test('shared pause, offscreen suspension, and reduced motion also govern anime loops', async ({ page }) => {
  await page.goto('/');
  await expect(visible(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await expect.poll(async () => (await frames(page)).every((frame) => frame.paused)).toBe(true);
  const before = await frames(page);
  await page.waitForTimeout(1000);
  const after = await frames(page);
  expect(after.map(({ clip, cell }) => ({ clip, cell }))).toEqual(before.map(({ clip, cell }) => ({ clip, cell })));
  after.forEach((frame, i) => expect(Math.abs(frame.time - before[i].time)).toBeLessThan(0.08));
  await page.getByRole('button', { name: 'Resume animation', exact: true }).click();
  await expect.poll(async () => (await frames(page)).every((frame) => !frame.paused)).toBe(true);
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await expect.poll(async () => (await frames(page)).every((frame) => frame.paused)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('[data-testid="anime-tiles"]')).toHaveCount(0);
  const requests: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/media/anime-')) requests.push(request.url()); });
  await page.reload();
  await expect(page.getByTestId('nature-backdrop')).toHaveAttribute('data-state', 'static');
  expect(requests).toEqual([]);
});

test('missing anime assets leave the nature background and controls usable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/media/anime-*.mp4', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await expect(page.getByTestId('nature-backdrop')).toHaveAttribute('data-state', 'playing');
  await expect(visible(page)).toHaveCount(0);
  await expect(page.locator('video[data-active="true"]')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
