import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
const accounts: { email: string; password: string; displayName: string }[] = JSON.parse(
  readFileSync('/tmp/salu-storage-fixture.json', 'utf8'),
);
async function login(page: Page, index = 0) {
  await page.goto('/login');
  await page.getByLabel('이메일', { exact: true }).fill(accounts[index].email);
  await page.getByLabel('비밀번호', { exact: true }).fill(accounts[index].password);
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  await expect(page.getByLabel('계정')).toContainText(accounts[index].displayName);
}
async function write(page: Page, path: string, method: string, data: unknown) {
  const csrf = await (await page.request.get('/api/csrf')).json();
  return page.request.fetch(path, { method, data, headers: { [csrf.headerName]: csrf.token } });
}
async function bundle(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve, reject) => {
        const request = indexedDB.open('salu-personal-v1');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('workspaces');
          const get = tx.objectStore('workspaces').getAll();
          get.onsuccess = () =>
            resolve(
              get.result.find((v: any) => v.scope.startsWith('member-'))?.bundle ??
                get.result[0]?.bundle,
            );
          get.onerror = () => reject(get.error);
          tx.oncomplete = () => db.close();
        };
        request.onerror = () => reject(request.error);
      }),
  );
}
test('실제 공개 등록·매장 선택·이름 스냅샷·오프라인 수정·ZIP/다른 기기 자동 복원', async ({
  page,
  browser,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await login(page);
  expect((await write(page, '/api/__storage-test/reset', 'POST', undefined)).status()).toBe(204);
  try {
    await page.goto('/account/designer');
    await page.getByLabel('활동 이름', { exact: true }).fill('선택 검증 디자이너');
    await page.getByLabel('소개', { exact: true }).fill('커트 기록을 함께 살펴봐요.');
    await page.getByLabel('전문 분야', { exact: true }).fill('커트,앞머리');
    await page.getByLabel('매장 이름', { exact: true }).fill('선택 검증 매장');
    await page.getByLabel('지역', { exact: true }).fill('서울');
    await page.getByLabel('지점', { exact: true }).fill('본점');
    await page.getByRole('button', { name: '매장 등록', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '등록 완료' })).toBeVisible();
    await page.getByRole('button', { name: '프로필 저장', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '프로필을 저장했어요', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: '프로필 보기', exact: true }).click();
    await expect(page.locator('.profile-banner')).toContainText('선택 검증 디자이너');
    await expect(page.locator('.profile-reviews')).toContainText('상담 후기 기능은 준비 중이에요.');
    await expect(page.locator('.review-card')).toHaveCount(0);
    const profile = await (await page.request.get('/api/my/designer-profile')).json();
    const second = await (
      await write(page, '/api/salons', 'POST', {
        name: '기록 당시 매장',
        region: '부산',
        branch: '',
      })
    ).json();
    await page.goto('/records/new');
    await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
    await page.getByLabel('좋았던 점').fill('등록 프로필과 과거 매장 보존');
    await page.getByText('선택 정보 · 미용실, 담당자, 가격', { exact: true }).click();
    await page.getByLabel('등록된 미용실 선택', { exact: true }).selectOption(second.id);
    await page.getByLabel('담당자 선택', { exact: true }).selectOption(`profile/${profile.id}`);
    await expect(page.getByLabel('미용실', { exact: true })).toHaveValue('기록 당시 매장');
    await page
      .getByLabel('사진 추가', { exact: true })
      .setInputFiles(resolve('public/images/sample-cut.jpg'));
    await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
    await page.getByRole('link', { name: '기록 보기', exact: true }).click();
    const recordURL = page.url();
    await page.goto(`/designers/${profile.id}?record=${recordURL.split('/').at(-1)}`);
    await page.getByRole('button', { name: '상담 자료 선택', exact: true }).click();
    await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
    await page.getByRole('button', { name: '원하는 점 적기', exact: true }).click();
    await page.getByLabel('원하는 내용 1', { exact: true }).fill('옆머리를 정리해 주세요');
    await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
    await page.getByRole('button', { name: '준비 저장하기', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '커트 준비를 마쳤어요', exact: true }),
    ).toBeVisible();
    expect(
      (
        await write(page, '/api/my/designer-profile', 'PUT', {
          name: '변경 후 이름',
          introduction: '소속 변경',
          specialties: ['커트'],
          visibility: 'PRIVATE',
          salonId: second.id,
        })
      ).status(),
    ).toBe(200);
    expect((await page.request.get(`/api/designers/${profile.id}`)).status()).toBe(404);
    await page.reload();
    await page.goto(`${recordURL}/edit`);
    await page.getByText('선택 정보 · 미용실, 담당자, 가격', { exact: true }).click();
    await expect(page.getByLabel('담당자', { exact: true })).toHaveValue('선택 검증 디자이너');
    await page.route('**/api/designers**', (route) => route.abort());
    await page.route('**/api/salons**', (route) => route.abort());
    await page.getByLabel('좋았던 점').fill('오프라인에도 과거 이름 유지');
    await page.getByRole('button', { name: '수정 저장', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: '커트 기록을 수정했어요', exact: true }),
    ).toBeVisible();
    await page.unroute('**/api/designers**');
    await page.unroute('**/api/salons**');
    await expect(page.locator('.storage-notice')).toContainText('서버에도 저장됨', {
      timeout: 20000,
    });
    const original = await bundle(page);
    expect(original.state.designers).toEqual([]);
    expect(original.state.cuts[0]).toMatchObject({
      designerProfileId: profile.id,
      designerName: '선택 검증 디자이너',
      salonId: second.id,
      salonName: '기록 당시 매장',
    });
    expect(original.state.previews[0].designer.id).toBe(profile.id);
    await page.goto('/backup');
    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'ZIP 백업 받기', exact: true }).click();
    const bytes = readFileSync((await (await waiting).path())!);
    const zip = JSON.parse(strFromU8(unzipSync(bytes)['records.json']));
    expect(zip.state.designers).toEqual([]);
    const fresh = await browser.newContext();
    const restored = await fresh.newPage();
    try {
      await restored.goto(`${baseURL}/backup`);
      await restored
        .getByLabel('SALU 백업 파일')
        .setInputFiles({ name: 'directory.zip', mimeType: 'application/zip', buffer: bytes });
      await expect(
        restored.getByText('기존 기록은 그대로 두고 복사본을 추가했어요.', { exact: true }),
      ).toBeVisible();
      const copy = await bundle(restored);
      expect(copy.state.cuts[0].id).not.toBe(original.state.cuts[0].id);
      expect(copy.state.cuts[0].designerProfileId).toBe(profile.id);
      expect(copy.state.cuts[0].salonId).toBe(second.id);
      expect(copy.state.previews[0].designer.id).toBe(profile.id);
      expect(copy.state.previews[0].sourceDraft.designerSnapshot.id).toBe(profile.id);
      expect(copy.state.photos).toHaveLength(1);
    } finally {
      await fresh.close();
    }
    const other = await browser.newContext();
    const cloud = await other.newPage();
    try {
      await login(cloud);
      await cloud.goto(`${baseURL}/records`);
      await expect(cloud.locator('.journal-entry')).toHaveCount(1);
      const copy = await bundle(cloud);
      expect(copy.state.cuts[0].designerName).toBe('선택 검증 디자이너');
      expect(copy.state.cuts[0].salonId).toBe(second.id);
      expect(copy.state.designers).toEqual([]);
      await cloud.goto(`${baseURL}/account/designer`);
      await expect(cloud.getByLabel('활동 이름', { exact: true })).toHaveValue('변경 후 이름');
    } finally {
      await other.close();
    }
    const secondAccount = await browser.newContext();
    const another = await secondAccount.newPage();
    try {
      await login(another, 1);
      expect((await another.request.get('/api/my/designer-profile')).status()).toBe(204);
      await another.goto(`${baseURL}/records`);
      await expect(another.locator('.journal-entry')).toHaveCount(0);
    } finally {
      await secondAccount.close();
    }
    expect(errors).toEqual([]);
  } finally {
    await write(page, '/api/__storage-test/reset', 'POST', undefined);
  }
});
