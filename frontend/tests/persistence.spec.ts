import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { unzipSync, zipSync, strToU8 } from 'fflate';

async function createCut(page: Page, note = '다시 열어도 남는 커트') {
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
  return page.url();
}
async function downloadBackup(page: Page) {
  await page.goto('/backup');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ZIP 백업 받기', exact: true }).click();
  const result = await download;
  const bytes = readFileSync((await result.path())!);
  return { entries: unzipSync(bytes), bytes };
}

for (const field of ['좋았던 점', '불편한 점']) {
  test(`${field} 연속 입력은 이전 저장 완료를 기다리지 않고 최신 내용·사진·커서를 유지`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        const request = put.call(this, value, key);
        if (this.name !== 'workspaces' || !Reflect.get(window, 'holdNextDraftWrite'))
          return request;
        Reflect.set(window, 'holdNextDraftWrite', false);
        const add = request.addEventListener.bind(request);
        request.addEventListener = ((
          type: string,
          listener: EventListenerOrEventListenerObject,
          options?: boolean | AddEventListenerOptions,
        ) => {
          if (type !== 'success') return add(type, listener, options);
          add(
            type,
            (event) => {
              Reflect.set(window, 'finishDraftWrite', () => {
                if (typeof listener === 'function') listener.call(request, event);
                else listener.handleEvent(event);
              });
            },
            options,
          );
        }) as typeof request.addEventListener;
        return request;
      };
    });
    await page.goto('/records/new');
    if (field === '불편한 점') {
      await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
      await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
      await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
      await expect(
        page.getByRole('heading', { name: '커트 기록 · 경과', exact: true }),
      ).toBeVisible();
      await page.getByRole('link', { name: '경과 추가', exact: true }).click();
    }
    await page
      .getByLabel('사진 추가', { exact: true })
      .setInputFiles(resolve('public/images/sample-cut.jpg'));
    await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '기기에 저장됨' })).toBeVisible();
    await page.evaluate(() => Reflect.set(window, 'holdNextDraftWrite', true));
    const input = page.getByLabel(field, { exact: true });
    await input.fill('작성 중 ');
    await expect
      .poll(() => page.evaluate(() => typeof Reflect.get(window, 'finishDraftWrite')))
      .toBe('function');
    await input.pressSequentially('abcdefghijklmnopqrst');
    const expected = '작성 중 abcdefghijklmnopqrst';
    await expect(input).toHaveValue(expected);
    await expect(input).toBeFocused();
    expect(await input.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(
      expected.length,
    );
    await page.evaluate(() => Reflect.get(window, 'finishDraftWrite')());
    await expect(page.getByRole('status').filter({ hasText: '기기에 저장됨' })).toBeVisible();
    await expect(input).toHaveValue(expected);
    await expect(input).toBeFocused();
    await page.reload();
    await expect(input).toHaveValue(expected);
    await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  });
}

