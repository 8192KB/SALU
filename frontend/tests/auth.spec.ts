import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Account = { email: string; password: string; displayName: string };
function readAccount(): Account {
  let account: Account;
  try {
    const contents = JSON.parse(
      readFileSync(
        resolve(process.env.SALU_E2E_LOGIN_FILE ?? '/tmp/salu-storage-fixture.json'),
        'utf8',
      ),
    );
    account = Array.isArray(contents) ? contents[0] : contents;
  } catch {
    throw new Error(
      '실제 인증 검증: SALU_E2E_LOGIN_FILE에 Git에서 제외된 개발 계정 JSON 경로 지정 필요',
    );
  }
  if (
    !account ||
    typeof account.email !== 'string' ||
    typeof account.password !== 'string' ||
    typeof account.displayName !== 'string'
  )
    throw new Error('실제 인증 검증: 개발 계정 파일 형식 확인 필요');
  return account;
}

const test = base.extend<{ browserGuard: void }>({
  browserGuard: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use();
      expect(errors).toEqual([]);
      expect(
        await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== 'salu.theme')),
      ).toEqual([]);
      const theme = await page.evaluate(() => localStorage.getItem('salu.theme'));
      if (theme !== null) expect(['system', 'light', 'dark']).toContain(theme);
      expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
    },
    { auto: true },
  ],
});
test.beforeEach(async ({ request }) => {
  const account = readAccount();
  if (!account.email.startsWith('storage-'))
    throw new Error(
      '인증 화면 검증은 scripts/storage-test-server.sh의 salu_test 임시 계정이 필요합니다.',
    );
  const csrf = await (await request.get('/api/csrf')).json();
  expect(
    (
      await request.post('/api/auth/login', {
        form: { email: account.email, password: account.password },
        headers: { [csrf.headerName]: csrf.token },
      })
    ).status(),
  ).toBe(200);
  const next = await (await request.get('/api/csrf')).json();
  expect(
    (
      await request.post('/api/__storage-test/reset', {
        headers: { [next.headerName]: next.token },
      })
    ).status(),
  ).toBe(204);
  await request.post('/api/auth/logout', { headers: { [next.headerName]: next.token } });
});
async function submitLogin(page: Page) {
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  const confirmation = page.getByRole('dialog', {
    name: '작성한 내용을 비우고 로그인할까요?',
    exact: true,
  });
  if (await confirmation.isVisible())
    await confirmation.getByRole('button', { name: '비우고 로그인', exact: true }).click();
}
async function login(page: Page, account: Account) {
  await page.goto('/login');
  await page.getByLabel('이메일', { exact: true }).fill(account.email);
  await page.getByLabel('비밀번호', { exact: true }).fill(account.password);
  await submitLogin(page);
  await expect(page.getByLabel('계정')).toContainText(`${account.displayName}님`);
}
async function logout(page: Page) {
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃 확인', exact: true }).click();
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
}
async function focusAfterDelay(page: Page) {
  await page.clock.install();
  await page.clock.fastForward(6000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test('실제 로그인·실패·세션 교체·새로고침·로그아웃과 예시 초안 분리', async ({ page, context }) => {
  const account = readAccount();
  expect((await context.request.get('/api/health')).status()).toBe(200);
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점', { exact: true }).fill('비로그인 예시 초안');
  if (await page.locator('.task-exit').count()) await page.locator('.task-exit').click();
  await page.getByRole('link', { name: '로그인', exact: true }).click();
  await page.getByLabel('이메일', { exact: true }).fill(account.email);
  await page.getByLabel('비밀번호', { exact: true }).fill('not-the-real-password');
  await submitLogin(page);
  await expect(page.getByRole('alert')).toContainText('이메일 또는 비밀번호');
  expect((await page.getByLabel('비밀번호', { exact: true }).inputValue()) === '').toBe(true);
  const oldSession = (await context.cookies()).find((cookie) => cookie.name === 'SALU_SESSION');
  await page.getByRole('link', { name: '내 기록으로 돌아가기' }).click();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점', { exact: true })).toHaveValue('비로그인 예시 초안');
  await page.getByLabel('좋았던 점', { exact: true }).fill('로그인 시 정리할 예시 초안');
  if (await page.locator('.task-exit').count()) await page.locator('.task-exit').click();
  await page.getByRole('link', { name: '로그인', exact: true }).click();
  await page.getByLabel('이메일', { exact: true }).fill(account.email);
  await page.getByLabel('비밀번호', { exact: true }).fill(account.password);
  await submitLogin(page);
  await expect(page.getByLabel('계정')).toContainText(`${account.displayName}님`);
  const session = (await context.cookies()).find((cookie) => cookie.name === 'SALU_SESSION');
  expect(Boolean(session?.value && oldSession?.value && session.value !== oldSession.value)).toBe(
    true,
  );
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie.includes('SALU_SESSION'))).toBe(false);
  await page.reload();
  await expect(page.getByLabel('계정')).toContainText(`${account.displayName}님`);
  expect((await context.request.get('/api/auth/me')).status()).toBe(200);
  await page.getByRole('link', { name: '커트 기록 남기기', exact: true }).click();
  await expect(page.getByLabel('좋았던 점', { exact: true })).toHaveValue(
    '로그인 시 정리할 예시 초안',
  );
  await page.getByLabel('좋았던 점', { exact: true }).fill('로그인 회원의 예시 초안');
  await page.locator('.task-exit').click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: '계속 사용' }).click();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점', { exact: true })).toHaveValue(
    '로그인 회원의 예시 초안',
  );
  await page.locator('.task-exit').click();
  await logout(page);
  expect((await context.request.get('/api/auth/me')).status()).toBe(401);
  await page.getByRole('link', { name: '커트 기록 남기기', exact: true }).click();
  await expect(page.getByLabel('좋았던 점', { exact: true })).toHaveValue('');
});

