/**
 * Grass: the rice standing in the trays of tall growing racks, and the air that moves it.
 *
 * Nothing is simulated per blade. Each frame the GPU rebuilds every blade from its instance
 * number (where it is rooted, how tall, how it leans) and from one texture, the wind:
 *
 *   wind ← wind + ease · (gain · u + gust − wind)
 *
 * where u is the flow solver's velocity field (the same one that drives the ripples on the
 * water) and `gust` a slow band of noise travelling across the sheet. The low-pass gives the
 * blades inertia.
 *
 * A blade is a chain of equal segments. Segment j points along
 *
 *   φ(t) = lean + curl · t + bend(wind) · (stiff + (1 − stiff) · t^flex),   t = j / n
 *
 * so the root keeps its place and the tip moves most. Vertical wind slightly varies projected height.
 *
 * This file holds the numbers and the pure versions of those formulas (unit-tested); the
 * shaders in shaders.ts are generated from the same constants.
 */


export type GrassMode = 'bloom' | 'geometry' | 'interference';

/**
 * The racks, in world units. The camera is at the origin, at eye level, looking along +z down an
 * aisle; x is sideways, y is up. A rack is a tall frame standing beside the aisle: its front is
 * the plane x = `front`, its trays reach `depth` further in, and it runs from z = `from` to `to`.
 */
const RACK_FROM = 2.0;
const RACK_BAY = 1.05;
const RACK_BAYS = 8;
/** Detailed foreground ends here; distant bays share a small, fixed blade budget. */
const RACK_DETAIL_TO = RACK_FROM + 6 * RACK_BAY;
export const RACK = {
  /** Distance of the right-hand rack's front from the line of sight. */
  front: 1,
  /** How far a tray reaches into the rack. */
  depth: 0.44,
  /** Height from one tray to the next, and of a tray's front lip; the water stands a little below the lip. */
  tier: 0.27,
  lip: 0.062,
  water: 0.044,
  /** Spacing of the uprights along the aisle, how many bays there are, and the side of an upright's square section. */
  bay: RACK_BAY,
  bays: RACK_BAYS,
  post: 0.034,
  /**
   * The rack's extent along the aisle: it begins at an upright and ends at one, a whole number
   * of bays later. Nothing of the rack — frame, tray, water or crop — lies outside these.
   */
  from: RACK_FROM,
  to: RACK_FROM + RACK_BAYS * RACK_BAY,
  /** The greatest height of its top above the eye (it ends at a whole tier). */
  top: 0.36,
  /** Length of a full-grown blade and width at its root. */
  blade: 0.17,
  bladeWidth: 0.0062,
} as const;

/**
 * The crop grows in modules: one rectangular raft per bay, floating in the tray's water. Between
 * two rafts, and between a raft and the tray's walls, open water shows. A raft has a low border;
 * the crop is rooted inside it.
 */
export const MODULE = {
  /** Open water between two rafts (half of it on each side of an upright's line). */
  gap: 0.12,
  /** Open water between a raft and the tray's front and back walls. */
  inset: 0.032,
  /** Width of a raft's border. */
  border: 0.02,
  /** Bare mat between the border and the nearest root. */
  clear: 0.012,
  /** How high the raft's mat floats above the water. */
  float: 0.006,
} as const;

/** Which bay a distance along the aisle falls in (0-based, limited to the rack), and how far into that bay it is. */
export function bayOf(z: number): { bay: number; local: number } {
  const along = z - RACK.from;
  const bay = Math.min(RACK.bays - 1, Math.max(0, Math.floor(along / RACK.bay)));
  return { bay, local: along - bay * RACK.bay };
}

/** Distance of the nearest root from a bay's ends, and from a tray's walls. */
export const cropMargin = { along: 0.5 * MODULE.gap + MODULE.border + MODULE.clear, across: MODULE.inset + MODULE.border + MODULE.clear } as const;

/**
 * Where a blade given the distance `z` (anywhere in the rack) is actually rooted: squeezed into
 * its bay's raft, keeping its order along the aisle. The blade shader does the same.
 */
