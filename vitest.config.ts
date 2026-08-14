import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror the `@` / `~` aliases from .wxt/tsconfig.json so tests can import
    // source the same way entrypoints and utils do (e.g. `@/utils/octoShared`).
    alias: {
      '@': root,
      '~': root,
    },
  },
  test: {
    // Pure-logic tests stay in the fast `node` environment; only tests that
    // actually touch the DOM opt in here via glob instead of per-file
    // `// @vitest-environment jsdom` comments.
    environment: 'node',
    environmentMatchGlobs: [
      ['**/*.dom.test.ts', 'jsdom'],
      ['**/octoMath.test.ts', 'jsdom'],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['utils/**/*.ts', 'entrypoints/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        // pixi.js kick world is injected on demand and lives outside the
        // always-injected bundle; exclude it from coverage targets.
        'utils/octoFullscreenKickPixi.ts',
        'entrypoints/octo-kick-world.ts',
      ],
    },
  },
});
