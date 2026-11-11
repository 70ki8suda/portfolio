import { describe, expect, it } from 'vitest';
import { GRASS, GRASS_STYLES, bladeAngle, bladeSpine, bladeWidth, grassField, sunlight, windBend, windDrive } from './grass';

const lengthOf = (spine: number[]) => {
  let total = 0;
  for (let index = 2; index < spine.length; index += 2) total += Math.hypot(spine[index] - spine[index - 2], spine[index + 1] - spine[index - 1]);
  return total;
};

describe('blade', () => {
  it('keeps its root and its length however hard the wind blows', () => {
    for (const segments of [4, 6, 8]) {
      for (const wind of [-3, -0.4, 0, 0.2, 1, 5]) {
        for (const style of Object.values(GRASS_STYLES)) {
          const spine = bladeSpine(segments, style.lean, style.curl, windBend(wind, style.sway));
          expect(spine.slice(0, 2)).toEqual([0, 0]);
          expect(spine).toHaveLength(2 * (segments + 1));
          expect(lengthOf(spine)).toBeCloseTo(1, 10);
        }
      }
    }
  });

  it('stands straight up in still air when it has no lean or curl', () => {
    const spine = bladeSpine(6, 0, 0, windBend(0));
    expect(spine[spine.length - 2]).toBeCloseTo(0, 12);
    expect(spine[spine.length - 1]).toBeCloseTo(1, 12);
  });

  it('bends with the wind, more at the tip than near the root, and mirrors for the opposite wind', () => {
    const calm = bladeSpine(6, 0, 0, 0);
    let previousTip = 0;
    for (const wind of [0.05, 0.15, 0.4, 1, 3]) {
      const spine = bladeSpine(6, 0, 0, windBend(wind));
      const tip = spine[spine.length - 2];
      expect(tip).toBeGreaterThan(previousTip);
      previousTip = tip;
      // Sideways travel grows faster than height along the blade: a curve, not a tilted stick.
      const low = spine[2] / (1 / 6);
      const high = (spine[12] - spine[10]) / (1 / 6);
      expect(high).toBeGreaterThan(low * 2);
      expect(spine[spine.length - 1]).toBeLessThan(calm[calm.length - 1]);
      const mirrored = bladeSpine(6, 0, 0, windBend(-wind));
      expect(mirrored[mirrored.length - 2]).toBeCloseTo(-tip, 12);
      expect(mirrored[mirrored.length - 1]).toBeCloseTo(spine[spine.length - 1], 12);
    }
  });

  it('never folds back on itself: the wind alone cannot turn a blade past horizontal', () => {
    for (const wind of [1, 10, 1e6, Infinity]) {
      const bend = windBend(wind);
      expect(bend).toBeLessThanOrEqual(GRASS.maxBend);
      expect(bend).toBeLessThan(Math.PI / 2);
      for (let t = 0; t <= 1; t += 0.1) expect(Math.abs(bladeAngle(t, 0, 0, bend))).toBeLessThanOrEqual(GRASS.maxBend + 1e-12);
    }
    expect(windBend(-0.3)).toBeCloseTo(-windBend(0.3), 12);
  });

  it('tapers from full width at the root to a point, without widening anywhere', () => {
    expect(bladeWidth(0)).toBe(1);
    expect(bladeWidth(1)).toBe(0);
    let previous = 1;
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const width = bladeWidth(t);
      expect(width).toBeLessThanOrEqual(previous);
      previous = width;
    }
    // Nearly parallel sides for the first half: a blade, not a triangle.
    expect(bladeWidth(0.5)).toBeGreaterThan(0.75);
    expect(bladeWidth(-1)).toBe(1);
    expect(bladeWidth(2)).toBe(0);
  });
});

