import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import stylex from '@stylexjs/unplugin';

export default defineConfig({
  plugins: [
    stylex.vite({
      dev: process.env.NODE_ENV !== 'production',
      runtimeInjection: false,
      useCSSLayers: true,
    }),
    react(),
  ],
  build: {
    target: 'es2022',
  },
});
