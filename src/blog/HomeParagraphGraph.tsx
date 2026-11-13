import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import * as stylex from '@stylexjs/stylex';
import type { GraphSearch } from './ParagraphGraph';
import { graph } from '../styles/graph.stylex';
const ParagraphGraph = lazy(() => import('./ParagraphGraph'));

/** A bounded, opt-in interaction surface: the page keeps scrolling until the reader enters the map. */
export function HomeParagraphGraph() {
  const host = useRef<HTMLDivElement>(null);
  const activateButton = useRef<HTMLButtonElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(false);
  const [search, setSearch] = useState<GraphSearch>({});
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting);
      if (!entry.isIntersecting) setActive(false);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!active || !surface.current) return;
    const element = surface.current;
    // Keep the viewport still while entering the map, including after a lazy load.
    element.focus({ preventScroll: true });
    const focusCanvas = () => {
      const canvas = element.querySelector<HTMLElement>('[data-testid=graph-canvas]');
      if (!canvas) return false;
      if (document.activeElement === element) canvas.focus({ preventScroll: true });
      return true;
    };
    if (focusCanvas()) return;
    const observer = new MutationObserver(() => { if (focusCanvas()) observer.disconnect(); });
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active]);
  return <section aria-label="graph view" lang="ja" {...stylex.props(graph.homeSection)}>
    <div ref={host} data-testid="home-graph" {...stylex.props(graph.homeMap)}>
      <div ref={surface} tabIndex={-1} inert={!active} style={{ height: '100%' }}>{visible && <Suspense fallback={<p role="status" {...stylex.props(graph.status)}>graph viewを読み込んでいます…</p>}>
        <ParagraphGraph embedded search={search} onChange={setSearch} />
      </Suspense>}</div>
      {!active ? <div {...stylex.props(graph.activation)}>
        <button ref={activateButton} type="button" {...stylex.props(graph.glass, graph.control)} onClick={() => setActive(true)}>graph viewを操作</button>
      </div> : <button type="button" {...stylex.props(graph.glass, graph.control, graph.leaveEmbedded)} onClick={() => { setActive(false); requestAnimationFrame(() => activateButton.current?.focus({ preventScroll: true })); }}>ページ操作へ</button>}
    </div>
    <Link to="/blog" data-testid="home-blog-link" {...stylex.props(graph.homeBlogLink)}>ブログの記事一覧へ</Link>
  </section>;
}
