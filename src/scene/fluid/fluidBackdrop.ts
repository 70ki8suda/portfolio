/**
 * WebGL2 host for hydroponic rice racks. An incompressible flow drives water ripples
 * and the wind bending the rice across the stacked trays. It owns the GPU
 * resources, the animation frame, the pointer listeners and every reason to stop working.
 *
 * `root[data-state]` reports running | paused | offscreen | hidden | static | unavailable.
 * Only `running` holds an animation frame or listens to the pointer. When WebGL2 or
 * float render targets are missing, or the context is lost, the canvas is hidden and
 * the root's CSS background is what the visitor sees.
 */
import { ADVECT, CONFINE, COPY, CURL, DIVERGENCE, PRESSURE, PROJECT, RENDER, SEED, SPLAT, VERTEX, WIND } from './shaders';
import { GRASS, GRASS_FRAGMENT, GRASS_STYLES, GRASS_VERTEX, grassField, sunlight, windDrive, type GrassMode } from './grass';
import { FLOW, PIGMENTS, POINTER_PRESS_RADIUS, POINTER_STROKE_RADIUS, STEP_SECONDS, createRandom, createSources, createSplatQueue, pushSplat, stage } from './ink';
import { createQualityGovernor, createStepClock, planResolution, resolveActivity, type ResolutionPlan } from './timing';

export interface FluidBackdropOptions {
  paused: boolean;
  reducedMotion: boolean;
  mode: GrassMode;
  /** 0..1 */
  intensity: number;
  /** Fixes the opening composition and the ambient forcing; random per visit when omitted. */
  seed?: number;
}
export interface FluidBackdropHandle {
  setPaused(paused: boolean): void;
  /** The state and intensity controls: how the grass stands and is lit, and how hard the wind blows. */
  setStyle(mode: GrassMode, intensity: number): void;
  dispose(): void;
}

/** Steps integrated before the first frame: enough for the seeded clouds to start curling. */
const WARMUP_STEPS = 12;
/** The reduced-motion still gets a longer run-up: it is the only frame anyone will see. */
const STATIC_WARMUP_STEPS = 90;
/** Rendering is capped near 60 fps; faster displays skip frames instead of doubling the work. */
const MIN_FRAME_MS = 1000 / 60 - 2.5;

interface Target { texture: WebGLTexture; framebuffer: WebGLFramebuffer; }
interface Program { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>; }
type Pair = [Target, Target];

/** Everything that dies with the context. */
interface Gpu {
  advect: Program; splat: Program; curl: Program; confine: Program; divergence: Program;
  pressure: Program; project: Program; seed: Program; copy: Program; render: Program; wind: Program; grass: Program;
  velocity: Pair | null;
  pressureField: Pair | null;
  dye: Pair | null;
  /** The smoothed wind the grass reads. */
  air: Pair | null;
  /** Scratch for the curl and the divergence. */
  scalar: Target | null;
}

