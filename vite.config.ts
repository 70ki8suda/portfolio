import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';

export default defineConfig({
  plugins: [
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
});