export function cropZ(z: number): number {
  const { bay, local } = bayOf(z);
  const share = Math.min(1, Math.max(0, local / RACK.bay));
  return RACK.from + bay * RACK.bay + cropMargin.along + share * (RACK.bay - 2 * cropMargin.along);
}

/** Where a blade given the share `t` (0..1) of the tray's depth is rooted, measured from the tray's front. */
export function cropInto(t: number): number {
  return cropMargin.across + Math.min(1, Math.max(0, t)) * (RACK.depth - 2 * cropMargin.across);
}

/**
 * Distance of a point of the tray (along the aisle, and in from the tray's front) inside its
 * raft's outline: positive on the raft, negative on open water. The render shader draws rafts
 * and water from the same expression.
 */
export function raftDistance(z: number, into: number): number {
  const { local } = bayOf(z);
  return Math.min(Math.min(local, RACK.bay - local) - 0.5 * MODULE.gap, Math.min(into, RACK.depth - into) - MODULE.inset);
}


/** How far the camera may be turned from its resting direction, in radians. */
export const CAMERA = {
  /** Left and right, about the vertical axis. */
  maxYaw: 0.34,
  /** Up and down, about the camera's own horizontal axis. */
  maxPitch: 0.22,
} as const;

/** The camera's turn: `pan` and `tilt` in −1..1 (left/down .. right/up), as the controls give them. */
export interface CameraTurn {
  pan: number;
  tilt: number;
}
export const CAMERA_REST: CameraTurn = { pan: 0, tilt: 0 };

/** Pan and tilt, each limited to −1..1; anything that is not a number is taken as 0. */
export function clampTurn(turn: CameraTurn): CameraTurn {
  const limit = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0);
  return { pan: limit(turn.pan), tilt: limit(turn.tilt) };
}

/** Yaw and pitch in radians for a turn: what the shaders are given. */
export function cameraAngles(turn: CameraTurn): { yaw: number; pitch: number } {
  const { pan, tilt } = clampTurn(turn);
  return { yaw: pan * CAMERA.maxYaw, pitch: tilt * CAMERA.maxPitch };
}

/**
 * World direction of the line of sight through a sheet point, as (x, y) per unit of world z —
 * the same as the shaders' `rayOf`. The camera stays at the origin; it is turned by yaw about
 * the vertical axis, then pitched about its own horizontal axis. Null where the line of sight
 * does not go down the aisle (z ≤ 0), which the limits on the turn keep off the sheet.
 */
export function cameraRay(field: GrassField, aspect: number, u: number, v: number, turn: CameraTurn = CAMERA_REST): [number, number] | null {
  const { yaw, pitch } = cameraAngles(turn);
  const cx = ((u - field.vanish) * aspect) / field.focal;
  const cy = (v - field.eye) / field.focal;
  // Pitch, in the camera's frame, then yaw, in the world's.
  const py = cy * Math.cos(pitch) + Math.sin(pitch);
  const pz = Math.cos(pitch) - cy * Math.sin(pitch);
  const x = cx * Math.cos(yaw) + pz * Math.sin(yaw);
  const z = pz * Math.cos(yaw) - cx * Math.sin(yaw);
  return z > 1e-6 ? [x / z, py / z] : null;
}

/**
 * Where a world point appears on the sheet, and how far in front of the camera it is — the
 * shaders' `toCamera` and `project`. Null for a point behind the camera.
 */
export function cameraProject(field: GrassField, aspect: number, world: readonly [number, number, number], turn: CameraTurn = CAMERA_REST): { u: number; v: number; depth: number } | null {
  const { yaw, pitch } = cameraAngles(turn);
  const [x, y, z] = world;
  // The inverse of the two turns, in the opposite order.
  const ax = x * Math.cos(yaw) - z * Math.sin(yaw);
  const az = x * Math.sin(yaw) + z * Math.cos(yaw);
  const cy = y * Math.cos(pitch) - az * Math.sin(pitch);
  const depth = y * Math.sin(pitch) + az * Math.cos(pitch);
  if (!(depth > 1e-6)) return null;
  return { u: field.vanish + (field.focal * ax) / (depth * aspect), v: field.eye + (field.focal * cy) / depth, depth };
}

