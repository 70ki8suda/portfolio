import { expect as baseExpect, test, type Page } from '@playwright/test';

// GPU readback screenshots can take several seconds under SwiftShader.
const expect = baseExpect.configure({ timeout: 15_000 });

/**
 * Counts what the backdrop asks of the GPU and the browser, from outside the app:
 * draw calls (the solver's passes and the instanced meadow) and object lifetimes on the fluid canvas's own WebGL2 context, and the
 * window pointer listeners it registers.
 */
interface FluidProbe {
  draws: number;
  /** Instanced draws, and the instance count of the latest one: the blades in the meadow. */
  meadows: number;
  blades: number;
  created: number;
  deleted: number;
  pointerListeners: number;
  /** Injections uploaded with the pointer's radius: [x, y, radius, vx, vy], position in the unit square, y up. */
  pointerSplats: number[][];
}
async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const probe = { draws: 0, meadows: 0, blades: 0, created: 0, deleted: 0, pointerListeners: 0, pointerSplats: [] as number[][] };
    Object.assign(window, { fluidProbe: probe });
    const isFluid = (gl: WebGL2RenderingContext) => (gl.canvas as HTMLCanvasElement).dataset?.testid === 'fluid-canvas';
    const prototype = WebGL2RenderingContext.prototype;
    const drawArrays = prototype.drawArrays;
    prototype.drawArrays = function (this: WebGL2RenderingContext, ...args: Parameters<typeof drawArrays>) {
      if (isFluid(this)) probe.draws += 1;
      return drawArrays.apply(this, args);
    };
    const drawArraysInstanced = prototype.drawArraysInstanced;
    prototype.drawArraysInstanced = function (this: WebGL2RenderingContext, ...args: Parameters<typeof drawArraysInstanced>) {
      if (isFluid(this)) { probe.draws += 1; probe.meadows += 1; probe.blades = args[3]; }
      return drawArraysInstanced.apply(this, args);
    };
    // Buffers and vertex arrays are counted too, so the balance holds however the meadow is drawn.
    for (const name of ['createTexture', 'createFramebuffer', 'createProgram', 'createBuffer', 'createVertexArray'] as const) {
      const original = prototype[name] as (this: WebGL2RenderingContext) => unknown;
      (prototype[name] as unknown) = function (this: WebGL2RenderingContext) {
        if (isFluid(this)) probe.created += 1;
        return original.call(this);
      };
    }
    for (const name of ['deleteTexture', 'deleteFramebuffer', 'deleteProgram', 'deleteBuffer', 'deleteVertexArray'] as const) {
      const original = prototype[name] as (this: WebGL2RenderingContext, object: unknown) => void;
      (prototype[name] as unknown) = function (this: WebGL2RenderingContext, object: unknown) {
        if (isFluid(this) && object) probe.deleted += 1;
        return original.call(this, object);
      };
    }
    // Injections are uploaded as a vec4 array of points, a vec3 array of velocities, then their count.
    // The pointer's are the only ones with a radius of exactly 0.04 (strokes) or 0.07 (presses).
    let points: Float32Array | null = null;
    let velocities: Float32Array | null = null;
    const uniform4fv = prototype.uniform4fv;
    prototype.uniform4fv = function (this: WebGL2RenderingContext, ...args: Parameters<typeof uniform4fv>) {
      if (isFluid(this) && args[1] instanceof Float32Array) { points = args[1]; velocities = null; }
      return uniform4fv.apply(this, args);
    } as typeof uniform4fv;
    const uniform3fv = prototype.uniform3fv;
    prototype.uniform3fv = function (this: WebGL2RenderingContext, ...args: Parameters<typeof uniform3fv>) {
      if (isFluid(this) && points && !velocities && args[1] instanceof Float32Array) velocities = args[1];
      return uniform3fv.apply(this, args);
    } as typeof uniform3fv;
    const uniform1i = prototype.uniform1i;
    prototype.uniform1i = function (location, value) {
      if (isFluid(this) && points && velocities) {
        for (let i = 0; i < value; i += 1) {
          const [x, y, radius] = points.subarray(i * 4, i * 4 + 3);
          if (radius === Math.fround(0.04) || radius === Math.fround(0.07)) probe.pointerSplats.push([x, y, radius, velocities[i * 3], velocities[i * 3 + 1]]);
        }
        points = null;
      }
      return uniform1i.call(this, location, value);
    };
    // Track the backdrop's window listeners by identity: it registers passive pointer listeners,
    // and removing a listener that was never counted (the test driver's own) changes nothing.
    const tracked = { pointermove: new Set<unknown>(), pointerdown: new Set<unknown>() };
    const update = () => { probe.pointerListeners = tracked.pointermove.size + tracked.pointerdown.size; };
    const add = window.addEventListener;
    const remove = window.removeEventListener;
    window.addEventListener = function (this: Window, type: string, listener: unknown, options?: unknown) {
      if ((type === 'pointermove' || type === 'pointerdown') && typeof options === 'object' && (options as AddEventListenerOptions | null)?.passive) {
        tracked[type].add(listener);
        update();
      }
      return Reflect.apply(add, this, [type, listener, options]);
    } as typeof add;
    window.removeEventListener = function (this: Window, type: string, listener: unknown, options?: unknown) {
      if (type === 'pointermove' || type === 'pointerdown') {
        tracked[type].delete(listener);
        update();
      }
      return Reflect.apply(remove, this, [type, listener, options]);
    } as typeof remove;
  });
}
const probe = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { fluidProbe: FluidProbe }).fluidProbe }));

