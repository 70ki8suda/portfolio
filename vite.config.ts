import { musicPreviewServer } from './scripts/music-preview-server';
import { claimPreviewServer } from './scripts/claim-preview-server';
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';

export default defineConfig(({ command, isPreview }) => ({
  // Only these non-secret development switches cross into the Workers runtime.
  define: {
    'process.env.MUSIC_GRAPH_PREVIEW': JSON.stringify(command === 'serve' && !isPreview && process.env.MUSIC_GRAPH_PREVIEW === '1' ? '1' : '0'),
    'process.env.GRAPH_CLAIM_PREVIEW': JSON.stringify(command === 'serve' && !isPreview && process.env.GRAPH_CLAIM_PREVIEW === '1' ? '1' : '0'),
    'process.env.BLOG_FIXTURES': JSON.stringify(command === 'serve' && !isPreview && process.env.BLOG_FIXTURES === '1' ? '1' : '0'),
    'process.env.BLOG_DRAFTS': JSON.stringify(command === 'serve' && !isPreview && process.env.BLOG_DRAFTS === '1' ? '1' : '0'),
  },
  plugins: [
    musicPreviewServer(command === 'serve' && !isPreview && process.env.MUSIC_GRAPH_PREVIEW === '1'),
    claimPreviewServer(command === 'serve' && !isPreview && process.env.GRAPH_CLAIM_PREVIEW === '1'),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    stylex.vite({
      dev: process.env.NODE_ENV !== 'production',
      runtimeInjection: false,
      useCSSLayers: true,
    }),
    tanstackStart(),
    // React's plugin must come after TanStack Start's.
    react(),
  ],
  // Loaded on demand by src/transitions; listed so the dev server never reloads the page to optimize them mid-navigation.
  optimizeDeps: {
    include: ['@vfx-js/core', '@vfx-js/transitions'],
  },
  build: {
    target: 'es2022',
  },
}));
