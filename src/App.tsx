import { useEffect, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Link } from '@tanstack/react-router';
import { CAMERA_REST, type CameraTurn } from './scene/fluid/grass';
import { attachCameraDrag } from './scene/fluid/cameraDrag';
import { ArrowIcon, SignalMark } from './components/Icons';
import { SelectedWork } from './components/SelectedWork';
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
        <span {...stylex.props(shared.label, page.headerDescriptor)}>In harmony, at our own pace.</span>
        <nav aria-label="Main navigation" {...stylex.props(page.nav)}>
          <a href="#work" {...stylex.props(page.navLink)}>Work<span {...stylex.props(page.navIndex)}>01</span></a>
          <a href="#practice" {...stylex.props(page.navLink)}>Practice<span {...stylex.props(page.navIndex)}>02</span></a>
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

        <SelectedWork />

        <section id="practice" aria-labelledby="practice-title" {...stylex.props(shared.section, page.practice)}>
          <div {...stylex.props(shared.label, page.practiceLabel)}><span {...stylex.props(shared.amber)}>02</span> / The practice</div>
          <div {...stylex.props(page.practiceContent)}>
            <h2 id="practice-title" {...stylex.props(page.practiceTitle)}>Precise by design.<br /><span {...stylex.props(page.practiceTitleMuted)}>Alive by intention.</span></h2>
            <div {...stylex.props(page.practiceDescription)}>
              <p {...stylex.props(page.practiceBody)}>I’m 70ki8suda. My practice brings code and visual exploration into the same space. I’m interested in the moment a structured system begins to feel expressive.</p>
              <p {...stylex.props(page.practiceBody, shared.muted)}>The work here moves between creative tools and experiments in form. Clear systems, considered interactions, and room for something unexpected.</p>
            </div>
            <div {...stylex.props(page.principles)}>
              <div {...stylex.props(page.principle)}>
                <span {...stylex.props(shared.label, shared.soft)}>01 / Structure</span>
                <h3 {...stylex.props(page.principleTitle)}>Build with clarity.</h3>
                <p {...stylex.props(page.principleBody)}>Give every element a reason to exist. Let the details do the work.</p>
              </div>
              <div {...stylex.props(page.principle)}>
                <span {...stylex.props(shared.label, shared.soft)}>02 / Sensation</span>
                <h3 {...stylex.props(page.principleTitle)}>Leave room to feel.</h3>
                <p {...stylex.props(page.principleBody)}>Use light, material, and movement to make an interaction memorable.</p>
              </div>
              <div {...stylex.props(page.principle)}>
                <span {...stylex.props(shared.label, shared.soft)}>03 / Exploration</span>
                <h3 {...stylex.props(page.principleTitle)}>Follow the anomaly.</h3>
                <p {...stylex.props(page.principleBody)}>Keep experimenting at the edge of what the system was meant to do.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="contact" aria-labelledby="contact-title" {...stylex.props(shared.section, page.contact)}>
          <div {...stylex.props(page.contactTop)}>
            <span {...stylex.props(shared.label, shared.muted)}><span {...stylex.props(shared.amber)}>03</span> / Make a connection</span>
            <span {...stylex.props(shared.label, page.contactNote)}>Good things start with a signal.</span>
          </div>
          <a href={githubProfile} target="_blank" rel="noreferrer" {...stylex.props(page.contactLink)}>
            <h2 id="contact-title" {...stylex.props(page.contactTitle)}>LET’S TALK<span {...stylex.props(shared.amber)}>.</span></h2>
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
