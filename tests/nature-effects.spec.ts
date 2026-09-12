import { expect, test, type Page } from '@playwright/test';

async function gridPixels(page: Page) {
  return page.getByTestId('nature-effects').evaluate((node) => {
    const canvas = node as HTMLCanvasElement;
    const gl = canvas.getContext('webgl')!;
    const program = gl.getParameter(gl.CURRENT_PROGRAM) as WebGLProgram;
    const junctions = [0, 1, 2].map((index) => {
      const location = gl.getUniformLocation(program, `junctions[${index}]`);
      if (!location) throw new Error('Grid junction uniform missing');
      return gl.getUniform(program, location) as number;
    });
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const cells: number[] = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) {
      const offset = (Math.floor((y + 0.5) * canvas.height / 5) * canvas.width + Math.floor((x + 0.5) * canvas.width / 8)) * 4;
      if (pixels[offset + 3] > 128) cells.push(y * 8 + x);
    }
    let signature = 0;
    for (let i = 0; i < pixels.length; i += 4) signature = (signature + pixels[i] * (i + 1) + pixels[i + 3]) >>> 0;
    return { cells, signature, junctions };
  });
}

test('video shader affects six of forty cells and freezes with the shared pause control', async ({ page }) => {
  await page.goto('/');
  const effects = page.getByTestId('nature-effects');
  await expect(effects).toHaveAttribute('data-state', 'playing');
  await expect.poll(async () => (await gridPixels(page)).cells.length).toBe(6);
  const initial = await gridPixels(page);
  expect(initial.junctions).toHaveLength(3);
  expect(new Set(initial.junctions).size).toBe(3);
  expect(initial.junctions.every((id) => Number.isInteger(id) && id >= 0 && id < 28)).toBe(true);
  await expect.poll(async () => (await gridPixels(page)).cells.join(','), { timeout: 8000 }).not.toBe(initial.cells.join(','));
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await expect(effects).toHaveAttribute('data-state', 'paused');
  const frozen = await gridPixels(page);
  await page.waitForTimeout(800);
  expect(await gridPixels(page)).toEqual(frozen);
  await page.getByRole('button', { name: 'Resume animation', exact: true }).click();
  await expect.poll(async () => (await gridPixels(page)).signature).not.toBe(frozen.signature);
  await page.locator('#contact').scrollIntoViewIfNeeded();
  await expect(effects).toHaveAttribute('data-state', 'paused');
  const offscreen = await gridPixels(page);
  await page.waitForTimeout(500);
  expect(await gridPixels(page)).toEqual(offscreen);
});

test('shader context loss exposes the original video and reduced motion omits the shader', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const effects = page.getByTestId('nature-effects');
  await expect(effects).toHaveAttribute('data-state', 'playing');
  await effects.evaluate((node) => (node as HTMLCanvasElement).getContext('webgl')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(effects).toHaveCSS('visibility', 'hidden');
  await expect(page.locator('video[data-active="true"]')).toHaveCSS('opacity', '1');
  await expect(page.locator('canvas[data-scene-ready="true"]')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(effects).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('paused video grid follows a resized viewport without restarting playback', async ({ page }) => {
  await page.goto('/');
  const effects = page.getByTestId('nature-effects');
  await expect(effects).toHaveAttribute('data-state', 'playing');
  await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
  await expect(effects).toHaveAttribute('data-state', 'paused');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => effects.evaluate((node) => (node as HTMLCanvasElement).width)).toBe(390);
  await expect(effects).toHaveAttribute('data-state', 'paused');
  expect((await gridPixels(page)).cells).toHaveLength(6);
  expect(await page.locator('video[data-active="true"]').evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true);
});