describe('wind', () => {
  it('blows harder and faster with intensity, and never stops or runs away', () => {
    const low = windDrive(0);
    const high = windDrive(1);
    expect(low.gain).toBeGreaterThan(0);
    expect(low.pace).toBeGreaterThan(0);
    expect(high.gain).toBeGreaterThan(low.gain);
    expect(high.pace).toBeGreaterThan(low.pace);
    expect(windDrive(0.5).gain).toBeCloseTo((low.gain + high.gain) / 2, 12);
    expect(windDrive(7)).toEqual(high);
    expect(windDrive(-2)).toEqual(low);
    expect(windDrive(NaN)).toEqual(low);
  });

  it('gives more sunlight with intensity, never none and never a blowout', () => {
    expect(sunlight(0)).toBeGreaterThan(0.4);
    expect(sunlight(1)).toBeGreaterThan(sunlight(0.5));
    expect(sunlight(0.5)).toBeGreaterThan(sunlight(0));
    expect(sunlight(1)).toBeLessThan(1.5);
    expect(sunlight(9)).toBe(sunlight(1));
    expect(sunlight(NaN)).toBe(sunlight(0));
  });

  it('eases toward its target slowly enough to hide the solver\'s jitter and fast enough to follow a gust', () => {
    // Time for the wind to close 63% of a change, at 60 steps per second.
    const seconds = -1 / (60 * Math.log(1 - GRASS.windEase));
    expect(seconds).toBeGreaterThan(0.12);
    expect(seconds).toBeLessThan(0.8);
  });
});

describe('grassField', () => {
  it('keeps the wetland right of the title on landscape screens and fills the hero from edge to edge', () => {
    for (const [width, height] of [[1440, 900], [1280, 720], [1920, 1080], [2560, 1080]]) {
      const field = grassField(width, height);
      // The title ends near 0.47 of the width on its widest line; grass starts no further left than a third.
      expect(field.left).toBeGreaterThanOrEqual(0.36);
      expect(field.edge).toBeLessThanOrEqual(field.left); // no blade is rooted left of where grass may stand
      expect(field.edge).toBeGreaterThan(0.25);
      expect(field.near).toBeLessThan(0); // nothing thins out on screen at the bottom
      expect(field.far).toBeGreaterThan(1);
    }
  });

  it('lays the wetland above the title on portrait screens and ends it there', () => {
    for (const [width, height] of [[390, 844], [430, 932]]) {
      const field = grassField(width, height);
      expect(field.left + field.soft).toBeLessThan(0); // full width
      expect(field.near).toBeGreaterThan(0.4); // the title's band stays paper
      expect(field.far).toBeLessThan(0.97); // below the header
      expect(field.scale).toBeLessThan(grassField(1440, 900).scale);
    }
  });

  it('lifts and shrinks the wetland on short phones, where the title starts higher', () => {
    const short = grassField(320, 568);
    const tall = grassField(390, 844);
    expect(short.near).toBeGreaterThan(0.64); // the title begins about 0.36 of the way down
    expect(short.near).toBeLessThan(short.far - 0.15);
    expect(short.scale).toBeLessThan(tall.scale);
  });

  it('keeps the vanishing line above the far edge, so sizes stay positive and shrink with distance', () => {
    for (const [width, height] of [[1440, 900], [390, 844], [320, 568], [768, 900], [1000, 900]]) {
      const field = grassField(width, height);
      expect(field.horizon).toBeGreaterThan(field.far + 0.05);
      // Size of something at the far edge relative to the near edge (the shader's `nearness`).
      const farSize = (field.horizon - field.far) / (field.horizon - Math.max(field.near, 0));
      expect(farSize).toBeGreaterThan(0.1);
      expect(farSize).toBeLessThan(0.6);
    }
  });

  it('blends continuously between the layouts and survives empty boxes', () => {
    let previous = grassField(600, 700);
    for (let width = 610; width <= 900; width += 10) {
      const next = grassField(width, 700);
      for (const key of Object.keys(next) as (keyof typeof next)[]) expect(Math.abs(next[key] - previous[key])).toBeLessThan(0.15);
      previous = next;
    }
    for (const value of Object.values(grassField(0, 0))) expect(Number.isFinite(value)).toBe(true);
  });
});