/**
 * What a PNG of the sheet contains, decoded in the page: the share of pixels that are bare
 * paper, tinted by ink, cool (teal to blue), magenta-ish, and grass green, and the mean chroma.
 * `region` limits the count to a fraction of the image: [left, top, right, bottom].
 */
async function inkStats(page: Page, png: Buffer, region: [number, number, number, number] = [0, 0, 1, 1]) {
  return page.evaluate(async ({ base64, region: [left, top, right, bottom] }) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const surface = document.createElement('canvas');
    surface.width = bitmap.width;
    surface.height = bitmap.height;
    const context = surface.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const x0 = Math.floor(left * surface.width), y0 = Math.floor(top * surface.height);
    const width = Math.max(1, Math.floor((right - left) * surface.width)), height = Math.max(1, Math.floor((bottom - top) * surface.height));
    const pixels = context.getImageData(x0, y0, width, height).data;
    const count = pixels.length / 4;
    let paper = 0, inked = 0, cool = 0, magenta = 0, green = 0, chroma = 0, pigmented = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      chroma += spread;
      if (r + g + b < 690) pigmented += 1;
      if (spread < 14 && r > 225) paper += 1;
      // Grass: green leads both other channels. That holds from the dark feet to the lit tips, and
      // for no ink (teal has more blue than green) and no paper.
      if (g > r + 10 && g > b + 6) green += 1;
      else {
        if (spread > 16) inked += 1;
        if (b > r + 14 && b >= g) cool += 1;
        if (r > g + 12 && b > g + 12) magenta += 1;
      }
    }
    return { pigmented: pigmented / count, paper: paper / count, inked: inked / count, cool: cool / count, magenta: magenta / count, green: green / count, chroma: chroma / count };
  }, { base64: png.toString('base64'), region });
}

/**
 * How much two PNGs of the sheet differ inside `region`: the share of pixels whose colour moved
 * by more than a blade's contrast, and of those that turned brighter. Slow washes of ink
 * score nothing; blades changing their lean do.
 */
async function motion(page: Page, before: Buffer, after: Buffer, region: [number, number, number, number]) {
  return page.evaluate(async ({ a, b, region: [left, top, right, bottom] }) => {
    const read = async (base64: string) => {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const surface = document.createElement('canvas');
      surface.width = bitmap.width;
      surface.height = bitmap.height;
      const context = surface.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const x0 = Math.floor(left * surface.width), y0 = Math.floor(top * surface.height);
      return context.getImageData(x0, y0, Math.max(1, Math.floor((right - left) * surface.width)), Math.max(1, Math.floor((bottom - top) * surface.height))).data;
    };
    const [first, second] = [await read(a), await read(b)];
    let moved = 0, brighter = 0;
    for (let index = 0; index < first.length; index += 4) {
      const delta = (second[index] - first[index]) + (second[index + 1] - first[index + 1]) + (second[index + 2] - first[index + 2]);
      if (Math.abs(delta) > 54) moved += 1;
      if (delta > 54) brighter += 1;
    }
    return { moved: moved / (first.length / 4), brighter: brighter / (first.length / 4) };
  }, { a: before.toString('base64'), b: after.toString('base64'), region });
}

/** Parts of the default 1280×720 sheet, as [left, top, right, bottom] from the top-left. */
const SKY: [number, number, number, number] = [0.36, 0.06, 0.96, 0.4];
const MEADOW: [number, number, number, number] = [0.74, 0.62, 0.98, 0.84];
const TITLE_COLUMN: [number, number, number, number] = [0.02, 0.2, 0.34, 0.84];

