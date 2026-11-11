import { expect as baseExpect, test, type Page } from '@playwright/test';

// GPU readback screenshots can take several seconds under SwiftShader.
const expect = baseExpect.configure({ timeout: 15_000 });

/**
 * Counts what the backdrop asks of the GPU and the browser, from outside the app:
 * draw calls (the solver's passes and the instanced grass) and object lifetimes on the fluid canvas's own WebGL2 context, and the
 * window pointer listeners it registers.
 */
interface FluidProbe {
  draws: number;
  camera: number[][];
  time: number;
  /** Instanced draws, and the instance count of the latest one: the blades of grass. */
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
    const probe = { camera: [] as number[][], time: 0, draws: 0, meadows: 0, blades: 0, created: 0, deleted: 0, pointerListeners: 0, pointerSplats: [] as number[][] };
    Object.assign(window, { fluidProbe: probe });
    const isFluid = (gl: WebGL2RenderingContext) => (gl.canvas as HTMLCanvasElement).dataset?.testid === 'fluid-canvas';
    const prototype = WebGL2RenderingContext.prototype;
    const locations = new Map<WebGLUniformLocation, string>();
    const getUniformLocation = prototype.getUniformLocation;
    prototype.getUniformLocation = function (program, name) {
      const location = getUniformLocation.call(this, program, name);
      if (isFluid(this) && location) locations.set(location, name);
      return location;
    };
    const uniform2f = prototype.uniform2f;
    prototype.uniform2f = function (location, x, y) {
      if (isFluid(this) && location) {
        if (locations.get(location) === 'uTurn') probe.camera = [...probe.camera.slice(-1), [x, y]];
        if (locations.get(location) === 'uInk') probe.time = x;
      }
      return uniform2f.call(this, location, x, y);
    };
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
    // Buffers and vertex arrays are counted too, so the balance holds however the grass is drawn.
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
 * What a PNG of the sheet contains, decoded in the page: the share of pixels that are pale
 * (tray rims and frames: light and nearly neutral), crop (green well ahead of red and blue,
 * and not light: the glazing's view of greenery outside is light), cool water and pipe highlights (blue ahead of red) and off the palette (magenta or violet).
 * `region` limits the count to a fraction of the image: [left, top, right, bottom].
 */
async function rackStats(page: Page, png: Buffer, region: [number, number, number, number] = [0, 0, 1, 1]) {
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
    let pale = 0, grass = 0, water = 0, offPalette = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (g > r + 10 && g > b + 18) { if (r + g + b < 600) grass += 1; }
      else if (r > 200 && spread < 40) pale += 1;
      else if (b > r + 8) water += 1;
      if (r > g + 12 && b > g + 12) offPalette += 1;
    }
    return { pale: pale / count, grass: grass / count, water: water / count, offPalette: offPalette / count };
  }, { base64: png.toString('base64'), region });
}

/**
 * How much two PNGs of the sheet differ inside `region`: the share of pixels whose colour moved
 * by more than a blade's contrast, and of those that turned brighter. Slow washes of ink
 * score nothing; blades changing their lean do.
 */
async function motion(page: Page, before: Buffer, after: Buffer, region: [number, number, number, number], threshold = 54) {
  return page.evaluate(async ({ a, b, threshold, region: [left, top, right, bottom] }) => {
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
      if (Math.abs(delta) > threshold) moved += 1;
      if (delta > threshold) brighter += 1;
    }
    return { moved: moved / (first.length / 4), brighter: brighter / (first.length / 4) };
  }, { a: before.toString('base64'), b: after.toString('base64'), region, threshold });
}

/** Right-hand cultivation rack in the default 1280×720 sheet. */
const RACK_AREA: [number, number, number, number] = [0.55, 0.3, 1, 0.85];

