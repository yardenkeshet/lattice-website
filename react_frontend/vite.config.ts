/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['lattice.cs.technion.ac.il'],
    
    hmr: {
    	protocol: 'wss',
    	host: 'lattice.cs.technion.ac.il',
    	clientPort: 443,
    },

    proxy: {
      '/socket.io/': {
        target: 'http://127.0.0.1:5003',
        changeOrigin: true,
        ws: true, // Required for WebSockets and Socket.io polling upgrades
      },
    },
  },
  test: {
    projects: [
      /* ── Unit tests: API layer, utilities ── */
      {
        test: {
          name: 'unit',
          include: ['src/**/__tests__/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['src/**/*.stories.*'],
          environment: 'jsdom',
          globals: true,
        },
      },
      /* ── Storybook component tests ── */
      {
        extends: true,
        plugins: [
          storybookTest({ configDir: path.join(dirname, '.storybook') }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});