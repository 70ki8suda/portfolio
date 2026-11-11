/// <reference types="vite/client" />
import type { ReactNode } from 'react';
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import '@fontsource-variable/space-grotesk';
import '@fontsource/dm-mono/400.css';
import '../styles/global.css';
import { DevStyleXInject } from '../components/DevStyleXInject';
import { NotFoundPage } from '../components/NotFoundPage';
import { PageTransitions } from '../components/PageTransitions';
import { siteTitle } from '../site';

const favicon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23f3f1eb'/%3E%3Cpath d='M16 16h32v32H16zM16 48l32-32M16 32h32M32 16v32' fill='none' stroke='%23366b87' stroke-width='2'/%3E%3C/svg%3E";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1.0' },
      { name: 'theme-color', content: '#f3f1eb' },
      { title: siteTitle },
    ],
    links: [{ rel: 'icon', href: favicon }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {import.meta.env.DEV && <DevStyleXInject />}
      </head>
      <body>
        {children}
        <PageTransitions />
        <Scripts />
      </body>
    </html>
  );
}