function compileProgram(gl: WebGL2RenderingContext, fragment: string, uniformNames: string[], vertex: string = VERTEX): Program {
  const program = gl.createProgram();
  const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].map(([type, source]) => {
    const shader = gl.createShader(type as number);
    if (!shader) throw new Error('Fluid shader unavailable');
    gl.shaderSource(shader, source as string);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    return shader;
  });
  gl.linkProgram(program);
  // Linked programs keep their own copy; the shader objects can go either way.
  shaders.forEach((shader) => { gl.detachShader(program, shader); gl.deleteShader(shader); });
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Fluid program failed to link: ${log}`);
  }
  const uniforms: Program['uniforms'] = {};
  for (const name of uniformNames) uniforms[name] = gl.getUniformLocation(program, name);
  return { program, uniforms };
}

function createTarget(gl: WebGL2RenderingContext, width: number, height: number, format: number, filter: number): Target {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, format, width, height); // zero-filled: still water
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!complete) {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    throw new Error('Fluid render target incomplete');
  }
  return { texture, framebuffer };
}

export function createFluidBackdrop(root: HTMLElement, canvas: HTMLCanvasElement, options: FluidBackdropOptions): FluidBackdropHandle {
  const { reducedMotion } = options;
  let paused = options.paused;
  let disposed = false;
  let inView = typeof IntersectionObserver !== 'function';
  let frame = 0;
  let listening = false;
  let lastFrame = -1;
  let stepIndex = 0;
  let quality = 0;
  let sizeDirty = true;
  let plan: ResolutionPlan | null = null;
  let gpu: Gpu | null = null;
  let mode = options.mode;
  let intensity = options.intensity;
  /** Advances with the steps, faster at higher intensity: where the gust fronts are. */
  let gustClock = 0;

  const seed = options.seed ?? Math.floor(Math.random() * 0xffffffff);
  const clock = createStepClock();
  const governor = createQualityGovernor();
  const sources = createSources(seed);
  const splats = createSplatQueue();
  const pointer = { x: 0, y: 0, moved: false, pressed: false, tracking: false, lastX: 0, lastY: 0, pigment: 0 };

  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
  } catch { gl = null; }

  /* ---------- GPU resources ---------- */

  // Own each target immediately, including allocations in a size change that may fail halfway.
  const targets = new Set<Target>();
  function target(width: number, height: number, filter: number): Target {
    const item = createTarget(gl!, width, height, gl!.RGBA16F, filter);
    targets.add(item);
    return item;
  }

  function deleteTarget(target: Target | null) {
    if (!gl || !target) return;
    gl.deleteFramebuffer(target.framebuffer);
    gl.deleteTexture(target.texture);
    targets.delete(target);
  }
  function release() {
    if (!gl || !gpu) return;
    for (const item of [gpu.advect, gpu.splat, gpu.curl, gpu.confine, gpu.divergence, gpu.pressure, gpu.project, gpu.seed, gpu.copy, gpu.render, gpu.wind, gpu.grass]) gl.deleteProgram(item.program);
    for (const item of targets) deleteTarget(item);
    gpu = null;
    plan = null;
  }
  function build(): boolean {
    if (!gl || gl.isContextLost()) return false;
    // Rendering to float textures is an extension in WebGL2. Half floats are enough here and filter linearly.
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return false;
    const programs: Program[] = [];
    try {
      const make = (fragment: string, names: string[], vertex?: string) => { const item = compileProgram(gl!, fragment, names, vertex); programs.push(item); return item; };
      gpu = {
        advect: make(ADVECT, ['uVelocity', 'uSource', 'uCell', 'uStep', 'uKeep', 'uLimit']),
        splat: make(SPLAT, ['uSource', 'uPoints[0]', 'uValues[0]', 'uCount', 'uAspect']),
        curl: make(CURL, ['uVelocity', 'uTexel']),
        confine: make(CONFINE, ['uVelocity', 'uCurl', 'uTexel', 'uStep']),
        divergence: make(DIVERGENCE, ['uVelocity', 'uTexel']),
        pressure: make(PRESSURE, ['uPressure', 'uDivergence', 'uTexel', 'uKeep']),
        project: make(PROJECT, ['uVelocity', 'uPressure', 'uTexel']),
        seed: make(SEED, ['uMode', 'uAspect', 'uStage', 'uOffset', 'uCells']),
        copy: make(COPY, ['uSource', 'uScale']),
        render: make(RENDER, ['uDye', 'uWind', 'uInk', 'uLayer', 'uField', 'uGround', 'uPhase']),
        wind: make(WIND, ['uWind', 'uVelocity', 'uDrive', 'uSheet']),
        grass: make(GRASS_FRAGMENT, ['uWind', 'uShape', 'uLight', 'uCount', 'uField', 'uGround', 'uPhase'], GRASS_VERTEX),
        velocity: null, pressureField: null, dye: null, air: null, scalar: null,
      };
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      // Texture units are fixed per program: unit 0 is the field being read, unit 1 its companion.
      const second: [Program, string][] = [[gpu.advect, 'uSource'], [gpu.confine, 'uCurl'], [gpu.pressure, 'uDivergence'], [gpu.project, 'uPressure'], [gpu.wind, 'uVelocity'], [gpu.render, 'uWind']];
      for (const [item, name] of second) {
        gl.useProgram(item.program);
        gl.uniform1i(item.uniforms[name], 1);
      }
      gl.useProgram(gpu.advect.program);
      gl.uniform1f(gpu.advect.uniforms.uStep, STEP_SECONDS);
      gl.useProgram(gpu.confine.program);
      gl.uniform1f(gpu.confine.uniforms.uStep, STEP_SECONDS);
      // Blades are blended over the picture back to front; the canvas itself stays opaque.
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      plan = null;
      sizeDirty = true;
      return true;
    } catch {
      programs.forEach((item) => gl!.deleteProgram(item.program));
      gpu = null;
      return false;
    }
  }

  /** Draws the full-screen triangle with `program` into `target` (null = the canvas). */
  function pass(program: Program, target: Target | null, width: number, height: number, first: WebGLTexture | null, second: WebGLTexture | null = null) {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, target ? target.framebuffer : null);
    gl!.viewport(0, 0, width, height);
    gl!.useProgram(program.program);
    if (second) {
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, second);
    }
    if (first) {
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, first);
    }
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }
  function swap(pair: Pair) { const held = pair[0]; pair[0] = pair[1]; pair[1] = held; }
  function pair(width: number, height: number): Pair {
    return [target(width, height, gl!.LINEAR), target(width, height, gl!.LINEAR)];
  }

  /** Matches the buffers to the element. Returns false while there is nothing to draw into. */
  function applySize(): boolean {
    sizeDirty = false;
    if (!gl || !gpu) return false;
    const next = planResolution(root.clientWidth, root.clientHeight, window.devicePixelRatio, quality);
    if (!next) return plan !== null;
    if (canvas.width !== next.canvasWidth || canvas.height !== next.canvasHeight) {
      canvas.width = next.canvasWidth;
      canvas.height = next.canvasHeight;
    }
    const aspect = next.simWidth / next.simHeight;
    if (!gpu.velocity || !plan || plan.simWidth !== next.simWidth || plan.simHeight !== next.simHeight
      || plan.dyeWidth !== next.dyeWidth || plan.dyeHeight !== next.dyeHeight) {
      const velocity = pair(next.simWidth, next.simHeight);
      const pressureField = pair(next.simWidth, next.simHeight);
      const scalar = target(next.simWidth, next.simHeight, gl.NEAREST);
      const dye = pair(next.dyeWidth, next.dyeHeight);
      const wind = pair(next.simWidth, next.simHeight);
      if (gpu.velocity && gpu.dye && gpu.air && plan) {
        // Keep the ink that is already moving: resample it, with speeds rescaled to the new cell size.
        gl.useProgram(gpu.copy.program);
        gl.uniform1f(gpu.copy.uniforms.uScale, next.simHeight / plan.simHeight);
        pass(gpu.copy, velocity[0], next.simWidth, next.simHeight, gpu.velocity[0].texture);
        gl.uniform1f(gpu.copy.uniforms.uScale, 1);
        pass(gpu.copy, dye[0], next.dyeWidth, next.dyeHeight, gpu.dye[0].texture);
        pass(gpu.copy, wind[0], next.simWidth, next.simHeight, gpu.air[0].texture);
      } else {
        // The opening composition: clouds of each pigment and a divergence-free swirl to carry them.
        const random = createRandom(seed ^ 0x9e3779b9);
        gl.useProgram(gpu.seed.program);
        gl.uniform1f(gpu.seed.uniforms.uAspect, aspect);
        gl.uniform4fv(gpu.seed.uniforms.uStage, stage(aspect));
        gl.uniform3f(gpu.seed.uniforms.uOffset, random() * 40, random() * 40, random() * 40);
        gl.uniform1f(gpu.seed.uniforms.uCells, next.simHeight);
        gl.uniform1i(gpu.seed.uniforms.uMode, 1);
        pass(gpu.seed, velocity[0], next.simWidth, next.simHeight, null);
        gl.uniform1i(gpu.seed.uniforms.uMode, 0);
        pass(gpu.seed, dye[0], next.dyeWidth, next.dyeHeight, null);
      }
      gpu.velocity?.forEach(deleteTarget);
      gpu.pressureField?.forEach(deleteTarget);
      gpu.dye?.forEach(deleteTarget);
      gpu.air?.forEach(deleteTarget);
      deleteTarget(gpu.scalar);
      gpu.air = wind;
      gpu.velocity = velocity;
      gpu.pressureField = pressureField;
      gpu.dye = dye;
      gpu.scalar = scalar;
      canvas.dataset.grid = `${next.simWidth}x${next.simHeight}`;
      // Per-size constants.
      const texelX = 1 / next.simWidth;
      const texelY = 1 / next.simHeight;
      for (const item of [gpu.curl, gpu.confine, gpu.divergence, gpu.pressure, gpu.project]) {
        gl.useProgram(item.program);
        gl.uniform2f(item.uniforms.uTexel, texelX, texelY);
      }
      gl.useProgram(gpu.advect.program);
      gl.uniform2f(gpu.advect.uniforms.uCell, texelX, texelY);
      gl.useProgram(gpu.splat.program);
      gl.uniform1f(gpu.splat.uniforms.uAspect, aspect);
      gl.useProgram(gpu.wind.program);
      gl.uniform2f(gpu.wind.uniforms.uSheet, aspect, next.simHeight);
    }
    // The racks share one responsive camera; crop variation is seeded for this visit.
    const field = grassField(root.clientWidth, root.clientHeight);
    const terrain = createRandom(seed ^ 0x51ed270b);
    const phaseX = terrain() * 40;
    const phaseY = terrain() * 40;
    for (const item of [gpu.render, gpu.grass]) {
      gl.useProgram(item.program);
      gl.uniform4f(item.uniforms.uField, field.vanish, field.eye, field.focal, field.bottom);
      gl.uniform4f(item.uniforms.uGround, root.clientWidth / root.clientHeight, field.left, 0, 0);
      gl.uniform2f(item.uniforms.uPhase, phaseX, phaseY);
    }
    plan = next;
    return true;
  }

  /* ---------- simulation and drawing ---------- */

  /** Moves the wind toward the ink's current flow plus the gusts; `ease` = 1 sets it outright. */
  function blow(ease: number) {
    const wind = gpu!.air!;
    const drive = windDrive(intensity);
    gl!.useProgram(gpu!.wind.program);
    gl!.uniform4f(gpu!.wind.uniforms.uDrive, drive.gain, GRASS_STYLES[mode].gust, gustClock, ease);
    pass(gpu!.wind, wind[1], plan!.simWidth, plan!.simHeight, wind[0].texture, gpu!.velocity![0].texture);
    swap(wind);
  }

  /** One step: advect, force, confine, project, then carry the pigments along the new flow. */
  function step() {
    const g = gpu!;
    const velocity = g.velocity!;
    const pressure = g.pressureField!;
    const dye = g.dye!;
    const width = plan!.simWidth;
    const height = plan!.simHeight;

    sources.advance(stepIndex, width / height, height, splats);
    const count = splats.count;
    splats.count = 0;

    // Self-advection.
    gl!.useProgram(g.advect.program);
    gl!.uniform1f(g.advect.uniforms.uKeep, FLOW.velocityKeep);
    gl!.uniform1f(g.advect.uniforms.uLimit, 1500);
    pass(g.advect, velocity[1], width, height, velocity[0].texture, velocity[0].texture);
    swap(velocity);

    // Forces.
    if (count > 0) {
      gl!.useProgram(g.splat.program);
      gl!.uniform4fv(g.splat.uniforms['uPoints[0]'], splats.points);
      gl!.uniform3fv(g.splat.uniforms['uValues[0]'], splats.velocity);
      gl!.uniform1i(g.splat.uniforms.uCount, count);
      pass(g.splat, velocity[1], width, height, velocity[0].texture);
      swap(velocity);
    }
    pass(g.curl, g.scalar, width, height, velocity[0].texture);
    pass(g.confine, velocity[1], width, height, velocity[0].texture, g.scalar!.texture);
    swap(velocity);

    // Projection onto divergence-free flow: a fixed number of Jacobi sweeps, warm-started.
    pass(g.divergence, g.scalar, width, height, velocity[0].texture);
    gl!.useProgram(g.pressure.program);
    gl!.uniform1f(g.pressure.uniforms.uKeep, FLOW.pressureKeep);
    for (let sweep = 0; sweep < plan!.pressureIterations; sweep += 1) {
      if (sweep === 1) gl!.uniform1f(g.pressure.uniforms.uKeep, 1);
      pass(g.pressure, pressure[1], width, height, pressure[0].texture, g.scalar!.texture);
      swap(pressure);
    }
    pass(g.project, velocity[1], width, height, velocity[0].texture, pressure[0].texture);
    swap(velocity);

    // Pigments.
    if (count > 0) {
      gl!.useProgram(g.splat.program);
      gl!.uniform3fv(g.splat.uniforms['uValues[0]'], splats.dye);
      pass(g.splat, dye[1], plan!.dyeWidth, plan!.dyeHeight, dye[0].texture);
      swap(dye);
    }
    gl!.useProgram(g.advect.program);
    gl!.uniform1f(g.advect.uniforms.uKeep, FLOW.dyeKeep);
    gl!.uniform1f(g.advect.uniforms.uLimit, FLOW.dyeLimit);
    pass(g.advect, dye[1], plan!.dyeWidth, plan!.dyeHeight, velocity[0].texture, dye[0].texture);
    swap(dye);
    stepIndex += 1;
    gustClock += STEP_SECONDS * windDrive(intensity).pace;
    blow(GRASS.windEase);
  }
  function simulate(steps: number) {
    for (let index = 0; index < steps; index += 1) step();
  }
  function draw() {
    const sun = sunlight(intensity);
    gl!.useProgram(gpu!.render.program);
    gl!.uniform2f(gpu!.render.uniforms.uInk, stepIndex * STEP_SECONDS, sun);
    // Three layers, back to front: the racks behind the crop, the crop, the frame in front of it.
    gl!.uniform1i(gpu!.render.uniforms.uLayer, 0);
    pass(gpu!.render, null, canvas.width, canvas.height, gpu!.dye![0].texture, gpu!.air![0].texture);
    // The grass: every blade in one instanced strip, over the picture just drawn.
    const style = GRASS_STYLES[mode];
    gl!.useProgram(gpu!.grass.program);
    gl!.uniform4f(gpu!.grass.uniforms.uShape, style.height, style.sway, style.curl, style.lean);
    gl!.uniform4f(gpu!.grass.uniforms.uLight, style.warmth, style.sheen, stepIndex * STEP_SECONDS, canvas.height);
    gl!.uniform4f(gpu!.grass.uniforms.uCount, plan!.blades, plan!.bladeSegments, 0, sun);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, gpu!.air![0].texture);
    gl!.enable(gl!.BLEND);
    gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, 2 * plan!.bladeSegments + 2, plan!.blades);
    gl!.useProgram(gpu!.render.program);
    gl!.uniform1i(gpu!.render.uniforms.uLayer, 1);
    pass(gpu!.render, null, canvas.width, canvas.height, gpu!.dye![0].texture, gpu!.air![0].texture);
    gl!.disable(gl!.BLEND);
    if (canvas.dataset.ready !== 'true') {
      canvas.dataset.ready = 'true';
      canvas.style.visibility = 'visible';
    }
  }
  /** One frame outside the loop: the first image, and resizes while not running. */
  function drawStill() {
    if (!gpu || frame !== 0) return;
    try {
      if ((sizeDirty || !plan) && !applySize()) return;
      if (plan) draw();
    } catch { fail(); }
  }
  function fail() {
    release();
    canvas.style.visibility = 'hidden';
    delete canvas.dataset.ready;
    refresh();
  }

  /* ---------- pointer ---------- */

  function onPointerMove(event: PointerEvent) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved = true;
  }
  function onPointerDown(event: PointerEvent) {
    onPointerMove(event);
    pointer.pressed = true;
    pointer.tracking = false; // a new touch is not a stroke from the previous one
  }
  /** Turns the latest pointer position into ink and motion; the rect is read at most once per frame. */
  function consumePointer() {
    if (!pointer.moved) return;
    pointer.moved = false;
    const pressed = pointer.pressed;
    pointer.pressed = false;
    const rect = canvas.getBoundingClientRect();
    const x = (pointer.x - rect.left) / rect.width;
    const y = 1 - (pointer.y - rect.top) / rect.height;
    if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) { pointer.tracking = false; return; }
    const cells = plan!.simHeight;
    const aspect = plan!.simWidth / cells;
    if (pressed) {
      // A press drops a blot of the next colour.
      pointer.pigment = (pointer.pigment + 1) % PIGMENTS.length;
      pushSplat(splats, x, y, POINTER_PRESS_RADIUS, 0, 0, pointer.pigment, 0.9);
    }
    // Movement in cells, so a stroke means the same on any grid.
    const dx = (x - pointer.lastX) * aspect * cells;
    const dy = (y - pointer.lastY) * cells;
    const distance = Math.hypot(dx, dy);
    if (!pointer.tracking || distance > 0.4 * cells) {
      pointer.tracking = true;
    } else if (distance < 0.4) {
      return; // keep the anchor so slow movement still adds up to a stroke
    } else {
      // A stroke drags the liquid along and leaves ink behind; faster strokes push harder, up to a limit.
      const push = Math.min(9, 0.9 * distance) / distance;
      pushSplat(splats, x, y, POINTER_STROKE_RADIUS, dx * push * cells * 0.25, dy * push * cells * 0.25, pointer.pigment, Math.min(0.35, 0.06 * distance));
    }
    pointer.lastX = x;
    pointer.lastY = y;
  }

  /* ---------- loop and lifecycle ---------- */

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const elapsed = lastFrame < 0 ? 0 : now - lastFrame;
    if (lastFrame >= 0 && elapsed < MIN_FRAME_MS) return;
    lastFrame = now;
    try {
      const level = governor.sample(elapsed);
      if (level !== quality) { quality = level; sizeDirty = true; }
      if ((sizeDirty || !plan) && !applySize()) return;
      consumePointer();
      const steps = clock.advance(elapsed / 1000);
      simulate(steps);
      draw();
    } catch { fail(); }
  }
  function start() {
    if (frame !== 0) return;
    lastFrame = -1;
    clock.reset();
    governor.resume();
    pointer.moved = pointer.pressed = pointer.tracking = false;
    if (!listening) {
      listening = true;
      // Passive and on the window: the backdrop never captures input, so scrolling and the controls are unaffected.
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerdown', onPointerDown, { passive: true });
    }
    frame = requestAnimationFrame(tick);
  }
  function stop() {
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    if (listening) {
      listening = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
    }
  }
  function refresh() {
    if (disposed) return;
    const activity = resolveActivity({
      available: gpu !== null,
      reducedMotion,
      paused,
      documentVisible: document.visibilityState !== 'hidden',
      inView,
    });
    root.dataset.state = activity;
    if (activity === 'running') start(); else stop();
  }
  /** After the buffers exist: a short run-up, the wind as it would have settled, and the first frame. */
  function open() {
    simulate(reducedMotion ? STATIC_WARMUP_STEPS : WARMUP_STEPS);
    blow(1);
    draw();
  }
  /** Programs, buffers, the opening composition and one frame on screen. */
  function prepare() {
    if (!build()) return;
    try {
      if (!applySize()) return; // not laid out yet: the resize observer will try again
      open();
    } catch { fail(); }
  }

  function onContextLost(event: Event) {
    event.preventDefault(); // allows the browser to restore it later
    targets.clear();
    gpu = null; // the objects died with the context; there is nothing to delete
    plan = null;
    canvas.style.visibility = 'hidden';
    delete canvas.dataset.ready;
    refresh();
  }
  function onContextRestored() {
    if (disposed) return;
    prepare();
    refresh();
  }
  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => {
      sizeDirty = true;
      if (!gpu) return;
      if (!plan) {
        // First layout after mounting at zero size.
        try { if (applySize()) open(); } catch { fail(); }
      } else {
        drawStill();
      }
    })
    : null;
  const intersectionObserver = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((entries) => {
      inView = entries[entries.length - 1].isIntersecting;
      refresh();
    })
    : null;

  canvas.style.visibility = 'hidden';
  if (gl) {
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
    prepare();
  }
  document.addEventListener('visibilitychange', refresh);
  resizeObserver?.observe(root);
  intersectionObserver?.observe(root);
  refresh();

  return {
    setPaused(next: boolean) {
      if (disposed || paused === next) return;
      paused = next;
      refresh();
    },
    setStyle(nextMode: GrassMode, nextIntensity: number) {
      const next = Math.min(1, Math.max(0, nextIntensity));
      if (disposed || (mode === nextMode && intensity === next)) return;
      mode = nextMode;
      intensity = next;
      drawStill(); // while paused or still, the new look shows at once; the wind itself waits
    },
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      release();
      canvas.style.visibility = 'hidden';
      delete canvas.dataset.ready;
    },
  };
}
