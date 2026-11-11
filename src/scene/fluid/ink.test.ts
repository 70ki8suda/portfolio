import { describe, expect, it } from 'vitest';
import {
  FLOW, MAX_SPLATS, PAPER, PIGMENTS, STEPS_PER_SECOND,
  createSources, createSplatQueue, inkColor, pushSplat, saturate, stage,
} from './ink';

const luminance = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const distance = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('pigments', () => {
  it('leave bare paper where there is no ink', () => {
    expect(inkColor([0, 0, 0])).toEqual([...PAPER]);
    expect(inkColor([-1, -1, -1])).toEqual([...PAPER]);
  });

  it('stay inside one restrained palette: jade, deep green and pale warm light', () => {
    const [jade, deep, sun] = PIGMENTS.map((_, index) => inkColor([0, 1, 2].map((slot) => (slot === index ? 2 : 0))));
    // Both water pigments are green-led, with blue between red and green: jade, never blue, violet or magenta.
    for (const water of [jade, deep]) {
      expect(water[1]).toBeGreaterThan(water[2]);
      expect(water[2]).toBeGreaterThan(water[0]);
      expect(water[1]).toBeGreaterThan(water[0] * 1.8);
    }
    expect(luminance(deep)).toBeLessThan(luminance(jade) * 0.75);
    // Sunlight barely darkens the paper and warms it: red and green stay, blue goes.
    expect(luminance(sun)).toBeGreaterThan(luminance([...PAPER]) * 0.85);
    expect(sun[0]).toBeGreaterThan(sun[2] * 1.3);
    expect(sun[1]).toBeGreaterThan(sun[2] * 1.2);
    expect(distance(jade, deep)).toBeGreaterThan(0.15);
    expect(distance(jade, sun)).toBeGreaterThan(0.4);
    // No mixture of the water pigments leaves the palette: green leads red and blue.
    for (const mix of [[1, 1, 0], [2, 0, 2], [0, 3, 1], [4, 4, 4], [0.3, 0.1, 0.2]]) {
      const [r, g, b] = inkColor(mix);
      expect(g).toBeGreaterThanOrEqual(r);
      expect(g).toBeGreaterThanOrEqual(b);
    }
  });

  it('mix subtractively: overlapping inks are darker than either and still green', () => {
    const jade = inkColor([1.5, 0, 0]);
    const deep = inkColor([0, 1.5, 0]);
    const mixed = inkColor([1.5, 1.5, 0]);
    expect(luminance(mixed)).toBeLessThan(Math.min(luminance(jade), luminance(deep)));
    for (let channel = 0; channel < 3; channel += 1) expect(mixed[channel]).toBeLessThanOrEqual(Math.min(jade[channel], deep[channel]));
    expect(mixed[1]).toBeGreaterThan(mixed[0] * 2);
    expect(mixed[1]).toBeGreaterThan(mixed[2]);
  });

  it('deepen with concentration but level off instead of going black', () => {
    let previous = luminance([...PAPER]);
    for (const amount of [0.1, 0.5, 1, 2, FLOW.dyeLimit]) {
      const next = luminance(inkColor([amount, 0, 0]));
      expect(next).toBeLessThan(previous);
      previous = next;
    }
    expect(saturate(FLOW.dyeLimit)).toBeLessThanOrEqual(1);
    expect(Math.max(...inkColor([FLOW.dyeLimit, 0, 0]))).toBeGreaterThan(0.45); // still clearly jade
  });
});