/** The ink alone: everything stacked above the canvas, the legibility veil included, is hidden for the capture. */
const INK_ONLY = 'header, figure, #top > div:not([data-testid="fluid-backdrop"]), [data-testid="fluid-backdrop"] > div { visibility: hidden !important; }';
const sheet = (page: Page) => page.getByTestId('fluid-canvas').screenshot({ style: INK_ONLY });

async function openRunning(page: Page) {
  await page.goto('/');
  const backdrop = page.getByTestId('fluid-backdrop');
  await expect(backdrop).toHaveAttribute('data-state', 'running', { timeout: 15_000 });
  await expect(page.getByTestId('fluid-canvas')).toHaveAttribute('data-ready', 'true');
  return backdrop;
}
/** Resolves once the draw count has stopped changing, and returns it. */
async function settledDraws(page: Page) {
  let last = -1;
  await expect.poll(async () => {
    const { draws } = await probe(page);
    const same = draws === last;
    last = draws;
    return same;
  }).toBe(true);
  return last;
}

async function advanceFrames(page: Page, count: number) {
  const before = (await probe(page)).meadows;
  await expect.poll(async () => (await probe(page)).meadows, { timeout: 25_000, intervals: [200] }).toBeGreaterThanOrEqual(before + count);
}

test.describe('fluid backdrop', () => {
  test.setTimeout(120_000);
  test('the homepage has no video elements and requests no video', async ({ page }) => {
    const media: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'media' || /\.(mp4|webm|mov|m4v|gif)(\?|$)/i.test(request.url()) || /\/media\//.test(request.url())) media.push(request.url());
    });
    await openRunning(page);
    await page.waitForTimeout(1500);
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page.locator('#top img')).toHaveCount(0);
    expect(media).toEqual([]);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where spirit meets technology.');
  });

  test('a meadow stands right of the title with pale ink behind it, and both keep moving on their own', async ({ page }) => {
    await installProbe(page);
    await openRunning(page);
    const canvas = page.getByTestId('fluid-canvas');
    await expect(canvas).toHaveAttribute('data-grid', /^\d+x\d+$/);
    await expect(canvas).toBeVisible();
    const first = await sheet(page);
    // Grass fills the lower right; the title's column is left as paper; the ink above the ridge
    // is there in both families, as a tint and not a flood.
    expect((await inkStats(page, first, MEADOW)).green).toBeGreaterThan(0.6);
    const column = await inkStats(page, first, TITLE_COLUMN);
    expect(column.green).toBeLessThan(0.01);
    expect(column.paper).toBeGreaterThan(0.5);
    const sky = await inkStats(page, first, SKY);
    expect(sky.green).toBeLessThan(0.1);
    expect(sky.inked).toBeGreaterThan(0.15);
    expect(sky.cool).toBeGreaterThan(0.02);
    expect(sky.magenta).toBeGreaterThan(0.02);

    // Every step runs the whole solver (advection, forces, curl, confinement, divergence, the
    // pressure sweeps, projection, pigment advection, wind); every frame draws the meadow once,
    // within the blade budget.
    const before = await probe(page);
    await expect.poll(async () => (await probe(page)).draws).toBeGreaterThan(before.draws + 5 * 24);
    await expect.poll(async () => (await probe(page)).meadows).toBeGreaterThan(before.meadows + 3);
    const { blades } = await probe(page);
    expect(blades).toBeGreaterThan(5_000);
    expect(blades).toBeLessThanOrEqual(26_000);

    // The grass itself moves: blades change their lean, which a drifting tint could not do.
    const from = await sheet(page);
    await advanceFrames(page, 12);
    expect((await motion(page, from, await sheet(page), MEADOW)).moved).toBeGreaterThan(0.03);
    // And the ink is still there after it has moved on: flowing, not fading out.
    await page.waitForTimeout(2000);
    const later = await sheet(page);
    expect((await inkStats(page, later, SKY)).inked).toBeGreaterThan(0.15);
    expect((await inkStats(page, later, MEADOW)).green).toBeGreaterThan(0.6);
    const buffer = await canvas.evaluate((node) => ({ width: (node as HTMLCanvasElement).width, height: (node as HTMLCanvasElement).height }));
    expect(buffer.width * buffer.height).toBeLessThanOrEqual(1_300_000 * 1.01);
  });

  test('the shared pause control freezes the simulation and ignores the pointer', async ({ page }) => {
    await installProbe(page);
    const backdrop = await openRunning(page);
    expect((await probe(page)).pointerListeners).toBe(2);
    await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
    await expect(backdrop).toHaveAttribute('data-state', 'paused');
    const draws = await settledDraws(page);
    const frozen = await sheet(page);
    expect((await probe(page)).pointerListeners).toBe(0);

    await page.mouse.move(300, 300);
    await page.mouse.move(700, 420, { steps: 12 });
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(700);
    expect((await probe(page)).draws).toBe(draws);
    expect((await probe(page)).pointerSplats).toEqual([]);
    expect((await sheet(page)).equals(frozen)).toBe(true);

    await page.getByRole('button', { name: 'Resume animation', exact: true }).click();
    await expect(backdrop).toHaveAttribute('data-state', 'running');
    await expect.poll(async () => (await probe(page)).draws).toBeGreaterThan(draws);
    await expect.poll(async () => (await sheet(page)).equals(frozen)).toBe(false);
    expect((await probe(page)).pointerListeners).toBe(2);
  });

  test('pointer presses add ink and strokes push it and the grass, where they happen, without blocking scroll or controls', async ({ page }) => {
    await installProbe(page);
    await openRunning(page);
    const canvas = page.getByTestId('fluid-canvas');
    const box = (await canvas.boundingBox())!;
    expect((await probe(page)).pointerSplats).toEqual([]);

    // The far top-left corner starts as bare paper: the ambient ink is released over the meadow.
    const corner: [number, number, number, number] = [0.02, 0.06, 0.16, 0.26];
    const bare = await inkStats(page, await sheet(page), corner);
    expect(bare.inked).toBeLessThan(0.08);
    const spot = { x: box.x + box.width * 0.09, y: box.y + box.height * 0.16 };
    await page.mouse.move(spot.x, spot.y);
    // The pointer is read once per frame, so each press is given its frame before the next.
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.down();
      await page.mouse.up();
      await expect.poll(async () => (await probe(page)).pointerSplats.filter((splat) => splat[2] === Math.fround(0.07)).length, { intervals: [50] }).toBe(i + 1);
    }
    for (const [x, y] of (await probe(page)).pointerSplats) {
      expect(x).toBeCloseTo(0.09, 1);
      expect(1 - y).toBeCloseTo(0.16, 1);
    }
    // The pigment shader really wrote there: the bare corner is now inked.
    await expect.poll(async () => (await inkStats(page, await sheet(page), corner)).pigmented).toBeGreaterThan(bare.pigmented + 0.15);

    // A stroke to the right pushes the liquid to the right (and slightly down the screen).
    for (let step = 1; step <= 4; step += 1) {
      const count = (await probe(page)).pointerSplats.length;
      await page.mouse.move(box.x + box.width * (0.09 + 0.21 * step / 4), spot.y + box.height * 0.04 * step / 4);
      await expect.poll(async () => (await probe(page)).pointerSplats.length, { timeout: 15_000 }).toBeGreaterThan(count);
    }
    await expect.poll(async () => (await probe(page)).pointerSplats.filter((splat) => splat[2] === Math.fround(0.04)).length).toBeGreaterThan(1);
    const strokes = (await probe(page)).pointerSplats.filter((splat) => splat[2] === Math.fround(0.04));
    for (const [x, y, , vx, vy] of strokes) {
      expect(x).toBeGreaterThan(0.08);
      expect(x).toBeLessThan(0.32);
      expect(1 - y).toBeGreaterThan(0.14);
      expect(1 - y).toBeLessThan(0.22);
      expect(vx).toBeGreaterThan(0);
      expect(Math.abs(vy)).toBeLessThan(vx);
    }
    // The drag adds pigment along its path, beyond the original pressed spot.
    const ahead: [number, number, number, number] = [0.2, 0.08, 0.3, 0.28];
    await expect.poll(async () => (await inkStats(page, await sheet(page), ahead)).inked).toBeGreaterThan(0.1);

    // Grass remains visibly responsive while strokes push the shared fluid field.
    // Compare after actual frames, since software rendering is much slower than a GPU.
    const from = await sheet(page);
    const row = box.y + box.height * 0.76;
    await page.mouse.move(box.x + box.width * 0.99, row);
    await advanceFrames(page, 1);
    for (let step = 1; step <= 6; step += 1) {
      const count = (await probe(page)).pointerSplats.length;
      await page.mouse.move(box.x + box.width * (0.99 - 0.27 * step / 6), row);
      await expect.poll(async () => (await probe(page)).pointerSplats.length, { timeout: 15_000 }).toBeGreaterThan(count);
      expect((await probe(page)).pointerSplats.at(-1)![3]).toBeLessThan(0);
    }
    await advanceFrames(page, 12);
    const stirred = await motion(page, from, await sheet(page), MEADOW);
    expect(stirred.moved).toBeGreaterThan(0.03);

    // The backdrop takes no input itself: the page scrolls and the controls answer.
    expect(await page.getByTestId('fluid-backdrop').evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('none');
    await page.mouse.move(640, 300);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('radio', { name: 'Bloom', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Bloom', exact: true })).toBeChecked();
  });

  test('reduced motion shows one still of the meadow and the ink and never starts a loop', async ({ page }) => {
    await installProbe(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const backdrop = page.getByTestId('fluid-backdrop');
    await expect(backdrop).toHaveAttribute('data-state', 'static');
    await expect(page.getByTestId('fluid-canvas')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('fluid-canvas')).toBeVisible();
    const draws = await settledDraws(page);
    const still = await sheet(page);
    await page.mouse.move(300, 300);
    await page.mouse.move(800, 400, { steps: 10 });
    await page.waitForTimeout(800);
    expect((await probe(page)).draws).toBe(draws);
    expect((await probe(page)).pointerListeners).toBe(0);
    expect((await probe(page)).pointerSplats).toEqual([]);
    // Metal readback may differ by a few quantisation levels even without a draw.
    // Draw-count equality above proves no simulation ran; reject visible pixel movement here.
    expect((await motion(page, still, await sheet(page), [0, 0, 1, 1])).moved).toBeLessThan(0.001);
    // The still cost a few draws in all, and it is composed: grass, ink above it, paper for the title.
    expect((await probe(page)).meadows).toBeLessThanOrEqual(4); // the first image, and a redraw per layout pass
    expect((await inkStats(page, still, MEADOW)).green).toBeGreaterThan(0.6);
    expect((await inkStats(page, still, SKY)).inked).toBeGreaterThan(0.15);
    expect((await inkStats(page, still, TITLE_COLUMN)).paper).toBeGreaterThan(0.5);
    await expect(page.locator('video')).toHaveCount(0);
  });

  test('offscreen and hidden states stop all work and resume afterwards', async ({ page }) => {
    await installProbe(page);
    const backdrop = await openRunning(page);
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await expect(backdrop).toHaveAttribute('data-state', 'offscreen');
    let draws = await settledDraws(page);
    await page.waitForTimeout(600);
    expect((await probe(page)).draws).toBe(draws);
    expect((await probe(page)).pointerListeners).toBe(0);
    await page.locator('#top').scrollIntoViewIfNeeded();
    await expect(backdrop).toHaveAttribute('data-state', 'running');
    await expect.poll(async () => (await probe(page)).draws).toBeGreaterThan(draws);

    // Dispatch the document lifecycle event deterministically in the test tab.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(backdrop).toHaveAttribute('data-state', 'hidden');
    draws = await settledDraws(page);
    await page.waitForTimeout(600);
    expect((await probe(page)).draws).toBe(draws);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(backdrop).toHaveAttribute('data-state', 'running');
    await expect.poll(async () => (await probe(page)).draws).toBeGreaterThan(draws);
  });

  test('resizing reallocates within budget and keeps drawing, also while paused', async ({ page }) => {
    await installProbe(page);
    const backdrop = await openRunning(page);
    const canvas = page.getByTestId('fluid-canvas');
    const buffer = () => canvas.evaluate((node) => {
      const element = node as HTMLCanvasElement;
      return { width: element.width, height: element.height, grid: element.dataset.grid!, css: element.clientWidth / element.clientHeight };
    });
    const wide = await buffer();
    expect(Math.max(...wide.grid.split('x').map(Number))).toBe(144);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => (await buffer()).grid).not.toBe(wide.grid);
    const phone = await buffer();
    expect(Math.max(...phone.grid.split('x').map(Number))).toBe(96);
    expect(phone.width * phone.height).toBeLessThanOrEqual(750_000 * 1.01);
    expect(phone.width / phone.height).toBeCloseTo(phone.css, 1);
    await expect(backdrop).toHaveAttribute('data-state', 'running');
    const draws = (await probe(page)).draws;
    await expect.poll(async () => (await probe(page)).draws).toBeGreaterThan(draws);

    await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
    await expect(backdrop).toHaveAttribute('data-state', 'paused');
    const paused = await settledDraws(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    // A paused backdrop redraws its frozen state for the new size, then goes quiet again.
    await expect.poll(async () => (await probe(page)).draws).toBeGreaterThan(paused);
    const redrawn = await settledDraws(page);
    const frozen = await sheet(page);
    await page.waitForTimeout(500);
    expect((await probe(page)).draws).toBe(redrawn);
    expect((await sheet(page)).equals(frozen)).toBe(true);
    await expect(canvas).toBeVisible();
    // Old buffers were released as new ones were made: nothing accumulates across resizes.
    const counts = await probe(page);
    expect(counts.created - counts.deleted).toBe(12 + 9 * 2); // twelve programs; velocity, pressure, pigment and wind pairs plus one scratch target
  });

  test('context loss falls back to the static backdrop and recovers on restore', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await installProbe(page);
    const backdrop = await openRunning(page);
    const canvas = page.getByTestId('fluid-canvas');
    await canvas.evaluate((node) => {
      const gl = (node as HTMLCanvasElement).getContext('webgl2')!;
      const extension = gl.getExtension('WEBGL_lose_context');
      if (!extension) throw new Error('Context loss extension unavailable');
      Object.assign(window, { fluidLoseContext: extension });
      extension.loseContext();
    });
    await expect(backdrop).toHaveAttribute('data-state', 'unavailable');
    await expect(canvas).toBeHidden();
    expect((await probe(page)).pointerListeners).toBe(0);
    const draws = await settledDraws(page);
    await page.waitForTimeout(500);
    expect((await probe(page)).draws).toBe(draws);
    // The CSS ink wash is what remains; copy and controls are unaffected.
    expect(await backdrop.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain('gradient');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('radio', { name: 'Geometry', exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Geometry', exact: true })).toBeChecked();

    await page.evaluate(() => (window as unknown as { fluidLoseContext: WEBGL_lose_context }).fluidLoseContext.restoreContext());
    await expect(backdrop).toHaveAttribute('data-state', 'running');
    await expect(canvas).toBeVisible();
    await expect.poll(async () => (await probe(page)).draws).toBeGreaterThan(draws);
    // The meadow is back with the ink.
    // Geometry has shorter blades; restoration must show grass, not match Bloom coverage.
    await expect.poll(async () => (await inkStats(page, await sheet(page), MEADOW)).green).toBeGreaterThan(0.2);
    expect(errors).toEqual([]);
  });

  test('without WebGL the hero keeps an ink-toned backdrop, its copy and its controls', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, options?: unknown) {
        if (contextId === 'webgl' || contextId === 'webgl2' || contextId === 'experimental-webgl') return null;
        return Reflect.apply(getContext, this, [contextId, options]);
      } as typeof getContext;
    });
    await page.goto('/');
    const backdrop = page.getByTestId('fluid-backdrop');
    await expect(backdrop).toHaveAttribute('data-state', 'unavailable');
    await expect(page.getByTestId('fluid-canvas')).toBeHidden();
    expect(await backdrop.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain('gradient');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Resume animation', exact: true })).toBeVisible();
    await expect(backdrop).toHaveAttribute('data-state', 'unavailable');
    expect(errors).toEqual([]);
  });

  test('leaving the page releases GPU objects, listeners and the animation frame', async ({ page }) => {
    await installProbe(page);
    await openRunning(page);
    const live = await probe(page);
    expect(live.created).toBeGreaterThan(0);
    expect(live.pointerListeners).toBe(2);
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Blog', exact: true }).click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.getByTestId('fluid-backdrop')).toHaveCount(0);
    const draws = await settledDraws(page);
    const after = await probe(page);
    expect(after.deleted).toBe(after.created);
    expect(after.pointerListeners).toBe(0);
    await page.waitForTimeout(500);
    expect((await probe(page)).draws).toBe(draws);
  });

  for (const [name, width, height] of [['desktop', 1440, 900], ['phone', 390, 844], ['small-phone', 320, 568]] as const) {
    test(`captures the ${name} composition`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height });
      await openRunning(page);
      await expect(page.locator('canvas[data-engine]')).toHaveAttribute('data-scene-ready', 'true', { timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: testInfo.outputPath(`meadow-${name}.png`) });
      await page.getByTestId('fluid-canvas').screenshot({ path: testInfo.outputPath(`meadow-${name}-canvas.png`), style: INK_ONLY });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
