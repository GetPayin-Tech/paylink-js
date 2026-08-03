import { defineConfig } from 'vitest/config';

/** A local config so Vitest does not walk up into the Laravel app's vite.config.js. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
