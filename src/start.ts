import { createStart, createMiddleware, createCsrfMiddleware } from '@tanstack/react-start';
import { legacyPostRedirect } from './blog/postPaths';

const legacyUrls = createMiddleware().server(({ request, next }) => {
  const url = new URL(request.url);
  const href = legacyPostRedirect(url.pathname, url.search);
  // Before Router parses search: keep duplicate parameters and original encoding.
  if (href && (request.method === 'GET' || request.method === 'HEAD')) {
    return new Response(null, { status: 301, headers: { Location: href } });
  }
  return next();
});

// Preserve Start's default server-function CSRF protection when providing start.ts.
export const startInstance = createStart(() => ({
  requestMiddleware: [createCsrfMiddleware({ filter: ctx => ctx.handlerType === 'serverFn' }), legacyUrls],
}));
