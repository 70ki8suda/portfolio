import { describe, expect, it } from 'vitest';
import { dragTurn, keyTurn } from './cameraDrag';

describe('camera gestures', () => {
  it('follows mouse displacement and bounds accumulated angles', () => {
    const turned = dragTurn({ pan: 0.3, tilt: -0.2 }, 100, 60, 1000, 600);
    expect(turned.pan).toBeCloseTo(0.06);
    expect(turned.tilt).toBeCloseTo(0.04);
    expect(dragTurn(turned, -10000, 10000, 1000, 600)).toEqual({ pan: 1, tilt: 1 });
  });
  it('reserves touch vertical movement for native scrolling', () => {
    expect(dragTurn({ pan: 0, tilt: 0.25 }, 100, 900, 1000, 600, 'touch')).toEqual({ pan: -0.24, tilt: 0.25 });
    expect(dragTurn({ pan: 0, tilt: 0.25 }, 0, 900, 1000, 600, 'touch')).toEqual({ pan: 0, tilt: 0.25 });
  });
  it('offers bounded keyboard angles and a deterministic reset', () => {
    expect(keyTurn({ pan: 1, tilt: 1 }, 'ArrowRight')).toEqual({ pan: 1, tilt: 1 });
    expect(keyTurn({ pan: 1, tilt: 1 }, 'ArrowDown')?.tilt).toBeCloseTo(0.9);
    expect(keyTurn({ pan: 1, tilt: 1 }, 'Home')).toEqual({ pan: 0, tilt: 0 });
    expect(keyTurn({ pan: 1, tilt: 1 }, 'Tab')).toBeNull();
  });
});
