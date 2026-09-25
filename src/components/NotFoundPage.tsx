import * as stylex from '@stylexjs/stylex';
import { Link } from '@tanstack/react-router';
import { PageShell } from './PageShell';
import { blog } from '../styles/blog.stylex';
import { shared } from '../styles/shared.stylex';

export function NotFoundPage() {
  return (
    <PageShell>
      <NotFoundMessage title="Page not found." body="There is nothing at this address." />
    </PageShell>
  );
}

/** Also used inside the blog layout when a post slug does not exist or is a draft. */
export function NotFoundMessage({ title, body }: { title: string; body: string }) {
  return (
    <div {...stylex.props(blog.grid)}>
      <p {...stylex.props(shared.label, blog.sideLabel)}><span {...stylex.props(shared.amber)}>404</span> / Not found</p>
      <div>
        <h1 {...stylex.props(blog.pageTitle)}>{title}</h1>
        <p {...stylex.props(blog.intro)}>{body}</p>
        <div {...stylex.props(blog.actions)}>
          <Link to="/blog" {...stylex.props(shared.textLink)}>Browse the blog <span aria-hidden="true">→</span></Link>
          <Link to="/" {...stylex.props(shared.textLink)}>Go home <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </div>
  );
}