test('개인 기록·경과·사진·불변 요청·작성 및 수정 초안 재접속', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const url = await createCut(page);
  const originalPhoto = await page.locator('main img').first().getAttribute('src');
  await page.getByRole('link', { name: '경과 추가', exact: true }).click();
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('집에서 옆머리가 뜸');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
  await page.getByRole('button', { name: '원하는 점 적기', exact: true }).click();
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('옆머리 길이는 유지');
  await page.locator('.request-options > summary').click();
  await page.getByLabel('집에서 손질', { exact: true }).fill('드라이만 하고 있어요');
  await page.getByLabel('추가 질문', { exact: true }).fill('옆머리 말리는 방향이 궁금해요');
  await expect(page.getByRole('status').filter({ hasText: '기기에 저장됨' })).toBeVisible();
  await page.reload();
  await expect(page.locator('.request-options > summary')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('집에서 손질', { exact: true })).toHaveValue('드라이만 하고 있어요');
  await expect(page.getByLabel('추가 질문', { exact: true })).toHaveValue(
    '옆머리 말리는 방향이 궁금해요',
  );
  await page.locator('.request-options > summary').click();
  await expect(page.locator('.request-options > summary')).toContainText('손질 방법 · 질문 작성됨');
  await expect(page.getByLabel('집에서 손질', { exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await expect(page).toHaveURL(/\/requests\/review\?draft=/);
  await page.getByRole('button', { name: '준비 저장하기', exact: true }).click();
  await page.getByRole('link', { name: '준비한 내용 보기', exact: true }).click();
  const previewURL = page.url();
  await expect(page.locator('main')).toContainText('드라이만 하고 있어요');
  await expect(page.locator('main')).toContainText('옆머리 말리는 방향이 궁금해요');
  await page.goto(url);
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await page.getByLabel('좋았던 점').fill('아직 저장하지 않은 수정');
  await expect(page.getByRole('status').filter({ hasText: '기기에 저장됨' })).toBeVisible();
  const editURL = page.url();
  await page.reload();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('아직 저장하지 않은 수정');
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점').fill('새 커트 작성 초안');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '기기에 저장됨' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('새 커트 작성 초안');
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await page.goto(previewURL);
  await expect(page.locator('main')).toContainText('옆머리 길이는 유지');
  await page.goto(editURL);
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.locator('main')).toContainText('집에서 옆머리가 뜸');
  const rebuilt = await page.locator('main img').first().getAttribute('src');
  expect(rebuilt).toMatch(/^blob:/);
  expect(rebuilt).not.toBe(originalPhoto);
  const { entries } = await downloadBackup(page);
  expect(new TextDecoder().decode(entries['records.json'])).not.toContain('blob:');
  expect(Object.keys(entries).filter((name) => name.startsWith('photos/'))).toHaveLength(3);
  expect(errors).toEqual([]);
});
test('ZIP은 실제 사진과 초안을 복원하고 기존 기록에 새 ID 복사본 추가', async ({
  page,
  browser,
  baseURL,
}) => {
  await createCut(page, 'ZIP 복원할 기록');
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점').fill('ZIP에 포함한 초안');
  const { bytes } = await downloadBackup(page);
  await page
    .getByLabel('SALU 백업 파일')
    .setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer: bytes });
  await expect(
    page.getByText('기존 기록은 그대로 두고 복사본을 추가했어요.', { exact: true }),
  ).toBeVisible();
  await page.goto('/records');
  await expect(page.locator('.journal-entry')).toHaveCount(2);
  const links = await page
    .locator('.journal-entry')
    .evaluateAll((elements) => elements.map((e) => e.getAttribute('href')));
  expect(new Set(links).size).toBe(2);
  const fresh = await browser.newContext({ baseURL });
  const restored = await fresh.newPage();
  try {
    await restored.goto('/backup');
    await restored
      .getByLabel('SALU 백업 파일')
      .setInputFiles({ name: 'backup.zip', mimeType: 'application/zip', buffer: bytes });
    await expect(
      restored.getByText('기존 기록은 그대로 두고 복사본을 추가했어요.', { exact: true }),
    ).toBeVisible();
    await restored.goto('/records');
    await expect(restored.locator('.journal-entry')).toHaveCount(1);
    await expect(restored.locator('img')).toBeVisible();
    expect(
      await restored.locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    await restored.reload();
    await expect(restored.locator('.journal-entry')).toHaveCount(1);
    await restored.goto('/backup');
    await expect(
      restored.getByRole('heading', { name: '복원한 작성 초안', exact: true }),
    ).toBeVisible();
    await restored.locator('.recovered-drafts').getByRole('button').first().click();
    await expect(restored).toHaveURL(/\/records\/new$/);
    await expect(restored.getByLabel('좋았던 점', { exact: true })).toHaveValue(
      'ZIP에 포함한 초안',
    );
    await expect(restored.getByRole('status').filter({ hasText: '기기에 저장됨' })).toBeVisible();
    await restored.reload();
    await expect(restored.getByLabel('좋았던 점', { exact: true })).toHaveValue(
      'ZIP에 포함한 초안',
    );
  } finally {
    await fresh.close();
  }
});
test('손상·사진 누락·미지원 버전·저장 실패는 기존 자료에 부분 복원하지 않음', async ({ page }) => {
  await createCut(page, '복원 실패에도 보존');
  const { entries } = await downloadBackup(page);
  const missing = { ...entries };
  delete missing[Object.keys(missing).find((p) => p.startsWith('photos/'))!];
  const newer = {
    ...entries,
    'manifest.json': strToU8(
      JSON.stringify({ format: 'salu-personal-backup', version: 999, photos: [] }),
    ),
  };
  for (const bytes of [
    Buffer.from('not a ZIP'),
    Buffer.from(zipSync(missing)),
    Buffer.from(zipSync(newer)),
  ]) {
    await page
      .getByLabel('SALU 백업 파일')
      .setInputFiles({ name: 'broken.zip', mimeType: 'application/zip', buffer: bytes });
    await expect(
      page.getByText(
        '백업 파일이 손상됐거나 지원하지 않는 형식이에요. 다른 파일을 선택해 주세요. 기존 기록은 그대로 있어요.',
        {
          exact: true,
        },
      ),
    ).toBeVisible();
  }
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('storage full', 'QuotaExceededError');
    };
  });
  await page.getByLabel('SALU 백업 파일').setInputFiles({
    name: 'full.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(entries)),
  });
  await expect(page.locator('main')).toContainText('기기에 저장하지 못했어요.');
  await page.reload();
  await page.goto('/records');
  await expect(page.locator('.journal-entry')).toHaveCount(1);
  await expect(page.locator('.journal-entry')).toContainText('복원 실패에도 보존');
});
test('기기 저장 실패 시 완료 안내 없이 작성 입력과 기존 기록 유지', async ({ page }) => {
  await createCut(page, '기존 기록');
  await page.goto('/records/new');
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('storage full', 'QuotaExceededError');
    };
  });
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('실패해도 유지할 입력');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('실패해도 유지할 입력');
  await expect(page.locator('.feedback-toast')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('기기에 저장하지 못했어요.');
  await page.goto('/records');
  await expect(page.locator('.journal-entry')).toHaveCount(1);
});

test('HTTP처럼 randomUUID가 없는 환경에서도 기록·경과·준비·백업 복원 유지', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  });
  const url = await createCut(page, 'HTTP 저장 확인');
  await page.getByRole('link', { name: '경과 추가', exact: true }).click();
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('HTTP 경과 저장 확인');
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page).toHaveURL(url);
  await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
  await page.getByRole('checkbox', { name: '사진 1 선택', exact: true }).check();
  await page.getByRole('button', { name: '원하는 점 적기', exact: true }).click();
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('HTTP 준비 저장 확인');
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await page.getByRole('button', { name: '준비 저장하기', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '커트 준비를 마쳤어요', exact: true }),
  ).toBeVisible();
  const { bytes } = await downloadBackup(page);
  await page
    .getByLabel('SALU 백업 파일')
    .setInputFiles({ name: 'http-backup.zip', mimeType: 'application/zip', buffer: bytes });
  await expect(
    page.getByRole('status').filter({ hasText: '기존 기록은 그대로 두고 복사본을 추가했어요.' }),
  ).toBeVisible();
  await page.goto('/records');
  await expect(page.locator('.journal-entry')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.journal-entry')).toHaveCount(2);
  await expect(page.locator('main')).toContainText('HTTP 저장 확인');
  const ids = await page
    .locator('.journal-entry')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('href')));
  expect(new Set(ids).size).toBe(2);
});
