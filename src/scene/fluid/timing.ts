/** Scheduling and budgets for the fluid backdrop. Pure, so the lifecycle rules are unit-testable. */
import { STEP_SECONDS } from './ink';

export { STEP_SECONDS };

/* ---------- activity ---------- */

export type Activity = 'running' | 'paused' | 'offscreen' | 'hidden' | 'static' | 'unavailable';

export interface ActivityInputs {
  /** WebGL is missing, failed, or its context is currently lost. */
  available: boolean;
  reducedMotion: boolean;
  paused: boolean;
  documentVisible: boolean;
  inView: boolean;
}

/** Only `running` owns an animation frame and pointer listeners. */
export function resolveActivity(inputs: ActivityInputs): Activity {
  if (!inputs.available) return 'unavailable';
  if (inputs.reducedMotion) return 'static';
  if (inputs.paused) return 'paused';
  if (!inputs.documentVisible) return 'hidden';
  if (!inputs.inView) return 'offscreen';
  return 'running';
}

/* ---------- fixed time step ---------- */

/** Catch-up limit per frame. Below 30 fps the ink slows down instead of the step growing. */
export const MAX_STEPS_PER_FRAME = 2;

/**
 * Converts irregular frame times into whole simulation steps. The step never changes
 * size, so the solver's stability does not depend on the frame rate.
 */
export function createStepClock(stepSeconds = STEP_SECONDS, maxSteps = MAX_STEPS_PER_FRAME) {
  let accumulated = 0;
  return {
    /** Whole steps owed after `elapsedSeconds` more of running time. */
    advance(elapsedSeconds: number): number {
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
      accumulated += elapsedSeconds;
      let steps = Math.floor(accumulated / stepSeconds + 1e-9);
      if (steps > maxSteps) {
        // Drop the backlog: a stalled tab must not be repaid with a burst of work.
        steps = maxSteps;
        accumulated = 0;
      } else {
        accumulated = Math.max(0, accumulated - steps * stepSeconds);
      }
      return steps;
    },
    reset() { accumulated = 0; },
  };
}

/* ---------- resolution ---------- */

export const MAX_DPR = 1.5;
export const COMPACT_WIDTH = 680;
export const QUALITY_SCALES = [1, 0.75, 0.55] as const;
/** Share of the blade budget drawn at each quality level: geometry is what a weak GPU pays most for. */
export const BLADE_SCALES = [1, 0.55, 0.28] as const;

export interface ResolutionPlan {
  canvasWidth: number;
  canvasHeight: number;
  /** Velocity and pressure grid. */
  simWidth: number;
  simHeight: number;
  /** Pigment grid: finer than the flow, because the wisps are what the eye reads. */
  dyeWidth: number;
  dyeHeight: number;
  /** Jacobi sweeps of the pressure solve per step. */
  pressureIterations: number;
  /** Grass: instances drawn, and segments per blade. Fewer at lower quality levels. */
  blades: number;
  bladeSegments: number;
}

const BUDGET = {
  regular: { pixels: 1_300_000, sim: 144, dye: 640, pressureIterations: 18, blades: 36_000, bladeSegments: 6 },
  compact: { pixels: 750_000, sim: 96, dye: 448, pressureIterations: 12, blades: 16_000, bladeSegments: 4 },
};

/**
 * Drawing-buffer, flow-grid and pigment-grid sizes and the grass budget for a CSS box.
 * The grids keep square cells and depend only on the box's shape, never on dpr or quality.
 */
export function planResolution(cssWidth: number, cssHeight: number, devicePixelRatio: number, quality = 0): ResolutionPlan | null {
  if (!(cssWidth >= 1) || !(cssHeight >= 1)) return null;
  const budget = cssWidth <= COMPACT_WIDTH ? BUDGET.compact : BUDGET.regular;
  const dpr = Math.min(MAX_DPR, Math.max(1, Number.isFinite(devicePixelRatio) ? devicePixelRatio : 1));
  const fit = Math.min(1, Math.sqrt(budget.pixels / (cssWidth * cssHeight * dpr * dpr)));
  const level = Math.min(QUALITY_SCALES.length - 1, Math.max(0, quality));
  const scale = dpr * fit * QUALITY_SCALES[level];
  const long = Math.max(cssWidth, cssHeight);
  const side = (css: number, target: number, step: number) => Math.max(step * 2, Math.round((css / long) * target / step) * step);
  return {
    canvasWidth: Math.max(1, Math.round(cssWidth * scale)),
    canvasHeight: Math.max(1, Math.round(cssHeight * scale)),
    // Multiples of 8 so a few pixels of layout change do not reallocate the simulation.
    simWidth: side(cssWidth, budget.sim, 8),
    simHeight: side(cssHeight, budget.sim, 8),
    dyeWidth: side(cssWidth, budget.dye, 16),
    dyeHeight: side(cssHeight, budget.dye, 16),
    pressureIterations: budget.pressureIterations,
    blades: Math.round(budget.blades * BLADE_SCALES[level]),
    bladeSegments: budget.bladeSegments,
  };
}

/* ---------- quality governor ---------- */

const SLOW_FRAME_MS = 30;
const SETTLE_FRAMES = 90;
/** A device this slow is not made to wait ninety frames: a short run of such frames is enough. */
const CRAWL_FRAME_MS = 150;
const CRAWL_FRAMES = 6;

/**
 * Steps the drawing-buffer scale and the blade count down, never up, when frames stay slow. It
 * reacts to a smoothed frame time after a settling period, so one hitch or a busy load does not
 * count; an unbroken run of very slow frames is acted on at once.
 */
export function createQualityGovernor(levels: number = QUALITY_SCALES.length) {
  let level = 0;
  let smoothed = 0;
  let frames = 0;
  let crawling = 0;
  return {
    get level() { return level; },
    /** Feed one frame interval; returns the level to render at. */
    sample(frameMs: number): number {
      if (!Number.isFinite(frameMs) || frameMs <= 0) return level;
      const clamped = Math.min(frameMs, 100);
      smoothed = frames === 0 ? clamped : smoothed + (clamped - smoothed) * 0.05;
      frames += 1;
      crawling = frameMs >= CRAWL_FRAME_MS ? crawling + 1 : 0;
      const slow = (frames >= SETTLE_FRAMES && smoothed > SLOW_FRAME_MS) || crawling >= CRAWL_FRAMES;
      if (slow && level < levels - 1) {
        level += 1;
        frames = 0;
        crawling = 0;
      }
      return level;
    },
    /** Forget the running average after a pause; the level is kept. */
    resume() { frames = 0; crawling = 0; },
  };
}
