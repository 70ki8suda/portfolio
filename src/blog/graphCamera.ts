import type { GraphLayout, Point } from './graphLayout';

/** `x`/`y` is the world point at the centre of the viewport; `k` is zoom relative to the fitted overview. */
export interface Camera { x: number; y: number; k: number }
export interface Viewport { width: number; height: number }
export type Level = 'article' | 'paragraph' | 'concept';

export const MIN_ZOOM = 0.7;
export const MAX_ZOOM = 12;
/** Same thresholds as `semanticLevel` in graphLayout. */
export const PARAGRAPH_ZOOM = 1.65;
export const CONCEPT_ZOOM = 3.1;
const HYSTERESIS = 0.12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Screen pixels per world unit when the whole layout is visible. */
export function fitScale(bounds: GraphLayout['bounds'], viewport: Viewport, padding = 28) {
  const width = Math.max(1, viewport.width - padding * 2);
  const height = Math.max(1, viewport.height - padding * 2);
  return Math.max(0.0001, Math.min(width / bounds.width, height / bounds.height));
}

export const overviewCamera = (bounds: GraphLayout['bounds']): Camera =>
  ({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, k: 1 });

export function toScreen(camera: Camera, fit: number, viewport: Viewport, point: Point): Point {
  const scale = fit * camera.k;
  return { x: (point.x - camera.x) * scale + viewport.width / 2, y: (point.y - camera.y) * scale + viewport.height / 2 };
}

export function toWorld(camera: Camera, fit: number, viewport: Viewport, point: Point): Point {
  const scale = fit * camera.k;
  return { x: (point.x - viewport.width / 2) / scale + camera.x, y: (point.y - viewport.height / 2) / scale + camera.y };
}

/** Keeps the centre inside the layout so the map can never be lost off screen. */
export function clampCamera(camera: Camera, bounds: GraphLayout['bounds']): Camera {
  return {
    x: clamp(camera.x, bounds.x, bounds.x + bounds.width),
    y: clamp(camera.y, bounds.y, bounds.y + bounds.height),
    k: clamp(camera.k, MIN_ZOOM, MAX_ZOOM),
  };
}

/** Zooms by `factor` while the world point under `anchor` (screen px) stays under it. */
export function zoomAt(camera: Camera, fit: number, viewport: Viewport, anchor: Point, factor: number): Camera {
  const k = clamp(camera.k * factor, MIN_ZOOM, MAX_ZOOM);
  const world = toWorld(camera, fit, viewport, anchor);
  const scale = fit * k;
  return { x: world.x - (anchor.x - viewport.width / 2) / scale, y: world.y - (anchor.y - viewport.height / 2) / scale, k };
}

/** Moves the content by a screen-pixel delta (dragging right moves the map right). */
export function panBy(camera: Camera, fit: number, dx: number, dy: number): Camera {
  const scale = fit * camera.k;
  return { ...camera, x: camera.x - dx / scale, y: camera.y - dy / scale };
}

/** Level for a zoom, sticky near the thresholds so a resting finger cannot make layers flicker. */
export function nextLevel(previous: Level, k: number): Level {
  return k >= (previous === 'article' ? PARAGRAPH_ZOOM : PARAGRAPH_ZOOM - HYSTERESIS) ? 'paragraph' : 'article';
}

/** Wheel delta → zoom factor, capped per event so a coarse mouse wheel cannot jump a whole level. */
export function wheelFactor(deltaY: number, pinch: boolean) {
  const delta = clamp(deltaY * (pinch ? 3 : 1), -60, 60);
  return Math.exp(-delta * 0.0022);
}

export function isCamera(value: unknown): value is Camera {
  if (typeof value !== 'object' || value === null) return false;
  const { x, y, k } = value as Record<string, unknown>;
  return [x, y, k].every(n => typeof n === 'number' && Number.isFinite(n)) && (k as number) >= MIN_ZOOM && (k as number) <= MAX_ZOOM;
}
