import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export type SceneMode = 'bloom' | 'geometry' | 'interference';
export interface SignalSceneProps {
  mode: SceneMode;
  intensity: number; // 0..1
  paused: boolean;
}

/* ---------- tuning ---------- */
const SLICE_COUNT = 7;
const SLICE_SPACING = 0.5;
const MODE_TARGETS: Record<SceneMode, { bloom: number; interf: number; slice: number; lattice: number; facet: number }> = {
  bloom: { bloom: 1.0, interf: 0.25, slice: 0.3, lattice: 0.12, facet: 0.0 },
  geometry: { bloom: 0.55, interf: 0.15, slice: 1.0, lattice: 0.9, facet: 0.85 },
  interference: { bloom: 0.8, interf: 1.0, slice: 0.7, lattice: 0.4, facet: 0.3 },
};
const damp = THREE.MathUtils.damp;

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

const BLOOM_VERT = /* glsl */ `
uniform float uTime, uBloom, uInterf, uAmp;
uniform vec2 uPointer;
varying vec3 vWorld, vNormalS;
varying float vFold;
${NOISE}
float foldAt(vec3 p, float t){
  float theta = atan(p.z, p.x);
  float lobes = 0.5 + 0.5 * cos(5.0 * theta + 1.6 * sin(p.y * 2.2 + t * 0.35) + 0.6 * p.y);
  return pow(lobes, 2.4);
}
vec3 displace(vec3 p){
  float t = uTime;
  float fold = foldAt(p, t);
  float n1 = snoise(p * 1.5 + vec3(0.0, t * 0.22, 0.0));
  float n2 = snoise(p * 3.4 - vec3(t * 0.12, 0.0, t * 0.09));
  float petal = fold * (0.42 + 0.28 * n1) + 0.10 * n2;
  float bud = 0.65 + 0.35 * smoothstep(-1.0, 1.0, p.y);
  vec3 s1 = vec3(uPointer.x * 1.6, uPointer.y * 1.6, 1.3);
  vec3 s2 = vec3(-uPointer.y * 1.2, -1.1, -uPointer.x * 1.2);
  float waves = sin(length(p - s1) * 13.0 - t * 2.6) + sin(length(p - s2) * 11.0 - t * 2.1);
  float r = 1.0 + uAmp * (uBloom * petal * bud + uInterf * 0.055 * waves);
  return p * r;
}
void main(){
  vec3 p = normalize(position);
  vec3 t1 = normalize(cross(p, abs(p.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(p, t1);
  float e = 0.012;
  vec3 d0 = displace(p);
  vec3 d1 = displace(normalize(p + t1 * e));
  vec3 d2 = displace(normalize(p + t2 * e));
  vNormalS = normalize(normalMatrix * cross(d1 - d0, d2 - d0));
  vFold = foldAt(p, uTime);
  vec4 w = modelMatrix * vec4(d0, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const BLOOM_FRAG = /* glsl */ `
