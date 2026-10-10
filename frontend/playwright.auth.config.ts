import { defineConfig } from '@playwright/test';

const baseURL = process.env.SALU_AUTH_E2E_URL ?? 'http://127.0.0.1:5187';
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results/auth',
  testMatch: 'auth.spec.ts',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    // 실제 계정 비밀번호·CSRF가 포함되는 trace/video/screenshot을 저장하지 않음
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    launchOptions: process.env.SALU_CHROMIUM_PATH
      ? { executablePath: process.env.SALU_CHROMIUM_PATH }
      : {},
  },
  webServer: process.env.SALU_AUTH_E2E_URL
    ? undefined
    : {
        command: 'npm run dev -- --port 5187',
        env: { VITE_SALU_AUTH_MODE: 'server' },
        url: baseURL,
        reuseExistingServer: false,
        timeout: 15_000,
      },
});
