import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: process.env.SALU_E2E_URL ?? 'http://127.0.0.1:5174',
    launchOptions: process.env.SALU_CHROMIUM_PATH
      ? { executablePath: process.env.SALU_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: !process.env.CI,
  },
});
