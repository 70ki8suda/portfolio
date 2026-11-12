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
          <SignalMark />
          <span>70ki8suda<span {...stylex.props(page.identityDot)}>.</span></span>
        </a>
        <span {...stylex.props(shared.label, page.headerDescriptor)} lang="ja">寂静 / <span lang="en">A future in harmony.</span></span>
        <nav aria-label="Main navigation" {...stylex.props(page.nav)}>
          <Link to="/blog" {...stylex.props(page.navLink)}>Blog</Link>
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
        </section>

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
