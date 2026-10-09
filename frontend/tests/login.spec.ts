import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.env.SALU_E2E_LOGIN_FILE;
test.describe('actual session login', () => {
  test.skip(!file, 'SALU_E2E_LOGIN_FILE: 실제 개발 계정 파일 필요');
  test('wrong password, login, reload, cookie security and logout', async ({ page, context }) => {
    const account = JSON.parse(readFileSync(resolve(file!), 'utf8')) as { email: string; password: string; displayName: string };
    await page.goto('/');
    await expect(page.getByLabel('이메일', { exact: true })).toBeEnabled();
    await page.getByLabel('이메일', { exact: true }).fill(account.email);
    await page.getByLabel('비밀번호', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('이메일 또는 비밀번호를 확인하세요.');
    await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('');
    await page.getByLabel('비밀번호', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByText(`${account.displayName}님, 안녕하세요.`)).toBeVisible();
    const session = (await context.cookies()).find(cookie => cookie.name === 'SALU_SESSION');
    expect(session?.httpOnly).toBe(true); expect(session?.sameSite).toBe('Lax');
    expect(await page.evaluate(() => document.cookie)).not.toContain('SALU_SESSION');
    expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
    await page.reload();
    await expect(page.getByText(`${account.displayName}님, 안녕하세요.`)).toBeVisible();
    await page.getByRole('button', { name: '로그아웃', exact: true }).click();
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeEnabled();
    expect((await context.request.get('/api/auth/me')).status()).toBe(401);
  });
  test('mobile login form remains within viewport and server failure is visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/auth/login', route => route.abort('connectionrefused'));
    await page.goto('/');
    await expect(page.getByLabel('이메일', { exact: true })).toBeEnabled();
    await page.getByLabel('이메일', { exact: true }).fill('offline@example.test');
    await page.getByLabel('비밀번호', { exact: true }).fill('not-a-real-password');
    await page.getByRole('button', { name: '로그인', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('서버에 연결할 수 없습니다.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
