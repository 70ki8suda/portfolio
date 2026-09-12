import { useEffect, useRef } from 'react';
import * as stylex from '@stylexjs/stylex';
import { nature } from '../styles/nature.stylex';
import { createNatureGridEffect } from '../scene/natureGridEffect';
import { createAnimeTiles } from '../scene/animeTiles';

export const NATURE_CLIPS = [
  { id: 'water', src: '/media/nature-water.mp4', cutMs: 2800 },
  { id: 'green', src: '/media/nature-green.mp4', cutMs: 3200 },
  { id: 'sky', src: '/media/nature-sky.mp4', cutMs: 2600 },
] as const;

export const NATURE_POSTER = '/media/nature-poster.jpg';

interface NatureBackdropProps {
  paused: boolean;
  reducedMotion: boolean;
}

/** Two reusable video surfaces keep a decoded frame visible across editorial cuts. */
export function NatureBackdrop({ paused, reducedMotion }: NatureBackdropProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const effectRef = useRef<HTMLCanvasElement>(null);
  const animeRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null]);
  const pausedRef = useRef(paused);
  const refreshActivity = useRef<(() => void) | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
    refreshActivity.current?.();
  }, [paused]);

  useEffect(() => {
    const root = rootRef.current;
    const first = videoRefs.current[0];
    const second = videoRefs.current[1];
    if (reducedMotion || !root || !first || !second) return;

    const videos = [first, second];
    let effect: ReturnType<typeof createNatureGridEffect> = null;
    let effectAttempted = false;
    const anime = animeRef.current ? createAnimeTiles(animeRef.current) : null;
    const assigned: (number | null)[] = [null, null];
    const failed = new Set<number>();
    const loadTimers: (ReturnType<typeof setTimeout> | undefined)[] = [];
    const frameCallbacks: (number | undefined)[] = [];
    let disposed = false;
    let inView = false;
    let running = false;
    let blocked = false;
    let active = -1;
    let pending = -1;
    let epoch = 0;
    let cutTimer: ReturnType<typeof setTimeout> | undefined;
    let deadline = 0;
    let remaining = NATURE_CLIPS[0].cutMs as number;

    const canRun = () => !disposed && !blocked && !pausedRef.current && inView && document.visibilityState !== 'hidden';

    function clearCut(preserveRemaining: boolean) {
      if (cutTimer !== undefined) {
        clearTimeout(cutTimer);
        if (preserveRemaining) remaining = Math.max(0, deadline - performance.now());
        cutTimer = undefined;
      }
    }

    function cancelPresentation() {
      effect?.pause();
      anime?.pause();
      epoch += 1;
      pending = -1;
      videos.forEach((video, slot) => {
        const callback = frameCallbacks[slot];
        if (callback !== undefined) video.cancelVideoFrameCallback(callback);
        frameCallbacks[slot] = undefined;
        video.pause();
      });
    }

    function nextClip(after: number, exclude: number | null = null) {
      for (let offset = 1; offset <= NATURE_CLIPS.length; offset += 1) {
        const candidate = (after + offset) % NATURE_CLIPS.length;
        if (candidate !== exclude && !failed.has(candidate)) return candidate;
      }
      return null;
    }

    function load(slot: number, clip: number) {
      clearTimeout(loadTimers[slot]);
      const video = videos[slot];
      video.pause();
      video.style.opacity = '0';
      video.dataset.active = 'false';
      assigned[slot] = clip;
      video.dataset.clip = NATURE_CLIPS[clip].id;
      video.preload = 'auto';
      video.src = NATURE_CLIPS[clip].src;
      video.load();
      loadTimers[slot] = setTimeout(() => fail(slot), 10_000);
    }

    function preloadNext() {
      if (active < 0) return;
      const current = assigned[active]!;
      const next = nextClip(current, current);
      const slot = 1 - active;
      if (next !== null && assigned[slot] !== next) load(slot, next);
    }

    function scheduleCut() {
      clearCut(false);
      if (!canRun() || active < 0) return;
      deadline = performance.now() + remaining;
      cutTimer = setTimeout(() => {
        cutTimer = undefined;
        remaining = 0;
        advance();
      }, remaining);
    }

    function present(slot: number) {
      const video = videos[slot];
      if (!canRun() || pending !== -1 || assigned[slot] === null || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
      pending = slot;
      const attempt = epoch;
      const clip = assigned[slot];

      const reveal = () => {
        frameCallbacks[slot] = undefined;
        if (disposed || attempt !== epoch || !canRun() || assigned[slot] !== clip) return;
        pending = -1;
        const previous = active;
        if (!effectAttempted && effectRef.current) {
          effectAttempted = true;
          effect = createNatureGridEffect(effectRef.current);
        }
        effect?.start(video);
        anime?.start();
        // Flip both surfaces in one browser task before recycling the old source.
        video.style.opacity = '1';
        video.dataset.active = 'true';
        active = slot;
        root!.dataset.clip = NATURE_CLIPS[clip].id;
        root!.dataset.state = 'playing';
        if (previous !== slot) {
          remaining = NATURE_CLIPS[clip].cutMs;
          if (previous >= 0) {
            videos[previous].style.opacity = '0';
            videos[previous].dataset.active = 'false';
            videos[previous].pause();
          }
          preloadNext();
        }
        scheduleCut();
      };

      void video.play().then(() => {
        if (disposed || attempt !== epoch || !canRun() || assigned[slot] !== clip) return;
        if (typeof video.requestVideoFrameCallback === 'function') {
          frameCallbacks[slot] = video.requestVideoFrameCallback(reveal);
        } else {
          reveal();
        }
      }).catch((error: unknown) => {
        if (disposed || attempt !== epoch || assigned[slot] !== clip) return;
        pending = -1;
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          blocked = true;
          running = false;
          clearCut(false);
          cancelPresentation();
          root!.dataset.state = 'blocked';
          return;
        }
        fail(slot);
      });
    }

    function advance() {
      if (!canRun()) return;
      if (active < 0) {
        const ready = videos.findIndex((video, slot) => assigned[slot] !== null && !failed.has(assigned[slot]!) && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA);
        if (ready >= 0) present(ready);
      } else {
        const slot = 1 - active;
        if (assigned[slot] !== null && !failed.has(assigned[slot]!)) present(slot);
      }
    }

    function fail(slot: number) {
      const clip = assigned[slot];
      if (disposed || clip === null) return;
      clearTimeout(loadTimers[slot]);
      failed.add(clip);
      if (pending === slot) {
        epoch += 1;
        pending = -1;
      }
      videos[slot].pause();
      if (active === slot) {
        effect?.clear();
        anime?.clear();
        videos[slot].style.opacity = '0';
        videos[slot].dataset.active = 'false';
        active = -1;
        clearCut(false);
      }
      const replacement = nextClip(clip, assigned[1 - slot]);
      if (replacement !== null) load(slot, replacement);
      else assigned[slot] = null;
      if (failed.size === NATURE_CLIPS.length) {
        blocked = true;
        clearCut(false);
        cancelPresentation();
        root!.dataset.state = 'unavailable';
        return;
      }
      if (active < 0 || remaining === 0) advance();
    }

    function updateActivity() {
      const nextRunning = canRun();
      if (!nextRunning) {
        if (running) {
          clearCut(true);
          cancelPresentation();
        }
        running = false;
        if (!blocked) root!.dataset.state = pausedRef.current ? 'paused' : document.visibilityState === 'hidden' ? 'hidden' : 'offscreen';
        return;
      }
      if (running) return;
      running = true;
      if (assigned.every((clip) => clip === null) && failed.size === 0) {
        root!.dataset.state = 'loading';
        load(0, 0);
      } else if (active >= 0) {
        present(active);
      } else {
        advance();
      }
    }

    const listeners = videos.map((video, slot) => {
      const onReady = () => {
        if (video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
        clearTimeout(loadTimers[slot]);
        if (active < 0 || remaining === 0) advance();
        else if (slot === active && running && video.paused) present(slot);
      };
      const onError = () => fail(slot);
      video.addEventListener('canplay', onReady);
      video.addEventListener('error', onError);
      return { onReady, onError };
    });

    refreshActivity.current = updateActivity;
    document.addEventListener('visibilitychange', updateActivity);
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
        updateActivity();
      })
      : null;
    if (observer) observer.observe(root);
    else inView = true;
    updateActivity();

    return () => {
      disposed = true;
      refreshActivity.current = null;
      observer?.disconnect();
      document.removeEventListener('visibilitychange', updateActivity);
      clearCut(false);
      cancelPresentation();
      effect?.dispose();
      anime?.dispose();
      videos.forEach((video, slot) => {
        clearTimeout(loadTimers[slot]);
        video.removeEventListener('canplay', listeners[slot].onReady);
        video.removeEventListener('error', listeners[slot].onError);
        video.removeAttribute('src');
        video.load();
      });
    };
  }, [reducedMotion]);

  return (
    <div ref={rootRef} data-testid="nature-backdrop" data-state={reducedMotion ? 'static' : 'idle'} aria-hidden="true" {...stylex.props(nature.root)}>
      <img src={NATURE_POSTER} alt="" draggable={false} onError={(event) => { event.currentTarget.hidden = true; }} {...stylex.props(nature.poster)} />
      {!reducedMotion && [0, 1].map((slot) => (
        <video
          key={slot}
          ref={(video) => { videoRefs.current[slot] = video; }}
          muted
          playsInline
          loop
          preload="none"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
          data-active="false"
          {...stylex.props(nature.video)}
        />
      ))}
      {!reducedMotion && <canvas ref={effectRef} data-testid="nature-effects" data-state="idle" {...stylex.props(nature.effects)} />}
      {!reducedMotion && <div ref={animeRef} data-testid="anime-tiles" {...stylex.props(nature.animeLayer)}>
        {[0, 1].map((slot) => <video key={slot} muted playsInline loop preload="none" disablePictureInPicture disableRemotePlayback tabIndex={-1} data-anime-visible="false" {...stylex.props(nature.animeTile)} />)}
      </div>}
      <div {...stylex.props(nature.veil)} />
    </div>
  );
}
