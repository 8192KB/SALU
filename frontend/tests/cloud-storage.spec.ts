import { test, expect } from '@playwright/test';
import type { Page, BrowserContext } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Account = { id: number; email: string; password: string; displayName: string };
const accounts: Account[] = JSON.parse(
  readFileSync(process.env.SALU_STORAGE_FIXTURE ?? '/tmp/salu-storage-fixture.json', 'utf8'),
);
async function login(page: Page, account: Account) {
  await page.goto('/login');
  await page.getByLabel('이메일', { exact: true }).fill(account.email);
  await page.getByLabel('비밀번호', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByLabel('계정')).toContainText(account.displayName);
}
async function logout(page: Page) {
  if (await page.locator('.task-exit').count()) await page.locator('.task-exit').click();
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await page.getByRole('button', { name: '로그아웃 확인', exact: true }).click();
  await expect(page.getByRole('link', { name: '로그인', exact: true })).toBeVisible();
}
async function create(page: Page, note: string) {
  await page.goto('/records/new');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill(note);
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 · 경과', exact: true })).toBeVisible();
}
async function synced(page: Page) {
  await expect(page.locator('.storage-notice')).toContainText('서버에도 저장됨', {
    timeout: 20000,
  });
}
async function session(context: BrowserContext) {
  return (await context.request.get('/api/auth/me')).json();
}
test.beforeEach(async ({ request }) => {
  for (const account of accounts) {
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
  }
});
test('로그인 전 사진·초안 연결, 자동 저장, 새 기기 복원과 로그아웃·다른 계정 분리', async ({
  page,
  browser,
  baseURL,
}) => {
  await create(page, '로그인 전 남긴 개인 기록');
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점').fill('로그인 전 작성 중인 기록');
  await login(page, accounts[0]);
  await page.goto('/records');
  await expect(page.locator('.journal-entry')).toHaveCount(1);
  await synced(page);
  await page.goto('/records/new');
  await expect(page.getByLabel('좋았던 점')).toHaveValue('로그인 전 작성 중인 기록');
  await page.reload();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('로그인 전 작성 중인 기록');
  const second = await browser.newContext({ baseURL });
  const restored = await second.newPage();
  try {
    await login(restored, accounts[0]);
    await restored.goto('/records');
    await expect(restored.locator('.journal-entry')).toHaveCount(1);
    await expect(restored.locator('img')).toBeVisible();
    await synced(restored);
    await restored.goto('/records/new');
    await expect(restored.getByLabel('좋았던 점')).toHaveValue('로그인 전 작성 중인 기록');
  } finally {
    await second.close();
  }
  await logout(page);
  await page.goto('/records');
  await expect(page.locator('.journal-entry')).toHaveCount(0);
  await create(page, '두 번째 계정으로 연결할 기기 기록');
  await login(page, accounts[1]);
  await page.goto('/records');
  await synced(page);
  await expect(page.locator('.journal-entry')).toHaveCount(1);
  await expect(page.locator('main')).not.toContainText('로그인 전 남긴 개인 기록');
  await logout(page);
  await login(page, accounts[0]);
  await page.goto('/records');
  await expect(page.locator('.journal-entry')).toHaveCount(1);
  await expect(page.locator('.journal-entry')).toContainText('로그인 전 남긴 개인 기록');
  await expect(page.locator('main')).not.toContainText('두 번째 계정으로 연결할 기기 기록');
});
test('서버 장애 재시도·응답 유실 멱등·동시 변경 충돌 복구와 오래된 계정 요청 거부', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  await login(page, accounts[0]);
  await create(page, '충돌 전 원본');
  await synced(page);
  const oldSession = await session(context);
  const cutURL = page.url();
  const second = await browser.newContext({ baseURL });
  const other = await second.newPage();
  try {
    await login(other, accounts[0]);
    await other.goto('/records');
    await expect(other.locator('.journal-entry')).toHaveCount(1);
    await other.locator('.journal-entry').click();
    await page.route('**/api/personal-backups**', (route) => route.abort('failed'));
    await page.getByRole('link', { name: '기록 수정', exact: true }).click();
    await page.getByLabel('좋았던 점').fill('오프라인에서 편집한 복구본');
    await page.getByRole('button', { name: '수정 저장', exact: true }).click();
    await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
    await expect(page.locator('.storage-notice')).toContainText('서버 저장 대기');
    await other.getByRole('link', { name: '기록 수정', exact: true }).click();
    await other.getByLabel('좋았던 점').fill('다른 기기의 최신 원본');
    await other.getByRole('button', { name: '수정 저장', exact: true }).click();
    await other.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
    await synced(other);
    await page.unroute('**/api/personal-backups**');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('.storage-notice')).toContainText('변경 충돌 1건');
    await expect(page.locator('.storage-state')).toHaveText('변경 확인 필요');
    await expect(page.locator('.storage-notice')).not.toContainText('서버에도 저장됨');
    await page.goto('/backup');
    await page.getByRole('button', { name: '복구본 만들기', exact: true }).click();
    await synced(page);
    await page.goto('/records');
    await expect(page.locator('.journal-entry')).toHaveCount(2);
    await expect(page.locator('main')).toContainText('다른 기기의 최신 원본');
    await expect(page.locator('main')).toContainText('오프라인에서 편집한 복구본');
    let lost = false;
    await page.route('**/api/personal-backups/*', async (route) => {
      if (route.request().method() === 'PUT' && !lost) {
        lost = true;
        await route.fetch();
        await route.abort('failed');
      } else await route.continue();
    });
    await page.goto(cutURL);
    await page.getByRole('link', { name: '기록 수정', exact: true }).click();
    await page.getByLabel('좋았던 점').fill('응답이 유실되어도 한 번 저장');
    await page.getByRole('button', { name: '수정 저장', exact: true }).click();
    await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
    await expect(page.locator('.storage-notice')).toContainText('서버 저장 대기');
    await page.unroute('**/api/personal-backups/*');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await synced(page);
    await page.goto('/backup');
    await expect(page.getByRole('button', { name: '복구본 만들기', exact: true })).toHaveCount(0);
    await logout(page);
    await login(page, accounts[1]);
    const response = await context.request.get('/api/personal-backups', {
      headers: { 'X-SALU-Storage-Context': oldSession.storageContext },
    });
    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe('STORAGE_CONTEXT_CHANGED');
  } finally {
    await second.close();
  }
});

