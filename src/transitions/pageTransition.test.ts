import { describe, expect, it } from 'vitest';
import { firstFontSource } from './embeddedFonts';
import { isPageChange } from './pageTransition';
import { isBlankPixels, mergedRunHeight, sameBox } from './snapshot';

describe('isPageChange', () => {
  it('is true only when the pathname changes', () => {
    expect(isPageChange({ from: '/', to: '/blog' })).toBe(true);
    expect(isPageChange({ from: '/blog', to: '/blog/a-post' })).toBe(true);
    expect(isPageChange({ from: '/blog/a', to: '/blog/b' })).toBe(true);
  });

  it('ignores the first load, an unchanged pathname and a trailing slash', () => {
    expect(isPageChange({ from: undefined, to: '/blog' })).toBe(false);
    // Tag filters and hash links keep the pathname, so they reach here unchanged.
    expect(isPageChange({ from: '/blog', to: '/blog' })).toBe(false);
    expect(isPageChange({ from: '/blog/', to: '/blog' })).toBe(false);
    expect(isPageChange({ from: '/', to: '/' })).toBe(false);
  });
});

describe('sameBox', () => {
  const box = { left: 10, top: 20, width: 300, height: 40 };
  it('accepts sub-pixel differences', () => {
    expect(sameBox(box, { left: 10.4, top: 19.2, width: 300.9, height: 40 })).toBe(true);
  });
  it('rejects a box that moved or changed size', () => {
    expect(sameBox(box, { ...box, top: 24 })).toBe(false);
    expect(sameBox(box, { ...box, width: 280 })).toBe(false);
  });
});

describe('mergedRunHeight', () => {
  it('spans from the first box to the last, minus the collapsed margin between them', () => {
    // first at 100, last at 900; margins 24 and 16 collapse to 24.
    expect(mergedRunHeight(100, 900, 24, 16)).toBe(776);
    expect(mergedRunHeight(100, 900, 0, 0)).toBe(800);
  });
  it('never returns a negative height', () => {
    expect(mergedRunHeight(100, 110, 40, 0)).toBe(0);
  });
});

describe('isBlankPixels', () => {
  const pixels = (...rgba: number[][]) => new Uint8ClampedArray(rgba.flat());
  it('treats a transparent or cleared opaque buffer as blank', () => {
    expect(isBlankPixels(pixels([0, 0, 0, 0], [0, 0, 0, 0]))).toBe(true);
    expect(isBlankPixels(pixels([0, 0, 0, 255], [0, 0, 0, 255]))).toBe(true);
  });
  it('accepts a picture with any drawn pixel', () => {
    expect(isBlankPixels(pixels([0, 0, 0, 0], [243, 241, 235, 255]))).toBe(false);
    expect(isBlankPixels(pixels([0, 0, 0, 255], [1, 0, 0, 255], [0, 0, 0, 0]))).toBe(false);
  });
});

describe('firstFontSource', () => {
  it('reads the first url and its format', () => {
    expect(firstFontSource('url("/assets/a.woff2") format("woff2"), url(/assets/a.woff) format("woff")'))
      .toEqual({ url: '/assets/a.woff2', format: 'woff2' });
    expect(firstFontSource("url('b.woff2')")).toEqual({ url: 'b.woff2', format: null });
    expect(firstFontSource('url(c.woff)format(woff)')).toEqual({ url: 'c.woff', format: 'woff' });
  });
  it('returns null without a url', () => {
    expect(firstFontSource('local("Arial")')).toBeNull();
  });
});
