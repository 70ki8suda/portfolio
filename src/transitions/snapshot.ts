/**
 * A static, viewport-sized copy of the page that is on screen right now.
 *
 * The shader transition runs on this copy instead of the live page, so React and the
 * router never have their DOM moved. Anything the copy cannot reproduce faithfully is
 * reported in `blockers`; the caller then navigates without the shader.
 */

export const TRANSITION_ATTR = 'data-page-transition';

/** Tolerance, in CSS px, when checking that the copy is laid out like the page. */
const LAYOUT_TOLERANCE = 1.5;
const MAX_LAYOUT_SAMPLES = 48;
const MAX_STILL_EDGE = 1600;
/** How long a still taken when a link was pointed at, pressed or focused stays usable. */
const STILL_MAX_AGE_MS = 4000;

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE', 'NOSCRIPT', 'META', 'TITLE']);
/** Embedded browsing contexts and video cannot be drawn into a texture. */
const OPAQUE_TAGS = new Set(['IFRAME', 'VIDEO', 'OBJECT', 'EMBED']);
const FLOW_DISPLAYS = new Set(['block', 'flow-root', 'list-item']);

export interface Box { left: number; top: number; width: number; height: number }

export interface PageSnapshot {
  /** Holds the copied page. Append it to a clipping box, then call `place()`. */
  content: HTMLDivElement;
  /** Why this page cannot be shown through the shader; empty when it can. */
  blockers: string[];
  /** Scrolls the clipping box like the window and pins sticky boxes where they are. */
  place(clip: HTMLElement): void;
  /** True when sampled boxes of the copy sit where the page's boxes sat. */
  matchesPage(): boolean;
  /** Turns canvas stills into images, which both capture paths can draw. */
  finalize(): Promise<void>;
  dispose(): void;
}

interface Viewport { width: number; height: number }

const stills = new WeakMap<HTMLCanvasElement, { still: HTMLCanvasElement; at: number }>();

function intersects(rect: DOMRect, viewport: Viewport) {
  return rect.width > 0 && rect.height > 0
    && rect.bottom > 0 && rect.right > 0 && rect.top < viewport.height && rect.left < viewport.width;
}

/** Whether two boxes agree within the layout tolerance. */
export function sameBox(a: Box, b: Box, tolerance = LAYOUT_TOLERANCE) {
  return Math.abs(a.left - b.left) <= tolerance && Math.abs(a.top - b.top) <= tolerance
    && Math.abs(a.width - b.width) <= tolerance && Math.abs(a.height - b.height) <= tolerance;
}

/**
 * Height for the first box of an off-screen run once the boxes between the first and
 * the last are removed, so the last box keeps its position.
 */
export function mergedRunHeight(firstTop: number, lastTop: number, firstMarginBottom: number, lastMarginTop: number) {
  // Adjacent vertical margins collapse to the larger one.
  return Math.max(0, lastTop - firstTop - Math.max(firstMarginBottom, lastMarginTop, 0));
}

/** True when every sampled pixel is transparent, or all are pure black (a cleared opaque buffer). */
export function isBlankPixels(data: Uint8ClampedArray) {
  let transparent = true;
  let black = true;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0) transparent = false;
    if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) black = false;
    if (!transparent && !black) return false;
  }
  return true;
}

/**
 * Copies a canvas's current picture. Returns null when the picture cannot be read,
 * which is the normal case for a WebGL canvas outside the frame that drew it.
 */
export function captureCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
  if (source.width === 0 || source.height === 0) return null;
  try {
    const scale = Math.min(1, MAX_STILL_EDGE / Math.max(source.width, source.height));
    const still = document.createElement('canvas');
    still.width = Math.max(1, Math.round(source.width * scale));
    still.height = Math.max(1, Math.round(source.height * scale));
    const context = still.getContext('2d');
    if (!context) return null;
    context.drawImage(source, 0, 0, still.width, still.height);

    const probe = document.createElement('canvas');
    probe.width = 16;
    probe.height = 16;
    const probeContext = probe.getContext('2d', { willReadFrequently: true });
    if (!probeContext) return null;
    probeContext.drawImage(still, 0, 0, 16, 16);
    return isBlankPixels(probeContext.getImageData(0, 0, 16, 16).data) ? null : still;
  } catch {
    return null; // tainted or lost
  }
}

function isShown(element: Element) {
  const style = getComputedStyle(element);
  return style.visibility === 'visible' && style.display !== 'none' && Number.parseFloat(style.opacity) > 0;
}

/** Canvases that are painted inside the viewport right now. */
export function visibleCanvases(root: ParentNode = document.body): HTMLCanvasElement[] {
  const viewport = currentViewport();
  return Array.from(root.querySelectorAll('canvas')).filter((canvas) => (
    !canvas.closest(`[${TRANSITION_ATTR}]`) && intersects(canvas.getBoundingClientRect(), viewport) && isShown(canvas)
  ));
}

