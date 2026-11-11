import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { artLayout } from './artLayout';

export type SceneMode = 'bloom' | 'geometry' | 'interference';
export interface SignalSceneProps {
  mode: SceneMode;
  intensity: number; // 0..1
  paused: boolean;
}

/* ---------- tuning ---------- */
const CAMERA_Z = 4.4;
const CAMERA_FOV = 36;
/** World units per CSS px of canvas height on the z = 0 plane. */
const WORLD_HEIGHT = 2 * CAMERA_Z * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
/** Width of the yellow strokes in each state. The meadow and ink behind them are drawn by the fluid backdrop. */
const STROKE_WIDTH: Record<SceneMode, number> = { bloom: 0.3, geometry: 1.0, interference: 0.7 };
const damp = THREE.MathUtils.damp;

/* ---------- GLSL ---------- */
// Flat yellow sunbeams in screen space. They run on their own clock (uGTime), whatever the intensity.
const GRAPHIC = /* glsl */ `
uniform vec2 uResolution;
uniform float uGTime;
uniform vec2 uArtCenter; // the art area's centre, in the same height-normalised space as p
float gh(float n){ return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
vec3 graphic(vec2 pixel){
  vec2 p = (pixel - 0.5 * uResolution) / uResolution.y - uArtCenter;
  p -= uPointer * 0.03;
  float aa = 1.5 / uResolution.y;
  float gt = uGTime;
  vec3 ink = vec3(0.0);
  // Infinite flat sunbeams: only the viewport clips their length, never an interior cap.
  // Opening and closing across their width preserves edge-to-edge rays throughout each cycle.
  for (int i = 0; i < 3; i++) {
    float index = float(i);
    float h1 = gh(index + 1.0), h2 = gh(index + 11.0), h3 = gh(index + 23.0), h4 = gh(index + 37.0);
    float period = mix(6.0, 10.0, h1);
    float phase = fract(gt / period + h2);
    vec2 c = vec2(0.42 * sin(gt * 0.17 + h3 * 6.2832), 0.26 * cos(gt * 0.21 + h4 * 6.2832));
    float angle = index * 1.047198 + 0.18 * sin(gt * 0.19 + h1 * 6.2832);
    vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * (p - c);
    float aperture = smoothstep(0.02, 0.22, phase) * (1.0 - smoothstep(0.68, 0.92, phase));
    // Kept slender: the strokes are light falling across the meadow, not bars in front of it.
    float width = mix(0.010, 0.026, gh(index + 71.0)) * (0.28 + 0.42 * uSlice) * aperture;
    float line = 1.0 - smoothstep(width, width + aa, abs(q.y));
    line *= clamp(width / aa, 0.0, 1.0);
    float front = step(0.5, mod(index, 2.0));
    ink.x = max(ink.x, line * front);
    ink.z = max(ink.z, line * (1.0 - front));
  }
  return ink;
}`;

const GRAPHIC_VERT = /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const GRAPHIC_FRAG = /* glsl */ `
uniform float uSlice;
uniform vec2 uPointer;
${GRAPHIC}
void main(){
  vec3 ink = graphic(gl_FragCoord.xy);
  gl_FragColor = vec4(vec3(1.0, 0.84, 0.0), max(ink.x, ink.z));
}`;

/* ---------- scene ---------- */
interface PointerRef { x: number; y: number; active: boolean }

