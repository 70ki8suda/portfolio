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
export const RACK = {
  /** Distance of the right-hand rack's front from the line of sight. */
  front: 1,
  /** How far a tray reaches into the rack. */
  depth: 0.44,
  /** Height from one tray to the next, and of a tray's front lip; the water stands a little below the lip. */
  tier: 0.27,
  lip: 0.046,
  water: 0.028,
  /** Spacing of the uprights along the aisle, and their width. */
  bay: 1.05,
  post: 0.03,
  /** The rack's extent along the aisle, and the greatest height of its top above the eye (it ends at a whole tier). */
  from: 0.7,
  to: 11,
  top: 0.36,
  /** Length of a full-grown blade and width at its root. */
  blade: 0.17,
  bladeWidth: 0.0062,
} as const;

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

const LANDSCAPE_FIELD: GrassField = { vanish: 0.27, eye: 0.52, focal: 1.2, bottom: -1.28, left: 2.6 };
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
uniform vec4 uGround; // aspect, distance of the left rack (0: none), unused, unused
uniform vec2 uPhase;  // this visit's variation
const float FRONT = ${f(RACK.front)};
const float DEPTH = ${f(RACK.depth)};
const float TIER = ${f(RACK.tier)};
const float LIP = ${f(RACK.lip)};
const float WATER = ${f(RACK.water)};
const float BAY = ${f(RACK.bay)};
const float POST = ${f(RACK.post)};
const float FROM = ${f(RACK.from)};
const float TO = ${f(RACK.to)};
const float TOP = ${f(RACK.top)};
const vec3 AIR = vec3(0.955, 0.968, 0.962);
float fieldHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fieldNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fieldHash(i), fieldHash(i + vec2(1, 0)), f.x), mix(fieldHash(i + vec2(0, 1)), fieldHash(i + vec2(1, 1)), f.x), f.y);
}
/** Slope of the ray through a sheet point: world (x, y) per unit of z. */
vec2 rayOf(vec2 uv) { return vec2((uv.x - uField.x) * uGround.x, uv.y - uField.y) / uField.z; }
/** Where a world point appears on the sheet. */
vec2 project(vec3 w) { return vec2(uField.x + uField.z * w.x / (w.z * uGround.x), uField.y + uField.z * w.y / w.z); }
/** Number of trays in a rack, and the height of the frame's top: one tier above the highest tray. */
float tiersOf() { return floor((TOP - uField.w) / TIER + 0.01); }
float roofOf() { return uField.w + tiersOf() * TIER; }
/** How much of the hall's bright air lies between the camera and something z away. */
float haze(float z) { return 0.72 * smoothstep(1.6, TO, z); }
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
  float aspect = uGround.x;

  // Instances are ordered far to near along the aisle, so later blades are drawn over earlier
  // ones. Distances are spaced evenly in log z: near trays, being large on the sheet, get their share.
  float d = (float(gl_InstanceID) + 0.5) / uCount.x;
  float z = ${f(RACK.to * 0.86)} * pow(${f(RACK.from / (RACK.to * 0.86))}, d);
  // Which rack, which tray, and how far into the tray.
  float isLeft = step(r0, 0.22) * step(0.001, uGround.y);
  float tiers = tiersOf();
  float tierIndex = floor(r1 * tiers);
  float into = mix(0.07, 0.93, fract(r1 * tiers)) * DEPTH;
  vec3 root = vec3(mix(FRONT + into, -(uGround.y + into), isLeft), uField.w + tierIndex * TIER + WATER, z);
  vec2 onSheet = project(root);
  float x = onSheet.x;
  float rootY = onSheet.y;
  float size = uField.z / z; // sheet heights per world unit, at this distance
  float depth = 1.0 - smoothstep(1.0, 8.0, z); // 1 near .. 0 far
  // Blades outside the picture are not drawn.
  float stands = step(-0.25, x) * step(x, 1.25) * step(-0.2, rootY) * step(rootY, 1.2);
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
  vec2 uv = vec2(x + offset.x / aspect, rootY + offset.y);
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
  vBehind = vec4(abs(root.x + offset.x / size), root.y + offset.y / size, shelf, mix(FRONT, uGround.y, isLeft));
  vColor = color;
  vEdge = vec3(side, t, opacity);
}
`;

export const GRASS_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
in vec3 vEdge;
in vec4 vBehind;
out vec4 outColor;
void main() {
  // Hidden where the line of sight to this point passes through a tray's bottom first: the ray
  // reaches the bottom's height at a share s of the way, and is inside the rack there.
  float s = vBehind.z / vBehind.y;
  if (s > 0.0 && s < 1.0 && vBehind.x * s > vBehind.w) discard;
  // Antialiased sides: opacity falls over the last pixel of the blade's width.
  float edge = 1.0 - abs(vEdge.x);
  float alpha = clamp(edge / max(fwidth(vEdge.x), 1e-4), 0.0, 1.0) * vEdge.z;
  // A fold along the midrib: one half catches the light.
  vec3 color = vColor * (1.0 + 0.16 * vEdge.x) * (0.93 + 0.07 * smoothstep(0.0, 0.3, edge));
  outColor = vec4(color, alpha);
}
`;
