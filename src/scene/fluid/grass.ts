/**
 * Grass: the islands of a wetland, standing in the flowing water, and the wind that moves them.
 *
 * Nothing is simulated per blade. Each frame the GPU rebuilds every blade from its instance
 * number (where it is rooted, how tall, how it leans) and from one texture, the wind:
 *
 *   wind ← wind + ease · (gain · u + gust − wind)
 *
 * where u is the ink's own velocity field and `gust` a slow band of noise travelling across
 * the sheet. The low-pass gives the blades inertia; the ink term makes them lean the way the
 * ink beside them is visibly moving.
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

import { INK_COLOR_GLSL, PAPER } from './ink';

export type GrassMode = 'bloom' | 'geometry' | 'interference';

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
  /** Length of a full-size blade and width at its root, in sheet heights. */
  length: 0.115,
  width: 0.0042,
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

/** Where the wetland lies on the sheet (uv, y up), as a pure function of the viewport. */
export interface GrassField {
  /** Grass begins at x = left and is at full cover by left + soft; the water reaches a little further left. */
  left: number;
  soft: number;
  /** Lower and upper ends of the wetland; it thins out to paper beyond them. */
  near: number;
  far: number;
  /** Height of the vanishing line: the ground is seen at a slant, so everything shrinks toward it. */
  horizon: number;
  /** Blade and island size multiplier. */
  scale: number;
  /** Left edge of where blades are rooted: none are spent on the title's column. */
  edge: number;
}

const LANDSCAPE_FIELD: GrassField = { left: 0.4, soft: 0.2, near: -0.1, far: 1.03, horizon: 1.42, scale: 1, edge: 0.34 };
const SHORT_PORTRAIT_FIELD: GrassField = { left: -0.6, soft: 0.2, near: 0.69, far: 0.94, horizon: 1.07, scale: 0.46, edge: -0.05 };
const PORTRAIT_FIELD: GrassField = { left: -0.6, soft: 0.2, near: 0.47, far: 0.94, horizon: 1.12, scale: 0.6, edge: -0.05 };

/**
 * Landscape: the wetland fills the hero right of the title's column, from the lower edge to the
 * top. Portrait: a band of it across the art area, above the title; shorter on short phones,
 * where the title starts higher. Ratios in between blend continuously.
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
  return { left: mix('left'), soft: mix('soft'), near: mix('near'), far: mix('far'), horizon: mix('horizon'), scale: mix('scale'), edge: mix('edge') };
}

const f = (value: number) => value.toFixed(4);

/**
 * The lie of the land, shared by the water, the ground under the grass and the blades, so that
 * all three agree on where an island ends. The ground is a plane seen at a slant: `nearness`
 * is 1 at the near edge and falls toward the horizon, and the island pattern is laid out in
 * ground coordinates, so islands and the channels between them shrink and flatten with distance.
 */
export const FIELD_GLSL = `
uniform vec4 uField;  // grass from x, softness of that edge, near edge y, far edge y
uniform vec4 uGround; // horizon y, size scale, aspect, unused
uniform vec2 uPhase;  // this visit's terrain
float fieldHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fieldNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fieldHash(i), fieldHash(i + vec2(1, 0)), f.x), mix(fieldHash(i + vec2(0, 1)), fieldHash(i + vec2(1, 1)), f.x), f.y);
}
/** 1 at the near edge, smaller toward the horizon: the size of anything standing at uv.y. */
float nearness(float y) {
  return clamp((uGround.x - y) / (uGround.x - max(uField.z, 0.0)), 0.05, 1.6);
}
/** Where the wetland is: 1 inside, falling to 0 toward the title's column and past both ends. \`reach\` widens it. */
float wetland(vec2 uv, float reach) {
  float wobble = fieldNoise(vec2(uv.y * 3.1, 1.7) + uPhase) - 0.5;
  float side = smoothstep(uField.x - reach, uField.x + uField.y, uv.x + 0.1 * wobble);
  float ends = smoothstep(uField.z - 0.05 - 0.4 * reach, uField.z + 0.09, uv.y) * (1.0 - smoothstep(uField.w - 0.1, uField.w + 0.3 * reach, uv.y));
  return side * ends;
}
/** Grass cover, 0 in open water .. 1 well inside an island. */
float cover(vec2 uv) {
  float size = nearness(uv.y);
  // Ground coordinates: sideways distance grows with 1/size, and so does depth, twice as fast as it looks.
  vec2 g = vec2((uv.x - 0.5) * uGround.z, 2.0 * (uGround.x - max(uField.z, 0.0))) / size * (2.6 / uGround.y) + uPhase;
  vec2 warp = vec2(fieldNoise(g * 0.6 + 3.1), fieldNoise(g * 0.6 + 8.7)) - 0.5;
  float land = fieldNoise(g + 1.3 * warp);
  // Channels: water finds the lines where a second, slower field crosses its middle.
  float channel = abs(fieldNoise(g * 0.5 - 1.1 * warp + 17.0) - 0.5);
  return smoothstep(0.42, 0.6, land) * smoothstep(0.025, 0.085, channel) * wetland(uv, 0.0);
}
`;

