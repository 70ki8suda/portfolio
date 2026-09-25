import { createFileRoute, Outlet } from '@tanstack/react-router';
import { PageShell } from '../../components/PageShell';

export const Route = createFileRoute('/blog')({
  component: BlogLayout,
});

function BlogLayout() {
  return (
    <PageShell section="blog">
      <Outlet />
    </PageShell>
  );
}
