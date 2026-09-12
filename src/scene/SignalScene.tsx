import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type SceneMode = 'bloom' | 'geometry' | 'interference';
export interface SignalSceneProps {
  mode: SceneMode;
  intensity: number; // 0..1
  paused: boolean;
}

/* ---------- tuning ---------- */
const PETALS = 13;
const GOLDEN = 2.399963;
const ART_SCALE = 0.84;
const ART_ORIGIN = new THREE.Vector3(0.05, -0.04, 0);
const MODE_TARGETS: Record<SceneMode, { open: number; ruffle: number; interf: number; slice: number; lattice: number; facet: number }> = {
  bloom: { open: 1.0, ruffle: 1.0, interf: 0.2, slice: 0.3, lattice: 0.1, facet: 0.0 },
  geometry: { open: 0.7, ruffle: 0.15, interf: 0.1, slice: 1.0, lattice: 0.9, facet: 0.7 },
  interference: { open: 0.85, ruffle: 0.6, interf: 1.0, slice: 0.7, lattice: 0.4, facet: 0.25 },
};
const damp = THREE.MathUtils.damp;
const hash = (n: number) => { const x = Math.sin(n * 12.9898 + 4.1414) * 43758.5453; return x - Math.floor(x); };

/* ---------- GLSL ---------- */
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const PETAL_VERT = /* glsl */ `
uniform float uTime, uRuffle, uInterf, uAmp, uOpen;
uniform vec2 uPointer;
attribute float aSeed, aLayer;
varying vec3 vWorld, vNormalS;
varying vec2 vUv;
varying float vSeed, vLayer;
${NOISE}
// A genuine petal surface: q.x across (0..1), q.y along the petal (base 0 .. tip 1).
vec3 surf(vec2 q, mat4 M){
  float t = uTime;
  float u = mix(0.004, 0.992, q.y);
  float v = q.x * 2.0 - 1.0;
  float w = pow(max(sin(u * 3.14159), 0.0), 0.62) * (1.0 - 0.22 * u);
  w *= 1.0 + 0.14 * sin(aSeed * 9.0) * v;                     // asymmetric outline
  float x = v * w * 0.38;
  float cup = -0.24 * v * v * w * (0.55 + 0.45 * uOpen);       // edges curl toward the centre
  float curl = 0.42 * u * u * uOpen * (0.7 + 0.3 * sin(aSeed * 7.0)); // tip folds outward
  float ruffle = uRuffle * uAmp * (0.055 * pow(u, 1.6) * v * v * sin(v * 4.0 + u * 7.0 + t * 0.9 + aSeed * 20.0)
                                   + 0.03 * u * snoise(vec3(v * 2.0, u * 3.0 + aSeed * 5.0, t * 0.25)));
  vec3 P = vec3(x, u, cup + curl + ruffle);
  vec3 W = (M * vec4(P, 1.0)).xyz;                             // interference lives in world space
  vec3 s1 = vec3(uPointer.x * 1.4, uPointer.y * 1.2, 1.2);
  vec3 s2 = vec3(-uPointer.y * 1.1, -0.9, -uPointer.x * 1.1);
  float waves = sin(length(W - s1) * 11.0 - t * 2.4) + sin(length(W - s2) * 9.0 - t * 1.9);
  P.z += uInterf * uAmp * 0.035 * waves * u;
  return P;
}
void main(){
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
    M = modelMatrix * instanceMatrix;
  #endif
  float e = 0.006;
  vec3 P = surf(uv, M);
  vec3 Pu = surf(uv + vec2(0.0, e), M);
  vec3 Pv = surf(uv + vec2(e, 0.0), M);
  // All lighting vectors are world-space; instances only use uniform scaling.
  vNormalS = normalize(mat3(M) * cross(Pv - P, Pu - P));
  vec4 w = M * vec4(P, 1.0);
  vWorld = w.xyz; vUv = uv; vSeed = aSeed; vLayer = aLayer;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

// Shared screen coordinates keep the graphic perfectly flat across the 3D silhouette.
// The strokes run on their own clock (uGTime), independent of the flower's intensity-scaled time.
const GRAPHIC = /* glsl */ `
uniform vec2 uResolution;
uniform float uGTime;
float gh(float n){ return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
vec3 graphic(vec2 pixel){
  vec2 p = (pixel - 0.5 * uResolution) / uResolution.y;
  p -= uPointer * 0.03;
  float aa = 1.5 / uResolution.y;
  float gt = uGTime;
  vec3 ink = vec3(0.0);
  // Solid flat strokes, square caps, no glow. Each one drifts, turns, stretches and wipes on/off
  // on its own slow cycle so appearances stagger instead of pulsing together.
  for (int i = 0; i < 6; i++) {
    float index = float(i);
    float h1 = gh(index + 1.0), h2 = gh(index + 11.0), h3 = gh(index + 23.0), h4 = gh(index + 37.0), h5 = gh(index + 53.0);
    float period = mix(6.0, 10.0, h1);
    float phase = fract(gt / period + h2);
    vec2 c = vec2(0.42 * sin(gt * 0.17 + h3 * 6.2832), 0.26 * cos(gt * 0.21 + h4 * 6.2832));
    float angle = mix(-0.55, 0.75, h5) + 0.4 * sin(gt * 0.27 + h1 * 6.2832) + (phase - 0.5) * 0.3;
    float len = mix(0.2, 0.6, 0.5 + 0.5 * sin(gt * 0.23 + h2 * 6.2832));
    vec2 q = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * (p - c);
    float width = mix(0.010, 0.026, gh(index + 71.0)) * (0.6 + 0.5 * uSlice);
    float line = 1.0 - smoothstep(width, width + aa, abs(q.y));
    float head = mix(-len, len, smoothstep(0.0, 0.3, phase));
    float tail = mix(-len, len, smoothstep(0.6, 0.9, phase));
    line *= smoothstep(tail, tail + aa, q.x) * (1.0 - smoothstep(head, head + aa, q.x));
    float front = step(0.5, mod(index, 2.0));
    ink.x = max(ink.x, line * front);
    ink.z = max(ink.z, line * (1.0 - front));
  }
  return ink;
}`;

const PETAL_FRAG = /* glsl */ `
uniform float uTime, uSlice, uFacet, uLattice, uInterf;
uniform vec2 uPointer;
varying vec3 vWorld, vNormalS;
varying vec2 vUv;
varying float vSeed, vLayer;
void main(){
  // split tip on some petals: a negative space cut into the form
  float slit = step(0.62, vSeed) * step(0.78, vUv.y) * step(abs(vUv.x - 0.5), 0.035 * smoothstep(0.78, 1.0, vUv.y) * 2.5);
  if (slit > 0.5) discard;
  vec3 faceted = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 N = normalize(mix(normalize(vNormalS), faceted, uFacet));
  vec3 V = normalize(cameraPosition - vWorld);
  if (dot(N, V) < 0.0) N = -N;
  vec3 L = normalize(vec3(-0.5, 0.9, 0.7));
  float diff = dot(N, L) * 0.5 + 0.5;                          // wrapped, porcelain-soft
  float back = max(dot(-N, L), 0.0);                           // light through the membrane
  float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
  vec3 H = normalize(L + V);
  float sheen = pow(max(dot(N, H), 0.0), 40.0);
  vec3 pearl = vec3(0.57, 0.86, 0.95);
  vec3 aqua = vec3(0.22, 0.71, 0.86);
  vec3 ice = vec3(0.72, 0.93, 0.98);
  vec3 cool = vec3(0.35, 0.62, 0.75);
  vec3 tint = mix(aqua, ice, smoothstep(0.1, 0.95, vUv.y) * (0.5 + 0.5 * sin(vSeed * 6.2832)));
  vec3 base = mix(pearl, tint, (0.22 + 0.3 * vUv.y) * (1.0 - 0.5 * vLayer));
  vec3 col = base * mix(cool, vec3(1.0), diff);
  col += ice * back * 0.16 * (0.3 + vUv.y);
  col += sheen * 0.10;
  col *= 1.0 - 0.28 * fres;                                    // contour darkening reads on ivory
  col = mix(col, cool * 0.9, (1.0 - smoothstep(0.0, 0.02, abs(vUv.x - 0.5))) * 0.35 * (1.0 - vUv.y)); // midrib
  // interference shading rings
  col -= uInterf * 0.045 * (0.5 + 0.5 * sin(dot(vWorld, vec3(2.0, 3.0, 1.0)) * 6.0 - uTime * 2.0));
  float a = 1.0 - 0.35 * fres * smoothstep(0.55, 1.0, vUv.y);
  gl_FragColor = vec4(col, a);
}`;

const GRAPHIC_VERT = /* glsl */ `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const GRAPHIC_FRAG = /* glsl */ `
uniform float uTime, uSlice, uLattice;
uniform vec2 uPointer;
uniform float uFront;
${GRAPHIC}
void main(){
  vec3 ink = graphic(gl_FragCoord.xy);
  gl_FragColor = vec4(vec3(1.0, 0.84, 0.0), mix(ink.z, ink.x, uFront));
}`;

/* ---------- scene ---------- */
interface PointerRef { x: number; y: number; active: boolean }

function Artwork({ mode, intensity, paused, pointer }: SignalSceneProps & { pointer: React.RefObject<PointerRef> }) {
  const petalsRef = useRef<THREE.InstancedMesh>(null);
  const flowerRef = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const frameloop = useThree((s) => s.frameloop);
  // Changes made while offscreen must render when a paused canvas returns to view.
  useEffect(() => { invalidate(); }, [mode, intensity, paused, frameloop, invalidate]);
  const state = useRef({ t: 0, gt: 0, px: 0, py: 0, ...MODE_TARGETS.interference, amp: 1 });

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 }, uOpen: { value: 0.85 }, uRuffle: { value: 0.6 }, uInterf: { value: 1 }, uAmp: { value: 1 },
      uSlice: { value: 0.7 }, uFacet: { value: 0.25 }, uLattice: { value: 0.4 },
      uResolution: { value: new THREE.Vector2(1, 1) }, uPointer: { value: new THREE.Vector2() }, uGTime: { value: 0 },
    }),
    [],
  );
  const petalGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, 1, 28, 56);
    geo.translate(0.5, 0.5, 0); // unused: surf() rebuilds positions from uv
    const seeds = new Float32Array(PETALS);
    const layers = new Float32Array(PETALS);
    for (let i = 0; i < PETALS; i++) { seeds[i] = hash(i + 1); layers[i] = i / (PETALS - 1); }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute('aLayer', new THREE.InstancedBufferAttribute(layers, 1));
    return geo;
  }, []);
  const graphicGeo = useMemo(() => new THREE.PlaneGeometry(2, 2), []);
  // Materials are constructed here, not as JSX props: R3F copies a `uniforms` prop into the material,
  // so per-frame writes to our uniform objects would never reach the GPU. These share them by reference.
  const petalMat = useMemo(
    () => new THREE.ShaderMaterial({ uniforms, vertexShader: PETAL_VERT, fragmentShader: PETAL_FRAG, side: THREE.DoubleSide, transparent: true }),
    [uniforms],
  );
  const graphicMat = (front: number) =>
    new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uFront: { value: front } }, vertexShader: GRAPHIC_VERT, fragmentShader: GRAPHIC_FRAG,
      transparent: true, depthTest: false, depthWrite: false,
    });
  const backMat = useMemo(() => graphicMat(0), [uniforms]); // eslint-disable-line react-hooks/exhaustive-deps
  const frontMat = useMemo(() => graphicMat(1), [uniforms]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => () => { petalGeo.dispose(); graphicGeo.dispose(); petalMat.dispose(); backMat.dispose(); frontMat.dispose(); },
    [petalGeo, graphicGeo, petalMat, backMat, frontMat],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, rawDelta) => {
    const s = state.current;
    // Paused controls apply in one frame, without an animated transition.
    const dt = paused ? 100 : Math.min(rawDelta, 0.05);
    const target = MODE_TARGETS[mode];
    const p = pointer.current;
    const lam = 3.2;
    if (!paused) {
      s.px = damp(s.px, p.active ? p.x : 0, lam, dt);
      s.py = damp(s.py, p.active ? p.y : 0, lam, dt);
    }
    s.open = damp(s.open, target.open, 2.4, dt);
    s.ruffle = damp(s.ruffle, target.ruffle, 2.4, dt);
    s.interf = damp(s.interf, target.interf * (0.35 + 0.65 * intensity), 2.4, dt);
    s.slice = damp(s.slice, target.slice * (0.3 + 0.7 * intensity), 2.4, dt);
    s.lattice = damp(s.lattice, target.lattice * (0.3 + 0.7 * intensity), 2.4, dt);
    s.facet = damp(s.facet, target.facet, 2.4, dt);
    s.amp = damp(s.amp, 0.45 + 0.75 * intensity, 2.4, dt);
    if (!paused) { s.t += dt * (0.55 + 0.75 * intensity); s.gt += dt; }
    const t = s.t;

    // petal arrangement: a golden-angle spiral, inner petals closed, outer petals opening
    const petals = petalsRef.current;
    if (petals) {
      for (let i = 0; i < PETALS; i++) {
        const layer = i / (PETALS - 1);
        const angle = i * GOLDEN + 0.4 * (hash(i + 31) - 0.5);
        const open = (0.2 + 1.15 * Math.pow(layer, 0.85)) * s.open * (1 + 0.06 * Math.sin(t * 0.45 + i)) + 0.25 * (hash(i + 7) - 0.5);
        const scale = (0.62 + 0.7 * layer) * (0.88 + 0.24 * hash(i + 3)) * 1.35;
        const r = 0.05 + 0.17 * layer;
        dummy.position.set(Math.sin(angle) * r, -0.35 - 0.22 * layer, Math.cos(angle) * r);
        dummy.rotation.set(open, angle, 0.3 * (hash(i + 11) - 0.5), 'YXZ');
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        petals.setMatrixAt(i, dummy.matrix);
      }
      petals.instanceMatrix.needsUpdate = true;
    }
    const flower = flowerRef.current;
    if (flower) flower.rotation.set(0.62 - s.py * 0.28, -0.35 + t * 0.045 + s.px * 0.35, -0.18);

    const u = uniforms;
    u.uTime.value = t; u.uOpen.value = s.open; u.uRuffle.value = s.ruffle; u.uInterf.value = s.interf; u.uAmp.value = s.amp;
    u.uSlice.value = s.slice; u.uFacet.value = s.facet; u.uLattice.value = s.lattice;
    u.uPointer.value.set(s.px, s.py); u.uGTime.value = s.gt;
    gl.getDrawingBufferSize(u.uResolution.value);
    if (!paused) {
      camera.position.x = damp(camera.position.x, s.px * 0.35, 2, dt);
      camera.position.y = damp(camera.position.y, s.py * 0.25, 2, dt);
    }
    camera.lookAt(0, 0, 0);
  });

  return (
    <group scale={ART_SCALE} position={ART_ORIGIN}>
      <ambientLight intensity={1.9} color="#f4f0ee" />
      <directionalLight position={[-2, 3.5, 3]} intensity={1.3} color="#ffffff" />
      <group ref={flowerRef}>
        <instancedMesh ref={petalsRef} args={[petalGeo, petalMat, PETALS]} frustumCulled={false} />
        <mesh position={[0, -0.32, 0]}>
          <sphereGeometry args={[0.12, 32, 24]} />
          <meshStandardMaterial color="#94d8e8" roughness={0.45} metalness={0} />
        </mesh>
      </group>
      <mesh geometry={graphicGeo} material={backMat} frustumCulled={false} renderOrder={-10} />
      <mesh geometry={graphicGeo} material={frontMat} frustumCulled={false} renderOrder={10} />
    </group>
  );
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
  background: 'transparent', // a video layer behind the scene must show through the root and the alpha canvas
};
const fallbackStyle: React.CSSProperties = {
  ...rootStyle,
  background:
    'radial-gradient(34% 30% at 50% 48%, rgba(104,201,232,0.65) 0%, rgba(166,224,241,0.3) 45%, transparent 72%),' +
    'repeating-linear-gradient(112deg, transparent 0 46px, rgba(229,190,0,0.5) 46px 48px)',
};
const Fallback = () => <div style={fallbackStyle} aria-hidden="true" data-testid="scene-fallback" />;

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
    <div ref={rootRef} style={rootStyle} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={onLeave} onPointerCancel={onLeave}>
      <SceneBoundary>
        <Canvas
          dpr={[1, 1.5]}
          frameloop={hidden || !inView ? 'never' : paused ? 'demand' : 'always'}
          camera={{ position: [0, 0, 4.4], fov: 36, near: 0.1, far: 30 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
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
