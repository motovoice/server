import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Undo vi.stubEnv / vi.spyOn after every test.
    unstubEnvs: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Entry point only wires up listen() and the cleanup interval.
      exclude: ['src/server.ts'],
      reporter: ['text', 'lcov'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          setupFiles: ['test/setup-env.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          globalSetup: ['test/integration/global-setup.ts'],
          setupFiles: ['test/setup-env.ts', 'test/integration/setup-db.ts'],
          // All files share one database and truncate it between tests.
          fileParallelism: false,
        },
      },
    ],
  },
});