/** The rack must contain both living crop and bright structure, with no composited white veil. */
async function expectRacks(page: Page, png: Buffer) {
  const rack = await rackStats(page, png, RACK_AREA);
  expect(rack.grass).toBeGreaterThan(0.12);
  expect(rack.grass).toBeLessThan(0.8);
  expect(rack.pale).toBeGreaterThan(0.15);
  expect((await rackStats(page, png)).offPalette).toBeLessThan(0.01);
  await expect(page.getByTestId('fluid-backdrop').locator(':scope > *')).toHaveCount(1);
}

/**
 * The canvas alone: everything stacked above it, the  is removed for the
 * capture. `display`, not `visibility`: under reduced motion the site gives every element a
 * 0.01 ms transition, and a transitioned `visibility` stays visible for one more frame, which
 * would put the title into some captures and not others.
 */
const INK_ONLY = 'header, #top > div, [data-testid="fluid-backdrop"] > div { display: none !important; }';
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

  test('one canvas shows stacked growing units with bright frames and moving rice', async ({ page }) => {
    await installProbe(page);
    await openRunning(page);
    // The hero's picture is this canvas and nothing else.
    await expect(page.locator('#top canvas')).toHaveCount(1);
    const canvas = page.getByTestId('fluid-canvas');
    await expect(page.getByRole('figure', { name: 'A living future — interactive artwork' }).locator('canvas')).toHaveCount(1);
    await expect(canvas).toHaveAttribute('data-grid', /^\d+x\d+$/);
    await expect(canvas).toBeVisible();
    const first = await sheet(page);
    await expectRacks(page, first);

    // Every step runs the whole solver (advection, forces, curl, confinement, divergence, the
    // pressure sweeps, projection, pigment advection, wind); every frame draws the grass once,
    // within the blade budget.
    const before = await probe(page);
    await expect.poll(async () => (await probe(page)).draws).toBeGreaterThan(before.draws + 5 * 24);
    await expect.poll(async () => (await probe(page)).meadows).toBeGreaterThan(before.meadows + 3);
    const { blades } = await probe(page);
    expect(blades).toBeGreaterThan(5_000);
    expect(blades).toBeLessThanOrEqual(36_000);

    // The grass itself moves: blades change their lean, which a drifting tint could not do.
    const from = await sheet(page);
    await advanceFrames(page, 12);
    expect((await motion(page, from, await sheet(page), RACK_AREA)).moved).toBeGreaterThan(0.03);
    // And it is the same landscape after it has moved on.
    await advanceFrames(page, 60);
    await expectRacks(page, await sheet(page));
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

  test('hover strokes stir the flow and grass without blocking scroll or controls', async ({ page }) => {
    await installProbe(page);
    await openRunning(page);
    const canvas = page.getByTestId('fluid-canvas');
    const box = (await canvas.boundingBox())!;
    expect((await probe(page)).pointerSplats).toEqual([]);

    // Hover stirs the flow; held drags now belong to the camera.
    const spot = { x: box.x + box.width * 0.09, y: box.y + box.height * 0.16 };
    await page.mouse.move(spot.x, spot.y);
    await advanceFrames(page, 1);

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
    const stirred = await motion(page, from, await sheet(page), RACK_AREA);
    expect(stirred.moved).toBeGreaterThan(0.03);

    // The backdrop takes no input itself: the page scrolls and the controls answer.
    expect(await page.getByTestId('fluid-backdrop').evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('none');
    await page.mouse.move(640, 300);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeVisible();
  });

  test('reduced motion shows one still of the racks and never starts a loop', async ({ page }) => {
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
    // The still uses a bounded number of draws and retains both crop and rack structure.
    expect((await probe(page)).meadows).toBeLessThanOrEqual(12); // three rack pairs per image, at most four layout passes
    await expectRacks(page, still);
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
    const initialGrass = (await rackStats(page, await sheet(page), RACK_AREA)).grass;
    expect(initialGrass).toBeGreaterThan(0.12);
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
    // The CSS fallback is what remains; copy and controls are unaffected.
    expect(await backdrop.evaluate((node) => getComputedStyle(node).backgroundImage)).toContain('gradient');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause animation', exact: true })).toBeVisible();

    await page.evaluate(() => (window as unknown as { fluidLoseContext: WEBGL_lose_context }).fluidLoseContext.restoreContext());
    await expect(backdrop).toHaveAttribute('data-state', 'running');
    await expect(canvas).toBeVisible();
    await expect.poll(async () => (await probe(page)).draws).toBeGreaterThan(draws);
    // Restore the crop coverage of this camera composition, allowing for moving blades.
    await expect.poll(async () => (await rackStats(page, await sheet(page), RACK_AREA)).grass).toBeGreaterThan(initialGrass * 0.85);
    expect((await rackStats(page, await sheet(page), RACK_AREA)).pale).toBeGreaterThan(0.15);
    expect(errors).toEqual([]);
  });

  test('without WebGL the hero keeps a pale interior backdrop, its copy and its controls', async ({ page }) => {
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
      await installProbe(page);
      await page.setViewportSize({ width, height });
      await openRunning(page);
      await page.evaluate(() => document.fonts.ready);
      await advanceFrames(page, 30);
      await page.screenshot({ path: testInfo.outputPath(`rack-${name}.png`) });
      await page.getByTestId('fluid-canvas').screenshot({ path: testInfo.outputPath(`rack-${name}-canvas.png`), style: INK_ONLY });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }


  for (const reduced of [false, true]) {
    test(`drag rotates ${reduced ? 'reduced-motion' : 'paused'} artwork without advancing the simulation`, async ({ page }) => {
      await installProbe(page);
      if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      const backdrop = page.getByTestId('fluid-backdrop');
      await expect(page.getByTestId('fluid-canvas')).toHaveAttribute('data-ready', 'true');
      if (!reduced) await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
      await settledDraws(page);
      const time = (await probe(page)).time;
      const original = await sheet(page);
      await expect(page.getByRole('slider', { name: /Camera/ })).toHaveCount(0);
      await page.mouse.move(1080, 210);
      await page.mouse.down();
      await page.mouse.move(880, 285, { steps: 8 });
      await page.mouse.up();
      const turned = await sheet(page);
      expect((await motion(page, original, turned, [0, 0, 1, 1])).moved).toBeGreaterThan(0.03);
      await settledDraws(page);
      const turnedProbe = await probe(page);
      expect(turnedProbe.time).toBe(time);
      expect(turnedProbe.camera).toHaveLength(2);
      expect(turnedProbe.camera[0]).toEqual(turnedProbe.camera[1]);
      expect(Math.abs(turnedProbe.camera[0][0])).toBeGreaterThan(0.01);
      expect(Math.abs(turnedProbe.camera[0][1])).toBeGreaterThan(0.01);
      const draws = turnedProbe.draws;
      await page.waitForTimeout(200);
      expect((await probe(page)).draws).toBe(draws);
      await page.setViewportSize({ width: 390, height: 844 });
      await settledDraws(page);
      expect((await probe(page)).camera).toEqual(turnedProbe.camera);
      await page.getByTestId('fluid-canvas').evaluate((node) => {
        const extension = (node as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
        Object.assign(window, { restoreCameraContext: extension });
        extension.loseContext();
      });
      await expect(backdrop).toHaveAttribute('data-state', 'unavailable');
      await page.evaluate(() => (window as unknown as { restoreCameraContext: WEBGL_lose_context }).restoreCameraContext.restoreContext());
      await expect(backdrop).toHaveAttribute('data-state', reduced ? 'static' : 'paused');
      await expect(page.getByTestId('fluid-canvas')).toHaveAttribute('data-ready', 'true');
      expect((await probe(page)).camera).toEqual(turnedProbe.camera);
    });
  }

  test('camera keyboard controls reset the view and leave form input alone', async ({ page }) => {
    await installProbe(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('fluid-canvas')).toHaveAttribute('data-ready', 'true');
    const art = page.getByRole('figure', { name: 'A living future — interactive artwork' });
    await art.focus();
    await art.press('ArrowRight');
    await art.press('ArrowUp');
    await settledDraws(page);
    const angle = (await probe(page)).camera;
    expect(angle[0][0]).toBeGreaterThan(0);
    expect(angle[0][1]).toBeGreaterThan(0);
    await page.getByRole('link', { name: '70ki8suda — back to top' }).focus();
    await page.keyboard.press('Home');
    await settledDraws(page);
    expect((await probe(page)).camera).toEqual(angle);
    await art.focus();
    await art.press('Home');
    await settledDraws(page);
    expect((await probe(page)).camera).toEqual([[0, 0], [0, 0]]);
  });

  test('touch pans the camera horizontally while vertical gestures scroll the page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installProbe(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    await page.goto('/');
    await expect(page.getByTestId('fluid-canvas')).toHaveAttribute('data-ready', 'true');
    const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', x = 0, y = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await touch('touchStart', 300, 180);
    for (let i = 1; i <= 6; i++) await touch('touchMove', 300 - i * 20, 180);
    await touch('touchEnd');
    await settledDraws(page);
    expect(Math.abs((await probe(page)).camera[0][0])).toBeGreaterThan(0.02);
    expect((await probe(page)).camera[0][1]).toBe(0);
    const angle = (await probe(page)).camera;
    await touch('touchStart', 310, 350);
    for (let i = 1; i <= 6; i++) await touch('touchMove', 310, 350 - i * 30);
    await touch('touchEnd');
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(50);
    expect((await probe(page)).camera).toEqual(angle);
    await expect(page.locator('[data-dragging]')).toHaveCount(0);
  });

  test('clear channels visibly flow independently of moving grass', async ({ page }) => {
    // Suppress only blades so moving water cannot be mistaken for moving foliage.
    await page.addInitScript(() => {
      const draw = WebGL2RenderingContext.prototype.drawArraysInstanced;
      WebGL2RenderingContext.prototype.drawArraysInstanced = function (...args) {
        if ((this.canvas as HTMLCanvasElement).dataset.testid !== 'fluid-canvas') draw.apply(this, args);
      };
    });
    await installProbe(page);
    await openRunning(page);
    const before = await sheet(page);
    await advanceFrames(page, 35);
    const after = await sheet(page);
    expect((await motion(page, before, after, RACK_AREA, 10)).moved).toBeGreaterThan(0.002);
    await page.getByRole('button', { name: 'Pause animation', exact: true }).click();
    await settledDraws(page);
    const frozen = await sheet(page);
    await page.waitForTimeout(250);
    expect((await motion(page, frozen, await sheet(page), RACK_AREA, 10)).moved).toBeLessThan(0.001);
  });

  test('renders the rack at the full near and far camera limits', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await installProbe(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('fluid-canvas')).toHaveAttribute('data-ready', 'true');
    const art = page.getByRole('figure', { name: 'A living future — interactive artwork' });
    for (const [name, horizontal, vertical] of [
      ['near', 'ArrowRight', 'ArrowDown'], ['far', 'ArrowLeft', 'ArrowUp'],
    ] as const) {
      await art.focus();
      await art.press('Home');
      for (let step = 0; step < 12; step++) { await art.press(horizontal); await art.press(vertical); }
      await settledDraws(page);
      const angle = (await probe(page)).camera[0];
      // Exercise both ends of the frontal, longer-lens camera range.
      expect(Math.abs(angle[0])).toBeCloseTo(0.16, 5);
      expect(Math.abs(angle[1])).toBeCloseTo(0.105, 5);
      const rendered = await rackStats(page, await sheet(page));
      expect(rendered.grass).toBeGreaterThan(0.01);
      expect(rendered.offPalette).toBeLessThan(0.01);
      await page.screenshot({ path: testInfo.outputPath(`rack-limit-${name}.png`) });
    }
    expect(errors).toEqual([]);
  });

});
