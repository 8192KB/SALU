import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';

const test = base.extend<{ offlineGuard: void }>({
  offlineGuard: [
    async ({ page, baseURL }, use) => {
      const requests: string[] = [];
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (
          url.pathname.startsWith('/api') ||
          (/^https?:$/.test(url.protocol) && url.origin !== new URL(baseURL!).origin)
        )
          requests.push(request.url());
      });
      await use();
      expect(errors, '브라우저 실행 오류').toEqual([]);
      expect(requests, '서버·외부 리소스 요청 없음').toEqual([]);
      expect(await page.evaluate(() => Object.keys(localStorage)), '영구 저장 없음').toEqual([]);
      expect(await page.evaluate(() => Object.keys(sessionStorage)), '세션 저장 없음').toEqual([]);
    },
    { auto: true },
  ],
});

async function withinViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}
async function chooseDesigner(page: Page) {
  await page.getByRole('link', { name: '디자이너 선택', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await expect(page.getByRole('heading', { name: '지우 디자이너', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '상담 자료 선택', exact: true }).click();
}
async function fillRequest(
  page: Page,
  text = '옆머리 아래는 조금 짧게, 위쪽 길이는 남기고 싶어요',
) {
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page.getByLabel('요청 내용 1', { exact: true }).fill(text);
  await page.getByRole('button', { name: '미리보기 확인', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '상담 요청 미리보기', exact: true }),
  ).toBeVisible();
}
function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('커트·사진·경과 작성부터 선택 자료와 상담 미리보기까지', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('상담에 넣지 않을 개인 메모');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  const recordURL = page.url();
  await page.getByRole('link', { name: '경과 추가', exact: true }).click();
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('집에서 다시 보면 옆머리가 떠요');
  await page.getByLabel('평소 손질').fill('드라이만 해요');
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await expect(page.getByText('D+0', { exact: true })).toBeVisible();
  await withinViewport(page);
  await chooseDesigner(page);
  await page.getByRole('checkbox', { name: `경과 ${localDate()} 선택`, exact: true }).check();
  await fillRequest(page);
  await expect(page.getByText('집에서 다시 보면 옆머리가 떠요', { exact: true })).toBeVisible();
  await expect(page.getByText('상담에 넣지 않을 개인 메모', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '선택한 사진', exact: true })).toHaveCount(0);
  await expect(
    page.getByText('실제 요청은 아직 보내지 않았습니다.', { exact: false }),
  ).toBeVisible();
  await withinViewport(page);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '상담 미리보기를 찾을 수 없습니다' }),
  ).toBeVisible();
  await page.goto(recordURL);
  await expect(page.getByRole('heading', { name: '자료를 찾을 수 없습니다' })).toBeVisible();
});

