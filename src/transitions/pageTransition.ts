/**
 * Shader page transitions with VFX-JS (`@vfx-js/core` + `@vfx-js/transitions`).
 *
 * How a run works:
 * 1. Right before the router commits a new pathname, a static copy of the visible page
 *    is put in a fixed, viewport-sized stage above the page.
 * 2. The router then renders the new page and restores scroll underneath, as always.
 * 3. `vfx.addTransition(stage).run(cb)` snapshots the stage, `cb` swaps in a copy of
 *    the new page, and the preset shader mixes the two.
 * 4. The stage is removed and the live page is on screen.
 *
 * The live DOM is never wrapped, moved or kept alive, so route context, focus, links,
 * scroll restoration and embedded frames behave exactly as they do without the effect.
 * Whenever a step cannot be done faithfully the stage is dropped and the navigation is
 * a plain cut. Navigation itself never waits for this module.
 */
import type { TransitionClass, TransitionHandle, VFX } from '@vfx-js/core';
import { embeddedFontCss } from './embeddedFonts';
import { currentViewport, rememberStills, snapshotPage, TRANSITION_ATTR, visibleCanvases, type PageSnapshot } from './snapshot';

export const STATE_ATTR = 'data-page-transition-state';
export const TRANSITION_EVENT = 'pagetransition';

const DURATION_SECONDS = 0.7;
const STAGE_Z_INDEX = 2147483000;
const ENGINE_TIMEOUT_MS = 2000;
const RENDER_TIMEOUT_MS = 1500;
const CANVAS_WAIT_MS = 450;
const WATCHDOG_MS = 4000;
const STILL_THROTTLE_MS = 400;
const STILL_ATTEMPTS = 8;
const FONT_WAIT_MS = 400;
/** A swipe-back the browser animated itself must not be animated again. */
const UA_TRANSITION_WINDOW_MS = 1000;

export type CaptureMode = 'html-in-canvas' | 'dom-to-canvas';

export interface PageTransitionEventDetail {
  phase: 'start' | 'end' | 'skip' | 'abort';
  /** Why the shader was not used, for `skip` and `abort`. */
  reason?: string;
  capture?: CaptureMode;
  /** For `end`: false when VFX-JS cut straight to the new page instead of animating. */
  played?: boolean;
}

export interface PathChange {
  /** Undefined on the first load. */
  from: string | undefined;
  to: string;
}

const trimPath = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

/** Only a new pathname is a page change. Search (tag filters) and hash changes are not. */
export function isPageChange({ from, to }: PathChange) {
  return from !== undefined && trimPath(from) !== trimPath(to);
}

interface Engine {
  vfx: VFX;
  transition: TransitionClass;
  capture: CaptureMode;
}

interface Run {
  host: HTMLDivElement;
  target: HTMLDivElement;
  snapshot: PageSnapshot;
  handle: TransitionHandle | null;
  rendered: Promise<void>;
  markRendered: () => void;
  watchdog: number;
  previousScrollBehavior: string;
}

class Skip extends Error {}

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
/** Resolves inside an animation frame, after the callbacks other render loops queued for it. */
const afterOtherFrames = () => new Promise<void>((resolve) => setTimeout(() => requestAnimationFrame(() => resolve()), 0));

function within<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Skip(reason)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); },
    );
  });
}

export interface PageTransitions {
  /** Call synchronously while the old page is still in the DOM. */
  beforeCommit(change: PathChange): void;
  /** Call once the router has rendered the new page and restored scroll. */
  rendered(): void;
  dispose(): void;
}

