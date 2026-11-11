/**
 * GLSL ES 3.00 programs for the flow behind the racks' water and moving air: one step of "stable fluids" split into passes.
 *
 * Velocity is stored in simulation cells per second (xy of a float texel); cells are square.
 * `uTexel` is always one cell of the texture being read for neighbours.
 */
import { FLOW, MAX_SPLATS } from './ink';
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
 * The racks without their crop, in two layers drawn by the same program.
 *
 * Layer 0, under the blades: for each pixel the camera's ray is followed through the rack it
 * enters (between the front plane and the back panel) and the first thing it meets is shaded —
 * the water in a tray below eye level, the underside of a tray above it with its strip light,
 * or the back panel. Outside the racks there is only bright air: no floor, no ceiling, no room.
 * Layer 1, over the blades: what stands in front of the crop — the uprights, each tray's
 * front lip and the feed pipe under it — with alpha, so blades are hidden where a real frame
 * would hide them.
 *
 * The water is clear: what is seen is the tray's pale floor through it. The solver contributes
 * motion only: its velocity (through the wind texture) sets how strong and which way the
 * ripples run, and the tracer it advects marks water that has been stirred.
 *
 * Approximations: a rack is planes and bands, not modelled parts (posts have no thickness, a
 * tray has no side walls); the ripples are three travelling sines, not a solved surface;
 * reflection is a Fresnel-weighted light colour, not a mirrored image; light and shade on the
 * panel are functions of position in the tier, not cast.
 */
