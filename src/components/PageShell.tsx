import type { ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Link } from '@tanstack/react-router';
import { ArrowIcon, SignalMark } from './Icons';
import { page } from '../styles/page.stylex';
import { shared } from '../styles/shared.stylex';
import { shell } from '../styles/blog.stylex';
import { siteName } from '../site';

interface PageShellProps {
  /** Highlights the matching navigation item. */
  section?: 'blog';
  children: ReactNode;
}

/** Header, main landmark, and footer for pages other than the full-bleed homepage. */
export function PageShell({ section, children }: PageShellProps) {
  return (
    <div {...stylex.props(shell.root)}>
      <a href="#main" {...stylex.props(page.skip)}>Skip to content</a>
      <header {...stylex.props(shell.header)}>
        <Link to="/" activeOptions={{ exact: true }} aria-label={`${siteName} — home`} {...stylex.props(page.identity)}>
          <SignalMark />
          <span>{siteName}<span {...stylex.props(page.identityDot)}>.</span></span>
        </Link>
        <nav aria-label="Main navigation" {...stylex.props(page.nav)}>
          <Link to="/blog" activeOptions={{ exact: true, includeSearch: false }} {...stylex.props(page.navLink, section === 'blog' && shell.navCurrent)}>Blog</Link>
          <Link to="/" hash="contact" activeOptions={{ exact: true, includeHash: true }} {...stylex.props(page.navLink)}>Contact<span {...stylex.props(page.navArrow)}><ArrowIcon /></span></Link>
        </nav>
      </header>
      <main id="main" tabIndex={-1} {...stylex.props(shell.main)}>{children}</main>
      <footer {...stylex.props(page.footer)}>
        <Link to="/" activeOptions={{ exact: true }} {...stylex.props(page.footerIdentity)}><SignalMark /><span>{siteName}</span></Link>
        <span {...stylex.props(shared.label, page.footerNote)}>Made of code. Open to possibility.</span>
        <a href="#main" {...stylex.props(shared.textLink, page.backTop)}>Back to top <span aria-hidden="true">↑</span></a>
      </footer>
    </div>
  );
}
