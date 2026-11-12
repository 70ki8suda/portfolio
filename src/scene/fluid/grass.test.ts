import { describe, expect, it } from 'vitest';
import { MODULE, bayOf, cropZ, cropInto, cropMargin, raftDistance, CAMERA, CAMERA_REST, cameraAngles, cameraProject, cameraRay, clampTurn, GRASS, GRASS_STYLES, RACK, bladeAngle, bladeSpine, bladeWidth, grassField, sunlight, windBend, windDrive } from './grass';

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

describe('rack camera', () => {
  it('keeps the camera finite with positive projection depth through responsive sizes', () => {
    for (const [width, height] of [[0, 0], [320, 568], [390, 844], [768, 900], [1440, 900], [2560, 1080]]) {
      const field = grassField(width, height);
      for (const value of Object.values(field)) expect(Number.isFinite(value)).toBe(true);
      expect(field.focal).toBeGreaterThan(0);
      expect(field.vanish).toBeGreaterThan(-1);
      expect(field.vanish).toBeLessThan(1);
      expect(field.eye).toBeGreaterThan(0);
      expect(field.eye).toBeLessThan(1);
      expect(Math.floor((RACK.top - field.bottom) / RACK.tier)).toBeGreaterThanOrEqual(2);
    }
  });

  it('crops a single rack above the mobile copy instead of masking it with white', () => {
    const desktop = grassField(1440, 900);
    const phone = grassField(390, 844);
    const short = grassField(320, 568);
    expect(desktop.left).toBeGreaterThan(0);
    expect(phone.left).toBe(0);
    expect(short.left).toBe(0);
    expect(phone.eye).toBeGreaterThan(desktop.eye);
    expect(short.bottom).toBeGreaterThan(phone.bottom);
    expect(short.focal).toBeLessThanOrEqual(phone.focal);
  });
});

describe('rack composition', () => {
  // Three racks side by side in landscape, one in portrait; a frame's posts reach a little past its top and lowest tray.
  const drawn = (width: number, height: number, rows: number) => {
    const field = grassField(width, height);
    const aspect = width / height;
    const roof = field.bottom + Math.floor((RACK.top - field.bottom) / RACK.tier + 0.01) * RACK.tier;
    const at = (x: number, y: number, z: number) => cameraProject(field, aspect, [x, y, z])!;
    return {
      left: at(RACK.front, 0, RACK.to).u,
      right: at(RACK.front + (rows - 1) * 1.25 + RACK.depth, 0, RACK.from).u,
      top: at(RACK.front, roof + 0.02, RACK.from).v,
      foot: at(RACK.front, field.bottom - 0.075, RACK.from).v,
    };
  };

  it('centres the drawn racks in the hero, with room on every side', () => {
    for (const [width, height, rows] of [[320, 692.5, 1], [375, 811.5, 1], [390, 844, 1], [430, 930.6, 1], [1280, 800, 3], [1440, 900, 3], [1920, 1080, 3]]) {
      const { left, right, top, foot } = drawn(width, height, rows);
      expect((left + right) / 2).toBeCloseTo(0.5, 6);
      expect((top + foot) / 2).toBeCloseTo(0.5, 6);
      expect(left).toBeGreaterThan(0.05);
      expect(right).toBeLessThan(0.95);
      expect(foot).toBeGreaterThan(0.1);
      // Clear of the header: 96px in landscape, 80px on a phone.
      expect((1 - top) * height).toBeGreaterThan((rows === 3 ? 96 : 80) + 16);
    }
  });

  it('draws every phone width as the same picture', () => {
    const reference = drawn(390, 844, 1);
    for (const width of [320, 375, 430]) {
      const other = drawn(width, width * 2.164103, 1);
      for (const key of ['left', 'right', 'top', 'foot'] as const) expect(other[key]).toBeCloseTo(reference[key], 3);
    }
  });
});

