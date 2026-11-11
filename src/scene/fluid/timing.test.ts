import { describe, expect, it } from 'vitest';
import {
  MAX_DPR, MAX_STEPS_PER_FRAME, QUALITY_SCALES, STEP_SECONDS,
  createQualityGovernor, createStepClock, planResolution, resolveActivity,
} from './timing';

describe('resolveActivity', () => {
  const live = { available: true, reducedMotion: false, paused: false, documentVisible: true, inView: true };

  it('runs only when nothing asks it to stop', () => {
    expect(resolveActivity(live)).toBe('running');
    expect(resolveActivity({ ...live, paused: true })).toBe('paused');
    expect(resolveActivity({ ...live, documentVisible: false })).toBe('hidden');
    expect(resolveActivity({ ...live, inView: false })).toBe('offscreen');
    expect(resolveActivity({ ...live, reducedMotion: true })).toBe('static');
    expect(resolveActivity({ ...live, available: false })).toBe('unavailable');
  });

  it('never animates for reduced motion or without WebGL, whatever else is true', () => {
    for (const paused of [true, false]) for (const inView of [true, false]) for (const documentVisible of [true, false]) {
      expect(resolveActivity({ available: true, reducedMotion: true, paused, inView, documentVisible })).toBe('static');
      expect(resolveActivity({ available: false, reducedMotion: false, paused, inView, documentVisible })).toBe('unavailable');
    }
  });

  it('reports the user’s pause ahead of incidental visibility', () => {
    expect(resolveActivity({ ...live, paused: true, inView: false, documentVisible: false })).toBe('paused');
  });
});

describe('step clock', () => {
  const total = (frameSeconds: number, frames: number) => {
    const clock = createStepClock();
    let steps = 0;
    for (let i = 0; i < frames; i += 1) steps += clock.advance(frameSeconds);
    return steps;
  };

  it('advances simulated time at the same rate on 60, 90 and 120 Hz displays', () => {
    expect(total(1 / 60, 600)).toBe(600);
    expect(total(1 / 120, 1200)).toBe(600);
    expect(Math.abs(total(1 / 90, 900) - 600)).toBeLessThanOrEqual(1);
  });

  it('carries the remainder so uneven frames lose no time', () => {
    const clock = createStepClock();
    let steps = 0;
    for (let i = 0; i < 300; i += 1) steps += clock.advance(i % 2 === 0 ? 0.012 : 0.021);
    expect(Math.abs(steps - 300 * 0.0165 / STEP_SECONDS)).toBeLessThanOrEqual(1);
  });

  it('caps the work of one frame and forgets the backlog', () => {
    const clock = createStepClock();
    expect(clock.advance(5)).toBe(MAX_STEPS_PER_FRAME);
    expect(clock.advance(1 / 60)).toBe(1); // no burst afterwards
    expect(total(1 / 20, 100)).toBe(100 * MAX_STEPS_PER_FRAME); // slow device: slower ink, same step
  });

  it('ignores zero, negative and non-finite intervals', () => {
    const clock = createStepClock();
    for (const value of [0, -1, NaN, Infinity, -Infinity]) expect(clock.advance(value)).toBe(0);
    expect(clock.advance(STEP_SECONDS)).toBe(1);
  });

  it('drops a partial step on reset', () => {
    const clock = createStepClock();
    expect(clock.advance(STEP_SECONDS * 0.9)).toBe(0);
    clock.reset();
    expect(clock.advance(STEP_SECONDS * 0.9)).toBe(0);
  });
});