/** Stores stills of the given canvases. Call it from an animation frame, after the canvases drew. */
export function rememberStills(canvases: HTMLCanvasElement[]) {
  let complete = true;
  for (const canvas of canvases) {
    const still = captureCanvas(canvas);
    if (still) stills.set(canvas, { still, at: performance.now() });
    else complete = false;
  }
  return complete;
}

function stillFor(canvas: HTMLCanvasElement) {
  const remembered = stills.get(canvas);
  if (remembered && performance.now() - remembered.at <= STILL_MAX_AGE_MS) return remembered.still;
  return captureCanvas(canvas);
}

export function currentViewport(): Viewport {
  return { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
}

/** Same class and inline style, pinned to the laid-out size, so the stand-in keeps the original's box. */
function standIn<T extends HTMLElement>(source: Element, rect: DOMRect, replacement: T): T {
  replacement.className = source.getAttribute('class') ?? '';
  replacement.style.cssText = (source as HTMLElement).style?.cssText ?? '';
  const display = getComputedStyle(source).display;
  replacement.style.setProperty('display', display === 'inline' ? 'inline-block' : display, 'important');
  replacement.style.setProperty('box-sizing', 'border-box', 'important');
  replacement.style.setProperty('width', `${rect.width}px`, 'important');
  replacement.style.setProperty('height', `${rect.height}px`, 'important');
  return replacement;
}

function pinEmpty(copy: HTMLElement, height: number) {
  copy.replaceChildren();
  const style = copy.style;
  for (const [name, value] of [
    ['box-sizing', 'border-box'], ['height', `${height}px`], ['min-height', '0'], ['max-height', 'none'],
    ['padding-top', '0'], ['padding-bottom', '0'], ['border-top-width', '0'], ['border-bottom-width', '0'],
    ['overflow', 'hidden'],
  ] as const) style.setProperty(name, value, 'important');
}

/**
 * Copies the page. Runs synchronously, so it can be called right before the router
 * swaps the page out.
 */
export function snapshotPage(): PageSnapshot {
  const viewport = currentViewport();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const blockers = new Set<string>();
  const samples: Array<{ copy: Element; box: Box }> = [];
  const sticky: Array<{ copy: HTMLElement; box: Box }> = [];
  const canvasStills: HTMLCanvasElement[] = [];
  const objectUrls: string[] = [];
  let disposed = false;

  /** Returns the node that stands for `source` in the copy, or null to drop it. */
  function copyElement(source: Element, copy: Element, parentIsFlow: boolean): { node: Node | null; prunable: boolean; rect: DOMRect } {
    const rect = source.getBoundingClientRect();
    const tag = source.tagName;
    if (SKIPPED_TAGS.has(tag)) return { node: null, prunable: false, rect };

    copy.removeAttribute('id');
    copy.removeAttribute('name');
    const visible = intersects(rect, viewport);

    if (OPAQUE_TAGS.has(tag)) {
      if (visible && isShown(source)) blockers.add(tag.toLowerCase());
      return { node: standIn(source, rect, document.createElement('div')), prunable: false, rect };
    }
    if (source instanceof HTMLCanvasElement) {
      if (!visible || !isShown(source)) return { node: standIn(source, rect, document.createElement('div')), prunable: false, rect };
      const still = stillFor(source);
      if (!still) {
        blockers.add('canvas');
        return { node: standIn(source, rect, document.createElement('div')), prunable: false, rect };
      }
      // A fresh canvas per snapshot: the remembered still may be shown by two copies in a row.
      const shown = document.createElement('canvas');
      shown.width = still.width;
      shown.height = still.height;
      shown.getContext('2d')?.drawImage(still, 0, 0);
      canvasStills.push(shown);
      return { node: standIn(source, rect, shown), prunable: false, rect };
    }
    if (source instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
      if (source.checked) copy.setAttribute('checked', ''); else copy.removeAttribute('checked');
      if (source.type !== 'file') copy.setAttribute('value', source.value);
    } else if (source instanceof HTMLTextAreaElement && copy instanceof HTMLTextAreaElement) {
      copy.textContent = source.value;
    } else if (source instanceof HTMLImageElement && copy instanceof HTMLImageElement) {
      copy.loading = 'eager';
      copy.decoding = 'sync';
    }

    const style = getComputedStyle(source);
    const isFlowBox = FLOW_DISPLAYS.has(style.display) && style.float === 'none'
      && (style.position === 'static' || style.position === 'relative');
    if (!visible) {
      // Its children may still reach into the viewport, so only empty a box that clips or contains them.
      const prunable = parentIsFlow && isFlowBox && rect.height > 0 && copy instanceof HTMLElement
        && !source.querySelector('canvas, iframe, video') && containsOverflow(source, rect);
      if (prunable) return { node: copy, prunable: true, rect };
    } else {
      const box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      samples.push({ copy, box });
      if (style.position === 'sticky' && copy instanceof HTMLElement) sticky.push({ copy, box });
    }

    copyChildren(source, copy, FLOW_DISPLAYS.has(style.display));
    return { node: copy, prunable: false, rect };
  }

  function copyChildren(source: Element, copy: Element, isFlow: boolean) {
    const sourceChildren = Array.from(source.children);
    const copyChildrenList = Array.from(copy.children);
    let run: Array<{ source: Element; copy: HTMLElement; rect: DOMRect }> = [];
    const keepEveryBox = source.tagName === 'OL' || source.tagName === 'UL';

    const flush = () => {
      const pending = run;
      run = [];
      if (pending.length === 0) return;
      const first = pending[0];
      const last = pending[pending.length - 1];
      if (pending.length < 3 || keepEveryBox) {
        for (const item of pending) pinEmpty(item.copy, item.rect.height);
        return;
      }
      // Keep the ends, which hold the margins shared with their neighbours, and drop the rest.
      for (const item of pending.slice(1, -1)) item.copy.remove();
      const marginBottom = Number.parseFloat(getComputedStyle(first.source).marginBottom) || 0;
      const marginTop = Number.parseFloat(getComputedStyle(last.source).marginTop) || 0;
      pinEmpty(first.copy, mergedRunHeight(first.rect.top, last.rect.top, marginBottom, marginTop));
      pinEmpty(last.copy, last.rect.height);
    };

    for (let i = 0; i < sourceChildren.length; i++) {
      const child = sourceChildren[i];
      const childCopy = copyChildrenList[i];
      if (!childCopy) break;
      const result = copyElement(child, childCopy, isFlow);
      if (result.prunable) {
        run.push({ source: child, copy: childCopy as HTMLElement, rect: result.rect });
        continue;
      }
      flush();
      if (result.node === null) childCopy.remove();
      else if (result.node !== childCopy) childCopy.replaceWith(result.node);
    }
    flush();
  }

  const content = document.createElement('div');
  content.style.cssText = 'position:relative;width:100%;';
  for (const child of Array.from(document.body.children)) {
    if (SKIPPED_TAGS.has(child.tagName) || child.hasAttribute(TRANSITION_ATTR)) continue;
    const copy = child.cloneNode(true) as Element;
    const result = copyElement(child, copy, true);
    if (result.node === null) continue;
    if (result.prunable) pinEmpty(copy as HTMLElement, result.rect.height);
    content.append(result.node);
  }

  return {
    content,
    blockers: Array.from(blockers),
    place(clip) {
      clip.scrollLeft = scrollX;
      clip.scrollTop = scrollY;
      // dom-to-canvas has no scrolling box, so a sticky box would fall back to its static place.
      for (const { copy, box } of sticky) {
        copy.style.setProperty('position', 'relative', 'important');
        copy.style.setProperty('top', '0px', 'important');
        copy.style.setProperty('bottom', 'auto', 'important');
        const rect = copy.getBoundingClientRect();
        copy.style.setProperty('top', `${box.top - rect.top}px`, 'important');
      }
    },
    matchesPage() {
      const step = Math.max(1, Math.ceil(samples.length / MAX_LAYOUT_SAMPLES));
      for (let i = 0; i < samples.length; i += step) {
        const { copy, box } = samples[i];
        if (!copy.isConnected) continue;
        const rect = copy.getBoundingClientRect();
        if (!sameBox(box, { left: rect.left, top: rect.top, width: rect.width, height: rect.height })) return false;
      }
      return samples.length > 0;
    },
    async finalize() {
      await Promise.all(canvasStills.map(async (still) => {
        if (disposed || !still.isConnected) return;
        const blob = await new Promise<Blob | null>((resolve) => still.toBlob(resolve, 'image/webp', 0.92));
        // The run may have been cancelled while the still was being encoded.
        if (disposed) return;
        if (!blob) throw new Error('canvas still could not be encoded');
        const url = URL.createObjectURL(blob);
        objectUrls.push(url);
        const image = document.createElement('img');
        image.alt = '';
        image.decoding = 'sync';
        image.className = still.className;
        image.style.cssText = still.style.cssText;
        image.src = url;
        await image.decode();
        // dispose() has already revoked the URL; leave the detached copy alone.
        if (disposed) return;
        still.replaceWith(image);
      }));
    },
    dispose() {
      disposed = true;
      for (const url of objectUrls) URL.revokeObjectURL(url);
      objectUrls.length = 0;
      content.remove();
    },
  };
}

/** True when nothing inside `element` is laid out beyond its own box vertically. */
function containsOverflow(element: Element, rect: DOMRect) {
  return element.scrollHeight <= Math.ceil(rect.height) + 1;
}
