/**
 * Grass: the meadow that stands in front of the ink, and the wind that moves it.
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
  length: 0.135,
  width: 0.0042,
  /** Size of the farthest blades relative to the nearest. */
  farScale: 0.4,
  /** The meadow is three overlapping rises, far to near; shares of the blades given to each. */
  layers: 3,
  layerShare: [0.4, 0.33, 0.27] as const,
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

/** Where the meadow stands on the sheet (uv, y up), as a pure function of the viewport. */
export interface GrassField {
  /** The ridge climbs from `left` at x = riseFrom to `right` at x = riseTo. */
  riseFrom: number;
  riseTo: number;
  left: number;
  right: number;
  /** Height of the slope from the far ridge down to the nearest roots. */
  depth: number;
  /** Below this the meadow thins out to nothing (portrait: the title's band). */
  near: number;
  /** Blade size multiplier. */
  scale: number;
  /** Left edge of where blades are rooted: none are spent where the ridge is below the sheet. */
  edge: number;
}

const LANDSCAPE_FIELD: GrassField = { riseFrom: 0.3, riseTo: 0.94, left: -0.03, right: 0.6, depth: 0.7, near: -0.3, scale: 1, edge: 0.3 };
const SHORT_PORTRAIT_FIELD: GrassField = { riseFrom: -0.5, riseTo: 1.2, left: 0.76, right: 0.9, depth: 0.25, near: 0.69, scale: 0.46, edge: -0.07 };
const PORTRAIT_FIELD: GrassField = { riseFrom: -0.5, riseTo: 1.2, left: 0.6, right: 0.82, depth: 0.42, near: 0.47, scale: 0.6, edge: -0.07 };

/**
 * Landscape: a slope that rises out of the lower edge right of the title and fills the right
 * of the hero. Portrait: a band of meadow across the art area, above the title. Ratios in
 * between blend continuously, as the art circle does.
 */
export function grassField(width: number, height: number): GrassField {
  const h = Math.max(1, height);
  const smooth = (edge0: number, edge1: number, value: number) => {
    const s = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
    return s * s * (3 - 2 * s);
  };
  const t = smooth(0.9, 1.25, Math.max(1, width) / h);
  // Short phones leave less room above the title: the meadow moves up and shrinks with it.
  const room = smooth(600, 740, h);
  const mix = (key: keyof GrassField) => {
    const portrait = SHORT_PORTRAIT_FIELD[key] + (PORTRAIT_FIELD[key] - SHORT_PORTRAIT_FIELD[key]) * room;
    return portrait + (LANDSCAPE_FIELD[key] - portrait) * t;
  };
  return { riseFrom: mix('riseFrom'), riseTo: mix('riseTo'), left: mix('left'), right: mix('right'), depth: mix('depth'), near: mix('near'), scale: mix('scale'), edge: mix('edge') };
}

const f = (value: number) => value.toFixed(4);

