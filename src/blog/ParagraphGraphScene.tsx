import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { GraphCanvas, lightTheme, type GraphCanvasRef, type GraphEdge as SceneEdge, type GraphNode as SceneNode, type Theme } from 'reagraph';
import { Vector3 } from 'three';
import type { Point } from './graphLayout';
import { wheelFactor } from './graphCamera';

/**
 * Client-only: this module pulls in Reagraph and three.js, so ParagraphGraph loads it with a dynamic import.
 * Reagraph owns the WebGL drawing, hit testing, node dragging and the wheel / pinch / drag camera.
 * Everything typographic stays in the DOM (see `labels`) so Japanese text never needs a remote font.
 */
export interface SceneView { x: number; y: number; zoom: number; width: number; height: number }
export interface SceneHandle {
  /** World centre and absolute zoom (screen px per world unit). */
  moveTo: (x: number, y: number, zoom: number, animated: boolean) => void;
  zoomBy: (factor: number, animated: boolean) => void;
  panBy: (dx: number, dy: number) => void;
  view: () => SceneView | undefined;
  /** Screen position of a world point, for touch hit testing. */
  project: (point: Point) => Point | undefined;
}
export interface SceneRing { x: number; y: number; radius: number; color: string }
/** `radius` is in world units. Reagraph rescales `size` relative to the other nodes, so the scene draws from this instead. */
export interface SceneNodeData { kind: 'article' | 'node' | 'concept'; ref: string; radius: number; fill: string; stroke: string; opacity: number; ring?: string; diamond?: boolean }
export interface SceneEdgeData { kind: 'link' | 'relation'; ref: string }
interface Props {
  nodes: SceneNode[];
  edges: SceneEdge[];
  positions: (id: string) => Point | undefined;
  rings: SceneRing[];
  background: string;
  accent: string;
  minZoom: number;
  maxZoom: number;
  /** Container whose children carry `data-wx` / `data-wy` world coordinates and follow the camera. */
  labels: RefObject<HTMLDivElement | null>;
  onReady: () => void;
  onView: (view: SceneView, resting: boolean) => void;
  onNode: (data: SceneNodeData) => void;
  onEdge: (data: SceneEdgeData) => void;
  onBackground: (event: MouseEvent) => void;
  onHover: (data: SceneNodeData | SceneEdgeData | undefined) => void;
  onDragged: (id: string, point: Point) => void;
}

const scratch = new Vector3();

/** Keeps DOM labels glued to their world points without a React render per frame. */
function LabelProjector({ container, viewport }: { container: RefObject<HTMLDivElement | null>; viewport: RefObject<{ width: number; height: number }> }) {
  useFrame(({ camera, size }) => {
    viewport.current = { width: size.width, height: size.height };
    const element = container.current;
    if (!element) return;
    for (const child of element.children) {
      const label = child as HTMLElement;
      const wx = Number(label.dataset.wx), wy = Number(label.dataset.wy);
      if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
      scratch.set(wx, -wy, 0).project(camera);
      const x = (scratch.x + 1) / 2 * size.width;
      label.style.transform = `translate(${x.toFixed(1)}px, ${((1 - scratch.y) / 2 * size.height).toFixed(1)}px)`;
      // Centred labels slide sideways just enough to stay readable at the edge; the node itself never moves.
      const clamped = label.querySelector<HTMLElement>('[data-clamp]');
      if (clamped && x > -40 && x < size.width + 40) {
        const half = clamped.offsetWidth / 2 + 6;
        const shift = half * 2 >= size.width ? 0 : Math.max(half - x, 0) + Math.min(size.width - half - x, 0);
        clamped.style.setProperty('--shift', `${shift.toFixed(1)}px`);
      }
    }
  });
  return null;
}

