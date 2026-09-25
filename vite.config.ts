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
  build: {
    target: 'es2022',
  },
});
