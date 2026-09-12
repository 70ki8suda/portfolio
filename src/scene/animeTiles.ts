const CLIPS = ['stones', 'signs', 'arcade', 'room', 'smoke', 'rain'] as const;
export const nextAnimeHoldMs = (random = Math.random) => 3000 + random() * 5000;

function shuffled<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Two native video decoders, governed by the nature layer's existing lifecycle. */
export function createAnimeTiles(root: HTMLDivElement) {
  const videos = Array.from(root.querySelectorAll('video'));
  const failed = new Set<string>();
  const pending = [false, false];
  const frames: (number | undefined)[] = [];
  let running = false;
  let disposed = false;
  let started = false;
  let epoch = 0;
  let remaining = nextAnimeHoldMs();
  let deadline = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function hide(video: HTMLVideoElement) {
    video.style.opacity = '0';
    video.dataset.animeVisible = 'false';
  }
  function cancelFrames() {
    epoch++;
    videos.forEach((video, slot) => {
      if (frames[slot] !== undefined) video.cancelVideoFrameCallback(frames[slot]!);
      frames[slot] = undefined;
      pending[slot] = false;
      video.pause();
    });
  }
  function present(slot: number) {
    const video = videos[slot];
    if (!running || disposed || pending[slot] || video.readyState < 2 || !video.getAttribute('src')) return;
    pending[slot] = true;
    const attempt = epoch;
    const reveal = () => {
      if (disposed || !running || attempt !== epoch) return;
      frames[slot] = undefined;
      pending[slot] = false;
      video.style.opacity = '1';
      video.dataset.animeVisible = 'true';
    };
    void video.play().then(() => {
      if (disposed || !running || attempt !== epoch) return;
      if (typeof video.requestVideoFrameCallback === 'function') frames[slot] = video.requestVideoFrameCallback(reveal);
      else reveal();
    }).catch(() => {
      if (disposed || attempt !== epoch) return;
      pending[slot] = false;
      failed.add(video.dataset.animeClip!);
      hide(video);
    });
  }
  function choose() {
    cancelFrames();
    const previous = videos.map((video) => video.dataset.animeClip);
    const available = CLIPS.filter((clip) => !failed.has(clip));
    const fresh = available.filter((clip) => !previous.includes(clip));
    const clips = shuffled([...(fresh.length >= 2 ? fresh : available)]).slice(0, 2);
    const previousCells = videos.map((video) => Number(video.dataset.cell));
    const cells = shuffled(Array.from({ length: 40 }, (_, i) => i).filter((cell) => !previousCells.includes(cell)));
    videos.forEach((video, slot) => {
      hide(video);
      if (!clips[slot]) { video.removeAttribute('src'); video.load(); return; }
      const cell = cells[slot];
      video.dataset.cell = String(cell);
      video.dataset.animeClip = clips[slot];
      video.style.left = `${(cell % 8) * 12.5}%`;
      video.style.top = `${Math.floor(cell / 8) * 20}%`;
      video.preload = 'auto';
      video.src = `/media/anime-${clips[slot]}.mp4`;
      video.load();
    });
    remaining = nextAnimeHoldMs();
  }
  function schedule() {
    deadline = performance.now() + remaining;
    timer = setTimeout(() => {
      timer = undefined;
      if (!running || disposed) return;
      choose();
      schedule();
    }, remaining);
  }
  function pause() {
    running = false;
    if (timer !== undefined) {
      clearTimeout(timer);
      remaining = Math.max(0, deadline - performance.now());
      timer = undefined;
    }
    cancelFrames();
  }
  const listeners = videos.map((video, slot) => {
    const onReady = () => { if (video.paused || video.dataset.animeVisible !== 'true') present(slot); };
    const onError = () => { failed.add(video.dataset.animeClip!); hide(video); };
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
    return { onReady, onError };
  });
  return {
    start() {
      if (running || disposed) return;
      running = true;
      if (!started) { started = true; choose(); }
      else videos.forEach((_, slot) => present(slot));
      schedule();
    },
    pause,
    clear() { pause(); videos.forEach(hide); },
    dispose() {
      disposed = true;
      pause();
      videos.forEach((video, slot) => {
        video.removeEventListener('canplay', listeners[slot].onReady);
        video.removeEventListener('error', listeners[slot].onError);
        video.removeAttribute('src');
        video.load();
      });
    },
  };
}
