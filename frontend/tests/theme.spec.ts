import { expect, test } from '@playwright/test';

async function choose(page: import('@playwright/test').Page, label: string) {
  await page.getByRole('button', { name: '화면 설정', exact: true }).click();
  await page.getByRole('radio', { name: label, exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: '완료', exact: true }).click();
}

test('기기 설정을 따르고 직접 선택한 화면은 재접속에도 유지', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await choose(page, '어두운 화면');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await choose(page, '기기 설정 따르기');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['salu.theme']);
  expect(await page.evaluate(() => localStorage.getItem('salu.theme'))).toBe('system');
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

test('작성 중 화면 설정은 입력과 페이지를 보존', async ({ page }) => {
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점').fill('화면 설정 후에도 유지할 기록');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  const address = page.url();
  await choose(page, '어두운 화면');
  await expect(page).toHaveURL(address);
  await expect(page.getByLabel('좋았던 점')).toHaveValue('화면 설정 후에도 유지할 기록');
  await expect(page.getByRole('checkbox', { name: '옆머리', exact: true })).toBeChecked();
  const colors = await page.getByLabel('좋았던 점').evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
  expect(colors.background).toBe('rgb(28, 39, 37)');
  expect(colors.text).toBe('rgb(232, 241, 237)');
  await expect(page.getByRole('heading', { name: '커트 정보', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '당일 기록', exact: true })).toBeVisible();
  await choose(page, '밝은 화면');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 · 경과', exact: true })).toBeVisible();
});

test('화면 설정 저장이 제한되어도 테마와 기록 입력은 작동', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점').fill('저장 제한에서도 작성 가능');
  await choose(page, '어두운 화면');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByLabel('좋았던 점')).toHaveValue('저장 제한에서도 작성 가능');
  expect(errors).toEqual([]);
});

test('React를 불러오기 전에도 기기 설정과 직접 선택에 맞는 화면 모드 적용', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.route('**/src/main.tsx*', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#121a19');
  await expect(page.locator('#root')).toBeEmpty();
  await page.evaluate(() => localStorage.setItem('salu.theme', 'light'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f7f9f8');
});
