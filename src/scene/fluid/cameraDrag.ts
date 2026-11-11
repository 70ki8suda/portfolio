/**
 * Turning the camera by hand: dragging the artwork, or the arrow keys while it has focus.
 *
 * The pure parts say what a gesture does to the turn; `attachCameraDrag` wires them to an
 * element. It never starts a drag from a link, a button, a slider or selectable text, never
 * blocks vertical scrolling on touch screens, and animates nothing: the camera moves only as
 * far as the hand does.
 */
import { CAMERA_REST, clampTurn, type CameraTurn } from './grass';

export const DRAG = {
  /** Change in pan for a drag across the element's whole width, and in tilt for its whole height. */
  panPerWidth: 2.4,
  tiltPerHeight: 2.4,
  /** Movement, in CSS px, before a press becomes a drag. */
  slop: 4,
  /** Change per arrow-key press. */
  keyStep: 0.1,
} as const;

/** The element that turns the camera carries this attribute; the flow ignores presses and held drags on it. */
export const CAMERA_DRAG_ATTRIBUTE = 'data-camera-drag';

/**
 * The turn after dragging by (dx, dy) CSS px from where the turn was `start`, on an element of
 * the given size. The scene follows the hand: dragging right turns the camera left, dragging
 * down turns it up. A touch only pans, because its vertical movement belongs to the page's scroll.
 */
export function dragTurn(start: CameraTurn, dx: number, dy: number, width: number, height: number, pointerType = 'mouse'): CameraTurn {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return clampTurn({
    pan: start.pan - (dx / w) * DRAG.panPerWidth,
    tilt: pointerType === 'touch' ? start.tilt : start.tilt + (dy / h) * DRAG.tiltPerHeight,
  });
}

/** The turn after a key press, or null when the key does nothing to the camera. Home returns to rest. */
export function keyTurn(turn: CameraTurn, key: string): CameraTurn | null {
  switch (key) {
    case 'ArrowLeft': return clampTurn({ pan: turn.pan - DRAG.keyStep, tilt: turn.tilt });
    case 'ArrowRight': return clampTurn({ pan: turn.pan + DRAG.keyStep, tilt: turn.tilt });
    case 'ArrowUp': return clampTurn({ pan: turn.pan, tilt: turn.tilt + DRAG.keyStep });
    case 'ArrowDown': return clampTurn({ pan: turn.pan, tilt: turn.tilt - DRAG.keyStep });
    case 'Home': return { ...CAMERA_REST };
    default: return null;
  }
}

/** Whether a press on `target` belongs to something of its own: a control, a link, or text. */
function hasOwnUse(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('a, button, input, select, textarea, label, summary, [role="slider"], [role="button"], [contenteditable]') !== null;
}

export interface CameraDragOptions {
  /** The turn as it is now. */
  get(): CameraTurn;
  /** Called with every new turn; never called with one equal to the current. */
  set(turn: CameraTurn): void;
}

/**
 * Makes `target` turn the camera: drag (mouse or pen: both ways; touch: left and right only),
 * arrow keys and Home while it has focus, double-click to return to rest. While a drag is under
 * way the element carries `data-dragging="true"` and a grabbing cursor. Returns the function that undoes all of it.
 */
export function attachCameraDrag(target: HTMLElement, options: CameraDragOptions): () => void {
  let drag: { id: number; x: number; y: number; start: CameraTurn; type: string; moving: boolean } | null = null;

  const apply = (next: CameraTurn) => {
    const now = options.get();
    if (next.pan !== now.pan || next.tilt !== now.tilt) options.set(next);
  };
  const release = () => {
    if (!drag) return;
    const { id } = drag;
    drag = null;
    delete target.dataset.dragging;
    target.style.cursor = 'grab';
    try { if (target.hasPointerCapture(id)) target.releasePointerCapture(id); } catch { /* the pointer is already gone */ }
  };

  const onPointerDown = (event: PointerEvent) => {
    if (drag || !event.isPrimary || event.button !== 0 || hasOwnUse(event.target)) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: options.get(), type: event.pointerType, moving: false };
    if (event.pointerType !== 'touch') {
      // A mouse press would start a text selection; a touch must be left alone so the page can scroll.
      event.preventDefault();
      target.focus({ preventScroll: true });
      try { target.setPointerCapture(event.pointerId); } catch { /* not capturable: moves over the element still arrive */ }
    }
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moving) {
      if (Math.hypot(dx, dy) < DRAG.slop) return;
      // A touch that sets off mostly up or down is a scroll, not a turn.
      if (drag.type === 'touch' && Math.abs(dy) > Math.abs(dx)) { release(); return; }
      drag.moving = true;
      target.dataset.dragging = 'true';
      target.style.cursor = 'grabbing';
    }
    const box = target.getBoundingClientRect();
    apply(dragTurn(drag.start, dx, dy, box.width, box.height, drag.type));
  };
  const onPointerEnd = (event: PointerEvent) => {
    if (drag && event.pointerId === drag.id) release();
  };
  const onDoubleClick = (event: MouseEvent) => {
    if (!hasOwnUse(event.target)) apply({ ...CAMERA_REST });
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target !== target || event.altKey || event.ctrlKey || event.metaKey) return;
    const next = keyTurn(options.get(), event.key);
    if (!next) return;
    event.preventDefault();
    apply(next);
  };

  const cursorBefore = target.style.cursor;
  target.style.cursor = 'grab';
  target.setAttribute(CAMERA_DRAG_ATTRIBUTE, '');
  target.addEventListener('pointerdown', onPointerDown);
  target.addEventListener('pointermove', onPointerMove);
  target.addEventListener('pointerup', onPointerEnd);
  target.addEventListener('pointercancel', onPointerEnd);
  target.addEventListener('lostpointercapture', onPointerEnd);
  target.addEventListener('dblclick', onDoubleClick);
  target.addEventListener('keydown', onKeyDown);
  return () => {
    release();
    target.style.cursor = cursorBefore;
    target.removeAttribute(CAMERA_DRAG_ATTRIBUTE);
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('pointermove', onPointerMove);
    target.removeEventListener('pointerup', onPointerEnd);
    target.removeEventListener('pointercancel', onPointerEnd);
    target.removeEventListener('lostpointercapture', onPointerEnd);
    target.removeEventListener('dblclick', onDoubleClick);
    target.removeEventListener('keydown', onKeyDown);
  };
}
