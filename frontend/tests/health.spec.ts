import { test, expect } from '@playwright/test';

test('actual backend and database connection is displayed through the Vite proxy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('서버와 DB 연결 정상');
  await expect(page.locator('.service-state')).toHaveText(['연결 정상', '연결 정상', '연결 정상']);
});

test('database failure keeps the server online and supports retry', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ status: 503, json: {
    status: 'DEGRADED', server: 'UP', database: 'DOWN', checkedAt: new Date().toISOString(),
    code: 'DATABASE_UNAVAILABLE', message: 'DB 연결 실패. DB 실행 상태와 서버 환경변수를 확인하세요.',
  } }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('DB 연결 실패');
  await expect(page.locator('.service-state')).toHaveText(['연결 정상', '연결 정상', '연결 실패']);
  await page.unroute('**/api/health');
  await page.getByRole('button', { name: '다시 확인' }).click();
  await expect(page.getByRole('status')).toContainText('서버와 DB 연결 정상');
});

test('unreachable server shows an actionable error and does not claim DB success', async ({ page }) => {
  await page.route('**/api/health', route => route.abort('connectionrefused'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('환경변수 누락 또는 DB 연결 오류');
  await expect(page.locator('.service-state')).toHaveText(['연결 정상', '연결 실패', '확인 불가']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
