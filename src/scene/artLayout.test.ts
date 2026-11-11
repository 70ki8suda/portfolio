import { describe, expect, it } from 'vitest';
import { artLayout } from './artLayout';

describe('artLayout', () => {
  it('places the art area right of centre on landscape screens, inside the header and dock', () => {
    for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
      const { x, y, radius } = artLayout(width, height);
      expect(x / width).toBeGreaterThanOrEqual(0.66);
      expect(x / width).toBeLessThanOrEqual(0.7);
      expect(y / height).toBeGreaterThanOrEqual(0.46);
      expect(y / height).toBeLessThanOrEqual(0.48);
      expect((2 * radius) / height).toBeGreaterThanOrEqual(0.75);
      expect((2 * radius) / height).toBeLessThanOrEqual(0.8);
      // The core (inner half) stays clear of the left text column.
      expect(x - radius / 2).toBeGreaterThan(width * 0.55);
    }
  });

  it('lifts the art area into the upper band on portrait screens', () => {
    for (const [width, height] of [[390, 844], [360, 640], [768, 1024]]) {
      const { x, y, radius } = artLayout(width, height);
      expect(x / width).toBeGreaterThanOrEqual(0.5);
      expect(x / width).toBeLessThanOrEqual(0.56);
      expect(y / height).toBeGreaterThanOrEqual(0.235);
      expect(y / height).toBeLessThanOrEqual(0.33);
      expect((2 * radius) / width).toBeLessThanOrEqual(1.15);
      // The core stays above the middle of the screen, where the title stack begins.
      expect(y + radius / 2).toBeLessThan(height * 0.5);
    }
    const phone = artLayout(390, 844);
    expect((2 * phone.radius) / 390).toBeGreaterThanOrEqual(1);
  });

  it('blends continuously between portrait and landscape', () => {
    const height = 900;
    let previous = artLayout(600, height);
    for (let width = 601; width <= 1500; width++) {
      const next = artLayout(width, height);
      expect(Math.abs(next.x / width - previous.x / (width - 1))).toBeLessThan(0.01);
      expect(Math.abs(next.y - previous.y)).toBeLessThan(2);
      expect(Math.abs(next.radius - previous.radius)).toBeLessThan(2);
      previous = next;
    }
  });

  it('keeps the core above the title on short phones', () => {
    const small = artLayout(320, 600);
    expect(small.y + small.radius / 2).toBeLessThan(200);
    const short = artLayout(360, 640);
    expect(short.y + short.radius / 2).toBeLessThan(250);
  });

  it('survives a zero-sized scene', () => {
    const layout = artLayout(0, 0);
    expect(Number.isFinite(layout.x) && Number.isFinite(layout.y) && Number.isFinite(layout.radius)).toBe(true);
  });
});
