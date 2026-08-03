import { defineConfig } from 'vitest/config';

/** A local config so Vitest does not walk up into the Laravel app's vite.config.js. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // index.ts is pure re-exports; the dist smoke test covers it end-to-end.
      exclude: ['src/index.ts'],
      reporter: ['text', 'lcov'],
      // The signing path is what must not regress silently, so the floor is a
      // real gate rather than an aspiration.
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