export const RENDER = `${HEADER}
uniform sampler2D uDye;   // tracer of stirred water
uniform sampler2D uWind;  // smoothed flow and moving air
uniform vec2 uInk;        // clock (s), daylight
uniform int uLayer;       // 0: behind the crop, 1: in front of it
${FIELD_GLSL}
/** 1 within w of a multiple of pitch, antialiased over \`pixel\` (the size of a pixel in x's units). */
float rule(float x, float pitch, float w, float pixel) {
  float d = abs(mod(x + 0.5 * pitch, pitch) - 0.5 * pitch);
  return 1.0 - smoothstep(w, w + 1.5 * pixel, d);
}
/** Brushed light metal. */
vec3 metal(float along, float lit) { return vec3(0.87, 0.89, 0.9) * (0.9 + 0.12 * clamp(lit, 0.0, 1.0)) * (0.985 + 0.03 * fieldNoise(vec2(along * 70.0, 3.0))); }
void main() {
  vec2 ray = rayOf(vUv);
  // The rack this ray can enter: the one on its side of the aisle.
  float side = ray.x > 0.0 ? FRONT : uGround.y;
  float across = abs(ray.x);
  float zFront = side / max(across, 1e-5);
  float zBack = (side + DEPTH) / max(across, 1e-5);
  bool rack = side > 0.0 && zFront < TO;
  float light = 0.94 + 0.06 * uInk.y;
  float roof = roofOf();
  // Pixel sizes on the rack's front, taken here, before any branch: a derivative taken after an
  // early return is undefined on the pixels next to it.
  float pixelZ = min(fwidth(zFront), 0.5);
  float pixelY = min(fwidth(ray.y * zFront), 0.5);

  if (uLayer == 1) {
    /* ---------- in front of the crop: uprights, lips, feed pipes ---------- */
    float y = ray.y * zFront;
    float within = step(FROM, zFront) * step(uField.w - 0.075, y) * step(y, roof + 0.02);
    if (!rack || within < 0.5) { outColor = vec4(0.0); return; }
    float inTier = mod(y - uField.w, TIER);
    float pixel = pixelY;
    // A tray's front: its lip above the base line, its floor's edge just below.
    float lip = smoothstep(-0.016 - pixel, -0.016, inTier - TIER * step(0.5 * TIER, inTier)) * (1.0 - smoothstep(LIP, LIP + pixel, inTier - TIER * step(0.5 * TIER, inTier)));
    float lipAt = (inTier - TIER * step(0.5 * TIER, inTier) + 0.016) / (LIP + 0.016); // 0 bottom .. 1 top
    // The frame ends in a slim top rail where the next tray would be.
    float rail = step(roof - 0.5 * TIER, y);
    lip *= 1.0 - rail * step(0.012, inTier - TIER * step(0.5 * TIER, inTier));
    vec3 color = vec3(0.93, 0.945, 0.94) * (0.86 + 0.16 * clamp(lipAt, 0.0, 1.0)) + 0.05 * smoothstep(0.85, 1.0, lipAt);
    // The feed pipe hangs under the tray.
    float pipeAt = (inTier - (TIER - 0.058)) / 0.022;
    float pipe = step(0.0, pipeAt) * step(pipeAt, 1.0) * step(uField.w + 0.5 * TIER, y) * step(y, roof - 0.5 * TIER);
    color = mix(color, vec3(0.74, 0.83, 0.87) * (0.8 + 0.4 * sin(3.1416 * pipeAt)), pipe * (1.0 - lip));
    // Uprights, with a brighter edge toward the aisle's light.
    float post = rule(zFront + 0.42, BAY, POST, pixelZ);
    float postAt = abs(mod(zFront + 0.42 + 0.5 * BAY, BAY) - 0.5 * BAY) / POST;
    color = mix(color, metal(y, 1.0 - postAt), post);
    float alpha = max(max(lip, pipe), post);
    color = mix(color, AIR, haze(zFront));
    outColor = vec4(color * light, alpha);
    return;
  }

  /* ---------- behind the crop ---------- */
  // Bright air, a little warmer toward where the aisle recedes.
  vec3 color = AIR + vec3(0.02, 0.018, 0.008) * exp(-3.0 * dot(vUv - uField.xy, vUv - uField.xy)) - 0.03 * smoothstep(0.2, 1.2, ray.y);
  if (rack) {
    // Follow the ray from the rack's front to its back panel; a tray may be in the way.
    float z = zBack;
    int kind = 0; // 0 panel, 1 water, 2 underside
    for (int k = 0; k < 12; k++) {
      float base = uField.w + float(k) * TIER;
      if (base > roof - 0.5 * TIER) break;
      float level = ray.y < 0.0 ? base + WATER : base - 0.016;
      float zAt = level / ray.y;
      if (zAt > zFront && zAt < z) { z = zAt; kind = ray.y < 0.0 ? 1 : 2; }
    }
    float y = ray.y * z;
    float into = across * z - side; // 0 at the front .. DEPTH at the panel
    if (z > FROM * 0.5 && z < TO && y < roof && y > uField.w - 0.016) {
      float inTier = mod(y - uField.w, TIER) / TIER; // 0 at a tray's base .. 1 under the next
      vec3 surface;
      if (kind == 1) {
        /* water in a tray, over its pale floor */
        vec2 g = vec2(z, into);
        float depth = smoothstep(0.0, 0.08, into) * smoothstep(0.0, 0.08, DEPTH - into);
        vec2 flow = texture(uWind, vUv).xy;
        float stirred = min(1.0, dot(texture(uDye, vUv).rgb, vec3(0.45)));
        float energy = 0.3 + 0.8 * min(1.0, 2.0 * length(flow)) + 0.9 * stirred;
        // The water is fed at one end of the tray and runs along it; the flow bends the ripples.
        vec2 run = normalize(vec2(-1.0, 0.08) + 0.9 * flow);
        float phase = 6.283 * fieldNoise(g * 3.0 + uPhase);
        vec2 k1 = run * 58.0, k2 = mat2(0.8, 0.6, -0.6, 0.8) * run * 90.0, k3 = mat2(0.9, -0.44, 0.44, 0.9) * run * 141.0;
        vec2 slope = energy * (0.5 * normalize(k1) * cos(dot(g, k1) - 3.1 * uInk.x + phase)
          + 0.32 * normalize(k2) * cos(dot(g, k2) - 4.3 * uInk.x - 1.7 * phase)
          + 0.2 * normalize(k3) * cos(dot(g, k3) - 5.9 * uInk.x + 2.9 * phase));
        vec2 b = g + 0.012 * depth * slope;
        vec3 floorColor = vec3(0.9, 0.93, 0.92) * (0.97 + 0.05 * fieldNoise(b * 50.0));
        floorColor *= 1.0 - 0.06 * rule(b.x, 0.15, 0.003, pixelZ);
        // Roots and the crop's shade darken the floor, greener toward the middle of the tray.
        floorColor = mix(floorColor, vec3(0.52, 0.66, 0.5), 0.5 * depth);
        surface = floorColor * exp(-depth * 0.3 * vec3(0.95, 0.3, 0.26)) * (1.0 + 0.18 * depth * (slope.x - slope.y));
        // The strip light above, on the surface: more of it the flatter the view.
        float grazing = clamp(1.0 + ray.y / max(length(vec2(ray.y, 1.0)), 1e-4) * 3.0, 0.0, 1.0);
        float fresnel = clamp(0.08 + 0.6 * grazing * grazing + 0.1 * length(slope), 0.0, 0.85);
        float strip = 1.0 - smoothstep(0.04, 0.1, abs(into + 0.03 * slope.y - 0.5 * DEPTH));
        surface = mix(surface, mix(vec3(0.9, 0.95, 0.96), vec3(1.0), 0.8 * strip), fresnel);
        float toSun = dot(slope, normalize(vec2(0.5, 0.86))) / energy;
        float sparkle = smoothstep(0.62, 0.8, fieldNoise(g * 300.0 + vec2(1.3, 0.7) * uInk.x));
        surface += vec3(1.0, 0.99, 0.94) * 0.6 * uInk.y * smoothstep(0.72, 0.95, toSun) * sparkle * (0.4 + 0.6 * min(1.0, energy));
        // Shade under the lip and against the panel.
        surface *= mix(0.84, 1.0, smoothstep(0.0, 0.05, into)) * mix(0.9, 1.0, smoothstep(0.0, 0.05, DEPTH - into));
      } else if (kind == 2) {
        /* the underside of a tray: a pale soffit with a strip light along its middle */
        surface = vec3(0.86, 0.88, 0.885) * (0.92 + 0.08 * smoothstep(0.0, DEPTH, into));
        float strip = 1.0 - smoothstep(0.035, 0.05, abs(into - 0.5 * DEPTH));
        surface = mix(surface, vec3(1.0, 0.995, 0.97), strip);
        surface += 0.1 * (1.0 - smoothstep(0.05, 0.2, abs(into - 0.5 * DEPTH)));
        surface *= 1.0 - 0.08 * rule(z + 0.42, BAY, 0.012, pixelZ);
      } else {
        /* the back panel: lit from the strip above, green with the crop's light below */
        surface = vec3(0.925, 0.945, 0.94) * mix(0.9, 1.04, smoothstep(0.25, 1.0, inTier));
        surface = mix(surface, vec3(0.78, 0.89, 0.74), 0.4 * (1.0 - smoothstep(0.15, 0.6, inTier)));
        // The tray against it, and the rear uprights and panel seams.
        surface = mix(surface, vec3(0.9, 0.915, 0.915) * 0.93, 1.0 - smoothstep(LIP / TIER, LIP / TIER + 0.01, inTier));
        surface = mix(surface, metal(y, 0.3), 0.8 * rule(z + 0.42, BAY, POST * 0.8, pixelZ));
        surface *= 1.0 - 0.05 * rule(z + 0.42 + 0.5 * BAY, BAY, 0.004, pixelZ);
      }
      color = mix(surface, AIR, haze(z));
    }
  }
  outColor = vec4(color * light, 1.0);
}
`;