test('변경할 자료가 없어도 서버 연결 회복 시 저장 대기 오류 해제', async ({ page }) => {
  await login(page, accounts[0]);
  await page.goto('/backup');
  await synced(page);
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT') writes++;
  });
  await page.route('**/api/personal-backups', (route) => route.abort('failed'));
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.storage-notice')).toContainText('서버 저장 대기');
  await expect(page.locator('.storage-notice [role="alert"]')).toContainText('자동으로 다시 시도');
  await page.unroute('**/api/personal-backups');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await synced(page);
  await expect(page.locator('.storage-notice [role="alert"]')).toHaveCount(0);
  expect(writes).toBe(0);
});

test('목록 조회 성공만으로 업로드 대기 중인 기록을 저장 완료로 표시하지 않음', async ({ page }) => {
  await login(page, accounts[0]);
  await page.goto('/backup');
  await synced(page);
  let unblock!: () => void;
  const waiting = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  let uploading = false;
  await page.route('**/api/personal-backups/*', async (route) => {
    if (route.request().method() === 'PUT') {
      uploading = true;
      await waiting;
    }
    await route.continue();
  });
  try {
    await create(page, '업로드 응답 전에는 기기에만 저장');
    await expect.poll(() => uploading).toBe(true);
    await expect(page.locator('.storage-notice')).toContainText('서버 저장 중');
    await expect(page.locator('.storage-notice')).not.toContainText('서버에도 저장됨');
  } finally {
    unblock();
  }
  await synced(page);
  await expect(page.locator('.storage-notice [role="alert"]')).toHaveCount(0);
});

test('기기 저장 실패는 서버 동기화 오류로 덮지 않고 입력 유지', async ({ page }) => {
  await login(page, accounts[0]);
  await page.goto('/backup');
  await synced(page);
  await page.goto('/records/new');
  await page.evaluate(() => {
    const counters = window as unknown as { storageFailures: number };
    counters.storageFailures = 0;
    IDBObjectStore.prototype.put = () => {
      counters.storageFailures++;
      throw new DOMException('storage full', 'QuotaExceededError');
    };
  });
  await page.getByLabel('좋았던 점').fill('기기 저장 실패에도 유지할 입력');
  await expect(page.locator('.storage-notice [role="alert"]')).toContainText(
    '기기에 저장하지 못했어요',
  );
  const failures = await page.evaluate(
    () => (window as unknown as { storageFailures: number }).storageFailures,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { storageFailures: number }).storageFailures),
    )
    .toBeGreaterThan(failures);
  await expect(page.locator('.storage-notice')).toContainText('기기 저장 확인 필요');
  await expect(page.locator('.storage-notice [role="alert"]')).not.toContainText(
    '서버에 저장하지 못',
  );
  await expect(page.getByLabel('좋았던 점')).toHaveValue('기기 저장 실패에도 유지할 입력');
  await expect(page.locator('.storage-notice')).not.toContainText('서버에도 저장됨');
});
