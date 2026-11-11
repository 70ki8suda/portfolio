/**
 * GLSL ES 3.00 programs for the wetland's water: one step of "stable fluids" split into passes.
 *
 * Velocity is stored in simulation cells per second (xy of a float texel); cells are square.
 * `uTexel` is always one cell of the texture being read for neighbours.
 */
import { FLOW, INK_COLOR_GLSL, MAX_SPLATS, PAPER } from './ink';
import { FIELD_GLSL } from './grass';

/** One triangle covering the viewport, generated from the vertex index: no buffers to manage. */
export const VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

const HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 outColor;
`;

/**
 * Semi-Lagrangian advection: each cell takes the value found one step upstream.
 * Unconditionally stable, whatever the speed. Used for the velocity itself and for the pigments.
 */
export const ADVECT = `${HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uCell;   // one simulation cell in uv
uniform float uStep;  // seconds
uniform float uKeep;
uniform float uLimit;
void main() {
  vec2 from = vUv - uStep * texture(uVelocity, vUv).xy * uCell;
  outColor = min(uKeep * texture(uSource, from), vec4(uLimit));
}
`;

/** Adds Gaussian blobs of velocity or pigment. */
export const SPLAT = `${HEADER}
uniform sampler2D uSource;
uniform vec4 uPoints[${MAX_SPLATS}]; // x, y, radius (of the height), unused
uniform vec3 uValues[${MAX_SPLATS}];
uniform int uCount;
uniform float uAspect;
void main() {
  vec4 value = texture(uSource, vUv);
  for (int i = 0; i < ${MAX_SPLATS}; i++) {
    if (i >= uCount) break;
    vec2 d = (vUv - uPoints[i].xy) * vec2(uAspect, 1.0);
    value.rgb += uValues[i] * exp(-dot(d, d) / (uPoints[i].z * uPoints[i].z));
  }
  outColor = value;
}
`;

/** Vorticity ω = ∂v/∂x − ∂u/∂y. */
export const CURL = `${HEADER}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  outColor = vec4(0.5 * (r - l - t + b), 0.0, 0.0, 1.0);
}
`;

/** Vorticity confinement: a force ε·(N × ω) with N pointing up the gradient of |ω|, spinning eddies back up. */
export const CONFINE = `${HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform vec2 uTexel;
uniform float uStep;
void main() {
  float l = abs(texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x);
  float r = abs(texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x);
  float b = abs(texture(uCurl, vUv - vec2(0.0, uTexel.y)).x);
  float t = abs(texture(uCurl, vUv + vec2(0.0, uTexel.y)).x);
  float c = texture(uCurl, vUv).x;
  vec2 n = 0.5 * vec2(r - l, t - b);
  n /= length(n) + 1e-4;
  vec2 force = ${FLOW.confinement.toFixed(2)} * c * vec2(n.y, -n.x);
  vec2 velocity = texture(uVelocity, vUv).xy + uStep * force;
  outColor = vec4(clamp(velocity, -1500.0, 1500.0), 0.0, 1.0);
}
`;

/** ∇·u, with solid walls: the neighbour beyond an edge mirrors the normal velocity. */
export const DIVERGENCE = `${HEADER}
uniform sampler2D uVelocity;
uniform vec2 uTexel;
void main() {
  vec2 c = texture(uVelocity, vUv).xy;
  float l = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float t = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  if (vUv.x - uTexel.x < 0.0) l = -c.x;
  if (vUv.x + uTexel.x > 1.0) r = -c.x;
  if (vUv.y - uTexel.y < 0.0) b = -c.y;
  if (vUv.y + uTexel.y > 1.0) t = -c.y;
  outColor = vec4(0.5 * (r - l + t - b), 0.0, 0.0, 1.0);
}
`;

/** One Jacobi sweep of ∇²p = ∇·u. Clamped lookups give ∂p/∂n = 0 at the walls. */
export const PRESSURE = `${HEADER}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
uniform float uKeep; // scales the starting guess on the first sweep
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  outColor = vec4(0.25 * (uKeep * (l + r + b + t) - texture(uDivergence, vUv).x), 0.0, 0.0, 1.0);
}
`;

/** Projection: u ← u − ∇p removes the divergence. Nothing flows through the walls. */
export const PROJECT = `${HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uPressure;
uniform vec2 uTexel;
void main() {
  float l = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 velocity = texture(uVelocity, vUv).xy - 0.5 * vec2(r - l, t - b);
  if (vUv.x - uTexel.x < 0.0 || vUv.x + uTexel.x > 1.0) velocity.x = 0.0;
  if (vUv.y - uTexel.y < 0.0 || vUv.y + uTexel.y > 1.0) velocity.y = 0.0;
  outColor = vec4(velocity, 0.0, 1.0);
}
`;

/**
 * The opening state, so the first frame already has ink in it.
 * uMode 0: pigment clouds from warped noise, gathered on the stage.
 * uMode 1: a swirling velocity field, the curl of a noise stream function (so it starts divergence-free).
 */
export const SEED = `${HEADER}
uniform int uMode;
uniform float uAspect;
uniform vec4 uStage; // centre xy, reach xy
uniform vec3 uOffset;
uniform float uCells;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float sum = 0.0, weight = 0.5;
  for (int i = 0; i < 4; i++) { sum += weight * noise(p); p = p * 2.03 + 7.1; weight *= 0.5; }
  return sum;
}
float stream(vec2 p) { return fbm(p * 2.3 + uOffset.xy) + 0.5 * sin(3.0 * p.x + uOffset.z) * cos(2.6 * p.y - uOffset.z); }
void main() {
  vec2 p = vUv * vec2(uAspect, 1.0);
  if (uMode == 1) {
    float e = 0.01;
    vec2 curl = vec2(stream(p + vec2(0.0, e)) - stream(p - vec2(0.0, e)), stream(p - vec2(e, 0.0)) - stream(p + vec2(e, 0.0))) / (2.0 * e);
    outColor = vec4(0.11 * uCells * curl, 0.0, 1.0);
    return;
  }
  vec2 q = (vUv - uStage.xy) / (uStage.zw * 1.25);
  float onStage = 1.0 - smoothstep(0.45, 1.25, length(q));
  vec2 warped = p + 0.3 * vec2(fbm(p * 2.4 + uOffset.yz), fbm(p * 2.4 + uOffset.zx + 5.0));
  // Each pigment gets its own third of the stage, so every opening has all three colours;
  // the noise decides the shapes and lets neighbours overlap.
  vec3 clouds;
  for (int i = 0; i < 3; i++) {
    float angle = uOffset.z + 2.094 * float(i);
    vec2 home = q - 0.5 * vec2(cos(angle), sin(angle));
    float cloud = fbm(warped * 2.6 + uOffset.xy + 19.0 * float(i)) + 0.24 * exp(-dot(home, home) / 0.3);
    clouds[i] = smoothstep(0.56, 0.78, cloud);
  }
  outColor = vec4(1.5 * clouds * onStage, 1.0);
}
`;

/** Carries a field across a grid reallocation. */
export const COPY = `${HEADER}
uniform sampler2D uSource;
uniform float uScale;
void main() { outColor = uScale * texture(uSource, vUv); }
`;

/**
 * The wind the grass feels: the ink's velocity (cells per second → sheet heights per second)
 * plus a band of gusts travelling across the sheet, eased in so that blades have inertia.
 */
export const WIND = `${HEADER}
uniform sampler2D uWind;
uniform sampler2D uVelocity;
uniform vec4 uDrive; // gain on the ink's flow, gust strength, gust clock, ease
uniform vec2 uSheet; // aspect, simulation cells per sheet height
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 flow = uDrive.x * texture(uVelocity, vUv).xy / uSheet.y;
  // Gust fronts: long bands slanted across the sheet, moving right; a finer ripple rides on them.
  vec2 p = vUv * vec2(uSheet.x, 1.0);
  float front = noise(vec2(p.x * 1.5 + p.y * 0.9 - uDrive.z * 0.6, p.y * 1.7 + uDrive.z * 0.07));
  float ripple = noise(vec2(p.x * 5.0 + p.y * 2.0 - uDrive.z * 1.5, p.y * 6.0 - uDrive.z * 0.2));
  float gust = uDrive.y * (smoothstep(0.3, 0.8, front) * 0.34 + (ripple - 0.5) * 0.12 + 0.02);
  vec2 target = flow + gust * vec2(1.0, 0.18 * (ripple - 0.5));
  outColor = vec4(mix(texture(uWind, vUv).xy, target, uDrive.w), 0.0, 1.0);
}
`;

/**
 * The wetland without its blades: water, the islands' ground, and what one does to the other.
 *
 * Water is the paper seen through pigment: a standing jade tint that deepens toward the viewer,
 * plus whatever the flow has carried here. Its surface catches pale warm light where the pigment
 * (and so the flow that folded it) changes quickly. Islands, from the field the blades also use,
 * are dark wet ground; just below each one the water holds its reflection.
 */
export const RENDER = `${HEADER}
uniform sampler2D uDye;
uniform vec2 uInk;    // how much of the carried pigment shows, sunlight on the surface
uniform vec2 uTexel;  // one pigment cell
${FIELD_GLSL}
${INK_COLOR_GLSL}
void main() {
  vec3 dye = texture(uDye, vUv).rgb;
  float size = nearness(vUv.y);
  float water = wetland(vUv, 0.26);
  // Standing water: jade and a little deep green, thin in the distance.
  vec3 standing = vec3(0.34, 0.1, 0.0) * mix(0.35, 1.0, smoothstep(0.25, 1.0, size)) * water;
  vec3 color = inkColor(uInk.x * dye + standing);

  // Light on the surface, from the slope of the pigment field: where the flow has just folded
  // the water, the surface is uneven and glints.
  float here = dot(dye, vec3(1.0));
  vec2 slope = vec2(dot(texture(uDye, vUv + vec2(uTexel.x, 0.0)).rgb, vec3(1.0)), dot(texture(uDye, vUv + vec2(0.0, uTexel.y)).rgb, vec3(1.0))) - here;
  float glint = smoothstep(0.05, 0.3, slope.x * 0.6 + slope.y);
  color += vec3(0.11, 0.1, 0.06) * uInk.y * (glint + 0.25 * water) * water;

  float land = cover(vUv);
  // The reflection of an island lies on the water just below it, longer for nearer islands.
  // The pigment's slope stirs it, as a moving surface would.
  vec2 stir = 0.5 * slope * size;
  float above = max(cover(vUv + stir + vec2(0.0, 0.02 * size)), cover(vUv + stir + vec2(0.0, 0.055 * size)) * 0.6);
  color = mix(color, color * vec3(0.5, 0.7, 0.62), 0.5 * above * (1.0 - land));

  // Ground under the grass: pale and hazy far away, dark and wet nearby; tinted by the water around it.
  float depth = clamp((uField.w - vUv.y) / (uField.w - uField.z), 0.0, 1.0);
  vec3 ground = mix(vec3(0.5, 0.67, 0.57), vec3(0.055, 0.17, 0.13), smoothstep(0.0, 0.8, depth));
  ground *= mix(vec3(1.0), color / ${`vec3(${PAPER.map((v) => v.toFixed(4)).join(', ')})`}, 0.4);
  // The bank is a gradual thing: shallows first, then ground, more solid the nearer it is.
  outColor = vec4(mix(color, ground, mix(0.6, 0.92, depth) * smoothstep(0.12, 0.85, land)), 1.0);
}
`;
