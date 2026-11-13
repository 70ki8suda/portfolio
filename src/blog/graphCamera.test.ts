import { describe, expect, it } from 'vitest';
import { clampCamera, fitScale, isCamera, MAX_ZOOM, MIN_ZOOM, nextLevel, overviewCamera, panBy, toScreen, toWorld, wheelFactor, zoomAt } from './graphCamera';
import { semanticLevel } from './graphLayout';

const bounds = { x: -500, y: -400, width: 1000, height: 800 };
const viewport = { width: 1200, height: 700 };

describe('graph camera', () => {
  it('fits the whole layout inside the viewport with padding', () => {
    const fit = fitScale(bounds, viewport, 28);
    expect(fit).toBeCloseTo(Math.min((1200 - 56) / 1000, (700 - 56) / 800));
    const camera = overviewCamera(bounds);
    const topLeft = toScreen(camera, fit, viewport, { x: bounds.x, y: bounds.y });
    const bottomRight = toScreen(camera, fit, viewport, { x: bounds.x + bounds.width, y: bounds.y + bounds.height });
    expect(topLeft.x).toBeGreaterThanOrEqual(0);
    expect(topLeft.y).toBeGreaterThanOrEqual(27.9);
    expect(bottomRight.x).toBeLessThanOrEqual(1200);
    expect(bottomRight.y).toBeLessThanOrEqual(700 - 27.9);
  });

  it('round-trips between screen and world', () => {
    const camera = { x: 120, y: -40, k: 2.4 };
    const fit = fitScale(bounds, viewport);
    const world = toWorld(camera, fit, viewport, { x: 333, y: 444 });
    const screen = toScreen(camera, fit, viewport, world);
    expect(screen.x).toBeCloseTo(333);
    expect(screen.y).toBeCloseTo(444);
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const fit = fitScale(bounds, viewport);
    const camera = { x: 10, y: 20, k: 1 };
    const anchor = { x: 900, y: 150 };
    const before = toWorld(camera, fit, viewport, anchor);
    const zoomed = zoomAt(camera, fit, viewport, anchor, 2.5);
    const after = toWorld(zoomed, fit, viewport, anchor);
    expect(zoomed.k).toBeCloseTo(2.5);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('never zooms or pans beyond its limits', () => {
    const fit = fitScale(bounds, viewport);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, fit, viewport, { x: 0, y: 0 }, 1000).k).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, k: 1 }, fit, viewport, { x: 0, y: 0 }, 0.0001).k).toBe(MIN_ZOOM);
    const lost = clampCamera(panBy({ x: 0, y: 0, k: 1 }, fit, -99999, 99999), bounds);
    expect(lost.x).toBe(bounds.x + bounds.width);
    expect(lost.y).toBe(bounds.y);
  });

  it('pans the content with the pointer', () => {
    const fit = fitScale(bounds, viewport);
    const camera = { x: 0, y: 0, k: 2 };
    const moved = panBy(camera, fit, 50, -30);
    const origin = toScreen(camera, fit, viewport, { x: 0, y: 0 });
    const shifted = toScreen(moved, fit, viewport, { x: 0, y: 0 });
    expect(shifted.x - origin.x).toBeCloseTo(50);
    expect(shifted.y - origin.y).toBeCloseTo(-30);
  });

  it('agrees with the layout thresholds when zooming in and is sticky when zooming out', () => {
    for (const k of [1, 1.64, 1.65, 2.5, 3.09, 3.1, 8]) expect(nextLevel('article', k)).toBe(semanticLevel(k));
    expect(nextLevel('paragraph', 1.6)).toBe('paragraph');
    expect(nextLevel('paragraph', 1.5)).toBe('article');
    expect(nextLevel('concept', 3.05)).toBe('paragraph');
    expect(nextLevel('concept', 2.9)).toBe('paragraph');
    expect(nextLevel('concept', 1)).toBe('article');
  });

  it('caps a single wheel step and makes pinch more responsive', () => {
    expect(wheelFactor(100, false)).toBeCloseTo(wheelFactor(6000, false));
    expect(wheelFactor(100, false)).toBeGreaterThan(0.85);
    expect(wheelFactor(-100, false)).toBeLessThan(1.16);
    expect(wheelFactor(-5, true)).toBeGreaterThan(wheelFactor(-5, false));
  });

  it('validates a stored camera', () => {
    expect(isCamera({ x: 1, y: 2, k: 3 })).toBe(true);
    expect(isCamera({ x: 1, y: 2, k: 99 })).toBe(false);
    expect(isCamera({ x: Number.NaN, y: 2, k: 3 })).toBe(false);
    expect(isCamera(null)).toBe(false);
  });
});
