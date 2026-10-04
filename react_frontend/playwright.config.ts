import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  // Serial, not parallel: the real-DLL-backed happy-path test shares the
  // same backend DLL slot as any other concurrent calculation — running
  // E2E workers in parallel would introduce queue-contention flakiness
  // that has nothing to do with whether the app actually works.
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
});
