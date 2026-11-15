import { readFile } from 'node:fs/promises';
import type { Plugin } from 'vite';

/** No public asset copy: only the explicitly enabled development server can serve this fixed directory. */
export function claimPreviewServer(enabled: boolean): Plugin {
  return {
    name: 'local-claim-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0];
        if (!path?.startsWith('/__claim-preview/')) return next();
        const file = path === '/__claim-preview/paragraphs.json' ? 'paragraphs.json'
          : path === '/__claim-preview/claims.json' ? 'graph-claims.json' : undefined;
        if (!enabled || !file) { res.statusCode = 404; res.end(); return; }
        try {
          const data = await readFile(`/tmp/section-claim-existing-graph/${file}`);
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(data);
        } catch { res.statusCode = 503; res.end('Preview dataset unavailable'); }
      });
    },
  };
}