describe('planResolution', () => {
  it('caps the device pixel ratio and the pixel count', () => {
    const laptop = planResolution(1440, 900, 1)!;
    expect([laptop.canvasWidth, laptop.canvasHeight]).toEqual([1440, 900]);
    const retina = planResolution(1440, 900, 3)!;
    expect(retina.canvasWidth).toBeLessThanOrEqual(1440 * MAX_DPR);
    expect(retina.canvasWidth * retina.canvasHeight).toBeLessThanOrEqual(1_300_000 * 1.01);
    const huge = planResolution(3840, 2160, 2)!;
    expect(huge.canvasWidth * huge.canvasHeight).toBeLessThanOrEqual(1_300_000 * 1.01);
    expect(huge.canvasWidth / huge.canvasHeight).toBeCloseTo(3840 / 2160, 2);
  });

  it('gives phones a smaller grid and pixel budget', () => {
    const phone = planResolution(390, 844, 3)!;
    expect(phone.canvasWidth * phone.canvasHeight).toBeLessThanOrEqual(750_000 * 1.01);
    expect(Math.max(phone.simWidth, phone.simHeight)).toBe(96);
    expect(phone.pressureIterations).toBeLessThan(planResolution(1440, 900, 2)!.pressureIterations);
    expect(phone.dyeWidth * phone.dyeHeight).toBeLessThan(planResolution(1440, 900, 2)!.dyeWidth * planResolution(1440, 900, 2)!.dyeHeight);
    expect(Math.max(planResolution(1440, 900, 2)!.simWidth, planResolution(1440, 900, 2)!.simHeight)).toBe(144);
  });

  it('keeps simulation cells square to within the 8-cell rounding', () => {
    for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [768, 900], [2560, 1080]]) {
      const plan = planResolution(width, height, 2)!;
      const cellX = width / plan.simWidth;
      const cellY = height / plan.simHeight;
      expect(Math.abs(cellX / cellY - 1)).toBeLessThan(0.12);
      expect(plan.simWidth % 8).toBe(0);
      expect(plan.simHeight % 8).toBe(0);
    }
  });

  it('does not let dpr or quality change the simulation grid', () => {
    const base = planResolution(1440, 900, 1, 0)!;
    const other = planResolution(1440, 900, 2, 2)!;
    expect([other.simWidth, other.simHeight]).toEqual([base.simWidth, base.simHeight]);
    expect(other.canvasWidth).toBeLessThan(planResolution(1440, 900, 2, 0)!.canvasWidth);
    expect(planResolution(1444, 903, 1)!.simHeight).toBe(base.simHeight); // small layout shifts reuse the grid
  });

  it('budgets fewer and simpler blades for phones and for lower quality levels', () => {
    const desktop = planResolution(1440, 900, 2)!;
    const phone = planResolution(390, 844, 3)!;
    expect(phone.blades).toBeLessThan(desktop.blades / 2);
    expect(phone.bladeSegments).toBeLessThan(desktop.bladeSegments);
    expect(planResolution(1440, 900, 2, 1)!.blades).toBeLessThan(desktop.blades);
    expect(planResolution(1440, 900, 2, 2)!.blades).toBeLessThan(planResolution(1440, 900, 2, 1)!.blades);
    // The vertex shader walks at most eight segments.
    for (const plan of [desktop, phone]) expect(plan.bladeSegments).toBeLessThanOrEqual(8);
    expect(planResolution(1440, 900, 2, 99)!.blades).toBeGreaterThan(1000);
  });

  it('survives extreme and empty boxes', () => {
    expect(planResolution(0, 900, 1)).toBeNull();
    expect(planResolution(1440, 0, 1)).toBeNull();
    expect(planResolution(NaN, 900, 1)).toBeNull();
    const sliver = planResolution(2000, 4, 1)!;
    expect(sliver.simHeight).toBeGreaterThanOrEqual(16);
    expect(sliver.canvasHeight).toBeGreaterThanOrEqual(1);
    expect(planResolution(800, 600, NaN)!.canvasWidth).toBe(800);
    expect(planResolution(800, 600, 0.5)!.canvasWidth).toBe(800);
    expect(planResolution(800, 600, 1, 99)!.canvasWidth).toBe(Math.round(800 * QUALITY_SCALES[QUALITY_SCALES.length - 1]));
  });
});

describe('quality governor', () => {
  it('holds full quality at a healthy frame rate', () => {
    const governor = createQualityGovernor();
    for (let i = 0; i < 2000; i += 1) governor.sample(16.7);
    expect(governor.level).toBe(0);
  });

  it('ignores isolated hitches', () => {
    const governor = createQualityGovernor();
    for (let i = 0; i < 2000; i += 1) governor.sample(i % 120 === 0 ? 400 : 16.7);
    expect(governor.level).toBe(0);
  });

  it('steps down one level at a time under sustained slow frames, and never back up', () => {
    const governor = createQualityGovernor();
    for (let i = 0; i < 60; i += 1) governor.sample(45);
    expect(governor.level).toBe(0); // still settling
    for (let i = 0; i < 60; i += 1) governor.sample(45);
    expect(governor.level).toBe(1);
    for (let i = 0; i < 1000; i += 1) governor.sample(45);
    expect(governor.level).toBe(QUALITY_SCALES.length - 1);
    for (let i = 0; i < 1000; i += 1) governor.sample(8);
    expect(governor.level).toBe(QUALITY_SCALES.length - 1);
  });

  it('gives up on full quality within seconds when frames are far too slow', () => {
    const governor = createQualityGovernor();
    let waited = 0;
    while (governor.level < QUALITY_SCALES.length - 1 && waited < 60_000) { governor.sample(700); waited += 700; }
    expect(governor.level).toBe(QUALITY_SCALES.length - 1);
    expect(waited).toBeLessThan(10_000);
    // One long stall among good frames is still only a hitch.
    const steady = createQualityGovernor();
    for (let i = 0; i < 400; i += 1) steady.sample(i === 3 ? 5000 : 16.7);
    expect(steady.level).toBe(0);
  });

  it('does not count the gap across a pause', () => {
    const governor = createQualityGovernor();
    for (let i = 0; i < 80; i += 1) governor.sample(40);
    governor.resume();
    for (let i = 0; i < 80; i += 1) governor.sample(16);
    expect(governor.level).toBe(0);
  });
});