/** The ridge of each rise, shared by the ground wash and the blades. */
export const FIELD_GLSL = `
uniform vec4 uField;  // ridge: rises from x, to x, height at the left, height at the right
uniform vec4 uGround; // slope depth, near edge, blade scale, aspect
uniform vec2 uPhase;  // this visit's terrain
float ridge(float x, float layer) {
  float rise = smoothstep(uField.x, uField.y, x + 0.04 * layer);
  rise = mix(rise, sqrt(rise), 0.55);
  float roll = (0.05 + 0.02 * layer) * sin(x * uGround.w * 3.7 + uPhase.x + layer * 2.3) + 0.022 * sin(x * uGround.w * 9.7 + uPhase.y + layer * 4.1);
  return mix(uField.z, uField.w, rise) + uGround.x * (roll * (0.35 + 0.65 * rise) - 0.3 * layer);
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
uniform vec3 uCount;  // blades, segments, left edge of the rooted span
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
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float angleAt(float t, float lean, float curl, float bend) {
  return lean + curl * t + bend * (${f(GRASS.rootShare)} + ${f(1 - GRASS.rootShare)} * pow(t, ${f(GRASS.flex)}));
}
void main() {
  uint id = uint(gl_InstanceID) * 8u;
  float r0 = rnd(id), r1 = rnd(id + 1u), r2 = rnd(id + 2u), r3 = rnd(id + 3u), r4 = rnd(id + 4u), r5 = rnd(id + 5u);
  float aspect = uGround.w;

  // Instances are ordered far to near, so later blades are drawn over earlier ones.
  float d = (float(gl_InstanceID) + 0.5) / uCount.x;
  float layer = d < ${f(GRASS.layerShare[0])} ? 0.0 : d < ${f(GRASS.layerShare[0] + GRASS.layerShare[1])} ? 1.0 : 2.0;
  float from = layer == 0.0 ? 0.0 : layer == 1.0 ? ${f(GRASS.layerShare[0])} : ${f(GRASS.layerShare[0] + GRASS.layerShare[1])};
  float share = layer == 0.0 ? ${f(GRASS.layerShare[0])} : layer == 1.0 ? ${f(GRASS.layerShare[1])} : ${f(GRASS.layerShare[2])};
  float q = (d - from) / share;       // 0 on this rise's ridge .. 1 at its foot
  float depth = (layer + q) / 3.0;    // 0 far .. 1 near

  float x = mix(uCount.z, 1.07, r0);
  float down = pow(q, 1.35);
  float size = mix(${f(GRASS.farScale)}, 1.0, depth) * uGround.z;
  // Uneven ground: hummocks lift and drop the roots, so nearer tufts hide the feet of farther ones.
  vec2 ground = vec2(x * aspect * 3.2, depth * 7.0) + uPhase;
  float hummock = noise(ground) - 0.5;
  float rootY = ridge(x, layer) - down * 0.46 * uGround.x + 0.07 * size * hummock * smoothstep(0.0, 0.25, q);
  // Tufts: neighbouring blades share a height, with stragglers; nothing stands in a row.
  float tuft = noise(ground * 3.7 + 11.0);
  float tall = (0.5 + 0.55 * tuft + 0.55 * r1 * r1) * (0.72 + 0.28 * smoothstep(0.0, 0.12, q));
  // Toward the near edge the meadow dissolves into the paper, like ground mist.
  float fade = smoothstep(uGround.y - 0.07, uGround.y + 0.07, rootY);
  float len = ${f(GRASS.length)} * uShape.x * size * tall * (0.6 + 0.4 * fade);
  float width = ${f(GRASS.width)} * size * (0.65 + 0.7 * r2);

  // The wind where the blade stands (sampled at mid-height: that is the air it is in).
  vec2 at = clamp(vec2(x, rootY + 0.5 * len), 0.0, 1.0);
  vec2 wind = textureLod(uWind, at, 0.0).xy;
  float flutter = sin(uLight.z * (5.0 + 4.0 * r3) + r4 * 6.283) * (0.025 + 0.11 * min(1.0, length(wind)));
  float bend = ${f(GRASS.maxBend)} * tanh(${f(GRASS.bendRate)} * uShape.y * wind.x) + flutter;
  float side0 = r3 < 0.5 ? -1.0 : 1.0;
  float lean = uShape.w * (r4 * 2.0 - 1.0);
  // Rising air stands the blade up, sinking air lays it over.
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
  gl_Position = fade > 0.004 ? vec4(uv * 2.0 - 1.0, 0.0, 1.0) : vec4(2.0, 2.0, 0.0, 1.0);

  // Colour: cool and dark at the foot, green through the body, lit from behind at the tip.
  float warmth = uLight.x;
  vec3 foot = mix(vec3(0.085, 0.215, 0.185), vec3(0.012, 0.075, 0.062), depth);
  vec3 body = mix(vec3(0.27, 0.48, 0.30), vec3(0.11, 0.41, 0.10), depth);
  vec3 tip = mix(vec3(0.66, 0.86, 0.38), vec3(0.88, 0.95, 0.24), warmth);
  // Each blade has its own green; a few have dried to straw.
  body *= 0.82 + 0.36 * r5;
  tip = mix(tip, vec3(0.86, 0.80, 0.42), step(0.93, r2) * 0.7);
  // How much light comes through: more where the blade is thin and turned to the sun (upper right).
  float sun = 0.5 + 0.5 * sin(heading + 0.6);
  float glow = smoothstep(0.3, 1.0, t) * (0.45 + 0.55 * sun) * (0.55 + 0.45 * tuft);
  vec3 color = mix(foot, body, smoothstep(0.0, 0.55, t));
  color = mix(color, tip, glow * mix(0.72, 1.0, depth));
  // A gust shows as a bright band: blades laid over turn their faces to the sky.
  color += vec3(0.34, 0.38, 0.16) * uLight.y * smoothstep(0.25, 1.1, abs(bend)) * smoothstep(0.15, 0.9, t);
  // Cloud-like shade drifting over the ground, and the hollows between hummocks.
  color *= 0.74 + 0.4 * noise(ground * 0.45 + 3.0) + 0.3 * hummock;
  // Occlusion: feet stand in their neighbours' shade, most of all in the nearest rise.
  color *= mix(1.0, smoothstep(-0.25, 0.6, t), 0.55 + 0.35 * depth);
  // Each rise has a lit crest and a shaded foot, where the next rise stands in front of it.
  float crest = 1.0 - smoothstep(0.0, 0.22, q);
  float valley = layer < 2.0 ? smoothstep(0.35, 0.95, q) : 0.0;
  color *= 1.0 + 0.3 * crest * smoothstep(0.3, 1.0, t);
  color = mix(color, color * vec3(0.5, 0.62, 0.66), 0.75 * valley);
  // Distance: the far rise is paler and takes the colour of the air.
  color = mix(color, vec3(0.80, 0.87, 0.80), 0.42 * (1.0 - depth) * (1.0 - depth));
  // The ink behind stains the light that reaches the meadow.
  vec3 ink = inkColor(textureLod(uDye, at, 0.0).rgb) / PAPER_COLOR;
  color *= mix(vec3(1.0), ink, 0.4);
  vColor = color;
  vEdge = vec3(side, t, opacity * (0.9 + 0.1 * depth) * fade);
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