describe('rack geometry', () => {
  it('puts the water below the lip and leaves growing space between trays', () => {
    expect(RACK.water).toBeGreaterThan(0);
    expect(RACK.water).toBeLessThan(RACK.lip);
    expect(RACK.tier - RACK.lip).toBeGreaterThan(RACK.blade);
    expect(RACK.depth).toBeGreaterThan(2 * RACK.post);
    expect(RACK.bay).toBeGreaterThan(4 * RACK.post);
    expect(RACK.from).toBeGreaterThan(0); // no projection through the camera
    expect(RACK.to).toBeGreaterThan(RACK.from + 3 * RACK.bay);
  });
});


describe('camera rotation', () => {
  it('bounds both axes and rejects non-finite inputs', () => {
    expect(clampTurn({ pan: 5, tilt: -3 })).toEqual({ pan: 1, tilt: -1 });
    expect(clampTurn({ pan: NaN, tilt: Infinity })).toEqual(CAMERA_REST);
    expect(cameraAngles({ pan: 1, tilt: -1 })).toEqual({ yaw: CAMERA.maxYaw, pitch: -CAMERA.maxPitch });
  });

  it('projects world points onto the same rays at every allowed angle', () => {
    for (const [width, height] of [[320, 568], [390, 844], [1440, 900], [2560, 1080]]) {
      const field = grassField(width, height);
      for (const pan of [-1, 0, 1]) for (const tilt of [-1, 0, 1]) {
        for (const world of [[1.2, -0.8, 2], [1.1, 0.2, 5], [-2.7, -0.4, 8]] as const) {
          const turn = { pan, tilt };
          const projected = cameraProject(field, width / height, world, turn);
          expect(projected).not.toBeNull();
          const ray = cameraRay(field, width / height, projected!.u, projected!.v, turn);
          expect(ray).not.toBeNull();
          expect(ray![0]).toBeCloseTo(world[0] / world[2], 10);
          expect(ray![1]).toBeCloseTo(world[1] / world[2], 10);
        }
      }
    }
  });

  it('preserves the resting composition and rejects points behind the camera', () => {
    const field = grassField(1440, 900);
    const point = cameraProject(field, 1.6, [1, -0.2, 3])!;
    expect(point.u).toBeCloseTo(field.vanish + field.focal / (3 * 1.6));
    expect(point.v).toBeCloseTo(field.eye - field.focal * 0.2 / 3);
    expect(cameraProject(field, 1.6, [0, 0, -1])).toBeNull();
  });
});


describe('cultivation modules', () => {
  it('ends at complete bays and leaves water channels between rafts', () => {
    expect(RACK.to - RACK.from).toBeCloseTo(RACK.bays * RACK.bay, 12);
    for (let bay = 0; bay <= RACK.bays; bay++) {
      const boundary = RACK.from + bay * RACK.bay;
      expect(raftDistance(boundary, RACK.depth / 2)).toBeLessThan(0);
    }
    for (let bay = 0; bay < RACK.bays; bay++) {
      const centre = RACK.from + (bay + 0.5) * RACK.bay;
      expect(raftDistance(centre, 0)).toBeLessThan(0);
      expect(raftDistance(centre, RACK.depth)).toBeLessThan(0);
      expect(raftDistance(centre, RACK.depth / 2)).toBeGreaterThan(MODULE.border);
    }
  });

  it('places every root inside a raft border, without reversing depth order', () => {
    let previous = -Infinity;
    for (let sample = 0; sample <= 500; sample++) {
      const distance = RACK.from + sample / 500 * (RACK.to - RACK.from);
      const root = cropZ(distance);
      expect(root).toBeGreaterThanOrEqual(previous);
      previous = root;
      expect(root).toBeGreaterThanOrEqual(RACK.from + cropMargin.along - 1e-10);
      expect(root).toBeLessThanOrEqual(RACK.to - cropMargin.along + 1e-10);
      const { local } = bayOf(root);
      expect(local).toBeGreaterThanOrEqual(cropMargin.along - 1e-10);
      expect(local).toBeLessThanOrEqual(RACK.bay - cropMargin.along + 1e-10);
      for (const share of [0, 0.2, 0.5, 0.9, 1]) {
        expect(raftDistance(root, cropInto(share))).toBeGreaterThanOrEqual(MODULE.border + MODULE.clear - 1e-10);
      }
    }
  });
});