test('503 계정 확인은 비로그인으로 처리하지 않고 예시 작성 유지 후 복구', async ({ page }) => {
  const account = readAccount();
  await login(page, account);
  await page.getByRole('link', { name: '커트 기록 남기기', exact: true }).click();
  await page.getByLabel('좋았던 점', { exact: true }).fill('장애 동안 유지할 예시');
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({ status: 503, json: { code: 'DATABASE_UNAVAILABLE' } }),
  );
  await focusAfterDelay(page);
  await expect(page.getByRole('alert')).toContainText('계정 정보를 확인할 수 없어요');
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
  await expect(page.getByLabel('좋았던 점', { exact: true })).toHaveValue('장애 동안 유지할 예시');
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: '로그인 상태 다시 확인' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByLabel('좋았던 점', { exact: true })).toHaveValue('장애 동안 유지할 예시');
  await page.locator('.task-exit').click();
  await expect(page.getByLabel('계정')).toContainText(`${account.displayName}님`);
});

test('실제 외부 로그아웃 뒤 세션 재확인은 예시 초안 초기화', async ({ page, context }) => {
  const account = readAccount();
  await login(page, account);
  await page.getByRole('link', { name: '커트 기록 남기기', exact: true }).click();
  await page.getByLabel('좋았던 점', { exact: true }).fill('다른 계정에 보이면 안 되는 초안');
  const csrf = await (await context.request.get('/api/csrf')).json();
  expect(
    (
      await context.request.post('/api/auth/logout', { headers: { [csrf.headerName]: csrf.token } })
    ).status(),
  ).toBe(204);
  await focusAfterDelay(page);
  await expect(page.getByLabel('좋았던 점', { exact: true })).toHaveValue('');
  await page.locator('.task-exit').click();
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
});

test('CSRF 만료 시 새 토큰으로 한 번 재시도 후 실제 로그인', async ({ page }) => {
  const account = readAccount();
  let attempts = 0;
  await page.route('**/api/auth/login', (route) => {
    attempts++;
    return attempts === 1
      ? route.fulfill({ status: 403, json: { code: 'CSRF_INVALID' } })
      : route.continue();
  });
  await login(page, account);
  expect(attempts).toBe(2);
});

for (const [code, expectedAttempts] of [
  ['ACCESS_DENIED', 1],
  ['CSRF_INVALID', 2],
] as const) {
  test(`${code} 실패 시 재시도 횟수 제한과 비밀번호 제거`, async ({ page }) => {
    let attempts = 0;
    await page.route('**/api/auth/login', (route) => {
      attempts++;
      return route.fulfill({ status: 403, json: { code } });
    });
    await page.goto('/login');
    await page.getByLabel('이메일', { exact: true }).fill('example@example.test');
    await page.getByLabel('비밀번호', { exact: true }).fill('example-input');
    await submitLogin(page);
    await expect(page.getByRole('alert')).toBeVisible();
    expect(attempts).toBe(expectedAttempts);
    expect((await page.getByLabel('비밀번호', { exact: true }).inputValue()) === '').toBe(true);
  });
}

