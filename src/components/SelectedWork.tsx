import * as stylex from '@stylexjs/stylex';
import { ArrowIcon } from './Icons';
import { work } from '../styles/work.stylex';
import { shared } from '../styles/shared.stylex';

export function SelectedWork() {
  return (
    <section id="work" aria-labelledby="work-title" {...stylex.props(shared.section)}>
      <div {...stylex.props(shared.sectionHeader)}>
        <div>
          <p {...stylex.props(shared.label, work.sectionKicker)}><span {...stylex.props(shared.amber)}>01</span> / Selected work & experiments</p>
          <h2 id="work-title" {...stylex.props(shared.sectionTitle)}>Systems with a pulse.</h2>
        </div>
        <span {...stylex.props(shared.label, shared.sectionIndex)}>A project. An experiment.</span>
      </div>

      <article {...stylex.props(work.project)}>
        <a href="https://github.com/70ki8suda/nodex" target="_blank" rel="noreferrer" aria-label="Explore the Nodex repository on GitHub (opens in a new tab)" {...stylex.props(work.nodexVisual)}>
          <span {...stylex.props(shared.label, work.visualTop)}>Creative systems / Nodex</span>
          <div {...stylex.props(work.nodexDiagram)} aria-hidden="true">
            <div {...stylex.props(work.diagramAxis, work.diagramAxisHorizontal)} />
            <div {...stylex.props(work.diagramAxis, work.diagramAxisVertical)} />
            <div {...stylex.props(work.diagramRing, work.diagramRingOuter)} />
            <div {...stylex.props(work.diagramRing, work.diagramRingInner)} />
            <div {...stylex.props(work.diagramCore)}><span {...stylex.props(work.diagramCoreInner)} /></div>
            <span {...stylex.props(work.diagramNode, work.nodeA)} />
            <span {...stylex.props(work.diagramNode, work.nodeB)} />
          </div>
          <span {...stylex.props(work.nodexWordmark)}>nodex<span {...stylex.props(shared.cyan)}>_</span></span>
          <div {...stylex.props(work.visualBottom)}><span {...stylex.props(shared.label)}>A world for creative systems.</span><ArrowIcon /></div>
        </a>
        <div {...stylex.props(work.projectInfo)}>
          <div {...stylex.props(work.projectMeta)}><span {...stylex.props(shared.label, shared.soft)}>001 / Software</span><span {...stylex.props(shared.label, work.projectTag)}>On GitHub</span></div>
          <h3 {...stylex.props(work.projectTitle)}>Nodex</h3>
          <p {...stylex.props(work.projectSubtitle)}>The instrument. The atmosphere.</p>
          <p {...stylex.props(work.projectDescription)}>A software project exploring creative systems with a precise, cinematic visual language. Structured interfaces, thoughtful materials, and a quietly luminous world.</p>
          <div {...stylex.props(work.projectTopics)}><span>Creative systems</span><span>Design language</span><span>Interface</span></div>
          <a href="https://github.com/70ki8suda/nodex" target="_blank" rel="noreferrer" {...stylex.props(shared.textLink, work.projectLink)}>Explore Nodex <ArrowIcon /></a>
          <p {...stylex.props(shared.label, work.caption)}>Visual interpretation of its design language.</p>
        </div>
      </article>

      <article {...stylex.props(work.study)}>
        <div {...stylex.props(work.studyIndex)}><span {...stylex.props(shared.label, shared.amber)}>002</span><span {...stylex.props(shared.label, shared.soft)}>Experiment</span></div>
        <div {...stylex.props(work.studyBody)}>
          <h3 {...stylex.props(work.studyTitle)}>Signal / Bloom</h3>
          <p {...stylex.props(work.studyDescription)}>Organic form meets geometric interference. A live study in the space between the natural and the constructed.</p>
        </div>
        <a href="#top" {...stylex.props(shared.textLink, work.studyLink)}>Enter the experiment <ArrowIcon /></a>
      </article>
    </section>
  );
}