export const GRASS = {
  /** Share of the difference to the target the wind closes per step: a time constant of about 0.3 s. */
  windEase: 0.055,
  /** Largest lean the wind can cause, in radians, and how quickly it is reached (per sheet height per second). */
  maxBend: 1.25,
  bendRate: 1.9,
  /** Share of the bend already present at the root's first segment, and the exponent that hands the rest to the tip. */
  rootShare: 0.12,
  flex: 1.6,
  /** Blade width falls as 1 − t^taper: nearly parallel sides, then a point. */
  taper: 2.4,
} as const;

/** What the three states change: how the blades stand, and how they are lit. */
export interface GrassStyle {
  /** Blade length multiplier. */
  height: number;
  /** Response to wind, 1 = as tuned. */
  sway: number;
  /** Natural droop of the tip, radians at t = 1. */
  curl: number;
  /** Spread of the resting lean, radians. */
  lean: number;
  /** Warmth of the lit tips, 0 cool .. 1 golden. */
  warmth: number;
  /** Brightness of the band that travels with a gust. */
  sheen: number;
  /** Strength of the travelling gusts relative to the ink's own flow. */
  gust: number;
}
export const GRASS_STYLES: Record<GrassMode, GrassStyle> = {
  bloom: { height: 1.12, sway: 1.0, curl: 0.75, lean: 0.34, warmth: 0.75, sheen: 0.55, gust: 0.8 },
  geometry: { height: 0.82, sway: 0.6, curl: 0.3, lean: 0.14, warmth: 0.15, sheen: 0.35, gust: 0.6 },
  interference: { height: 1.0, sway: 1.25, curl: 0.55, lean: 0.26, warmth: 0.4, sheen: 1.0, gust: 1.35 },
};

/** Intensity 0..1 → how much sunlight there is: on the blade tips and on the water's surface. Shows at once, also while paused. */
export function sunlight(intensity: number): number {
  const t = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 0));
  return 0.55 + 0.7 * t;
}

/** Intensity 0..1 → how hard the ink's flow pushes the grass, and how fast gusts cross the sheet. */
export function windDrive(intensity: number): { gain: number; pace: number } {
  const t = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 0));
  return { gain: 0.45 + 1.15 * t, pace: 0.35 + 0.95 * t };
}

/** Lean caused by a wind component `speed` (sheet heights per second): odd, monotone, bounded by maxBend. */
export function windBend(speed: number, sway = 1): number {
  return GRASS.maxBend * Math.tanh(GRASS.bendRate * sway * speed);
}

/** Direction of the blade at `t` (0 root .. 1 tip), in radians from vertical. */
export function bladeAngle(t: number, lean: number, curl: number, bend: number): number {
  return lean + curl * t + bend * (GRASS.rootShare + (1 - GRASS.rootShare) * t ** GRASS.flex);
}

/** Half-width profile, 1 at the root and 0 at the tip. */
export function bladeWidth(t: number): number {
  return 1 - Math.min(1, Math.max(0, t)) ** GRASS.taper;
}

/**
 * The blade's centre line as `segments + 1` points, in blade lengths from the root: [x0, y0, x1, y1, …].
 * The vertex shader runs the same sum up to its own segment.
 */
export function bladeSpine(segments: number, lean: number, curl: number, bend: number): number[] {
  const points = [0, 0];
  let x = 0;
  let y = 0;
  for (let index = 0; index < segments; index += 1) {
    const angle = bladeAngle((index + 0.5) / segments, lean, curl, bend);
    x += Math.sin(angle) / segments;
    y += Math.cos(angle) / segments;
    points.push(x, y);
  }
  return points;
}

/** How the racks are seen, as a pure function of the viewport (sheet coordinates: uv, y up). */
export interface GrassField {
  /** Sheet position of the vanishing point: where the aisle recedes to, at eye level. */
  vanish: number;
  eye: number;
  /** Focal length, in sheet heights: larger is a closer, flatter view. */
  focal: number;
  /** Height of the lowest tray relative to the eye (negative: below it). Nothing is drawn under it. */
  bottom: number;
  /** Distance of the second rack, across the aisle on the left; 0 when there is none. */
  left: number;
}