uniform float uTime, uSlice, uFacet, uLattice, uInterf, uSlide, uSpacing;
uniform vec3 uSliceN;
uniform vec2 uPointer;
varying vec3 vWorld, vNormalS;
varying float vFold;
void main(){
  vec3 faceted = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 N = normalize(mix(normalize(vNormalS), faceted, uFacet));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 L = normalize(vec3(-0.55, 0.85, 0.6));
  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 64.0);
  vec3 ivory = vec3(0.96, 0.94, 0.88);
  vec3 cyan = vec3(0.38, 0.86, 1.0);
  vec3 amber = vec3(1.0, 0.64, 0.24);
  vec3 col = mix(vec3(0.015, 0.03, 0.07), vec3(0.12, 0.24, 0.40), diff);
  col += ivory * diff * diff * 0.5 + cyan * fres * 0.75 + ivory * spec * 0.55;
  col += vFold * cyan * 0.06;
  #ifdef HALO
    gl_FragColor = vec4(cyan * pow(1.0 - abs(dot(N, V)), 2.5) * 0.28, 1.0);
    return;
  #endif
  // slicing planes cutting through the surface (same planes drawn as meshes)
  float d = dot(vWorld, uSliceN) - uSlide;
  float k = d / uSpacing;
  float f = abs(fract(k + 0.5) - 0.5);
  float w = fwidth(k) * 1.4;
  float band = (1.0 - smoothstep(0.0, w, f)) * step(abs(round(k)), 3.5);
  float isAmber = step(0.86, fract(round(k) * 0.618 + 0.3));
  col += band * uSlice * mix(cyan, amber, isAmber) * 1.1;
  // articulated lattice etched into the form
  vec3 gp = vWorld * 3.6 + vec3(uPointer * 0.4, uTime * 0.05);
  vec3 g = abs(fract(gp) - 0.5);
  float gw = fwidth(gp.x) * 1.2;
  float lat = 1.0 - smoothstep(0.0, gw, min(min(g.x, g.y), g.z));
  col += lat * uLattice * 0.16 * ivory;
  // interference rings in shading
  col += uInterf * 0.06 * cyan * (0.5 + 0.5 * sin(dot(vWorld, vec3(2.0, 3.0, 1.0)) * 6.0 - uTime * 2.0));
  gl_FragColor = vec4(col, 1.0);
}`;

const PLANE_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PLANE_FRAG = /* glsl */ `
uniform float uOpacity, uAmber, uTime;
varying vec2 vUv;
void main(){
  vec2 c = (vUv - 0.5) * 2.0;
  float r = length(c);
  float mask = smoothstep(1.0, 0.25, r);
  vec2 g = abs(fract(vUv * 14.0) - 0.5);
  float gw = fwidth(vUv.x * 14.0) * 1.2;
  float grid = 1.0 - smoothstep(0.0, gw, min(g.x, g.y));
  float ring = 1.0 - smoothstep(0.0, 0.03, abs(r - 0.62 - 0.03 * sin(uTime * 0.7)));
  vec3 cyan = vec3(0.38, 0.86, 1.0); vec3 amber = vec3(1.0, 0.64, 0.24);
  vec3 col = mix(cyan, amber, uAmber);
  float a = mask * (0.035 + grid * 0.16 + ring * 0.35) * uOpacity;
  gl_FragColor = vec4(col * a, a);
}`;

/* ---------- scene ---------- */
interface PointerRef { x: number; y: number; active: boolean }

function Artwork({ mode, intensity, paused, pointer }: SignalSceneProps & { pointer: React.RefObject<PointerRef> }) {
  const slicesRef = useRef<THREE.Group>(null);
  const latticeRef = useRef<THREE.LineSegments>(null);
  const camera = useThree((s) => s.camera);
  const state = useRef({ t: 0, px: 0, py: 0, ...MODE_TARGETS.interference, amp: 1 });
  const planeMats = useRef<THREE.ShaderMaterial[]>([]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 }, uBloom: { value: 0.8 }, uInterf: { value: 1 }, uAmp: { value: 1 },
      uSlice: { value: 0.7 }, uFacet: { value: 0.3 }, uLattice: { value: 0.4 },
      uSlide: { value: 0 }, uSpacing: { value: SLICE_SPACING },
      uSliceN: { value: new THREE.Vector3(0, 0, 1) }, uPointer: { value: new THREE.Vector2() },
    }),
    [],
  );
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 48), []);
  const latticeGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.05, 1)), []);
  const planeGeo = useMemo(() => new THREE.PlaneGeometry(4.2, 4.2), []);
  useEffect(() => () => { geometry.dispose(); latticeGeo.dispose(); planeGeo.dispose(); }, [geometry, latticeGeo, planeGeo]);

  const euler = useMemo(() => new THREE.Euler(), []);
  const normal = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDelta) => {
    const s = state.current;
    const dt = Math.min(rawDelta, 0.05);
    const target = MODE_TARGETS[mode];
    const p = pointer.current;
    const lam = 3.2;
    s.px = damp(s.px, p.active ? p.x : 0, lam, dt);
    s.py = damp(s.py, p.active ? p.y : 0, lam, dt);
    s.bloom = damp(s.bloom, target.bloom, 2.4, dt);
    s.interf = damp(s.interf, target.interf * (0.35 + 0.65 * intensity), 2.4, dt);
    s.slice = damp(s.slice, target.slice * (0.3 + 0.7 * intensity), 2.4, dt);
    s.lattice = damp(s.lattice, target.lattice * (0.3 + 0.7 * intensity), 2.4, dt);
    s.facet = damp(s.facet, target.facet, 2.4, dt);
    s.amp = damp(s.amp, 0.45 + 0.75 * intensity, 2.4, dt);
    if (!paused) s.t += dt * (0.55 + 0.75 * intensity);
    const t = s.t;

    // slicing planes: shared orientation between mesh planes and surface bands
    euler.set(0.45 + s.py * 0.7 + Math.sin(t * 0.13) * 0.15, s.px * 0.9 + t * 0.09, 0.28);
    const slide = Math.sin(t * 0.32) * SLICE_SPACING * 0.5;
    const slices = slicesRef.current;
    if (slices) {
      slices.rotation.copy(euler);
      slices.children.forEach((child, i) => { child.position.z = (i - (SLICE_COUNT - 1) / 2) * SLICE_SPACING + slide; });
      normal.set(0, 0, 1).applyEuler(euler);
    }
    planeMats.current.forEach((m) => { m.uniforms.uOpacity.value = s.slice; m.uniforms.uTime.value = t; });

    const u = uniforms;
    u.uTime.value = t; u.uBloom.value = s.bloom; u.uInterf.value = s.interf; u.uAmp.value = s.amp;
    u.uSlice.value = s.slice; u.uFacet.value = s.facet; u.uLattice.value = s.lattice;
    u.uSlide.value = slide; u.uSliceN.value.copy(normal); u.uPointer.value.set(s.px, s.py);

    const lattice = latticeRef.current;
    if (lattice) {
      lattice.rotation.set(t * 0.05 - s.py * 0.3, t * 0.07 + s.px * 0.4, 0);
      (lattice.material as THREE.LineBasicMaterial).opacity = 0.05 + 0.3 * s.lattice;
    }
    camera.position.x = damp(camera.position.x, s.px * 0.35, 2, dt);
    camera.position.y = damp(camera.position.y, s.py * 0.25, 2, dt);
    camera.lookAt(0, 0, 0);
  });

  return (
    <group scale={0.84} position={[0.05, -0.04, 0]}>
      <mesh geometry={geometry} rotation={[0.2, 0.4, 0]}>
        <shaderMaterial uniforms={uniforms} vertexShader={BLOOM_VERT} fragmentShader={BLOOM_FRAG} />
      </mesh>
      <mesh geometry={geometry} rotation={[0.2, 0.4, 0]} scale={1.045}>
        <shaderMaterial
          uniforms={uniforms} vertexShader={BLOOM_VERT} fragmentShader={BLOOM_FRAG}
          defines={{ HALO: 1 }} side={THREE.BackSide} transparent blending={THREE.AdditiveBlending} depthWrite={false}
        />
      </mesh>
      <group ref={slicesRef}>
        {Array.from({ length: SLICE_COUNT }, (_, i) => {
          const k = i - (SLICE_COUNT - 1) / 2;
          const amber = ((k * 0.618 + 0.3) % 1 + 1) % 1 >= 0.86 ? 1 : 0;
          return (
            <mesh key={i} geometry={planeGeo}>
              <shaderMaterial
                ref={(m) => { if (m) planeMats.current[i] = m; }}
                uniforms={{ uOpacity: { value: 0.7 }, uAmber: { value: amber }, uTime: { value: 0 } }}
                vertexShader={PLANE_VERT} fragmentShader={PLANE_FRAG}
                transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide}
              />
            </mesh>
          );
        })}
      </group>
      <lineSegments ref={latticeRef} geometry={latticeGeo}>
        <lineBasicMaterial color="#cfe6ff" transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
    </group>
  );
}

/* ---------- shell: fallback, pointer, visibility ---------- */
const rootStyle: React.CSSProperties = {
  position: 'absolute', inset: 0, overflow: 'hidden',
  background: 'radial-gradient(120% 90% at 42% 44%, #0d1a2e 0%, #070d19 45%, #03060d 100%)',
};
const fallbackStyle: React.CSSProperties = {
  ...rootStyle,
  background:
    'radial-gradient(38% 34% at 48% 46%, rgba(97,214,255,0.28) 0%, rgba(97,214,255,0.06) 45%, transparent 70%),' +
    'repeating-linear-gradient(112deg, transparent 0 46px, rgba(97,214,255,0.12) 46px 47px),' +
    'radial-gradient(120% 90% at 42% 44%, #0d1a2e 0%, #070d19 45%, #03060d 100%)',
};

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div style={fallbackStyle} aria-hidden="true" /> : this.props.children; }
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch { return false; }
}

export default function SignalScene({ mode, intensity, paused }: SignalSceneProps) {
  const pointer = useRef<PointerRef>({ x: 0, y: 0, active: false });
  const rootRef = useRef<HTMLDivElement>(null);
  const [webgl] = useState(hasWebGL);
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden');
  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  if (!webgl) return <div style={fallbackStyle} aria-hidden="true" />;

  const onMove = (e: React.PointerEvent) => {
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
          frameloop={hidden ? 'never' : 'always'}
          camera={{ position: [0, 0, 4.4], fov: 36, near: 0.1, far: 30 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => { gl.setClearColor(0x000000, 0); gl.domElement.style.touchAction = 'pan-y'; }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Artwork mode={mode} intensity={Math.min(1, Math.max(0, intensity))} paused={paused} pointer={pointer} />
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
