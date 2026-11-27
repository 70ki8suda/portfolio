import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { legacyRouteRedirect } from '../../blog/postPaths';

export const Route = createFileRoute('/blog')({
  beforeLoad: ({ location }) => {
    const href = legacyRouteRedirect(location);
    if (href) throw redirect({ href, statusCode: 301, reloadDocument: true });
  },
  component: Outlet,
});