const LANDSCAPE_FIELD: GrassField = { vanish: 0.14, eye: 0.52, focal: 0.95, bottom: -1.28, left: 2.6 };
const SHORT_PORTRAIT_FIELD: GrassField = { vanish: -0.25, eye: 0.71, focal: 0.8, bottom: -0.2, left: 0 };
const PORTRAIT_FIELD: GrassField = { vanish: -0.25, eye: 0.7, focal: 0.8, bottom: -0.45, left: 0 };

/**
 * Landscape: the aisle recedes to a point left of centre; the right-hand rack fills the right
 * of the hero and a second one stands far off on the left. Portrait: one rack, cropped to the
 * upper art band; its lowest tray ends above the title. Ratios in between blend continuously.
 */
export function grassField(width: number, height: number): GrassField {
  const h = Math.max(1, height);
  const smooth = (edge0: number, edge1: number, value: number) => {
    const s = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return s * s * (3 - 2 * s);
  };
  const t = smooth(0.9, 1.25, Math.max(1, width) / h);
  const room = smooth(600, 740, h);
  const mix = (key: keyof GrassField) => {
    const portrait = SHORT_PORTRAIT_FIELD[key] + (PORTRAIT_FIELD[key] - SHORT_PORTRAIT_FIELD[key]) * room;
    return portrait + (LANDSCAPE_FIELD[key] - portrait) * t;
  };
  // The second rack is either there or not: it does not slide in from the line of sight.
  return { vanish: mix('vanish'), eye: mix('eye'), focal: mix('focal'), bottom: mix('bottom'), left: t > 0.5 ? LANDSCAPE_FIELD.left : 0 };
}

const f = (value: number) => value.toFixed(4);

/**
 * The camera and the racks' measures, shared by the structure and the blades, so that both are
 * projected the same way: a world point (x, y, z) appears at
 *
 *   sheet x = vanish + focal · x / (z · aspect),   sheet y = eye + focal · y / z
 *
 * and the ray through a sheet point is (rayOf(uv), 1) · z.
 */
