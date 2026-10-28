import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // Several suites walk the whole content tree, and they run in parallel
    // workers, so the 5s default times out on a loaded machine even though
    // every test passes. This matches the timeout the repo already passed by
    // hand (`npm run test -- --test-timeout=30000`).
    testTimeout: 30_000,
  },
});