function Artwork({ mode, intensity, paused, pointer }: SignalSceneProps & { pointer: React.RefObject<PointerRef> }) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const frameloop = useThree((s) => s.frameloop);
  const size = useThree((s) => s.size);
  // The strokes orbit the art area's centre, which follows the canvas size declaratively,
  // so paused and reduced-motion scenes still track resizes.
  const artCenter = useMemo(() => {
    const layout = artLayout(size.width, size.height);
    const worldPerPx = WORLD_HEIGHT / Math.max(1, size.height);
    return [((layout.x - size.width / 2) * worldPerPx) / WORLD_HEIGHT, ((size.height / 2 - layout.y) * worldPerPx) / WORLD_HEIGHT] as const;
  }, [size.width, size.height]);
  // Changes made while offscreen must render when a paused canvas returns to view.
  useEffect(() => { invalidate(); }, [mode, intensity, paused, frameloop, invalidate]);
  const state = useRef({ gt: 0, px: 0, py: 0, slice: STROKE_WIDTH.interference });

  const uniforms = useMemo(
    () => ({
      uSlice: { value: 0.7 }, uResolution: { value: new THREE.Vector2(1, 1) }, uPointer: { value: new THREE.Vector2() },
      uGTime: { value: 0 }, uArtCenter: { value: new THREE.Vector2() },
    }),
    [],
  );
  const graphicGeo = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  // The material is constructed here, not as JSX props: R3F copies a `uniforms` prop into the material,
  // so per-frame writes to our uniform objects would never reach the GPU. This shares them by reference.
  const graphicMat = useMemo(
    () => new THREE.ShaderMaterial({ uniforms, vertexShader: GRAPHIC_VERT, fragmentShader: GRAPHIC_FRAG, transparent: true, depthTest: false, depthWrite: false }),
    [uniforms],
  );
  useEffect(() => () => { graphicGeo.dispose(); graphicMat.dispose(); }, [graphicGeo, graphicMat]);

  useFrame((_, rawDelta) => {
    const s = state.current;
    // Paused controls apply in one frame, without an animated transition.
    const dt = paused ? 100 : Math.min(rawDelta, 0.05);
    const p = pointer.current;
    if (!paused) {
      s.px = damp(s.px, p.active ? p.x : 0, 3.2, dt);
      s.py = damp(s.py, p.active ? p.y : 0, 3.2, dt);
      s.gt += dt;
    }
    s.slice = damp(s.slice, STROKE_WIDTH[mode] * (0.3 + 0.7 * intensity), 2.4, dt);
    const u = uniforms;
    u.uSlice.value = s.slice;
    u.uPointer.value.set(s.px, s.py); u.uGTime.value = s.gt;
    u.uArtCenter.value.set(artCenter[0], artCenter[1]);
    gl.getDrawingBufferSize(u.uResolution.value);
  });

  return <mesh geometry={graphicGeo} material={graphicMat} frustumCulled={false} />;
}

/* Runtime context loss and shader link failures never throw into React; route them to the fallback.
   Registered inside the Canvas with a symmetrical effect so StrictMode's mount/unmount/mount keeps a listener. */
function RendererGuard({ onFailure }: { onFailure: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextlost', onFailure);
    gl.debug.onShaderError = onFailure;
    canvas.dataset.sceneReady = 'true';
    if (gl.getContext().isContextLost()) onFailure();
    return () => {
      delete canvas.dataset.sceneReady;
      canvas.removeEventListener('webglcontextlost', onFailure);
      gl.debug.onShaderError = null;
    };
  }, [gl, onFailure]);
  return null;
}

/* ---------- shell: fallback, pointer, visibility, context loss ---------- */
const rootStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, overflow: 'hidden',
  background: 'transparent', // the simulated picture behind the scene must show through the root and the alpha canvas
};
function useElementSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function Fallback() {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(ref);
  const { x, y, radius } = artLayout(width || 1, height || 1);
  const style: React.CSSProperties = {
    ...rootStyle,
    background:
      // A soft green wash where the meadow would stand.
      `radial-gradient(circle ${Math.round(radius)}px at ${Math.round(x)}px ${Math.round(y)}px, rgba(63,154,120,0.5) 0%, rgba(168,206,170,0.28) 55%, transparent 100%),` +
      'repeating-linear-gradient(112deg, transparent 0 46px, rgba(229,190,0,0.5) 46px 48px)',
  };
  return <div ref={ref} style={style} aria-hidden="true" data-testid="scene-fallback" />;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Fallback /> : this.props.children; }
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch { return false; }
}

export default function SignalScene({ mode, intensity, paused }: SignalSceneProps) {
  const pointer = useRef<PointerRef>({ x: 0, y: 0, active: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const rootSize = useElementSize(rootRef);
  const layout = artLayout(rootSize.width, rootSize.height);
  const [webgl] = useState(hasWebGL);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden');
  const [inView, setInView] = useState(true);
  useEffect(() => {
    if (!rootRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const onFailure = useCallback(() => setFailed(true), []);
  if (!webgl || failed) return <Fallback />;

  const onMove = (e: React.PointerEvent) => {
    if (paused) return;
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    pointer.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1), active: true };
  };
  const onLeave = () => { pointer.current = { ...pointer.current, active: false }; };

  return (
    <div
      ref={rootRef}
      style={rootStyle}
      // Exposed for layout checks: the art area's centre and core (inner half) radius in CSS px.
      data-art-x={Math.round(layout.x)}
      data-art-y={Math.round(layout.y)}
      data-art-core={Math.round(layout.radius / 2)}
      onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={onLeave} onPointerCancel={onLeave}>
      <SceneBoundary>
        <Canvas
          dpr={[1, 1.5]}
          frameloop={hidden || !inView ? 'never' : paused ? 'demand' : 'always'}
          camera={{ position: [0, 0, CAMERA_Z], fov: CAMERA_FOV, near: 0.1, far: 30 }}
          gl={{ antialias: false, alpha: true }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); gl.domElement.style.touchAction = 'pan-y'; }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <RendererGuard onFailure={onFailure} />
          <Artwork mode={mode} intensity={Math.min(1, Math.max(0, intensity))} paused={paused} pointer={pointer} />
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