export const FIELD_GLSL = `
uniform vec4 uField;  // vanishing point x, eye y, focal length, lowest tray's height
uniform vec2 uSide;   // aspect, distance of the left rack (0: none)
uniform vec2 uTurn;   // camera yaw, pitch (radians)
uniform float uRow;  // neighboring rack pair, from the central aisle outward
uniform vec2 uPhase;  // this visit's variation
const float FRONT = ${f(RACK.front)};
const float ROW_PITCH = 1.25;
float rightSide() { return FRONT + uRow * ROW_PITCH; }
float leftSide() { return uSide.y > 0.0 ? uSide.y + uRow * ROW_PITCH : 0.0; }
const float DEPTH = ${f(RACK.depth)};
const float TIER = ${f(RACK.tier)};
const float LIP = ${f(RACK.lip)};
const float WATER = ${f(RACK.water)};
const float BAY = ${f(RACK.bay)};
const float POST = ${f(RACK.post)};
const float BAYS = ${f(RACK.bays)};
const float FROM = ${f(RACK.from)};
const float TO = ${f(RACK.to)};
const float TOP = ${f(RACK.top)};
const float GAP = ${f(MODULE.gap)};       // open water between two rafts
const float INSET = ${f(MODULE.inset)};     // open water between a raft and the tray's walls
const float BORDER = ${f(MODULE.border)};    // a raft's border
const float CROP_ALONG = ${f(MODULE.gap * 0.5 + MODULE.border + MODULE.clear)};  // nearest root to a bay's end
const float CROP_ACROSS = ${f(MODULE.inset + MODULE.border + MODULE.clear)}; // nearest root to a tray's wall
const vec3 AIR = vec3(0.955, 0.968, 0.962);
float fieldHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fieldNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fieldHash(i), fieldHash(i + vec2(1, 0)), f.x), mix(fieldHash(i + vec2(0, 1)), fieldHash(i + vec2(1, 1)), f.x), f.y);
}
/**
 * Slope of the ray through a sheet point: world (x, y) per unit of world z. The camera is at the
 * origin and may be turned: pitched about its own horizontal axis, then yawed about the vertical.
 * Every surface and every blade goes through this pair of functions, so they turn together.
 */
vec2 rayOf(vec2 uv) {
  vec2 c = vec2((uv.x - uField.x) * uSide.x, uv.y - uField.y) / uField.z;
  float sy = sin(uTurn.x), cy = cos(uTurn.x), sp = sin(uTurn.y), cp = cos(uTurn.y);
  float py = c.y * cp + sp, pz = cp - c.y * sp;
  float z = pz * cy - c.x * sy;
  return vec2(c.x * cy + pz * sy, py) / max(z, 1e-4);
}
/** A world point in the camera's frame: x right, y up, z ahead. */
vec3 toCamera(vec3 w) {
  float sy = sin(uTurn.x), cy = cos(uTurn.x), sp = sin(uTurn.y), cp = cos(uTurn.y);
  float ax = w.x * cy - w.z * sy, az = w.x * sy + w.z * cy;
  return vec3(ax, w.y * cp - az * sp, w.y * sp + az * cp);
}
/** Where a world point appears on the sheet. */
vec2 project(vec3 w) {
  vec3 c = toCamera(w);
  return vec2(uField.x + uField.z * c.x / (c.z * uSide.x), uField.y + uField.z * c.y / c.z);
}
/** Number of trays in a rack, and the height of the frame's top: one tier above the highest tray. */
float tiersOf() { return floor((TOP - uField.w) / TIER + 0.01); }
float roofOf() { return uField.w + tiersOf() * TIER; }
/** How much of the hall's bright air lies between the camera and something z away. */
float haze(float z) {
  // A little aerial perspective separates neighboring rows without erasing their ends.
  return 0.48 * smoothstep(2.0, 18.0, z) + 0.07 * uRow;
}
`;

