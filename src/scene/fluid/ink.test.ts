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

  it('are each a distinct, saturated colour: teal, magenta, violet-blue', () => {
    const [teal, magenta, violet] = PIGMENTS.map((_, index) => inkColor([0, 1, 2].map((slot) => (slot === index ? 2 : 0))));
    expect(teal[1]).toBeGreaterThan(teal[0] * 2);
    expect(teal[2]).toBeGreaterThan(teal[0] * 2);
    expect(magenta[0]).toBeGreaterThan(magenta[1] * 2);
    expect(magenta[2]).toBeGreaterThan(magenta[1] * 2);
    expect(violet[2]).toBeGreaterThan(violet[0] * 1.8);
    expect(violet[2]).toBeGreaterThan(violet[1] * 1.5);
    expect(distance(teal, magenta)).toBeGreaterThan(0.5);
    expect(distance(teal, violet)).toBeGreaterThan(0.25);
    expect(distance(magenta, violet)).toBeGreaterThan(0.25);
  });

  it('mix subtractively: overlapping inks are darker than either and a colour of their own', () => {
    const teal = inkColor([1.5, 0, 0]);
    const magenta = inkColor([0, 1.5, 0]);
    const mixed = inkColor([1.5, 1.5, 0]);
    expect(luminance(mixed)).toBeLessThan(Math.min(luminance(teal), luminance(magenta)));
    for (let channel = 0; channel < 3; channel += 1) expect(mixed[channel]).toBeLessThanOrEqual(Math.min(teal[channel], magenta[channel]));
    // Blue survives both, so the blend reads as violet-blue rather than grey.
    expect(mixed[2]).toBeGreaterThan(mixed[0] * 1.5);
    expect(mixed[2]).toBeGreaterThan(mixed[1] * 1.5);
  });

  it('deepen with concentration but level off instead of going black', () => {
    let previous = luminance([...PAPER]);
    for (const amount of [0.1, 0.5, 1, 2, FLOW.dyeLimit]) {
      const next = luminance(inkColor([amount, 0, 0]));
      expect(next).toBeLessThan(previous);
      previous = next;
    }
    expect(saturate(FLOW.dyeLimit)).toBeLessThanOrEqual(1);
    expect(Math.max(...inkColor([FLOW.dyeLimit, 0, 0]))).toBeGreaterThan(0.45); // still clearly teal
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

  it('keep the ink over the meadow and off the copy', () => {
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
