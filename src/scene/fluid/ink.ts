/**
 * Ink in liquid: the model's constants, its pigments, and the forcing that keeps it moving.
 *
 * The GPU integrates the 2-D incompressible Navier–Stokes equations for a velocity field u
 * and carries three pigment concentrations along with it (Stam's "stable fluids" scheme):
 *
 *   ∂u/∂t = −(u·∇)u − ∇p + f,   ∇·u = 0        ∂c/∂t = −(u·∇)c + s
 *
 * This file is the part that needs no GPU, so it can be unit-tested: what is injected,
 * where, how much, and how concentrations turn into colour.
 */

/** Simulation steps per second of running time. The step itself never changes size. */
export const STEPS_PER_SECOND = 60;
export const STEP_SECONDS = 1 / STEPS_PER_SECOND;

export const FLOW = {
  /** Velocity kept per step: a slow stand-in for viscous losses. */
  velocityKeep: 0.9985,
  /** Pigment kept per step: ink thins out so the sheet never fills up. Half-life ≈ 7 s. */
  dyeKeep: 0.99835,
  /** Vorticity confinement, restoring the small eddies that semi-Lagrangian advection smears. */
  confinement: 11,
  /** Each step starts the pressure solve from this fraction of the last solution. */
  pressureKeep: 0.8,
  /** Upper bound on a concentration, so repeated injection cannot overflow the texture. */
  dyeLimit: 4,
} as const;

/* ---------- pigments ---------- */

/** The sheet the ink spreads on. */
export const PAPER: readonly [number, number, number] = [0.953, 0.945, 0.922];

/**
 * Absorbance of each pigment per unit of (saturated) concentration, in R, G, B.
 * Colour is subtractive, as with real ink: paper × exp(−Σ cᵢ·Aᵢ). Where two inks overlap
 * their absorbances add, which is why teal over magenta turns deep violet instead of grey.
 */
export const PIGMENTS: readonly (readonly [number, number, number])[] = [
  [2.0, 0.5, 0.36], // teal
  [0.5, 1.75, 0.34], // magenta
  [1.25, 0.95, 0.12], // ultramarine violet
];

/** Concentration → optical amount: linear for thin washes, levelling off so dense ink keeps its hue. */
export const saturate = (concentration: number) => 1 - Math.exp(-Math.max(0, concentration));

/** Displayed colour of a pigment mixture; the render shader computes exactly this. */
export function inkColor(concentrations: readonly number[]): [number, number, number] {
  const color: [number, number, number] = [0, 0, 0];
  for (let channel = 0; channel < 3; channel += 1) {
    let absorbed = 0;
    for (let pigment = 0; pigment < PIGMENTS.length; pigment += 1) absorbed += saturate(concentrations[pigment] ?? 0) * PIGMENTS[pigment][channel];
    color[channel] = PAPER[channel] * Math.exp(-absorbed);
  }
  return color;
}

const vec3 = (values: readonly number[]) => `vec3(${values.map((value) => value.toFixed(4)).join(', ')})`;
export const INK_COLOR_GLSL = `
vec3 inkColor(vec3 c) {
  c = 1.0 - exp(-max(c, 0.0));
  return ${vec3(PAPER)} * exp(-(c.r * ${vec3(PIGMENTS[0])} + c.g * ${vec3(PIGMENTS[1])} + c.b * ${vec3(PIGMENTS[2])}));
}
`;

/* ---------- injections ---------- */

export const MAX_SPLATS = 8;

/**
 * Pending injections for one step. Each is a Gaussian blob at (x, y) in the unit square
 * (y up) with a radius in fractions of the height, adding a velocity (cells per second)
 * and an amount of each pigment.
 */
export interface SplatQueue {
  /** x, y, radius, unused */
  readonly points: Float32Array;
  readonly velocity: Float32Array;
  readonly dye: Float32Array;
  count: number;
}
export const createSplatQueue = (): SplatQueue => ({
  points: new Float32Array(MAX_SPLATS * 4),
  velocity: new Float32Array(MAX_SPLATS * 3),
  dye: new Float32Array(MAX_SPLATS * 3),
  count: 0,
});

