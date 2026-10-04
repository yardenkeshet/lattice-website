import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  // Serial, not parallel: the real-DLL-backed happy-path test shares the
  // same backend DLL slot as any other concurrent calculation — running
  // E2E workers in parallel would introduce queue-contention flakiness
  // that has nothing to do with whether the app actually works.
  // fullyParallel: false alone only serializes tests within a single file,
  // not across files — workers: 1 is what actually forces one worker
  // (and therefore one test at a time) across the whole run.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
});