/** One blade per instance, one strip vertex per call: no buffers. */
export const GRASS_VERTEX = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uWind;
uniform sampler2D uDye;
uniform vec4 uShape;  // height, sway, curl, lean
uniform vec4 uLight;  // warmth, sheen, clock (s), drawing-buffer height (px)
uniform vec4 uCount;  // blades, segments, left edge of the rooted span, sunlight
${FIELD_GLSL}
out vec3 vColor;
out vec3 vEdge; // across the blade (−1..1), along it (0..1), opacity
${INK_COLOR_GLSL}
const vec3 PAPER_COLOR = vec3(${PAPER.map(f).join(', ')});
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
  float aspect = uGround.z;

  // Instances are ordered far to near, so later blades are drawn over earlier ones. Rows are
  // spaced between evenly on the sheet and evenly on the ground: the far ones, being small, are closer together.
  float d = (float(gl_InstanceID) + 0.5) / uCount.x;
  float farY = uField.w, nearY = uField.z - 0.03;
  float reach = uGround.x - max(uField.z, 0.0);
  float onGround = uGround.x - reach / mix(reach / (uGround.x - farY), reach / (uGround.x - nearY), d);
  float y = mix(mix(farY, nearY, d), onGround, 0.5);
  float x = mix(uCount.z, 1.06, r0);
  float depth = clamp((farY - y) / (farY - nearY), 0.0, 1.0); // 0 far .. 1 near
  float size = nearness(y) * uGround.y;

  // The same field the water and the ground are drawn from decides whether a blade stands here.
  // A blade that would land in open water is given one more place to try in its row, so few are wasted.
  float land = cover(vec2(x, y));
  float second = mix(uCount.z, 1.06, r1);
  float other = cover(vec2(second, y));
  if (land < 0.3 && other > land) { x = second; land = other; }
  float stands = step(0.18 + 0.24 * r4, land);
  // Tufts: neighbouring blades share a height, with stragglers; nothing stands in a row.
  vec2 ground = vec2(x * aspect, y * 2.0) * 9.0 / size * uGround.y + uPhase;
  float tuft = fieldNoise(ground);
  float tall = (0.45 + 0.55 * tuft + 0.5 * r5 * r5) * (0.42 + 0.58 * smoothstep(0.15, 0.75, land));
  float len = ${f(GRASS.length)} * uShape.x * size * tall;
  float width = ${f(GRASS.width)} * size * (0.65 + 0.7 * r2);
  // Islands are low mounds: their middles stand a little higher than their banks.
  float rootY = y + 0.02 * size * smoothstep(0.2, 1.0, land);

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

  // Colour: jade throughout. Dark and cool at the wet foot, green through the body, and pale
  // warm sunlight coming through the tip.
  float warmth = uLight.x;
  vec3 foot = mix(vec3(0.11, 0.27, 0.23), vec3(0.03, 0.12, 0.1), depth);
  vec3 body = mix(vec3(0.27, 0.5, 0.38), vec3(0.11, 0.42, 0.21), depth);
  vec3 tip = mix(vec3(0.68, 0.87, 0.56), vec3(0.95, 0.94, 0.52), warmth);
  // Each blade has its own green; a few have dried to straw.
  body *= 0.82 + 0.36 * r5;
  tip = mix(tip, vec3(0.88, 0.82, 0.5), step(0.94, r2) * 0.6);
  // How much light comes through: more where the blade is thin and turned to the sun (upper right).
  float sun = 0.5 + 0.5 * sin(heading + 0.6);
  float glow = smoothstep(0.3, 1.0, t) * (0.45 + 0.55 * sun) * (0.55 + 0.45 * tuft);
  vec3 color = mix(foot, body, smoothstep(0.0, 0.55, t));
  color = mix(color, tip, min(1.0, glow * mix(0.7, 0.95, depth) * uCount.w));
  // A gust shows as a bright band: blades laid over turn their faces to the sky.
  color += vec3(0.32, 0.36, 0.2) * uLight.y * smoothstep(0.25, 1.1, abs(bend)) * smoothstep(0.15, 0.9, t);
  // Light and shade drifting over the islands.
  color *= 0.78 + 0.4 * fieldNoise(ground * 0.07 + 3.0);
  // Occlusion: feet stand in their neighbours' shade, most of all nearby.
  color *= mix(1.0, smoothstep(-0.3, 0.6, t), 0.4 + 0.3 * depth);
  // The bank: blades at the water's edge are wetter and darker than those on the mound.
  color *= mix(vec3(0.7, 0.82, 0.82), vec3(1.0), smoothstep(0.1, 0.75, land));
  // Distance: far islands are paler and take the colour of the water's haze.
  color = mix(color, vec3(0.80, 0.88, 0.83), 0.55 * pow(1.0 - depth, 1.5));
  // The water's pigment stains the light that reaches the grass beside it.
  vec3 ink = inkColor(textureLod(uDye, at, 0.0).rgb) / PAPER_COLOR;
  color *= mix(vec3(1.0), ink, 0.3);
  vColor = color;
  vEdge = vec3(side, t, opacity * (0.7 + 0.3 * smoothstep(0.18, 0.5, land)));
}
`;

export const GRASS_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColor;
in vec3 vEdge;
out vec4 outColor;
void main() {
  // Antialiased sides: opacity falls over the last pixel of the blade's width.
  float edge = 1.0 - abs(vEdge.x);
  float alpha = clamp(edge / max(fwidth(vEdge.x), 1e-4), 0.0, 1.0) * vEdge.z;
  // A fold along the midrib: one half catches the light.
  vec3 color = vColor * (1.0 + 0.16 * vEdge.x) * (0.93 + 0.07 * smoothstep(0.0, 0.3, edge));
  outColor = vec4(color, alpha);
}
`;
