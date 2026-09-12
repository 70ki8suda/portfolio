import { expect, test, type Page } from '@playwright/test';

// Measure only flat yellow ink, excluding the independently moving nature footage
// and blue petals. A full-image difference alone cannot prove the strokes move.
async function yellowInk(page: Page) {
  const png = await page.locator('canvas').screenshot();
  return page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const surface = document.createElement('canvas');
    surface.width = bitmap.width;
    surface.height = bitmap.height;
    const context = surface.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, surface.width, surface.height).data;
    let count = 0;
    let signature = 0;
    let edgeCount = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 230 && pixels[index + 1] > 175 && pixels[index + 2] < 35) {
        count++;
        const pixel = index / 4;
        const x = pixel % surface.width;
        const y = Math.floor(pixel / surface.width);
        if (x < 2 || x >= surface.width - 2 || y < 2 || y >= surface.height - 2) edgeCount++;
        signature = (signature + index * 31) >>> 0;
      }
    }
    return { count, signature, edgeCount };
  }, png.toString('base64'));
}

test('substantial flat yellow strokes move without pointer input and freeze on pause', async ({ page }) => {
  // Observe values submitted to the GPU, not only CPU refs or pixels changed by
  // the moving flower occluding otherwise frozen rear strokes.
  await page.addInitScript(() => {
    const clocks: { min: number; max: number }[] = [];
    Object.assign(window, { yellowGpuClocks: clocks });
    const locations = new WeakMap<WebGLUniformLocation, { min: number; max: number }>();
    const prototype = WebGL2RenderingContext.prototype;
    const getLocation = prototype.getUniformLocation;
    const setFloat = prototype.uniform1f;
    prototype.getUniformLocation = function (program, name) {
      const location = getLocation.call(this, program, name);
      if (location && name === 'uGTime') {
        const clock = { min: Infinity, max: -Infinity };
        locations.set(location, clock);
        clocks.push(clock);
      }
      return location;
    };
    prototype.uniform1f = function (location, value) {
      const clock = location && locations.get(location);
      if (clock) {
        clock.min = Math.min(clock.min, value);
        clock.max = Math.max(clock.max, value);
      }
      setFloat.call(this, location, value);
    };
  });
  await page.setViewportSize({ width: 960, height: 900 });
  await page.goto('/');
  await expect(page.locator('canvas')).toHaveAttribute('data-scene-ready', 'true');
  await expect.poll(async () => (await yellowInk(page)).count).toBeGreaterThan(1500);
  await expect.poll(async () => (await yellowInk(page)).edgeCount).toBeGreaterThan(10);
  await expect.poll(() => page.evaluate(() => {
    const clocks = (window as unknown as { yellowGpuClocks: { min: number; max: number }[] }).yellowGpuClocks;
    return clocks.filter((clock) => clock.max - clock.min > 0.05).length;
  })).toBeGreaterThanOrEqual(1);
  const moving = await yellowInk(page);
  await expect.poll(async () => (await yellowInk(page)).signature).not.toBe(moving.signature);

  await page.getByRole('button', { name: 'Pause animation' }).click();
  let frozen = await yellowInk(page);
  let stable = 0;
  await expect.poll(async () => {
    const next = await yellowInk(page);
    stable = next.signature === frozen.signature ? stable + 1 : 0;
    frozen = next;
    return stable;
  }).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(700);
  expect(await yellowInk(page)).toEqual(frozen);
  await page.getByRole('button', { name: 'Resume animation' }).click();
  await expect.poll(async () => (await yellowInk(page)).signature).not.toBe(frozen.signature);
});
