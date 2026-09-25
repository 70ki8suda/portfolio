import { defineConfig } from 'vitest/config';

// Unit tests only; browser behaviour lives in Playwright under tests/.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