describe('splat queue', () => {
  it('stores position, velocity and a single pigment', () => {
    const queue = createSplatQueue();
    expect(pushSplat(queue, 0.25, 0.75, 0.05, 3, -4, 1, 0.5)).toBe(true);
    expect([...queue.points.subarray(0, 3)]).toEqual([0.25, 0.75, Math.fround(0.05)]);
    expect([...queue.velocity.subarray(0, 3)]).toEqual([3, -4, 0]);
    expect([...queue.dye.subarray(0, 3)]).toEqual([0, 0.5, 0]);
  });

  it('has a fixed capacity and rejects unusable values', () => {
    const queue = createSplatQueue();
    expect(pushSplat(queue, NaN, 0, 0.05, 0, 0, 0, 1)).toBe(false);
    expect(pushSplat(queue, 0, 0, 0, 0, 0, 0, 1)).toBe(false);
    expect(pushSplat(queue, 0, 0, 0.05, Infinity, 0, 0, 1)).toBe(false);
    for (let i = 0; i < MAX_SPLATS; i += 1) expect(pushSplat(queue, 0.5, 0.5, 0.05, 0, 0, 0, 1)).toBe(true);
    expect(pushSplat(queue, 0.5, 0.5, 0.05, 0, 0, 0, 1)).toBe(false);
    expect(queue.count).toBe(MAX_SPLATS);
  });
});

describe('ambient sources', () => {
  const collect = (seed: number, steps: number, aspect = 1.6, cells = 88) => {
    const sources = createSources(seed);
    const queue = createSplatQueue();
    const events: number[][] = [];
    for (let step = 0; step < steps; step += 1) {
      sources.advance(step, aspect, cells, queue);
      expect(queue.count).toBeLessThanOrEqual(MAX_SPLATS);
      for (let i = 0; i < queue.count; i += 1) {
        events.push([step, ...queue.points.subarray(i * 4, i * 4 + 3), ...queue.velocity.subarray(i * 3, i * 3 + 2), ...queue.dye.subarray(i * 3, i * 3 + 3)]);
      }
      queue.count = 0;
    }
    return events;
  };

  it('are a function of the seed and the step count only', () => {
    expect(collect(42, 1200)).toEqual(collect(42, 1200));
    expect(collect(42, 1200)).not.toEqual(collect(43, 1200));
  });

  it('release all three pigments, inside the sheet, every one with motion', () => {
    const events = collect(7, 60 * STEPS_PER_SECOND);
    const totals = [0, 0, 0];
    for (const [, x, y, radius, vx, vy, ...dye] of events) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(1);
      expect(radius).toBeGreaterThan(0.01);
      expect(radius).toBeLessThan(0.1);
      expect(Math.hypot(vx, vy)).toBeGreaterThan(0);
      expect(Math.hypot(vx, vy)).toBeLessThan(3 * 88); // under three sheet-heights per second
      expect(dye.filter((amount) => amount > 0).length).toBe(1);
      dye.forEach((amount, index) => { totals[index] += amount; });
    }
    for (const total of totals) expect(total).toBeGreaterThan(Math.max(...totals) * 0.3);
  });

  it('fire a hard jet every few seconds on top of the steady nozzles', () => {
    const jets = collect(11, 60 * STEPS_PER_SECOND).filter(([, , , , vx, vy]) => Math.hypot(vx, vy) > 88);
    expect(jets.length).toBeGreaterThan(14);
    expect(jets.length).toBeLessThan(56);
  });

  it('keep the ink over the wetland and off the copy', () => {
    const [landscapeX, landscapeY] = stage(1.6);
    expect(landscapeX).toBeGreaterThan(0.6);
    expect(landscapeY).toBeGreaterThan(0.45);
    const [portraitX, portraitY, , reachY] = stage(0.46);
    expect(portraitX).toBeCloseTo(0.5, 5);
    expect(portraitY - reachY).toBeGreaterThan(0.35); // upper part of a phone screen (y runs upward)
    for (const aspect of [0.4, 0.9, 1.1, 1.25, 2.4]) {
      const [x, y, rx, ry] = stage(aspect);
      expect(x - rx).toBeGreaterThan(0.05);
      expect(x + rx).toBeLessThan(0.99);
      expect(y - ry).toBeGreaterThan(0.05);
      expect(y + ry).toBeLessThan(0.99);
    }
  });
});
