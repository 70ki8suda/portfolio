import { createFileRoute } from '@tanstack/react-router';
import App from '../App';
import { siteDescription, siteTitle } from '../site';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: siteTitle },
      { name: 'description', content: siteDescription },
    ],
  }),
  component: App,
});
