import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Link } from '@tanstack/react-router';
import { CAMERA_REST, type CameraTurn } from './scene/fluid/grass';
import { attachCameraDrag } from './scene/fluid/cameraDrag';
import { ArrowIcon, SignalMark } from './components/Icons';
import { FluidBackdrop } from './components/FluidBackdrop';
import { useReducedMotion } from './components/useReducedMotion';
import { page } from './styles/page.stylex';
import { shared } from './styles/shared.stylex';
import { githubProfile } from './site';
import { HomeParagraphGraph } from './blog/HomeParagraphGraph';
import { HomeMusic } from './music/HomeMusic';

export default function App() {
  const [camera, setCamera] = useState<CameraTurn>(CAMERA_REST);
  const artworkRef = useRef<HTMLElement>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  // Dragging the artwork turns the camera; so do the arrow keys while it has focus. No panel, no animation.
  useEffect(() => {
    if (!artworkRef.current) return;
    return attachCameraDrag(artworkRef.current, { get: () => cameraRef.current, set: setCamera });
  }, []);
  const reducedMotion = useReducedMotion();

  return (
    <div {...stylex.props(page.root)}>
      <a href="#main" {...stylex.props(page.skip)}>Skip to content</a>
      <header {...stylex.props(page.header)}>
        <a href="#top" aria-label="70ki8suda — back to top" {...stylex.props(page.identity)}>
          <span>70ki8suda<span {...stylex.props(page.identityDot)}>.</span></span>
        </a>
        <span {...stylex.props(shared.label, page.headerDescriptor)} lang="ja">寂静 / <span lang="en">A future in harmony.</span></span>
        <nav aria-label="Main navigation" {...stylex.props(page.nav)}>
          <Link to="/knowdes" {...stylex.props(page.navLink)}>KNo(w)des</Link>
          <a href="#contact" {...stylex.props(page.navLink)}>Contact<span {...stylex.props(page.navArrow)}><ArrowIcon /></span></a>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <section id="top" aria-label="Interactive hydroponic landscape" {...stylex.props(page.hero)}>
          {/* The whole picture is one canvas: racks, water and rice. */}
          <figure ref={artworkRef} tabIndex={0} {...stylex.props(page.artwork)} aria-labelledby="artwork-caption" aria-describedby="artwork-instructions">
            <FluidBackdrop paused={reducedMotion} reducedMotion={reducedMotion} mode="interference" intensity={0.65} camera={camera} />
            <figcaption id="artwork-caption" {...stylex.props(shared.screenReaderOnly)}>A living future — interactive artwork</figcaption>
            <p id="artwork-instructions" {...stylex.props(shared.screenReaderOnly)}>Move over the picture to stir the water and bend the grass. Drag it, or use the arrow keys while it has focus, to turn the camera; Home or a double-click returns it.</p>
          </figure>
          <a href="#home-graph-section" {...stylex.props(page.heroNext)}>KNo(w)des <span aria-hidden="true">↓</span></a>
        </section>

        <div lang="ja" {...stylex.props(page.deckEntry)}>
          <a href="/life-cards/" {...stylex.props(page.deckLink, page.deckLife)}>
            <span aria-hidden="true" {...stylex.props(page.deckFrame, page.deckAccent)} />
            {/* Garden, net, ring, breath: a sprout inside a ring, over a woven ground. */}
            <svg aria-hidden="true" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...stylex.props(page.deckEmblem)}>
              <circle cx="48" cy="44" r="30" />
              <path d="M48 66V36M48 50c-9 0-14-5-14-13 9 0 14 5 14 13ZM48 42c0-8 5-13 13-13 0 8-5 13-13 13Z" />
              <path d="M26 80l8 8 8-8 6 6 6-6 8 8 8-8M30 88h36" opacity=".55" />
            </svg>
            <span {...stylex.props(page.deckText)}><span {...stylex.props(shared.label, shared.muted)}>カードデッキ</span><span {...stylex.props(page.deckTitle)}>庭と網と輪と息</span></span>
            <span aria-hidden="true" {...stylex.props(page.deckArrow)}><ArrowIcon /></span>
          </a>
          <a href="/dream-cards/" {...stylex.props(page.deckLink, page.deckDream)}>
            <span aria-hidden="true" {...stylex.props(page.deckFrame, page.deckAccent)} />
            {/* From our home: a house under a crescent moon and a few stars. */}
            <svg aria-hidden="true" viewBox="0 0 96 96" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" {...stylex.props(page.deckEmblem)}>
              <path d="M66 12a15 15 0 1 0 12 24 12 12 0 0 1-12-24Z" />
              <path d="M22 20v6M19 23h6M40 10v4M38 12h4" opacity=".55" />
              <path d="M22 58l26-20 26 20M28 54v28h40V54M43 82V66h10v16" />
              <path d="M14 86h68" opacity=".55" />
            </svg>
            <span {...stylex.props(page.deckText)}><span {...stylex.props(shared.label, shared.muted)}>夢と行動基準</span><span {...stylex.props(page.deckTitle)}>わが家から</span></span>
            <span aria-hidden="true" {...stylex.props(page.deckArrow)}><ArrowIcon /></span>
          </a>
        </div>

        <HomeParagraphGraph />

        <HomeMusic />

        <section id="contact" aria-labelledby="contact-title" {...stylex.props(shared.section, page.contact)}>
          <a href={githubProfile} target="_blank" rel="noreferrer" {...stylex.props(page.contactLink)}>
            <h2 id="contact-title" lang="ja" {...stylex.props(page.contactTitle)}>結縁<span lang="en" style={{ fontSize: 'inherit', letterSpacing: 'inherit' }}> / Contact</span></h2>
            <span {...stylex.props(page.contactArrow)}><ArrowIcon /></span>
            <span {...stylex.props(shared.screenReaderOnly)}> — find 70ki8suda on GitHub (opens in a new tab)</span>
          </a>
          <div {...stylex.props(page.contactBottom)}>
            <p {...stylex.props(page.contactBody)}>Find me on X (Twitter) and GitHub.</p>
            <a href="https://x.com/70ki8suda" target="_blank" rel="noreferrer" {...stylex.props(shared.textLink)}>X (Twitter) / @70ki8suda <ArrowIcon /></a>
            <a href={githubProfile} target="_blank" rel="noreferrer" {...stylex.props(shared.textLink)}>GitHub / 70ki8suda <ArrowIcon /></a>
          </div>
        </section>
      </main>

      <footer {...stylex.props(page.footer)}>
        <a href="#top" {...stylex.props(page.footerIdentity)}><SignalMark /><span>70ki8suda</span></a>
        <span {...stylex.props(shared.label, page.footerNote)}>Made of code. Open to possibility.</span>
        <a href="#top" {...stylex.props(shared.textLink, page.backTop)}>Back to top <span aria-hidden="true">↑</span></a>
      </footer>
    </div>
  );
}