/** One blade per instance, one strip vertex per call: no buffers. */
export const GRASS_VERTEX = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uWind;
uniform vec4 uShape;  // height, sway, curl, lean
uniform vec4 uLight;  // warmth, sheen, clock (s), drawing-buffer height (px)
uniform vec4 uCount;  // blades, segments, unused, sunlight
${FIELD_GLSL}
out vec3 vColor;
out vec3 vEdge; // across the blade (−1..1), along it (0..1), opacity
out vec4 vBehind; // this point's distance from the line of sight and height; the tray bottom that can hide it, and its rack's front
out float vAlong; // this point's distance along the aisle
uint pcg(uint v) {
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float rnd(uint n) { return float(pcg(n)) * (1.0 / 4294967295.0); }
float angleAt(float t, float lean, float curl, float bend) {
  return lean + curl * t + bend * (${f(GRASS.rootShare)} + ${f(1 - GRASS.rootShare)} * pow(t, ${f(GRASS.flex)}));
}
void main() {
  uint id = uint(gl_InstanceID) * 8u;
  float r0 = rnd(id), r1 = rnd(id + 1u), r2 = rnd(id + 2u), r3 = rnd(id + 3u), r4 = rnd(id + 4u), r5 = rnd(id + 5u);
  float aspect = uSide.x;

  // Instances are ordered far to near along the aisle, so later blades are drawn over earlier
  // ones. Reserve most blades for the original foreground; extending the aisle must not
  // spread the same budget uniformly across all bays.
  float d = (float(gl_InstanceID) + 0.5) / uCount.x;
  float spread = d < 0.12
    ? TO * pow(${f(RACK_DETAIL_TO)} / TO, d / 0.12)
    : ${f(RACK_DETAIL_TO)} * pow(${f(RACK.from / RACK_DETAIL_TO)}, (d - 0.12) / 0.88);
  // Each bay holds one raft: the blade is squeezed into its bay's raft, keeping its place in the order.
  float bay = min(floor((spread - FROM) / BAY), BAYS - 1.0);
  float z = FROM + bay * BAY + mix(CROP_ALONG, BAY - CROP_ALONG, clamp((spread - FROM) / BAY - bay, 0.0, 1.0));
  // Which rack, which tray, and how far into the tray.
  float isLeft = step(r0, 0.22) * step(0.001, uSide.y);
  float tiers = tiersOf();
  float tierIndex = floor(r1 * tiers);
  float into = mix(CROP_ACROSS, DEPTH - CROP_ACROSS, fract(r1 * tiers));
  vec3 root = vec3(mix(rightSide() + into, -(leftSide() + into), isLeft), uField.w + tierIndex * TIER + WATER + ${f(MODULE.float)}, z);
  vec3 seen = toCamera(root);
  float ahead = max(seen.z, 1e-3);
  float x = uField.x + uField.z * seen.x / (ahead * uSide.x);
  float rootY = uField.y + uField.z * seen.y / ahead;
  float size = uField.z / ahead; // sheet heights per world unit, at this distance from the camera
  float depth = 1.0 - smoothstep(1.0, 8.0, z); // 1 near .. 0 far
  // Blades outside the picture are not drawn.
  float stands = step(0.05, seen.z) * step(-0.25, x) * step(x, 1.25) * step(-0.2, rootY) * step(rootY, 1.2);
  // Tufts: neighbouring blades share a height, with stragglers; nothing stands in a row.
  vec2 ground = vec2(z * 9.0, into * 22.0 + tierIndex * 7.3 + isLeft * 31.0) + uPhase;
  float tuft = fieldNoise(ground);
  float tall = 0.5 + 0.5 * tuft + 0.45 * r5 * r5;
  float len = ${f(RACK.blade)} * uShape.x * size * tall;
  float width = ${f(RACK.bladeWidth)} * size * (0.65 + 0.7 * r2);

  // The wind where the blade stands (sampled at mid-height: that is the air it is in).
  vec2 at = clamp(vec2(x, rootY + 0.5 * len), 0.0, 1.0);
  vec2 wind = textureLod(uWind, at, 0.0).xy;
  float flutter = sin(uLight.z * (5.0 + 4.0 * r3) + r4 * 6.283) * (0.025 + 0.11 * min(1.0, length(wind)));
  float bend = ${f(GRASS.maxBend)} * tanh(${f(GRASS.bendRate)} * uShape.y * wind.x) + flutter;
  float side0 = r3 < 0.5 ? -1.0 : 1.0;
  float lean = uShape.w * (r4 * 2.0 - 1.0);
  // Flow away from the viewer stands the blade up, flow toward the viewer lays it over.
  float curl = side0 * uShape.z * (0.35 + 0.65 * r5) * (1.0 - 0.6 * tanh(1.6 * wind.y));
  len *= 1.0 + 0.12 * tanh(1.6 * wind.y);
  // No blade is longer than the room under the next tray, however tall it grew or the air stretches it.
  len = min(len, (TIER - WATER - 0.03) * size);

  // Walk the chain up to this vertex's segment.
  int segment = gl_VertexID >> 1;
  float side = float(gl_VertexID & 1) * 2.0 - 1.0;
  float segments = uCount.y;
  vec2 spine = vec2(0.0);
  for (int j = 0; j < 8; j++) {
    if (j >= segment) break;
    float a = angleAt((float(j) + 0.5) / segments, lean, curl, bend);
    spine += vec2(sin(a), cos(a)) / segments;
  }
  float t = float(segment) / segments;
  float heading = angleAt(t, lean, curl, bend);
  vec2 normal = vec2(cos(heading), -sin(heading));
  float profile = 1.0 - pow(t, ${f(GRASS.taper)});
  // Never thinner than a pixel and a bit: thin blades fade instead of flickering.
  float pixels = width * profile * uLight.w;
  float least = 1.3 * profile + 0.35;
  float opacity = clamp(pixels / least, 0.0, 1.0);
  float half_ = 0.5 * max(pixels, least) / uLight.w;
  vec2 offset = spine * len + normal * side * half_;
  // The blade is a strip in the world, standing in the plane across the aisle at its root. Each
  // vertex is a world point, projected by the same camera as everything else, so the blade turns
  // and foreshortens with it; the same point is what a tray can hide.
  vec3 point = root + vec3(offset / size, 0.0);
  vec3 pointSeen = toCamera(point);
  float pointAhead = max(pointSeen.z, 1e-3);
  vec2 uv = vec2(uField.x + uField.z * pointSeen.x / (pointAhead * aspect), uField.y + uField.z * pointSeen.y / pointAhead);
  gl_Position = stands > 0.5 ? vec4(uv * 2.0 - 1.0, 0.0, 1.0) : vec4(2.0, 2.0, 0.0, 1.0);

  // Colour: young rice under daylight. Deep green at the foot, fresh green through the body,
  // and light coming through the tip.
  float warmth = uLight.x;
  vec3 foot = mix(vec3(0.2, 0.36, 0.2), vec3(0.06, 0.2, 0.07), depth);
  vec3 body = mix(vec3(0.42, 0.64, 0.33), vec3(0.24, 0.56, 0.14), depth);
  vec3 tip = mix(vec3(0.74, 0.92, 0.46), vec3(0.95, 0.96, 0.5), warmth);
  // Each blade has its own green.
  body *= 0.86 + 0.3 * r5;
  // How much light comes through: more where the blade is thin and turned to the skylight (upper right).
  float sun = 0.5 + 0.5 * sin(heading + 0.6);
  float glow = smoothstep(0.25, 1.0, t) * (0.5 + 0.5 * sun) * (0.6 + 0.4 * tuft);
  vec3 color = mix(foot, body, smoothstep(0.0, 0.5, t));
  color = mix(color, tip, min(1.0, glow * mix(0.7, 0.95, depth) * uCount.w));
  // Moving air shows as a bright band: blades laid over turn their faces to the roof.
  color += vec3(0.3, 0.34, 0.16) * uLight.y * smoothstep(0.25, 1.1, abs(bend)) * smoothstep(0.15, 0.9, t);
  // Patches of stronger and weaker light along the tray.
  color *= 0.9 + 0.2 * fieldNoise(ground * 0.07 + 3.0);
  // Occlusion: feet stand in their neighbours' shade, most of all nearby.
  color *= mix(1.0, smoothstep(-0.35, 0.6, t), 0.3 + 0.3 * depth);
  // Distance: the hall's bright air takes colour away.
  color = mix(color, AIR, haze(z));
  // What can hide a blade is the bottom of a tray between it and the camera: its own tray's when
  // it stands above the eye (seen from below), the next tray up when it stands below (seen from above).
  float base = uField.w + tierIndex * TIER;
  float shelf = (base > 0.0 ? base : base + TIER) - 0.016;
  vBehind = vec4(abs(point.x), point.y, shelf, mix(rightSide(), leftSide(), isLeft));
  vAlong = point.z;
  vColor = color;
  vEdge = vec3(side, t, opacity);
}
`;

export const GRASS_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
in vec3 vEdge;
in vec4 vBehind;
in float vAlong;
out vec4 outColor;
void main() {
  // Hidden where the line of sight to this point passes through a tray's bottom first: the ray
  // reaches the bottom's height at a share s of the way, and is inside the rack there: past its
  // front, and past its near end (before that there is no tray to pass through).
  float s = vBehind.z / vBehind.y;
  if (s > 0.0 && s < 1.0 && vBehind.x * s > vBehind.w && vAlong * s > ${f(RACK.from)}) discard;
  // Antialiased sides: opacity falls over the last pixel of the blade's width.
  float edge = 1.0 - abs(vEdge.x);
  float alpha = clamp(edge / max(fwidth(vEdge.x), 1e-4), 0.0, 1.0) * vEdge.z;
  // A fold along the midrib: one half catches the light.
  vec3 color = vColor * (1.0 + 0.16 * vEdge.x) * (0.93 + 0.07 * smoothstep(0.0, 0.3, edge));
  outColor = vec4(color, alpha);
}
`;
