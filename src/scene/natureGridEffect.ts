const VERTEX = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = position * 0.5 + 0.5; gl_Position = vec4(position, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform sampler2D footage;
uniform vec2 resolution, videoSize;
uniform float time, cells[6], junctions[3];
varying vec2 uv;
float hash(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
vec2 cover(vec2 p) {
  float screenRatio = resolution.x / resolution.y;
  float videoRatio = videoSize.x / videoSize.y;
  return (p - 0.5) * vec2(min(screenRatio / videoRatio, 1.0), min(videoRatio / screenRatio, 1.0)) + 0.5;
}
vec4 gridMarks() {
  vec2 junction = floor(uv * vec2(8.0, 5.0) + 0.5);
  if (junction.x < 1.0 || junction.x > 7.0 || junction.y < 1.0 || junction.y > 4.0) return vec4(0.0);
  float id = (junction.y - 1.0) * 7.0 + junction.x - 1.0;
  float chosen = 0.0;
  for (int i = 0; i < 3; i++) chosen += 1.0 - step(0.5, abs(id - junctions[i]));
  vec2 d = abs((uv - junction / vec2(8.0, 5.0)) * resolution);
  float horizontal = (1.0 - smoothstep(0.55, 1.15, d.y)) * (1.0 - smoothstep(5.0, 6.0, d.x));
  float vertical = (1.0 - smoothstep(0.55, 1.15, d.x)) * (1.0 - smoothstep(5.0, 6.0, d.y));
  float cycle = fract(time / 4.8);
  float fade = smoothstep(0.0, 0.12, cycle) * (1.0 - smoothstep(0.86, 1.0, cycle));
  float alpha = max(horizontal, vertical) * chosen * fade * mix(0.16, 0.24, hash(id + 83.0));
  // Premultiplied alpha keeps the thin grey marks soft over the DOM video.
  return vec4(vec3(0.30) * alpha, alpha);
}
void main() {
  vec2 grid = vec2(8.0, 5.0);
  vec2 cell = min(floor(uv * grid), grid - 1.0);
  float id = cell.y * 8.0 + cell.x;
  float selected = 0.0;
  for (int i = 0; i < 6; i++) selected += 1.0 - step(0.5, abs(id - cells[i]));
  vec4 marks = gridMarks();
  if (selected < 0.5) { gl_FragColor = marks; return; }
  float cycle = fract(time / 2.4);
  float envelope = smoothstep(0.0, 0.16, cycle) * (1.0 - smoothstep(0.80, 1.0, cycle));
  float seed = hash(id + floor(time / 2.4) * 41.0);
  vec2 local = fract(uv * grid);
  float stripe = floor(local.y * 11.0);
  float shift = (hash(stripe + id * 13.0) - 0.5) * 0.036;
  shift *= sin(time * 1.7 + stripe) * envelope;
  float glitch = step(0.48, seed);
  vec2 p = uv + vec2(shift * glitch, 0.0);
  vec2 lo = cell / grid + 0.5 / resolution;
  vec2 hi = (cell + 1.0) / grid - 0.5 / resolution;
  p = clamp(p, lo, hi);
  vec2 radius = vec2(mix(5.0, 1.5, glitch) * envelope) / resolution;
  vec3 blurred = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    blurred += texture2D(footage, cover(clamp(p + vec2(float(x), float(y)) * radius, lo, hi))).rgb / 9.0;
  }
  float split = 0.005 * envelope * glitch;
  blurred.r = mix(blurred.r, texture2D(footage, cover(clamp(p + vec2(split, 0.0), lo, hi))).r, glitch * 0.75);
  blurred.b = mix(blurred.b, texture2D(footage, cover(clamp(p - vec2(split, 0.0), lo, hi))).b, glitch * 0.75);
  vec3 original = texture2D(footage, cover(uv)).rgb;
  gl_FragColor = vec4(mix(original, blurred, envelope) * (1.0 - marks.a) + marks.rgb, 1.0);
}
`;

/** A video-only transparent overlay. The original DOM video remains its fallback. */
export function createNatureGridEffect(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  let frame = 0;
  let running = false;
  let failed = false;
  let video: HTMLVideoElement | null = null;
  let clock = 0;
  let last = 0;
  let lastDraw = 0;
  let bucket = -1;
  let resizeObserver: ResizeObserver | null = null;
  const seed = Math.random() * 10000;

  function pause() {
    running = false;
    cancelAnimationFrame(frame);
    canvas.dataset.state = failed ? 'unavailable' : 'paused';
  }
  function fail() {
    failed = true;
    pause();
    canvas.style.visibility = 'hidden';
  }
  function dispose() {
    pause();
    resizeObserver?.disconnect();
    canvas.removeEventListener('webglcontextlost', fail);
    gl!.deleteTexture(texture);
    gl!.deleteBuffer(buffer);
    gl!.deleteProgram(program);
    shaders.forEach((shader) => gl!.deleteShader(shader));
    canvas.style.visibility = 'hidden';
  }

  try {
    if (!program || !buffer || !texture) throw new Error('Video effect allocation failed');
    for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Video effect shader unavailable');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Video effect shader compilation failed');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Video effect linking failed');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.uniform1i(gl.getUniformLocation(program, 'footage'), 0);
  } catch {
    dispose();
    canvas.dataset.state = 'unavailable';
    return null;
  }
  const timeUniform = gl.getUniformLocation(program!, 'time');
  const sizeUniform = gl.getUniformLocation(program!, 'resolution');
  const videoUniform = gl.getUniformLocation(program!, 'videoSize');
  const cellsUniform = gl.getUniformLocation(program!, 'cells[0]');
  const junctionsUniform = gl.getUniformLocation(program!, 'junctions[0]');

  function draw() {
    if (!video || video.readyState < 2 || failed) return;
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));
    const scale = Math.min(1, 1280 / width, 900 / height);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    try {
      gl!.viewport(0, 0, w, h);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, video);
      gl!.uniform2f(sizeUniform, w, h);
      gl!.uniform2f(videoUniform, video.videoWidth, video.videoHeight);
      gl!.uniform1f(timeUniform, clock);
      const nextBucket = Math.floor(clock / 2.4);
      if (bucket !== nextBucket) {
        bucket = nextBucket;
        // Random ranking gives exactly six distinct cells, without replacement.
        const cells = Array.from({ length: 40 }, (_, id) => ({ id, rank: Math.sin(id * 127.1 + bucket * 311.7 + seed) * 43758.5453 }))
          .map((cell) => ({ ...cell, rank: cell.rank - Math.floor(cell.rank) }))
          .sort((a, b) => a.rank - b.rank).slice(0, 6).map((cell) => cell.id);
        gl!.uniform1fv(cellsUniform, cells);
        const junctions = Array.from({ length: 28 }, (_, id) => ({ id, rank: Math.sin(id * 93.7 + Math.floor(bucket / 2) * 197.3 + seed) * 43758.5453 }))
          .map((junction) => ({ ...junction, rank: junction.rank - Math.floor(junction.rank) }))
          .sort((a, b) => a.rank - b.rank).slice(0, 3).map((junction) => junction.id);
        gl!.uniform1fv(junctionsUniform, junctions);
      }
      gl!.drawArrays(gl!.TRIANGLES, 0, 6);
      if (gl!.getError() !== gl!.NO_ERROR) { fail(); return; }
      canvas.style.visibility = 'visible';
      canvas.dataset.source = video.dataset.clip;
    } catch { fail(); }
  }
  function tick(now: number) {
    if (!running || failed) return;
    clock += Math.min((now - last) / 1000, 0.1);
    last = now;
    if (now - lastDraw >= 1000 / 24) { draw(); lastDraw = now; }
    if (running) frame = requestAnimationFrame(tick);
  }
  canvas.addEventListener('webglcontextlost', fail);
  resizeObserver = new ResizeObserver(() => {
    if (running || failed || !video || document.visibilityState === 'hidden') return;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth) draw();
  });
  resizeObserver.observe(canvas);
  return {
    start(source: HTMLVideoElement) {
      if (failed) return;
      video = source;
      draw(); // Atomically replace the old clip's overlay before the DOM video switches.
      if (failed) return;
      canvas.dataset.state = 'playing';
      if (!running) {
        running = true;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    },
    pause,
    clear() { pause(); video = null; canvas.style.visibility = 'hidden'; },
    dispose,
  };
}
