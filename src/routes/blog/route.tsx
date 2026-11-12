import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { PageShell } from '../../components/PageShell';

export const Route = createFileRoute('/blog')({
  component: BlogLayout,
});

function BlogLayout() {
  const immersive = useRouterState({ select: state =>
    /^\/blog\/?$/.test(state.location.pathname) && new URLSearchParams(state.location.searchStr).get('view') === 'graph',
  });
  return (
    <PageShell section="blog" immersive={immersive}>
      <Outlet />
    </PageShell>
  );
}
