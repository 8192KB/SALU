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

test('저장 완료 안내는 입력 실패에 나오지 않고 성공 후에만 표시', async ({ page }) => {
  await page.goto('/records/new');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect(page.getByText('부위를 하나 이상 선택해 주세요.', { exact: true })).toBeVisible();
  await expect(page.locator('.feedback-toast')).toHaveCount(0);
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('완료 안내 확인용 기록');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 · 경과', exact: true })).toBeVisible();
  await expect(page.locator('.feedback-region')).toHaveText('예시 커트 기록을 남겼어요');
  await expect(page.locator('.feedback-toast')).toHaveCount(0, { timeout: 5000 });
  await page.getByRole('link', { name: '내 기록', exact: true }).click();
  await expect(page.getByText('완료 안내 확인용 기록', { exact: true })).toBeVisible();
  await expect(page.locator('.feedback-toast')).toHaveCount(0);
});

test('확인창 내부 클릭은 유지하고 배경 클릭은 초안을 보존하며 닫기', async ({ page }, info) => {
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점').fill('배경으로 닫아도 보존할 기록');
  const trigger = page.getByRole('button', { name: '초기화', exact: true });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '작성한 내용을 초기화할까요?', exact: true });
  await expect(dialog).toBeVisible();
  if (info.project.name === 'mobile') {
    await expect
      .poll(async () => {
        const bounds = await dialog.boundingBox();
        return Math.round(bounds!.y + bounds!.height);
      })
      .toBe(page.viewportSize()!.height);
  }
  await dialog.getByRole('heading').click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(8, 8);
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('배경으로 닫아도 보존할 기록');
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});
async function resetPrototype(page: Page) {
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await page.getByRole('button', { name: '모두 초기화', exact: true }).click();
}
async function chooseDesigner(page: Page) {
  await page.getByRole('link', { name: '디자이너 선택', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await expect(page.getByRole('heading', { name: '지우 디자이너', exact: true })).toBeVisible();
  await chooseMaterials(page);
}
async function chooseMaterials(page: Page) {
  const existing = page.getByRole('link', { name: '기존 초안 이어쓰기', exact: true });
  const fresh = page.getByRole('button', { name: '상담 자료 선택', exact: true });
  await existing.or(fresh).click();
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

test('커트·디자이너별 초안 분리 보관, 재방문 복원과 초기화', async ({ page }) => {
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
  await page.getByLabel('요청 내용 1', { exact: true }).fill('8월 커트에만 쓸 요청');
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await page.getByLabel('기준 커트', { exact: true }).selectOption('cut-september');
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue(
    '돌아와도 남아 있을 요청',
  );

  await page.getByRole('link', { name: '디자이너', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '민서 디자이너' }).click();
  await chooseMaterials(page);
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue('');
  await page.getByLabel('요청 내용 1', { exact: true }).fill('민서에게만 쓸 요청');
  await page.getByRole('link', { name: '디자이너', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await chooseMaterials(page);
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue(
    '돌아와도 남아 있을 요청',
  );
  await resetPrototype(page);
  await page.getByRole('link', { name: '디자이너', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await chooseMaterials(page);
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue('');
});

test('요청 작성 중 선택한 경과·사진만 확인, 모바일 다음 버튼 노출', async ({ page }, testInfo) => {
  await page.goto('/records/cut-september/progress/new');
  await page.getByLabel('관찰 날짜', { exact: true }).fill('2026-09-16');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('며칠 지나니 옆머리가 더 떠요');
  await page.getByLabel('평소 손질').fill('아침에 드라이를 하고 있어요');
  await page.getByLabel('물어볼 점').fill('어느 방향으로 말리면 좋을까요?');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await chooseDesigner(page);
  await expect(page.getByText('경과 D+15 · 2026. 09. 16', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '경과 2026-09-16 선택', exact: true }).check();
  await page.getByRole('checkbox', { name: '사진 2 선택', exact: true }).check();
  if (testInfo.project.name === 'mobile') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('button', { name: '요청 작성', exact: true })).toBeInViewport({
      ratio: 1,
    });
  }
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  const reference = page.getByRole('complementary', { name: '요청에 첨부할 자료', exact: true });
  if ((await reference.locator('details').getAttribute('open')) === null)
    await reference.locator('summary').click();
  await expect(reference.getByText('며칠 지나니 옆머리가 더 떠요', { exact: true })).toBeVisible();
  await expect(reference.getByText('아침에 드라이를 하고 있어요', { exact: true })).toBeVisible();
  await expect(
    reference.getByText('어느 방향으로 말리면 좋을까요?', { exact: true }),
  ).toBeVisible();
  await expect(reference.getByText('경과 D+15', { exact: true })).toBeVisible();
  await expect(reference.getByRole('img')).toHaveCount(1);
  await expect(reference.getByText('앞머리 길이가 마음에 듦', { exact: true })).toHaveCount(0);
  await expect(reference.getByText('옆머리가 금방 떠요', { exact: true })).toHaveCount(0);
  await expect(reference.getByText('커트 당일 · 예시 사진', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('집에서 손질', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('추가 질문', { exact: true })).toHaveValue('');
  await page.getByLabel('요청 내용 1', { exact: true }).fill('손질 방법을 알고 싶어요');
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue(
    '손질 방법을 알고 싶어요',
  );
  await withinViewport(page);
});

test('초기화와 새로고침은 신규 기록·초안을 없애고 샘플을 복원', async ({ page }) => {
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점').fill('작성 중인 커트 초안');
  await page.getByRole('link', { name: '내 기록', exact: true }).click();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('작성 중인 커트 초안');
  await resetPrototype(page);
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await resetPrototype(page);
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
  await resetPrototype(page);
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
  await expect(
    page.getByRole('link', { name: '상담 미리보기로 돌아가기', exact: true }),
  ).toHaveAttribute('href', new URL(previewURL).pathname);
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

test('디자이너 없이 개인 요청 준비, 경과 질문 가져오기와 목록 재진입', async ({ page }) => {
  await page.goto('/records/cut-september');
  await page.getByRole('button', { name: '이번 요청 정리', exact: true }).click();
  await expect(page.getByRole('heading', { name: '다음 커트 준비', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  const reference = page.getByRole('complementary', { name: '요청에 첨부할 자료', exact: true });
  if ((await reference.locator('details').getAttribute('open')) === null)
    await reference.locator('summary').click();
  await reference.getByRole('button', { name: '이 질문을 요청에 추가', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue(
    '옆머리 아래는 짧게, 위는 길게 남기면 덜 뜰까요?',
  );
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toBeFocused();
  await expect(
    reference.getByRole('button', { name: '이 질문을 요청에 추가', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('요청 내용 2', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '미리보기 확인', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '이번 요청 미리보기', exact: true }),
  ).toBeVisible();
  const previewPath = new URL(page.url()).pathname;
  await expect(page.getByText('앞머리 길이가 마음에 듦', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '요청 자료', exact: true }).click();
  await page.locator(`a[href="${previewPath}"]`).click();
  await expect(
    page.getByRole('heading', { name: '이번 요청 미리보기', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '원본 기록 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '작성한 요청 자료', exact: true })).toBeVisible();
  const saved = page.getByRole('heading', { name: '작성한 요청 자료', exact: true }).locator('..');
  await saved.locator(`a[href="${previewPath}"]`).click();
  await expect(
    page.getByRole('heading', { name: '이번 요청 미리보기', exact: true }),
  ).toBeVisible();
  await withinViewport(page);
});

test('첨부 없는 개인 준비에서 상담 자료 추가, 요청 문장 유지', async ({ page }) => {
  await page.goto('/records/cut-august');
  await page.getByRole('button', { name: '이번 요청 정리', exact: true }).click();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page
    .getByLabel('요청 내용 1', { exact: true })
    .fill('아직 디자이너를 정하지 않은 개인 준비');
  await page.getByRole('button', { name: '미리보기 확인', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '이번 요청 미리보기', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('전체적으로 가벼운 느낌이에요', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '디자이너 선택하기', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await page.getByRole('button', { name: '자료를 추가해서 상담 준비', exact: true }).click();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('상담에 사용할 자료를 하나 이상 선택해 주세요.');
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue(
    '아직 디자이너를 정하지 않은 개인 준비',
  );
  await page.getByRole('button', { name: '미리보기 확인', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '상담 요청 미리보기', exact: true }),
  ).toBeVisible();
  await withinViewport(page);
});

test('개인 준비를 디자이너용으로 복사해도 기존 초안과 개인 준비본 보존', async ({ page }) => {
  await page.goto('/consultations/materials?designer=designer-jiu&record=cut-september');
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page.getByLabel('요청 내용 1', { exact: true }).fill('디자이너별 기존 초안');
  await page.getByRole('link', { name: '내 기록', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '9월 1일 커트' }).click();
  await page.getByRole('button', { name: '새 요청 준비', exact: true }).click();
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await page.getByRole('checkbox', { name: '사진 1 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page.getByLabel('요청 내용 1', { exact: true }).fill('개인 준비에서 가져갈 새 요청');
  await page.getByRole('button', { name: '미리보기 확인', exact: true }).click();
  const personalPath = new URL(page.url()).pathname;
  await page.getByRole('link', { name: '디자이너 선택하기', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await expect(page.getByRole('link', { name: '기존 초안 이어쓰기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이 자료로 상담 준비', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '상담 요청 미리보기', exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).not.toBe(personalPath);
  await expect(page.getByText('개인 준비에서 가져갈 새 요청', { exact: true })).toBeVisible();
  await expect(page.getByText('앞머리 길이가 마음에 듦', { exact: true })).toHaveCount(0);
  await expect(page.getByText('커트 당일 · 2026. 09. 01', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '요청 자료', exact: true }).click();
  await page.locator(`a[href="${personalPath}"]`).click();
  await expect(
    page.getByRole('heading', { name: '이번 요청 미리보기', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '요청 자료', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '디자이너별 기존 초안' }).click();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue('디자이너별 기존 초안');
  await withinViewport(page);
});

test('같은 디자이너·커트의 새 준비와 이전 초안을 각각 다시 열기', async ({ page }) => {
  await page.goto('/consultations/materials?designer=designer-jiu&record=cut-september');
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page.getByLabel('요청 내용 1', { exact: true }).fill('같은 대상의 첫 번째 초안');
  await page.getByRole('link', { name: '디자이너', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await page.getByRole('button', { name: '새 준비 만들기', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page.getByLabel('요청 내용 1', { exact: true }).fill('같은 대상의 두 번째 초안');
  const secondPath = new URL(page.url()).pathname + new URL(page.url()).search;
  await page.getByRole('link', { name: '요청 자료', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '같은 대상의 첫 번째 초안' }).click();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue(
    '같은 대상의 첫 번째 초안',
  );
  await page.getByRole('link', { name: '요청 자료', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '같은 대상의 두 번째 초안' }).click();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue(
    '같은 대상의 두 번째 초안',
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '작성 중인 요청을 찾을 수 없습니다', exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(secondPath);
});

test('수정은 확정 시점 자료를 유지하고 최신 기록 선택은 명시적으로 전환', async ({ page }) => {
  await page.goto('/records/cut-september');
  await page.getByRole('button', { name: '이번 요청 정리', exact: true }).click();
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page.getByLabel('요청 내용 1', { exact: true }).fill('원본을 다시 봐도 유지할 개인 준비');
  await page.getByRole('button', { name: '미리보기 확인', exact: true }).click();
  const oldPath = new URL(page.url()).pathname;
  await page.getByRole('link', { name: '원본 기록 보기', exact: true }).click();
  await page.getByRole('link', { name: '경과 추가', exact: true }).click();
  await page.getByLabel('관찰 날짜', { exact: true }).fill('2026-10-01');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('미리보기 이후 새로 적은 관찰');
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await page.getByRole('link', { name: '요청 자료', exact: true }).click();
  await page.locator(`a[href="${oldPath}"]`).click();
  await page.getByRole('button', { name: '내용 수정', exact: true }).click();
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '경과 2026-10-01 선택', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '최신 기록에서 다시 고르기', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '경과 2026-10-01 선택', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: '경과 2026-10-01 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue(
    '원본을 다시 봐도 유지할 개인 준비',
  );
  await page.getByRole('button', { name: '미리보기 확인', exact: true }).click();
  await expect(page.getByText('미리보기 이후 새로 적은 관찰', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '요청 자료', exact: true }).click();
  await page.locator(`a[href="${oldPath}"]`).click();
  await expect(page.getByText('미리보기 이후 새로 적은 관찰', { exact: true })).toHaveCount(0);
  await withinViewport(page);
});

test('기록·경과 수정의 날짜 검사와 이전 요청 자료 보존', async ({ page }) => {
  await page.goto('/consultations/materials?designer=designer-jiu&record=cut-september');
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await page.getByRole('checkbox', { name: '사진 1 선택', exact: true }).check();
  await fillRequest(page, '수정 전에 준비한 요청');
  const previewPath = new URL(page.url()).pathname;
  await page.getByRole('link', { name: '원본 기록 보기', exact: true }).click();
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await page.getByLabel('커트 날짜', { exact: true }).fill('2026-09-16');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(
    page.getByText('이미 남긴 경과 날짜보다 늦은 커트 날짜로 바꿀 수 없습니다.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('커트 날짜', { exact: true }).fill('2026-08-31');
  await page.getByLabel('좋았던 점').fill('현재 원본에서 수정한 메모');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(page.getByText('D+15', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '경과 수정', exact: true }).click();
  await page.getByLabel('관찰 날짜', { exact: true }).fill('2026-08-30');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(
    page.getByText('커트 날짜부터 오늘 사이의 관찰 날짜를 선택해 주세요.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('관찰 날짜', { exact: true }).fill('2026-09-16');
  await page.getByLabel('물어볼 점', { exact: true }).fill('현재 원본에서 수정한 질문');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(page.getByText('D+16', { exact: true })).toBeVisible();
  await page.locator(`.record-request-list a[href="${previewPath}"]`).click();
  await expect(page.getByText('앞머리 길이가 마음에 듦', { exact: true })).toBeVisible();
  await expect(
    page.getByText('옆머리 아래는 짧게, 위는 길게 남기면 덜 뜰까요?', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('커트 당일 · 2026. 09. 01', { exact: true })).toBeVisible();
  await expect(page.getByText('현재 원본에서 수정한 메모', { exact: true })).toHaveCount(0);
  await expect(page.getByText('현재 원본에서 수정한 질문', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '내용 수정', exact: true }).click();
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await expect(page.getByText('앞머리 길이가 마음에 듦', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '최신 기록에서 다시 고르기', exact: true }).click();
  await expect(page.getByText('현재 원본에서 수정한 메모', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: '경과 2026-09-16 선택', exact: true }),
  ).toBeChecked();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await expect(page.getByLabel('요청 내용 1', { exact: true })).toHaveValue(
    '수정 전에 준비한 요청',
  );
  await page.getByRole('button', { name: '미리보기 확인', exact: true }).click();
  await expect(page.getByText('현재 원본에서 수정한 메모', { exact: true })).toBeVisible();
  await expect(page.getByText('현재 원본에서 수정한 질문', { exact: true })).toBeVisible();
  await expect(page.getByText('커트 당일 · 2026. 08. 31', { exact: true })).toBeVisible();
  await withinViewport(page);
});

test('이름 입력은 프로필로 자동 연결하지 않고 직접 선택한 ID만 연결', async ({ page }) => {
  await page.goto('/records/new');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.locator('summary').filter({ hasText: '선택 정보' }).click();
  await page.getByLabel('담당자', { exact: true }).fill('지우');
  await page.getByLabel('미용실', { exact: true }).fill('시술 당시 매장');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect(page.getByText('기록에 연결한 디자이너', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await page.locator('summary').filter({ hasText: '선택 정보' }).click();
  await page.getByLabel('연결할 디자이너 프로필', { exact: true }).selectOption('designer-jiu');
  await expect(page.getByLabel('담당자', { exact: true })).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(page.getByText('현재 소속 · 그린 헤어', { exact: true })).toBeVisible();
  await expect(page.getByText('시술 당시 매장', { exact: true })).toBeVisible();
  const cutId = new URL(page.url()).pathname.split('/').at(-1);
  await page.getByRole('link', { name: '프로필 · 상담 준비', exact: true }).click();
  await page.getByRole('button', { name: '상담 자료 선택', exact: true }).click();
  await expect(page.getByLabel('기준 커트', { exact: true })).toHaveValue(cutId!);
  await withinViewport(page);
});

test('편집 초안은 이동 후 유지하고 취소하면 원본 복원, 신규 사진 초안 정리', async ({ page }) => {
  await page.addInitScript(() => {
    const original = URL.revokeObjectURL.bind(URL);
    const revoked: string[] = [];
    Object.assign(window, { revokedPhotos: revoked });
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
      original(url);
    };
  });
  await page.goto('/records/cut-september/edit');
  await page.getByLabel('좋았던 점').fill('저장하지 않은 수정');
  await page.getByRole('link', { name: '내 기록', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '9월 1일 커트' }).click();
  await expect(page.getByText('저장하지 않은 수정', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('저장하지 않은 수정');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('앞머리 길이가 마음에 듦');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('link', { name: '내 기록', exact: true }).click();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await page.getByLabel('좋았던 점').fill('취소할 신규 기록');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  const photoUrl = await page
    .getByRole('img', { name: 'sample-cut.jpg', exact: true })
    .getAttribute('src');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  expect(
    await page.evaluate(() => (window as unknown as { revokedPhotos: string[] }).revokedPhotos),
  ).toContain(photoUrl);
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('');
  await expect(page.getByRole('img')).toHaveCount(0);
});

test('사진 확대와 초기화 확인의 Escape·닫기·계속 작성은 데이터 유지', async ({ page }) => {
  await page.goto('/records/cut-september');
  const photoButton = page.getByRole('button', { name: '커트 당일 · 예시 사진 확대', exact: true });
  await photoButton.click();
  const photoDialog = page.getByRole('dialog', { name: '사진 확대', exact: true });
  await expect(photoDialog).toBeVisible();
  await expect(photoDialog.getByText('커트 당일 · 2026. 09. 01', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(photoDialog).not.toBeVisible();
  await expect(photoButton).toBeFocused();
  await photoButton.click();
  await photoDialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(photoButton).toBeFocused();
  await page.getByRole('link', { name: '내 기록', exact: true }).click();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await page.getByLabel('좋았던 점').fill('초기화 취소 후에도 유지');
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '작성한 내용을 초기화할까요?', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('좋았던 점')).toHaveValue('초기화 취소 후에도 유지');
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await page.getByRole('button', { name: '계속 작성', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('초기화 취소 후에도 유지');
  await resetPrototype(page);
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('');
  await withinViewport(page);
});

test('다른 커트의 경과 편집·없는 기록 편집·없는 초안 URL은 복구 화면', async ({ page }) => {
  for (const [path, title] of [
    ['/records/cut-august/progress/progress-september/edit', '자료를 찾을 수 없습니다'],
    ['/records/no-such-cut/edit', '자료를 찾을 수 없습니다'],
    ['/requests/write?draft=no-such-draft', '작성 중인 요청을 찾을 수 없습니다'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '수정 저장', exact: true })).toHaveCount(0);
    await withinViewport(page);
  }
});

test('새 사진 처리 중 기존 사진 삭제 차단, 처리 후 삭제·저장 정상 동작', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLImageElement.prototype.decode;
    let release: (() => void) | undefined;
    const control = { hold: false, release: () => release?.() };
    Object.assign(window, { photoDecodeControl: control });
    HTMLImageElement.prototype.decode = async function () {
      if (control.hold && this.src.startsWith('blob:'))
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      return original.call(this);
    };
  });
  await page.goto('/records/new');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toHaveCount(1);
  await page.evaluate(() => {
    (window as unknown as { photoDecodeControl: { hold: boolean } }).photoDecodeControl.hold = true;
  });
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByText('사진 확인 중', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '커트 기록 저장', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'sample-cut.jpg 제거', exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    (
      window as unknown as { photoDecodeControl: { release: () => void } }
    ).photoDecodeControl.release();
  });
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toHaveCount(2);
  await page.getByRole('button', { name: 'sample-cut.jpg 제거', exact: true }).first().click();
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toHaveCount(1);
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 · 경과', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toHaveCount(1);
});
