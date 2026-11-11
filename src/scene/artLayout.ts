/**
 * Where the hero's art area sits, as a pure function of the viewport: the point the yellow
 * strokes turn about, and the wash shown when WebGL is unavailable.
 *
 * Landscape screens place it right of centre so the title owns the left column.
 * Portrait screens lift it into the band between the header and the bottom-aligned title.
 * Ratios in between blend continuously, so resizing never makes it jump.
 */
export interface ArtLayout {
  /** Centre of the art area in CSS px from the top-left of the scene. */
  x: number;
  y: number;
  /** Radius of the art area in CSS px. */
  radius: number;
}

const PORTRAIT_ASPECT = 0.9;
const LANDSCAPE_ASPECT = 1.25;

const LANDSCAPE = { x: 0.68, y: 0.47, radiusOfHeight: 0.39 };
const PORTRAIT = { x: 0.53, y: 0.3, radiusOfWidth: 0.56, maxRadiusOfHeight: 0.27 };

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function artLayout(width: number, height: number): ArtLayout {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const t = smoothstep(PORTRAIT_ASPECT, LANDSCAPE_ASPECT, w / h);
  // Short phones leave less room between the header and the title stack.
  const portraitRoom = smoothstep(600, 740, h);
  const portraitY = mix(0.235, PORTRAIT.y, portraitRoom);
  const portraitRadius = Math.min(PORTRAIT.radiusOfWidth * w, PORTRAIT.maxRadiusOfHeight * h)
    * mix(0.37, 1, portraitRoom);
  const landscapeRadius = LANDSCAPE.radiusOfHeight * h;
  return {
    x: mix(PORTRAIT.x, LANDSCAPE.x, t) * w,
    y: mix(portraitY, LANDSCAPE.y, t) * h,
    radius: mix(portraitRadius, landscapeRadius, t),
  };
}