export function createPageTransitions(): PageTransitions {
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let modules: Promise<[typeof import('@vfx-js/core'), typeof import('@vfx-js/transitions')]> | undefined;
  let engine: Promise<Engine | null> | undefined;
  let unavailable = false;
  let disposed = false;
  let active: Run | null = null;
  let lastUaTransition = Number.NEGATIVE_INFINITY;
  let idleTimer = 0;

  const emit = (detail: PageTransitionEventDetail) => {
    window.dispatchEvent(new CustomEvent<PageTransitionEventDetail>(TRANSITION_EVENT, { detail }));
  };

  const loadModules = () => {
    modules ??= Promise.all([import('@vfx-js/core'), import('@vfx-js/transitions')]);
    return modules;
  };

  const loadFontCss = () => embeddedFontCss().catch(() => '');

  const loadEngine = () => {
    engine ??= loadModules().then(([core, presets]): Engine | null => {
      // One WebGL context for the whole visit, created at the first transition.
      const vfx = core.VFX.init({
        autoplay: false,
        scrollPadding: false,
        zIndex: STAGE_Z_INDEX + 1,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      });
      if (!vfx) return null;
      // stop() preserves the last WebGL frame, so the reusable output must be
      // hidden whenever it is not actively covering a transition.
      vfx.canvas.style.visibility = 'hidden';
      vfx.canvas.setAttribute(TRANSITION_ATTR, 'output');
      vfx.canvas.setAttribute('aria-hidden', 'true');
      vfx.canvas.addEventListener('webglcontextlost', () => {
        unavailable = true;
        abort('webgl context lost');
      });
      return {
        vfx,
        transition: presets.DistortFade,
        capture: core.supportsHtmlInCanvas() ? 'html-in-canvas' : 'dom-to-canvas',
      };
    }).catch(() => null);
    return engine;
  };

  function createStage() {
    const viewport = currentViewport();
    const background = getComputedStyle(document.body).backgroundColor;
    const host = document.createElement('div');
    host.setAttribute(TRANSITION_ATTR, 'stage');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = `position:fixed;left:0;top:0;width:${viewport.width}px;height:${viewport.height}px;`
      + `z-index:${STAGE_Z_INDEX};overflow:hidden;contain:strict;background:${background};`
      + 'pointer-events:none;';
    // This is only a visual copy. Input always belongs to the live page underneath.

    const target = document.createElement('div');
    // Not focusable, not clickable, not in the accessibility tree.
    target.inert = true;
    target.style.cssText = `width:100%;height:100%;overflow:hidden;background:${background};`;
    host.append(target);
    return { host, target };
  }

  function cleanup(run: Run) {
    if (active === run) active = null;
    clearTimeout(run.watchdog);
    try { run.handle?.destroy(); } catch { /* already gone */ }
    run.snapshot.dispose();
    run.host.remove();
    document.documentElement.style.scrollBehavior = run.previousScrollBehavior;
    document.documentElement.removeAttribute(STATE_ATTR);
    void engine?.then((ready) => {
      // An older run may finish loading after a new navigation has started.
      if (!ready || active) return;
      ready.vfx.canvas.style.visibility = 'hidden';
      ready.vfx.stop();
    });
  }

  function abort(reason: string) {
    const run = active;
    if (!run) return;
    cleanup(run);
    emit({ phase: 'abort', reason });
  }

  /** Copies the new page once its canvases, if any, have drawn a frame that can be read. */
  async function snapshotNewPage() {
    const deadline = performance.now() + CANVAS_WAIT_MS;
    for (;;) {
      await afterOtherFrames();
      if (rememberStills(visibleCanvases()) || performance.now() > deadline) break;
    }
    return snapshotPage();
  }

  async function settleScroll() {
    await frame();
    let last = window.scrollY;
    for (let i = 0; i < 12; i++) {
      await frame();
      if (window.scrollY === last) return;
      last = window.scrollY;
    }
  }

  async function play(run: Run) {
    const isCurrent = () => active === run;
    const ready = await within(loadEngine(), ENGINE_TIMEOUT_MS, 'renderer did not load in time');
    if (!isCurrent()) return;
    if (!ready) {
      unavailable = true;
      throw new Skip('renderer unavailable');
    }

    const fonts = document.createElement('style');
    if (ready.capture === 'dom-to-canvas') {
      fonts.textContent = await within(loadFontCss(), FONT_WAIT_MS, 'fonts were not ready in time');
    }
    await run.snapshot.finalize();
    if (!isCurrent()) return;
    run.target.append(fonts);

    const handle = ready.vfx.addTransition(run.target, { transition: ready.transition, duration: DURATION_SECONDS });
    run.handle = handle;
    ready.vfx.canvas.style.visibility = 'visible';
    ready.vfx.play();
    emit({ phase: 'start', capture: ready.capture });

    let swappedAt = 0;
    await handle.run(async () => {
      await within(run.rendered, RENDER_TIMEOUT_MS, 'new page did not render in time');
      if (!isCurrent()) return;
      await settleScroll();
      const next = await snapshotNewPage();
      if (!isCurrent()) { next.dispose(); return; }
      if (next.blockers.length > 0) {
        next.dispose();
        throw new Skip(`new page shows ${next.blockers.join(', ')}`);
      }
      const previous = run.snapshot;
      run.snapshot = next;
      previous.dispose();
      run.target.prepend(next.content);
      next.place(run.target);
      if (Math.abs(run.target.scrollTop - window.scrollY) > 1 || !next.matchesPage()) {
        throw new Skip('copy of the new page does not match its layout');
      }
      await next.finalize();
      // The new page may have loaded faces the old one did not use.
      if (ready.capture === 'dom-to-canvas') fonts.textContent = await within(loadFontCss(), FONT_WAIT_MS, 'fonts were not ready in time');
      swappedAt = performance.now();
    });
    if (!isCurrent()) return;
    const played = swappedAt > 0 && performance.now() - swappedAt >= DURATION_SECONDS * 500;
    cleanup(run);
    emit({ phase: 'end', capture: ready.capture, played });
  }

  function beforeCommit(change: PathChange) {
    if (disposed) return;
    if (active) {
      // Rapid navigation: show the live page at once; this navigation is a plain cut.
      abort('superseded by another navigation');
      return;
    }
    if (!isPageChange(change)) return;
    const skip = (reason: string) => emit({ phase: 'skip', reason });
    if (motionQuery.matches) return skip('reduced motion');
    if (unavailable) return skip('renderer unavailable');
    if (document.visibilityState !== 'visible') return skip('document hidden');
    if (performance.now() - lastUaTransition < UA_TRANSITION_WINDOW_MS) return skip('browser animated this navigation');
    const viewport = currentViewport();
    if (viewport.width < 1 || viewport.height < 1) return skip('no viewport');

    let snapshot: PageSnapshot;
    try {
      snapshot = snapshotPage();
    } catch {
      return skip('page could not be copied');
    }
    if (snapshot.blockers.length > 0) {
      snapshot.dispose();
      return skip(`page shows ${snapshot.blockers.join(', ')}`);
    }

    const scrollY = window.scrollY;
    const { host, target } = createStage();
    target.append(snapshot.content);
    document.body.append(host);
    snapshot.place(target);
    if (Math.abs(target.scrollTop - scrollY) > 1 || !snapshot.matchesPage()) {
      snapshot.dispose();
      host.remove();
      return skip('copy of the page does not match its layout');
    }

    let markRendered = () => {};
    const rendered = new Promise<void>((resolve) => { markRendered = resolve; });
    const root = document.documentElement;
    const run: Run = {
      host,
      target,
      snapshot,
      handle: null,
      rendered,
      markRendered,
      watchdog: window.setTimeout(() => abort('timed out'), WATCHDOG_MS),
      previousScrollBehavior: root.style.scrollBehavior,
    };
    active = run;
    root.setAttribute(STATE_ATTR, 'running');
    // Scroll restoration and hash scrolling must land at once: the new page is copied where it rests.
    root.style.scrollBehavior = 'auto';

    play(run).catch((error: unknown) => {
      if (active !== run) return;
      if (!(error instanceof Skip)) console.warn('[page-transition] falling back to a plain navigation:', error);
      abort(error instanceof Error ? error.message : 'failed');
    });
  }

  // A frozen screenshot must never make the new page feel locked. End the effect on
  // scroll intent, before the browser performs its default action. Touchstart matters:
  // the browser decides touch-action at the beginning of a gesture, not on touchmove.
  const onScrollIntent = () => abort('scroll requested');
  const onScrollKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, button, [contenteditable], [role="slider"]')) return;
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) onScrollIntent();
  };
  const scrollIntentEvents = ['wheel', 'touchstart', 'touchmove'] as const;
  for (const type of scrollIntentEvents) window.addEventListener(type, onScrollIntent, { capture: true, passive: true });
  window.addEventListener('keydown', onScrollKey);

  const onMotionChange = () => { if (motionQuery.matches) abort('reduced motion'); };
  const onPageHide = () => abort('page hidden');
  const onVisibility = () => { if (document.visibilityState !== 'visible') abort('document hidden'); };
  const onPopState = (event: PopStateEvent) => {
    if ((event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition) lastUaTransition = performance.now();
  };
  /**
   * A WebGL canvas can only be read in the frame that drew it, and the router may swap
   * the page before the next frame. So pointing at, pressing or focusing a link takes
   * the stills that a navigation from it will need.
   */
  let lastStillRequest = Number.NEGATIVE_INFINITY;
  const onLinkIntent = (event: Event) => {
    if (disposed || motionQuery.matches || unavailable || active) return;
    if (!(event.target instanceof Element) || !event.target.closest('a[href]')) return;
    const now = performance.now();
    if (event.type !== 'pointerdown' && now - lastStillRequest < STILL_THROTTLE_MS) return;
    if (visibleCanvases().length === 0) return;
    lastStillRequest = now;
    // A render loop may skip frames to hold its frame rate, so try a few in a row.
    let attempts = STILL_ATTEMPTS;
    const attempt = () => {
      if (disposed || active || rememberStills(visibleCanvases()) || --attempts <= 0) return;
      requestAnimationFrame(attempt);
    };
    requestAnimationFrame(attempt);
  };

  motionQuery.addEventListener('change', onMotionChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('popstate', onPopState);
  document.addEventListener('visibilitychange', onVisibility);
  const intentEvents = ['pointerover', 'pointerdown', 'focusin'] as const;
  for (const type of intentEvents) document.addEventListener(type, onLinkIntent, { capture: true, passive: true });

  // Fetch the renderer and inline the fonts while idle, so the first transition does not wait for them.
  if (!motionQuery.matches) {
    idleTimer = window.setTimeout(() => {
      loadModules().catch(() => { unavailable = true; });
      void document.fonts?.ready.then(loadFontCss);
    }, 1200);
  }

  return {
    beforeCommit,
    rendered() { active?.markRendered(); },
    dispose() {
      disposed = true;
      clearTimeout(idleTimer);
      for (const type of scrollIntentEvents) window.removeEventListener(type, onScrollIntent, { capture: true });
      window.removeEventListener('keydown', onScrollKey);
      abort('disposed');
      motionQuery.removeEventListener('change', onMotionChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const type of intentEvents) document.removeEventListener(type, onLinkIntent, { capture: true });
      void engine?.then((ready) => ready?.vfx.destroy());
      engine = undefined;
    },
  };
}
