import { defineConfig } from '@playwright/test';

const baseURL = process.env.SALU_E2E_URL ?? 'http://127.0.0.1:5185';

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results/prototype',
  testMatch: 'prototype.spec.ts',
  timeout: 20_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.SALU_CHROMIUM_PATH
      ? { executablePath: process.env.SALU_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: process.env.SALU_E2E_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5185',
        env: { VITE_SALU_AUTH_MODE: 'prototype' },
        url: baseURL,
        reuseExistingServer: false,
        timeout: 15_000,
      },
});