test('커트와 경과의 날짜·필수 입력 검사', async ({ page }) => {
  await page.goto('/records/new');
  await page.getByLabel('커트 날짜', { exact: true }).fill(localDate(1));
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect(
    page.getByText('오늘까지의 올바른 커트 날짜를 선택해 주세요.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('부위를 하나 이상 선택해 주세요.', { exact: true })).toBeVisible();
  await page.goto('/records/cut-september/progress/new');
  await page.getByLabel('관찰 날짜', { exact: true }).fill('2026-08-31');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await expect(
    page.getByText('커트 날짜부터 오늘 사이의 관찰 날짜를 선택해 주세요.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('관찰 날짜', { exact: true }).fill('2026-09-15');
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await expect(
    page.getByText('불편한 점, 손질, 질문 중 하나 이상 적어 주세요.', { exact: true }),
  ).toBeVisible();
  await withinViewport(page);
});

test('자료 미선택·빈 요청 차단, 부위별 요청 추가', async ({ page }) => {
  await page.goto('/consultations/materials?designer=designer-jiu&record=cut-september');
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('상담에 사용할 자료를 하나 이상 선택해 주세요.');
  await page.getByRole('checkbox', { name: '사진 1 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page.getByRole('button', { name: '미리보기 확인', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('부위별 요청 내용을 모두 적어 주세요.');
  await page.getByLabel('요청 내용 1', { exact: true }).fill('위쪽 길이는 조금 남기고 싶어요');
  await page.getByLabel('요청 종류 1', { exact: true }).selectOption('CHANGE');
  await page.getByRole('button', { name: '요청 항목 추가', exact: true }).click();
  await page.getByLabel('요청 부위 2', { exact: true }).selectOption('FRONT');
  await page.getByLabel('요청 종류 2', { exact: true }).selectOption('KEEP');
  await page.getByLabel('요청 내용 2', { exact: true }).fill('앞머리 길이는 유지하고 싶어요');
  await page.getByRole('button', { name: '미리보기 확인', exact: true }).click();
  await expect(page.getByText('앞머리 길이는 유지하고 싶어요', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '선택한 사진', exact: true })).toBeVisible();
  await withinViewport(page);
});

test('앞뒤 이동 시 초안 유지, 기준 커트 변경 시 선택·요청 초기화', async ({ page }) => {
  await page.goto('/consultations/materials?designer=designer-jiu&record=cut-september');
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page.getByLabel('요청 내용 1', { exact: true }).fill('돌아와도 남아 있을 요청');
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue(
    '돌아와도 남아 있을 요청',
  );
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await page.getByLabel('기준 커트', { exact: true }).selectOption('cut-august');
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).not.toBeChecked();
  await expect(page.getByText('아직 경과가 없습니다.', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue('');
});

test('초기화와 새로고침은 신규 기록·초안을 없애고 샘플을 복원', async ({ page }) => {
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점').fill('작성 중인 커트 초안');
  await page.getByRole('link', { name: '내 기록', exact: true }).click();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('작성 중인 커트 초안');
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(page.getByText('2개의 기록', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await page.getByLabel('좋았던 점').fill('재시작하면 사라질 초안');
  await page.reload();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('');
});

test('사진 형식·크기·개수·실제 decode와 임시 URL 정리', async ({ page }) => {
  await page.addInitScript(() => {
    const originalCreate = URL.createObjectURL.bind(URL);
    const originalRevoke = URL.revokeObjectURL.bind(URL);
    const evidence = { created: [] as string[], revoked: [] as string[] };
    Object.assign(window, { photoEvidence: evidence });
    URL.createObjectURL = (blob) => {
      const url = originalCreate(blob);
      evidence.created.push(url);
      return url;
    };
    URL.revokeObjectURL = (url) => {
      evidence.revoked.push(url);
      originalRevoke(url);
    };
  });
  await page.goto('/records/new');
  const input = page.getByLabel('사진 추가', { exact: true });
  await input.setInputFiles({
    name: 'memo.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a photo'),
  });
  await expect(page.getByRole('alert')).toContainText('5 MiB 이하');
  await input.setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not a photo'),
  });
  await expect(page.getByRole('alert')).toContainText('사진을 읽을 수 없습니다.');
  await input.setInputFiles({
    name: 'large.png',
    mimeType: 'image/png',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole('alert')).toContainText('5 MiB 이하');
  await input.setInputFiles(
    Array.from({ length: 7 }, (_, index) => ({
      name: `${index}.png`,
      mimeType: 'image/png',
      buffer: Buffer.from('not decoded'),
    })),
  );
  await expect(page.getByRole('alert')).toContainText('최대 6장');
  await input.setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'sample-cut.jpg 제거', exact: true }).click();
  await expect(page.getByRole('img')).toHaveCount(0);
  await input.setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  const evidence = await page.evaluate(
    () =>
      (window as unknown as { photoEvidence: { created: string[]; revoked: string[] } })
        .photoEvidence,
  );
  expect(evidence.created.length).toBe(3);
  expect(evidence.revoked.sort()).toEqual(evidence.created.sort());
});

test('선택 시점 미리보기는 이후 경과 추가와 요청 편집에 영향받지 않음', async ({ page }) => {
  await page.goto('/consultations/materials?designer=designer-jiu&record=cut-september');
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await fillRequest(page, '확인 시점에 남긴 요청');
  const previewURL = page.url();
  await page.getByRole('button', { name: '내용 수정', exact: true }).click();
  await page.getByLabel('요청 내용 1', { exact: true }).fill('나중에 수정한 초안');
  await page.goBack();
  await expect(page.getByText('확인 시점에 남긴 요청', { exact: true })).toBeVisible();
  await expect(page.getByText('나중에 수정한 초안', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '원본 기록 보기', exact: true }).click();
  await page.getByRole('link', { name: '경과 추가', exact: true }).click();
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('미리보기 확인 후 새로 남긴 경과');
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(previewURL);
  await expect(page.getByText('미리보기 확인 후 새로 남긴 경과', { exact: true })).toHaveCount(0);
  await expect(page.getByText('D+14', { exact: true })).toBeVisible();
  await withinViewport(page);
});

test('없는 경로와 빈 경과·사진을 안내하고 긴 내용도 화면에 맞춤', async ({ page }) => {
  for (const path of [
    '/records/missing',
    '/designers/missing',
    '/consultations/previews/missing',
    '/not-a-page',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: '내 기록으로', exact: true })).toBeVisible();
    await withinViewport(page);
  }
  await page.goto('/records/cut-august');
  await expect(page.getByText('아직 경과를 남기지 않았어요.', { exact: false })).toBeVisible();
  await chooseDesigner(page);
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await fillRequest(page, '아주긴요청내용'.repeat(150));
  await withinViewport(page);
});