/** Returns false, leaving the queue untouched, once it is full or the values are unusable. */
export function pushSplat(queue: SplatQueue, x: number, y: number, radius: number, vx: number, vy: number, pigment: number, amount: number): boolean {
  if (queue.count >= MAX_SPLATS) return false;
  if (!Number.isFinite(x + y + radius + vx + vy + amount) || radius <= 0) return false;
  const index = queue.count;
  queue.points[index * 4] = x;
  queue.points[index * 4 + 1] = y;
  queue.points[index * 4 + 2] = radius;
  queue.velocity[index * 3] = vx;
  queue.velocity[index * 3 + 1] = vy;
  for (let channel = 0; channel < 3; channel += 1) queue.dye[index * 3 + channel] = channel === pigment ? amount : 0;
  queue.count += 1;
  return true;
}

/** Deterministic PRNG (mulberry32): the forcing depends only on its seed and the step count. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Where ink is released: right of centre on landscape screens, the upper half on portrait
 * ones — over the meadow and away from the copy. Returns [centreX, centreY, reachX, reachY].
 */
export function stage(aspect: number): [number, number, number, number] {
  const t = Math.min(1, Math.max(0, (aspect - 0.9) / 0.35));
  return [0.5 + 0.14 * t, 0.66 - 0.14 * t, 0.34 - 0.04 * t, 0.26 + 0.1 * t];
}

/**
 * The forcing, counted in simulation steps so that pausing the solver pauses it too.
 *  - Three nozzles, one per pigment, drift on slow closed paths and release ink in pulses
 *    along a slowly turning direction.
 *  - Now and then a short, hard jet fires somewhere on the stage. A jet into still liquid
 *    rolls up into a mushroom: two counter-rotating eddies that fold the colours together.
 * Only the injections are scripted. Where the ink goes afterwards is the solver's doing.
 */
export function createSources(seed: number) {
  const random = createRandom(seed);
  const nozzles = PIGMENTS.map((_, pigment) => ({
    pigment,
    phaseX: random() * 6.283, phaseY: random() * 6.283, phaseTurn: random() * 6.283, phasePulse: random() * 6.283,
    rateX: 0.09 + 0.07 * random(), rateY: 0.07 + 0.07 * random(),
    turn: (0.25 + 0.3 * random()) * (random() < 0.5 ? -1 : 1),
    pulse: 0.45 + 0.35 * random(),
  }));
  let nextJet = Math.round(0.4 * STEPS_PER_SECOND);
  return {
    /** Queue what is due at `step` for a sheet `cells` simulation cells high. */
    advance(step: number, aspect: number, cells: number, queue: SplatQueue) {
      const time = step * STEP_SECONDS;
      const [cx, cy, rx, ry] = stage(aspect);
      for (const nozzle of nozzles) {
        const x = cx + rx * Math.sin(time * nozzle.rateX * 6.283 + nozzle.phaseX);
        const y = cy + ry * Math.sin(time * nozzle.rateY * 6.283 + nozzle.phaseY);
        const flow = Math.max(0, Math.sin(time * nozzle.pulse + nozzle.phasePulse)) ** 2;
        if (flow < 0.02) continue;
        const heading = time * nozzle.turn + nozzle.phaseTurn;
        const speed = 0.085 * cells * flow; // cells per second added per step
        pushSplat(queue, x, y, 0.035, Math.cos(heading) * speed, Math.sin(heading) * speed, nozzle.pigment, 0.11 * flow);
      }
      if (step >= nextJet) {
        const x = cx + rx * (2 * random() - 1);
        const y = cy + ry * (2 * random() - 1);
        // Aim across the stage, so the jet travels through other ink instead of into a wall.
        const heading = Math.atan2(cy - y, (cx - x) * aspect) + (random() - 0.5) * 1.6;
        const speed = (1.5 + 1.3 * random()) * cells;
        pushSplat(queue, x, y, 0.03 + 0.02 * random(), Math.cos(heading) * speed, Math.sin(heading) * speed, Math.floor(random() * PIGMENTS.length), 0.7 + 0.5 * random());
        nextJet = step + Math.round((1.1 + 2.2 * random()) * STEPS_PER_SECOND);
      }
    },
  };
}

/** Pointer injections use fixed radii, which also lets a test tell them from the ambient ones. */
export const POINTER_STROKE_RADIUS = 0.04;
export const POINTER_PRESS_RADIUS = 0.07;