const ParagraphGraphScene = forwardRef<SceneHandle, Props>(function ParagraphGraphScene(props, ref) {
  const canvas = useRef<GraphCanvasRef>(null);
  const viewport = useRef({ width: 0, height: 0 });
  const pendingZoom = useRef<number | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;
  const theme = useMemo<Theme>(() => ({
    ...lightTheme,
    canvas: { background: props.background },
    // Hover and selection are expressed by this site's own colours, never Reagraph's default highlight.
    node: { ...lightTheme.node, activeFill: props.accent, opacity: 1, selectedOpacity: 1, inactiveOpacity: 1 },
    edge: { ...lightTheme.edge, activeFill: props.accent, opacity: 1, selectedOpacity: 1, inactiveOpacity: 1 },
    ring: { fill: props.accent, activeFill: props.accent },
    arrow: { fill: props.accent, activeFill: props.accent },
  }), [props.background, props.accent]);

  const read = (): SceneView | undefined => {
    const controls = canvas.current?.getControls();
    if (!controls || !viewport.current.width) return undefined;
    const target = controls.getTarget(scratch);
    return { x: target.x, y: -target.y, zoom: controls.camera.zoom, ...viewport.current };
  };
  useImperativeHandle(ref, () => ({
    moveTo: (x, y, zoom, animated) => {
      const controls = canvas.current?.getControls();
      if (!controls) return;
      pendingZoom.current = undefined;
      void controls.moveTo(x, -y, 0, animated);
      void controls.zoomTo(zoom, animated);
    },
    zoomBy: (factor, animated) => {
      const controls = canvas.current?.getControls();
      if (!controls) return;
      // Repeated steps build on the pending target, not on a zoom that is still animating.
      const next = Math.max(controls.minZoom, Math.min(controls.maxZoom, (pendingZoom.current ?? controls.camera.zoom) * factor));
      pendingZoom.current = animated ? next : undefined;
      void controls.zoomTo(next, animated);
    },
    panBy: (dx, dy) => {
      const controls = canvas.current?.getControls();
      if (controls) void controls.truck(-dx / controls.camera.zoom, -dy / controls.camera.zoom, false);
    },
    view: read,
    project: point => {
      const controls = canvas.current?.getControls();
      const view = read();
      if (!controls || !view) return undefined;
      scratch.set(point.x, -point.y, 0).project(controls.camera);
      return { x: (scratch.x + 1) / 2 * view.width, y: (1 - scratch.y) / 2 * view.height };
    },
  }));

  // Reagraph creates its camera controls asynchronously; bind once they exist.
  useEffect(() => {
    let frame = 0;
    let controls: ReturnType<GraphCanvasRef['getControls']> | undefined;
    const update = () => { const view = read(); if (view) latest.current.onView(view, false); };
    const rest = () => { pendingZoom.current = undefined; const view = read(); if (view) latest.current.onView(view, true); };
    const bind = () => {
      controls = canvas.current?.getControls();
      if (!controls) { frame = requestAnimationFrame(bind); return; }
      // The wheel is handled below with a capped step; Reagraph keeps drag, touch pan and touch pinch.
      controls.mouseButtons.wheel = 0;
      // Reagraph's default moves the map twice as far as the pointer; a drag should stay under the finger.
      controls.truckSpeed = 1;
      controls.addEventListener('update', update);
      controls.addEventListener('rest', rest);
      controls.addEventListener('sleep', rest);
      latest.current.onReady();
    };
    bind();
    return () => {
      cancelAnimationFrame(frame);
      controls?.removeEventListener('update', update);
      controls?.removeEventListener('rest', rest);
      controls?.removeEventListener('sleep', rest);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reagraph's own wheel step jumps several levels at once, so the wheel (and trackpad pinch, which arrives
  // as ctrl+wheel) is handled here with a capped step around the pointer. Touch pinch stays with Reagraph.
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const controls = canvas.current?.getControls();
      const view = read();
      if (!controls || !view) return;
      controls.mouseButtons.wheel = 0;
      pendingZoom.current = undefined;
      const rect = element.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
      const zoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, view.zoom * wheelFactor(delta, event.ctrlKey)));
      // Keep the world point under the pointer where it is while the scale changes.
      const dx = event.clientX - rect.left - view.width / 2, dy = event.clientY - rect.top - view.height / 2;
      const x = view.x + dx / view.zoom - dx / zoom, y = view.y + dy / view.zoom - dy / zoom;
      void controls.moveTo(x, -y, 0, false);
      void controls.zoomTo(zoom, false);
    };
    element.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => element.removeEventListener('wheel', onWheel, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={frame} style={{ position: 'absolute', inset: 0 }}><GraphCanvas ref={canvas} nodes={props.nodes} edges={props.edges} theme={theme}
    cameraMode="orthographic" minZoom={props.minZoom} maxZoom={props.maxZoom}
    layoutType="custom" labelType="none" edgeArrowPosition="none" animated={false} draggable
    sizingType="none" defaultNodeSize={1}
    layoutOverrides={{ getNodePosition: (id, { drags }) => {
      const dragged = drags?.[id]?.position;
      if (dragged) return { ...dragged, id };
      const point = latest.current.positions(id) ?? { x: 0, y: 0 };
      return { id, x: point.x, y: -point.y, z: 0 } as never;
    } }}
    renderNode={({ node }) => {
      const data = node.data as SceneNodeData;
      const size = data.radius;
      // Raised above the edges so lines end at the rim instead of crossing the shape.
      return <group position={[0, 0, 2]}>
        {data.ring && <mesh position={[0, 0, -0.2]}><circleGeometry args={[size * 1.75, 40]} /><meshBasicMaterial color={data.ring} /></mesh>}
        {data.ring && <mesh position={[0, 0, -0.1]}><circleGeometry args={[size * 1.5, 40]} /><meshBasicMaterial color={latest.current.background} /></mesh>}
        <mesh><circleGeometry args={[size, data.diamond ? 4 : 40]} /><meshBasicMaterial color={data.stroke} transparent opacity={data.opacity} /></mesh>
        <mesh position={[0, 0, 0.1]}><circleGeometry args={[size * (data.kind === 'article' ? 0.86 : 0.66), data.diamond ? 4 : 40]} /><meshBasicMaterial color={data.fill} transparent opacity={data.opacity} /></mesh>
      </group>;
    }}
    onNodeClick={node => latest.current.onNode(node.data as SceneNodeData)}
    onEdgeClick={edge => latest.current.onEdge(edge.data as SceneEdgeData)}
    onNodePointerOver={node => latest.current.onHover(node.data as SceneNodeData)}
    onNodePointerOut={() => latest.current.onHover(undefined)}
    onEdgePointerOver={edge => latest.current.onHover(edge?.data as SceneEdgeData | undefined)}
    onEdgePointerOut={() => latest.current.onHover(undefined)}
    onNodeDragged={node => latest.current.onDragged(node.id, { x: node.position.x, y: -node.position.y })}
    onCanvasClick={event => latest.current.onBackground(event)}>
    {props.rings.map(ring => <mesh key={`${ring.x}:${ring.y}`} position={[ring.x, -ring.y, -1]}>
      <ringGeometry args={[ring.radius - 0.6, ring.radius, 96]} /><meshBasicMaterial color={ring.color} />
    </mesh>)}
    <LabelProjector container={props.labels} viewport={viewport} />
  </GraphCanvas></div>;
});
export default ParagraphGraphScene;