test('실제 로그인 성공 후 토큰 재조회 실패가 성공을 취소하지 않음', async ({ page }) => {
  let csrfRequests = 0;
  await page.route('**/api/csrf', (route) =>
    ++csrfRequests > 1 ? route.abort('connectionrefused') : route.continue(),
  );
  await login(page, readAccount());
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('로그아웃 연결 실패는 로그인·작성 내용을 유지하고 재시도 가능', async ({ page }) => {
  const account = readAccount();
  await login(page, account);
  await page.getByRole('link', { name: '커트 기록 남기기', exact: true }).click();
  await page.getByLabel('좋았던 점', { exact: true }).fill('로그아웃 실패 때 유지');
  await page.locator('.task-exit').click();
  await page.route('**/api/auth/logout', (route) => route.abort('connectionrefused'));
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃 확인', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('서버에 연결할 수 없어요');
  await expect(page.getByLabel('계정')).toContainText(`${account.displayName}님`);
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점', { exact: true })).toHaveValue('로그아웃 실패 때 유지');
  await page.locator('.task-exit').click();
  await page.unroute('**/api/auth/logout');
  await logout(page);
});

test('모바일 로그인과 연결 실패 안내·복구, 가로 넘침 없음', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/auth/me', (route) => route.abort('connectionrefused'));
  await page.goto('/login');
  await expect(page.getByRole('alert')).toContainText('서버에 연결할 수 없어요');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.unroute('**/api/auth/me');
  await page.getByRole('button', { name: '로그인 상태 다시 확인' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByLabel('이메일', { exact: true }).fill(readAccount().email);
  await page.getByLabel('비밀번호', { exact: true }).fill(readAccount().password);
  await submitLogin(page);
  await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('로그인 상태 조회 중에도 소개 홈과 기기 기록 작성 가능', async ({ page }) => {
  let release: () => void = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/me', async (route) => {
    await hold;
    await route.fulfill({ status: 401, json: { code: 'AUTHENTICATION_REQUIRED' } });
  });
  await page.goto('/');
  try {
    await expect(
      page.getByRole('heading', { name: '커트 기록, 남겨볼까요?', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('계정 확인 중', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: '커트 기록 남기기', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '커트 기록 남기기', exact: true }),
    ).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: '커트 기록 남기기', exact: true })).toBeVisible();
});

test('로그인 화면에 삭제 확인 없이 돌아오면 작성 내용 유지', async ({ page }) => {
  let loginRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/auth/login') loginRequests++;
  });
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점', { exact: true }).fill('로그인 취소 후 유지할 기록');
  if (await page.locator('.task-exit').count()) await page.locator('.task-exit').click();
  await page.getByRole('link', { name: '로그인', exact: true }).click();
  await expect(page.getByText('현재 기록은 서버에 저장되지 않으며', { exact: false })).toHaveCount(
    0,
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: '내 기록으로 돌아가기', exact: true }).click();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점', { exact: true })).toHaveValue(
    '로그인 취소 후 유지할 기록',
  );
  expect(loginRequests).toBe(0);
});

test('소셜 연결 조회 완료 전에는 연결 버튼을 열지 않고 실패 후 다시 조회 가능', async ({
  page,
}) => {
  await login(page, readAccount());
  await page.route('**/api/auth/oauth2/providers', (route) =>
    route.fulfill({ json: ['google', 'naver'] }),
  );
  let fail = true;
  let release: (() => void) | undefined;
  await page.route('**/api/auth/oauth2/linked', async (route) => {
    if (fail) {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await route.fulfill({ status: 503, json: { code: 'INTERNAL_ERROR' } });
    } else await route.fulfill({ json: ['google'] });
  });
  await page.goto('/account');
  await expect.poll(() => typeof release).toBe('function');
  await expect(page.getByText('간편 로그인 확인 중', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Google 계정 연결', exact: true })).toHaveCount(0);
  release!();
  await expect(page.getByRole('alert')).toContainText('연결한 계정을 확인하지 못했어요.');
  await expect(page.getByRole('button', { name: 'Google 계정 연결', exact: true })).toHaveCount(0);
  fail = false;
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Google 연결됨', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '네이버 계정 연결', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('서버 장애 중 로그인 실패는 한 번만 안내하고 상태 재확인 후 이전 오류 제거', async ({
  page,
}) => {
  let unavailable = true;
  await page.route('**/api/auth/me', (route) =>
    unavailable
      ? route.fulfill({ status: 503, json: { code: 'AUTHENTICATION_UNAVAILABLE' } })
      : route.continue(),
  );
  await page.route('**/api/auth/login', (route) =>
    route.fulfill({ status: 503, json: { code: 'AUTHENTICATION_UNAVAILABLE' } }),
  );
  await page.goto('/login');
  await expect(page.getByRole('alert')).toHaveCount(1);
  await page.getByLabel('이메일', { exact: true }).fill('visual@example.invalid');
  await page.getByLabel('비밀번호', { exact: true }).fill('visual-fixture');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.locator('.login-form > [role="alert"]')).toContainText(
    '로그인 서버를 사용할 수 없어요.',
  );
  await expect(page.getByRole('alert')).toHaveCount(1);
  unavailable = false;
  await page.getByRole('button', { name: '로그인 상태 다시 확인', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
