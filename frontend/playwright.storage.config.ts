import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  testMatch: ['cloud-storage.spec.ts', 'directory-storage.spec.ts'],
  outputDir: '/tmp/salu-cloud-storage-results',
  timeout: 60000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5189',
    viewport: { width: 1440, height: 1000 },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    launchOptions: process.env.SALU_CHROMIUM_PATH
      ? { executablePath: process.env.SALU_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npm run dev -- --port 5189',
    env: { SALU_SERVER_PORT: '8083', VITE_SALU_AUTH_MODE: 'server' },
    url: 'http://127.0.0.1:5189',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
