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
      expect(
        await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== 'salu.theme')),
        '영구 저장 없음',
      ).toEqual([]);
      const theme = await page.evaluate(() => localStorage.getItem('salu.theme'));
      if (theme !== null) expect(['system', 'light', 'dark']).toContain(theme);
      expect(await page.evaluate(() => Object.keys(sessionStorage)), '세션 저장 없음').toEqual([]);
    },
    { auto: true },
  ],
});

async function openSavedPreparation(page: Page) {
  await expect(page).toHaveURL(/\/requests\/review\?draft=/);
  await page.getByRole('button', { name: '준비 저장하기', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '커트 준비를 마쳤어요', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '준비한 내용 보기', exact: true }).click();
}
async function waitMenuPage(page: Page, target: string) {
  const path = new URL(target, page.url()).pathname.replace(/^\/examples/, '') || '/';
  const title =
    path === '/records'
      ? '나의 커트 기록'
      : path === '/requests'
        ? '커트 준비'
        : path === '/'
          ? '커트 기록, 남겨볼까요?'
          : /\/records\/[^/]+$/.test(path)
            ? '커트 기록 · 경과'
            : /\/(requests|consultations)\/previews\//.test(path)
              ? /^(다음 커트 준비 내용|디자이너에게 보여 줄 내용)$/
              : undefined;
  if (title) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function goMenu(page: Page, name: string) {
  await expect(page.locator('main button[aria-busy="true"]')).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: '주 메뉴' });
  if (!(await nav.count())) {
    await page.locator('.task-exit').click();
    await expect(nav).toBeVisible();
    if (
      (name === '내 기록' && new URL(page.url()).pathname.endsWith('/records')) ||
      (name === '커트 준비' && new URL(page.url()).pathname.endsWith('/requests'))
    ) {
      await waitMenuPage(page, page.url());
      return;
    }
  }
  const link = nav.getByRole('link', { name, exact: true });
  const target = new URL((await link.getAttribute('href'))!, page.url()).href;
  await link.click();
  await expect(page).toHaveURL(target);
  await waitMenuPage(page, target);
}
async function discardDraft(page: Page) {
  await page.locator('form').getByRole('button', { name: '작성 내용 지우기', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '작성 내용 지우기', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.task-exit')).toHaveCount(0);
}

async function openDetails(page: Page, text: string) {
  const summary = page.locator('summary').filter({ hasText: text });
  if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click();
}

async function withinViewport(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test('자료 전체 선택·부분 선택·전체 해제는 요청 문장과 별개로 복귀 후 유지', async ({ page }) => {
  await page.goto('/examples/requests/materials?record=cut-september');
  const materials = page.locator('.material-picker').getByRole('checkbox');
  await expect(materials).toHaveCount(3);
  await expect(page.locator('.material-picker input:checked')).toHaveCount(0);
  await page.getByRole('button', { name: '자료 전체 선택', exact: true }).click();
  await expect(page.locator('.material-picker input:checked')).toHaveCount(3);
  await expect(page.getByRole('button', { name: '자료 전체 해제', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('checkbox', { name: '사진 1 선택', exact: true }).uncheck();
  await page.getByRole('button', { name: '자료 전체 선택', exact: true }).click();
  await expect(page.locator('.material-picker input:checked')).toHaveCount(3);
  await goToRequest(page);
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('선택을 바꿔도 남아 있을 요청');
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await page.getByRole('button', { name: '자료 전체 해제', exact: true }).click();
  await expect(page.locator('.material-picker input:checked')).toHaveCount(0);
  await page.locator('.task-exit').click();
  await page.getByRole('link').filter({ hasText: '선택을 바꿔도 남아 있을 요청' }).click();
  if (new URL(page.url()).pathname.endsWith('/write'))
    await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await expect(page.locator('.material-picker input:checked')).toHaveCount(0);
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '선택을 바꿔도 남아 있을 요청',
  );
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  await expect(page.getByText('참고한 사진', { exact: true })).toHaveCount(0);
  await expect(page.getByText('옆머리가 금방 떠요', { exact: true })).toHaveCount(0);
});

test('자료 전문 펼침과 사진 확대는 선택 상태를 바꾸지 않고 키보드로 선택 가능', async ({
  page,
}) => {
  await page.goto('/examples/requests/materials?record=cut-september');
  await openDetails(page, '경과 자세히 보기');
  await expect(page.getByText('드라이만 하고 왁스는 쓰지 않아요', { exact: true })).toBeVisible();
  await expect(page.locator('.material-picker input:checked')).toHaveCount(0);
  const photo = page.getByRole('button', { name: '커트 당일 · 예시 사진 확대', exact: true });
  await photo.click();
  await expect(page.getByRole('dialog', { name: '사진 확대', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(photo).toBeFocused();
  await expect(page.locator('.material-picker input:checked')).toHaveCount(0);
  const checkbox = page.getByRole('checkbox', { name: '사진 1 선택', exact: true });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await page.getByRole('button', { name: '자료 전체 선택', exact: true }).click();
  await page.locator('summary').filter({ hasText: '경과 자세히 보기' }).click();
  await photo.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.material-picker input:checked')).toHaveCount(3);
  await withinViewport(page);
});

test('부위 전체 선택·해제와 개별 해제 후 저장·재편집', async ({ page }) => {
  await page.goto('/examples/records/new');
  const choices = page.getByRole('group', { name: '부위', exact: true });
  const all = choices.getByRole('checkbox', { name: '전체', exact: true });
  await all.check();
  await expect(choices.locator('input:checked')).toHaveCount(6);
  await all.uncheck();
  await expect(choices.locator('input:checked')).toHaveCount(0);
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect(page.getByText('부위를 하나 이상 선택해 주세요.', { exact: true })).toBeVisible();
  await all.check();
  await choices.getByRole('checkbox', { name: '옆머리', exact: true }).uncheck();
  await expect(all).not.toBeChecked();
  await expect(all).toHaveJSProperty('indeterminate', true);
  await expect(choices.locator('input:checked')).toHaveCount(4);
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await expect(choices.getByRole('checkbox', { name: '옆머리', exact: true })).not.toBeChecked();
  await expect(choices.locator('input:checked')).toHaveCount(4);
  await choices.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await expect(all).toBeChecked();
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await page.getByRole('link', { name: '경과 추가', exact: true }).click();
  await all.check();
  await expect(choices.locator('input:checked')).toHaveCount(6);
  await all.uncheck();
  await expect(choices.locator('input:checked')).toHaveCount(0);
  await choices.getByRole('checkbox', { name: '앞머리', exact: true }).check();
  await expect(all).not.toBeChecked();
});

test('가격 증감은 천 원 단위, 백 원 단위 직접 입력은 저장·수정 후 유지', async ({ page }) => {
  await page.goto('/examples/records/new');
  await page.getByRole('checkbox', { name: '전체', exact: true }).check();
  await openDetails(page, '선택 정보 · 미용실, 담당자, 가격');
  const price = page.getByRole('spinbutton', { name: '가격', exact: true });
  await price.fill('25000');
  await price.press('ArrowDown');
  await expect(price).toHaveValue('24000');
  await price.press('ArrowUp');
  await expect(price).toHaveValue('25000');
  await price.fill('0');
  await price.press('ArrowDown');
  await expect(price).toHaveValue('0');
  await price.fill('25300');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByText('25,300원', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await openDetails(page, '선택 정보 · 미용실, 담당자, 가격');
  await expect(price).toHaveValue('25300');
  await expect(
    page.getByRole('group', { name: '부위', exact: true }).locator('input:checked'),
  ).toHaveCount(6);
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByText('25,300원', { exact: true })).toBeVisible();
});

test('디자이너 핵심 정보와 상담 시작, 추가 정보 펼침 및 작은 화면 잘림 없음', async ({
  page,
}, info) => {
  await page.goto('/examples/designers/designer-jiu');
  const banner = page.locator('.profile-banner');
  await expect(banner.getByRole('heading', { name: '지우 디자이너', exact: true })).toBeVisible();
  await expect(banner.getByText('현재 소속 · 그린 헤어', { exact: true })).toBeVisible();
  await expect(banner.locator('.profile-description')).toContainText('모발 상태');
  await expect(page.getByRole('button', { name: '상담 자료 선택', exact: true })).toBeInViewport();
  await expect(
    page.getByText('이번 단계에서는 실제 요청을 전송하지 않습니다.', { exact: true }),
  ).toHaveCount(0);
  const extra = page.getByRole('region', { name: '디자이너 추가 정보', exact: true });
  await expect(extra.locator('details[open]')).toHaveCount(0);
  await expect(extra.getByRole('heading', { name: '상담 후기', exact: true })).toBeVisible();
  await expect(extra.locator('.review-card')).toHaveCount(2);
  await extra.locator('summary').filter({ hasText: '소속 정보' }).click();
  await expect(extra.getByText('이전 소속', { exact: true })).toBeVisible();
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 320, height: 740 });
  await withinViewport(page);
  const bounds = await banner
    .getByRole('heading', { name: '지우 디자이너', exact: true })
    .boundingBox();
  const container = await banner.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(container!.x);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(container!.x + container!.width);
});

test('저장 완료 안내는 입력 실패에 나오지 않고 성공 후에만 표시', async ({ page }) => {
  await page.goto('/examples/records/new');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect(page.getByText('부위를 하나 이상 선택해 주세요.', { exact: true })).toBeVisible();
  await expect(page.locator('.feedback-toast')).toHaveCount(0);
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('완료 안내 확인용 기록');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 · 경과', exact: true })).toBeVisible();
  await expect(page.locator('.feedback-region')).toHaveText('');
  await expect(page.locator('.feedback-toast')).toHaveCount(0, { timeout: 5000 });
  await goMenu(page, '내 기록');
  await expect(page.getByText('완료 안내 확인용 기록', { exact: true })).toBeVisible();
  await expect(page.locator('.feedback-toast')).toHaveCount(0);
});

test('확인창 내부 클릭은 유지하고 배경 클릭은 초안을 보존하며 닫기', async ({ page }, info) => {
  await page.goto('/examples/records/new');
  await page.getByLabel('좋았던 점').fill('배경으로 닫아도 보존할 기록');
  const trigger = page.getByRole('button', { name: '초기화', exact: true });
  await openDetails(page, '체험 안내');
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
  await openDetails(page, '체험 안내');
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
  await expect(page).toHaveURL(/\/requests\/(materials|write)/);
  await expect(page.locator('main h1')).toHaveText(
    /참고할 지난 커트를 골라 주세요|상담에 참고할 자료 선택|이번 커트에서 원하는 점을 적어 주세요/,
  );
  if (
    await page
      .getByRole('heading', { name: '참고할 지난 커트를 골라 주세요', exact: true })
      .isVisible()
  ) {
    await page.getByRole('link').filter({ hasText: '9월 1일 커트' }).click();
    await expect(
      page.getByRole('heading', { name: '상담에 참고할 자료 선택', exact: true }),
    ).toBeVisible();
  }
}
async function goToRequest(page: Page) {
  await expect(page).toHaveURL(/\/requests\/(materials|write)/);
  if (new URL(page.url()).pathname.endsWith('/materials')) {
    await page.getByRole('button', { name: '원하는 점 적기', exact: true }).click();
  } else await expect(page.getByLabel('원하는 내용 1', { exact: true })).toBeVisible();
}
async function fillRequest(
  page: Page,
  text = '옆머리 아래는 조금 짧게, 위쪽 길이는 남기고 싶어요',
) {
  await goToRequest(page);
  await page.getByLabel('원하는 내용 1', { exact: true }).fill(text);
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  await expect(
    page.getByRole('heading', { name: '디자이너에게 보여 줄 내용', exact: true }),
  ).toBeVisible();
}
function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

test('커트·사진·경과 작성부터 선택 자료와 상담 미리보기까지', async ({ page }) => {
  await page.goto('/examples/records');
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('상담에 넣지 않을 개인 메모');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  const recordURL = page.url();
  await page.getByRole('link', { name: '경과 추가', exact: true }).click();
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('집에서 다시 보면 옆머리가 떠요');
  await openDetails(page, '손질 방법, 물어볼 점');
  await page.getByLabel('평소 손질').fill('드라이만 해요');
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByText('D+0', { exact: true })).toBeVisible();
  await withinViewport(page);
  await chooseDesigner(page);
  await page.getByRole('checkbox', { name: `경과 ${localDate()} 선택`, exact: true }).check();
  await fillRequest(page);
  await expect(page.getByText('집에서 다시 보면 옆머리가 떠요', { exact: true })).toBeVisible();
  await expect(page.getByText('상담에 넣지 않을 개인 메모', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '선택한 사진', exact: true })).toHaveCount(0);
  await expect(
    page.getByText('디자이너에게 보여 줄 자료와 원하는 커트를 정리했어요.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /보내기|전송/ })).toHaveCount(0);
  await withinViewport(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: '준비한 내용을 찾을 수 없어요' })).toBeVisible();
  await page.goto(recordURL);
  await expect(page.getByRole('heading', { name: '자료를 찾을 수 없어요' })).toBeVisible();
});

test('커트와 경과의 날짜·필수 입력 검사', async ({ page }) => {
  await page.goto('/examples/records/new');
  await page.getByLabel('커트 날짜', { exact: true }).fill(localDate(1));
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect(
    page.getByText('오늘까지의 올바른 커트 날짜를 선택해 주세요.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('부위를 하나 이상 선택해 주세요.', { exact: true })).toBeVisible();
  await page.goto('/examples/records/cut-september/progress/new');
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
  await page.goto('/examples/consultations/materials?designer=designer-jiu&record=cut-september');
  await goToRequest(page);
  await expect(page.getByRole('alert')).toContainText(
    '상담에 사용할 자료를 하나 이상 선택해 주세요.',
  );
  await page.getByRole('checkbox', { name: '사진 1 선택', exact: true }).check();
  await goToRequest(page);
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('부위별 원하는 내용을 모두 적어 주세요.');
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('위쪽 길이는 조금 남기고 싶어요');
  await page.getByLabel('원하는 변화 1', { exact: true }).selectOption('CHANGE');
  await page.getByRole('button', { name: '원하는 점 추가', exact: true }).click();
  await page.getByLabel('부위 2', { exact: true }).selectOption('FRONT');
  await page.getByLabel('원하는 변화 2', { exact: true }).selectOption('KEEP');
  await page.getByLabel('원하는 내용 2', { exact: true }).fill('앞머리 길이는 유지하고 싶어요');
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  await expect(page.getByText('앞머리 길이는 유지하고 싶어요', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '선택한 사진', exact: true })).toBeVisible();
  await withinViewport(page);
});

test('커트·디자이너별 초안 분리 보관, 재방문 복원과 초기화', async ({ page }) => {
  await page.goto('/examples/consultations/materials?designer=designer-jiu&record=cut-september');
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await goToRequest(page);
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('돌아와도 남아 있을 요청');
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).toBeChecked();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '돌아와도 남아 있을 요청',
  );
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await openDetails(page, '참고할 커트 바꾸기');
  await page.getByLabel('참고할 지난 커트', { exact: true }).selectOption('cut-august');
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).not.toBeChecked();
  await expect(page.getByText('아직 남긴 경과가 없어요.', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue('');
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('8월 커트에만 쓸 요청');
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await openDetails(page, '참고할 커트 바꾸기');
  await page.getByLabel('참고할 지난 커트', { exact: true }).selectOption('cut-september');
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).toBeChecked();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '돌아와도 남아 있을 요청',
  );

  await openDetails(page, '체험 안내');
  await page.getByRole('link', { name: '디자이너 예시', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '민서 디자이너' }).click();
  await chooseMaterials(page);
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue('');
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('민서에게만 쓸 요청');
  await openDetails(page, '체험 안내');
  await page.getByRole('link', { name: '디자이너 예시', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await chooseMaterials(page);
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '돌아와도 남아 있을 요청',
  );
  await resetPrototype(page);
  await openDetails(page, '체험 안내');
  await page.getByRole('link', { name: '디자이너 예시', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await chooseMaterials(page);
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue('');
});

test('원하는 점 적기 중 선택한 경과·사진만 확인, 모바일 다음 버튼 노출', async ({
  page,
}, testInfo) => {
  await page.goto('/examples/records/cut-september/progress/new');
  await page.getByLabel('관찰 날짜', { exact: true }).fill('2026-09-16');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('며칠 지나니 옆머리가 더 떠요');
  await openDetails(page, '손질 방법, 물어볼 점');
  await page.getByLabel('평소 손질').fill('아침에 드라이를 하고 있어요');
  await page.getByLabel('물어볼 점').fill('어느 방향으로 말리면 좋을까요?');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await chooseDesigner(page);
  const progressPhoto = page
    .locator('.material-choice')
    .filter({ has: page.getByRole('checkbox', { name: '사진 2 선택', exact: true }) });
  await expect(progressPhoto).toContainText('경과 D+15');
  await expect(progressPhoto).toContainText('9월 16일');
  await page.getByRole('checkbox', { name: '경과 2026-09-16 선택', exact: true }).check();
  await page.getByRole('checkbox', { name: '사진 2 선택', exact: true }).check();
  if (testInfo.project.name === 'mobile') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('button', { name: '원하는 점 적기', exact: true })).toBeInViewport({
      ratio: 1,
    });
  }
  await goToRequest(page);
  if (testInfo.project.name === 'mobile') {
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByLabel('원하는 내용 1', { exact: true })).toBeInViewport({ ratio: 1 });
    const input = await page.getByLabel('원하는 내용 1', { exact: true }).boundingBox();
    const actions = await page.locator('.request-editor-actions').boundingBox();
    expect(input!.y + input!.height).toBeLessThanOrEqual(actions!.y);
    const next = page.getByRole('button', { name: '내용 확인하기', exact: true });
    await next.scrollIntoViewIfNeeded();
    await expect(next).toBeInViewport({ ratio: 1 });
  }
  await expect(page.locator('.request-options > summary')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.getByLabel('집에서 손질', { exact: true })).not.toBeVisible();
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
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('손질 방법을 알고 싶어요');
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '손질 방법을 알고 싶어요',
  );
  if (testInfo.project.name === 'mobile') {
    await page.setViewportSize({ width: 390, height: 500 });
    await page.locator('.request-options > summary').click();
    const question = page.getByLabel('추가 질문', { exact: true });
    await question.fill('손질할 때 어느 방향으로 말리면 좋을까요?');
    await question.press('Tab');
    const button = page.getByRole('button', { name: '내용 확인하기', exact: true });
    await expect(button).toBeFocused();
    const primary = await button.boundingBox();
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
    expect(primary!.y + primary!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await withinViewport(page);
});

test('초기화와 새로고침은 신규 기록·초안을 없애고 샘플을 복원', async ({ page }) => {
  await page.goto('/examples/records/new');
  await page.getByLabel('좋았던 점').fill('작성 중인 커트 초안');
  await goMenu(page, '내 기록');
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('작성 중인 커트 초안');
  await resetPrototype(page);
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
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
  await page.goto('/examples/records/new');
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
  await expect(page.getByRole('alert')).toContainText('사진을 읽을 수 없어요.');
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
  await page.goto('/examples/consultations/materials?designer=designer-jiu&record=cut-september');
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await fillRequest(page, '확인 시점에 남긴 요청');
  const previewURL = page.url();
  await page.getByRole('button', { name: '내용 수정', exact: true }).click();
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('나중에 수정한 초안');
  await page.goBack();
  await expect(page.getByText('확인 시점에 남긴 요청', { exact: true })).toBeVisible();
  await expect(page.getByText('나중에 수정한 초안', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '원본 기록 보기', exact: true }).click();
  await expect(
    page.getByRole('link', { name: '상담 미리보기로 돌아가기', exact: true }),
  ).toHaveAttribute('href', new URL(previewURL).pathname);
  await page.getByRole('link', { name: '경과 추가', exact: true }).click();
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('내용 확인하기 후 새로 남긴 경과');
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await page.goBack();
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(previewURL);
  await expect(page.getByText('내용 확인하기 후 새로 남긴 경과', { exact: true })).toHaveCount(0);
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
  await page.goto('/examples/records/cut-august');
  await expect(page.getByText('아직 경과를 남기지 않았어요.', { exact: false })).toBeVisible();
  await chooseDesigner(page);
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await fillRequest(page, '아주긴요청내용'.repeat(150));
  await withinViewport(page);
});

test('디자이너 없이 개인 요청 준비, 경과 질문 가져오기와 목록 재진입', async ({ page }) => {
  await page.goto('/examples/records/cut-september');
  await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
  await expect(page.getByRole('heading', { name: '참고 자료 선택', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await goToRequest(page);
  const reference = page.getByRole('complementary', { name: '요청에 첨부할 자료', exact: true });
  if ((await reference.locator('details').getAttribute('open')) === null)
    await reference.locator('summary').click();
  await reference.getByRole('button', { name: '이 질문을 요청에 추가', exact: true }).click();
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '옆머리 아래는 짧게, 위는 길게 남기면 덜 뜰까요?',
  );
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toBeFocused();
  await expect(
    reference.getByRole('button', { name: '이 질문을 요청에 추가', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('원하는 내용 2', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  await expect(
    page.getByRole('heading', { name: '다음 커트 준비 내용', exact: true }),
  ).toBeVisible();
  const previewPath = new URL(page.url()).pathname;
  await expect(page.getByText('앞머리 길이가 마음에 듦', { exact: true })).toHaveCount(0);
  await goMenu(page, '커트 준비');
  await page.locator(`a[href="${previewPath}"]`).click();
  await expect(
    page.getByRole('heading', { name: '다음 커트 준비 내용', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '원본 기록 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '준비한 내용', exact: true })).toBeVisible();
  const saved = page.getByRole('heading', { name: '준비한 내용', exact: true }).locator('..');
  await saved.locator(`a[href="${previewPath}"]`).click();
  await expect(
    page.getByRole('heading', { name: '다음 커트 준비 내용', exact: true }),
  ).toBeVisible();
  await withinViewport(page);
});

test('첨부 없는 개인 준비에서 상담 자료 추가, 요청 문장 유지', async ({ page }) => {
  await page.goto('/examples/records/cut-august');
  await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
  await goToRequest(page);
  await page
    .getByLabel('원하는 내용 1', { exact: true })
    .fill('아직 디자이너를 정하지 않은 개인 준비');
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  await expect(
    page.getByRole('heading', { name: '다음 커트 준비 내용', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('전체적으로 가벼운 느낌이에요', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '디자이너 선택하기', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await page.getByRole('button', { name: '자료를 추가해서 상담 준비', exact: true }).click();
  await goToRequest(page);
  await expect(page.getByRole('alert')).toContainText(
    '상담에 사용할 자료를 하나 이상 선택해 주세요.',
  );
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '아직 디자이너를 정하지 않은 개인 준비',
  );
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  await expect(
    page.getByRole('heading', { name: '디자이너에게 보여 줄 내용', exact: true }),
  ).toBeVisible();
  await withinViewport(page);
});

test('개인 준비를 디자이너용으로 복사해도 기존 초안과 개인 준비본 보존', async ({ page }) => {
  await page.goto('/examples/consultations/materials?designer=designer-jiu&record=cut-september');
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await goToRequest(page);
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('디자이너별 기존 초안');
  await goMenu(page, '내 기록');
  await page.getByRole('link').filter({ hasText: '9월 1일 커트' }).click();
  await page.getByRole('button', { name: '새 커트 준비', exact: true }).click();
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await page.getByRole('checkbox', { name: '사진 1 선택', exact: true }).check();
  await goToRequest(page);
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('개인 준비에서 가져갈 새 요청');
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  const personalPath = new URL(page.url()).pathname;
  await page.getByRole('link', { name: '디자이너 선택하기', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await expect(page.getByRole('link', { name: '기존 초안 이어쓰기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이 자료로 상담 준비', exact: true }).click();
  await openSavedPreparation(page);
  await expect(
    page.getByRole('heading', { name: '디자이너에게 보여 줄 내용', exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).not.toBe(personalPath);
  await expect(page.getByText('개인 준비에서 가져갈 새 요청', { exact: true })).toBeVisible();
  await expect(page.getByText('앞머리 길이가 마음에 듦', { exact: true })).toHaveCount(0);
  await expect(page.getByText('커트 당일 · 9월 1일', { exact: true })).toBeVisible();
  await goMenu(page, '커트 준비');
  await page.locator(`a[href="${personalPath}"]`).click();
  await expect(
    page.getByRole('heading', { name: '다음 커트 준비 내용', exact: true }),
  ).toBeVisible();
  await goMenu(page, '커트 준비');
  await page.getByRole('link').filter({ hasText: '디자이너별 기존 초안' }).click();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '디자이너별 기존 초안',
  );
  await withinViewport(page);
});

test('같은 디자이너·커트의 새 준비와 이전 초안을 각각 다시 열기', async ({ page }) => {
  await page.goto('/examples/consultations/materials?designer=designer-jiu&record=cut-september');
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await goToRequest(page);
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('같은 대상의 첫 번째 초안');
  await openDetails(page, '체험 안내');
  await page.getByRole('link', { name: '디자이너 예시', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await page.getByRole('button', { name: '새 준비 만들기', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: '커트 당일 메모 선택', exact: true }).check();
  await goToRequest(page);
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('같은 대상의 두 번째 초안');
  const secondPath = new URL(page.url()).pathname + new URL(page.url()).search;
  await goMenu(page, '커트 준비');
  await page.getByRole('link').filter({ hasText: '같은 대상의 첫 번째 초안' }).click();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '같은 대상의 첫 번째 초안',
  );
  await goMenu(page, '커트 준비');
  await page.getByRole('link').filter({ hasText: '같은 대상의 두 번째 초안' }).click();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '같은 대상의 두 번째 초안',
  );
  await page.reload();
  await expect(
    page.getByRole('heading', { name: '작성 중인 요청을 찾을 수 없어요', exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(secondPath);
});

test('수정은 확정 시점 자료를 유지하고 최신 기록 선택은 명시적으로 전환', async ({ page }) => {
  await page.goto('/examples/records/cut-september');
  await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await goToRequest(page);
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('원본을 다시 봐도 유지할 개인 준비');
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  const oldPath = new URL(page.url()).pathname;
  await page.getByRole('link', { name: '원본 기록 보기', exact: true }).click();
  await page.getByRole('link', { name: '경과 추가', exact: true }).click();
  await page.getByLabel('관찰 날짜', { exact: true }).fill('2026-10-01');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('미리보기 이후 새로 적은 관찰');
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 · 경과', exact: true })).toBeVisible();
  await goMenu(page, '커트 준비');
  await expect(page).toHaveURL(new URL(oldPath, page.url()).href);
  await page.getByRole('button', { name: '내용 수정', exact: true }).click();
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '경과 2026-10-01 선택', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '자료 전체 해제', exact: true }).click();
  await expect(page.locator('.material-picker input:checked')).toHaveCount(0);
  await page.getByRole('button', { name: '자료 전체 선택', exact: true }).click();
  await expect(page.locator('.material-picker input:checked')).toHaveCount(1);
  await expect(
    page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: '경과 2026-10-01 선택', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: '최신 기록에서 다시 고르기', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: '경과 2026-10-01 선택', exact: true }),
  ).not.toBeChecked();
  await page.getByRole('checkbox', { name: '경과 2026-10-01 선택', exact: true }).check();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '원본을 다시 봐도 유지할 개인 준비',
  );
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  await expect(page.getByText('미리보기 이후 새로 적은 관찰', { exact: true })).toBeVisible();
  await goMenu(page, '커트 준비');
  await page.locator(`main a[href="${oldPath}"]`).click();
  await expect(page.getByText('미리보기 이후 새로 적은 관찰', { exact: true })).toHaveCount(0);
  await withinViewport(page);
});

test('기록·경과 수정의 날짜 검사와 이전 커트 준비 보존', async ({ page }) => {
  await page.goto('/examples/consultations/materials?designer=designer-jiu&record=cut-september');
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
    page.getByText('이미 남긴 경과 날짜보다 늦은 커트 날짜로 바꿀 수 없어요.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('커트 날짜', { exact: true }).fill('2026-08-31');
  await page.getByLabel('좋았던 점').fill('현재 원본에서 수정한 메모');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByText('D+15', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '경과 수정', exact: true }).click();
  await page.getByLabel('관찰 날짜', { exact: true }).fill('2026-08-30');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(
    page.getByText('커트 날짜부터 오늘 사이의 관찰 날짜를 선택해 주세요.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('관찰 날짜', { exact: true }).fill('2026-09-16');
  await openDetails(page, '손질 방법, 물어볼 점');
  await page.getByLabel('물어볼 점', { exact: true }).fill('현재 원본에서 수정한 질문');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByText('D+16', { exact: true })).toBeVisible();
  await page.locator(`.record-request-list a[href="${previewPath}"]`).click();
  await expect(
    page.getByText('앞머리 길이가 마음에 듦', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText('옆머리 아래는 짧게, 위는 길게 남기면 덜 뜰까요?', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('커트 당일 · 9월 1일', { exact: true })).toBeVisible();
  await expect(page.getByText('현재 원본에서 수정한 메모', { exact: true })).toHaveCount(0);
  await expect(page.getByText('현재 원본에서 수정한 질문', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '내용 수정', exact: true }).click();
  await page.getByRole('link', { name: '자료 다시 고르기', exact: true }).click();
  await expect(
    page.getByText('앞머리 길이가 마음에 듦', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '최신 기록에서 다시 고르기', exact: true }).click();
  await expect(
    page.getByText('현재 원본에서 수정한 메모', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: '경과 2026-09-16 선택', exact: true }),
  ).toBeChecked();
  await goToRequest(page);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '수정 전에 준비한 요청',
  );
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  await expect(
    page.getByText('현재 원본에서 수정한 메모', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText('현재 원본에서 수정한 질문', { exact: true })).toBeVisible();
  await expect(page.getByText('커트 당일 · 8월 31일', { exact: true })).toBeVisible();
  await withinViewport(page);
});

test('이름 입력은 프로필로 자동 연결하지 않고 직접 선택한 ID만 연결', async ({ page }) => {
  await page.goto('/examples/records/new');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await openDetails(page, '선택 정보 · 미용실, 담당자, 가격');
  await page.getByLabel('담당자', { exact: true }).fill('지우');
  await page.getByLabel('미용실', { exact: true }).fill('시술 당시 매장');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByText('기록에 연결한 디자이너', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await openDetails(page, '선택 정보 · 미용실, 담당자, 가격');
  await page.getByLabel('담당자 선택', { exact: true }).selectOption('profile/designer-jiu');
  await expect(page.getByLabel('담당자', { exact: true })).toHaveAttribute('readonly', '');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByText('현재 소속 · 그린 헤어', { exact: true })).toBeVisible();
  await expect(page.getByText('시술 당시 매장', { exact: true })).toBeVisible();
  const cutId = new URL(page.url()).pathname.split('/').at(-1);
  await page.getByRole('link', { name: '프로필 · 상담 준비', exact: true }).click();
  await page.getByRole('button', { name: '상담 자료 선택', exact: true }).click();
  await expect(page.getByLabel('참고할 지난 커트', { exact: true })).toHaveValue(cutId!);
  await withinViewport(page);
});

test('이전 담당자는 이름·매장별로 모아 선택하고 저장·재접속, 프로필로 자동 연결하지 않음', async ({
  page,
}) => {
  for (const salon of ['봄 헤어', '봄 헤어', '여름 헤어']) {
    await page.goto('/records/new');
    await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
    await openDetails(page, '선택 정보 · 미용실, 담당자, 가격');
    await page.getByLabel('담당자', { exact: true }).fill('지우');
    await page.getByLabel('미용실', { exact: true }).fill(salon);
    await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
    await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
    await expect(
      page.getByRole('heading', { name: '커트 기록 · 경과', exact: true }),
    ).toBeVisible();
  }
  await page.goto('/records/new');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await openDetails(page, '선택 정보 · 미용실, 담당자, 가격');
  const chooser = page.getByRole('combobox', { name: '담당자 선택', exact: true });
  await expect(chooser.locator('optgroup[label="이전 기록의 담당자"] option')).toHaveCount(2);
  await expect(chooser.locator('optgroup[label="예시 디자이너 프로필"]')).toHaveCount(0);
  await chooser.selectOption({ label: '지우 · 봄 헤어' });
  await expect(page.getByLabel('담당자', { exact: true })).toHaveValue('지우');
  await expect(page.getByLabel('미용실', { exact: true })).toHaveValue('봄 헤어');
  await expect(page.getByLabel('담당자', { exact: true })).not.toHaveAttribute('readonly', '');
  await chooser.selectOption('');
  await expect(chooser).toHaveValue('');
  await expect(page.getByLabel('담당자', { exact: true })).toHaveValue('지우');
  await chooser.selectOption({ label: '지우 · 여름 헤어' });
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByText('여름 헤어', { exact: true })).toBeVisible();
  await expect(page.getByText('기록에 연결한 디자이너', { exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await openDetails(page, '선택 정보 · 미용실, 담당자, 가격');
  await expect(page.getByLabel('담당자', { exact: true })).toHaveValue('지우');
  await expect(page.getByLabel('미용실', { exact: true })).toHaveValue('여름 헤어');
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
  await page.goto('/examples/records/cut-september/edit');
  await page.getByLabel('좋았던 점').fill('저장하지 않은 수정');
  await goMenu(page, '내 기록');
  await page.getByRole('link').filter({ hasText: '9월 1일 커트' }).click();
  await expect(page.getByText('저장하지 않은 수정', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('저장하지 않은 수정');
  await discardDraft(page);
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('앞머리 길이가 마음에 듦');
  await discardDraft(page);
  await goMenu(page, '내 기록');
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await page.getByLabel('좋았던 점').fill('취소할 신규 기록');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  const photoUrl = await page
    .getByRole('img', { name: 'sample-cut.jpg', exact: true })
    .getAttribute('src');
  await discardDraft(page);
  expect(
    await page.evaluate(() => (window as unknown as { revokedPhotos: string[] }).revokedPhotos),
  ).toContain(photoUrl);
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('');
  await expect(page.getByRole('img')).toHaveCount(0);
});

test('사진 확대와 초기화 확인의 Escape·닫기·계속 작성은 데이터 유지', async ({ page }) => {
  await page.goto('/examples/records/cut-september');
  const photoButton = page.getByRole('button', { name: '커트 당일 · 예시 사진 확대', exact: true });
  await photoButton.click();
  const photoDialog = page.getByRole('dialog', { name: '사진 확대', exact: true });
  await expect(photoDialog).toBeVisible();
  await expect(photoDialog.getByText('커트 당일 · 9월 1일', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(photoDialog).not.toBeVisible();
  await expect(photoButton).toBeFocused();
  await photoButton.click();
  await photoDialog.getByRole('button', { name: '닫기', exact: true }).click();
  await expect(photoButton).toBeFocused();
  await goMenu(page, '내 기록');
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await page.getByLabel('좋았던 점').fill('초기화 취소 후에도 유지');
  await openDetails(page, '체험 안내');
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '작성한 내용을 초기화할까요?', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('좋았던 점')).toHaveValue('초기화 취소 후에도 유지');
  await openDetails(page, '체험 안내');
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
    ['/examples/records/cut-august/progress/progress-september/edit', '자료를 찾을 수 없어요'],
    ['/examples/records/no-such-cut/edit', '자료를 찾을 수 없어요'],
    ['/examples/requests/write?draft=no-such-draft', '작성 중인 요청을 찾을 수 없어요'],
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
  await page.goto('/examples/records/new');
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
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 · 경과', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toHaveCount(1);
});

test('소개 홈과 빈 내 기록, 기록 없이 준비할 때의 시작 안내', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: '커트 기록, 남겨볼까요?', exact: true }),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText('9월 1일 커트');
  await expect(page.getByRole('link', { name: '커트 기록 남기기', exact: true })).toBeInViewport();
  await goMenu(page, '내 기록');
  await expect(page.getByText('아직 남긴 커트 기록이 없어요', { exact: true })).toBeVisible();
  await goMenu(page, '커트 준비');
  await page.getByRole('link', { name: '먼저 커트 기록 남기기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 남기기', exact: true })).toBeVisible();
  await withinViewport(page);
});

test('개인 기록에서 경과 없이 3단계 준비, 마지막 작성 단계로 재진입', async ({ page }) => {
  await page.goto('/records/new');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('요청에 포함하지 않을 개인 메모');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(
    page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }),
  ).toBeInViewport();
  await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
  await expect(page.getByLabel('커트 준비 단계').locator('li')).toHaveCount(3);
  await expect(page.locator('[aria-current="step"]')).toHaveText('1자료 고르기');
  await goToRequest(page);
  await page
    .getByLabel('원하는 내용 1', { exact: true })
    .fill('이번에는 옆머리를 조금 짧게 해 주세요');
  await goMenu(page, '커트 준비');
  await page.getByRole('link').filter({ hasText: '이번에는 옆머리를 조금 짧게 해 주세요' }).click();
  await expect(
    page.getByRole('heading', { name: '이번 커트에서 원하는 점을 적어 주세요', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '이번에는 옆머리를 조금 짧게 해 주세요',
  );
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await openSavedPreparation(page);
  await expect(
    page.getByRole('heading', { name: '다음 커트 준비 내용', exact: true }),
  ).toBeVisible();
  await expect(page.locator('main')).not.toContainText('요청에 포함하지 않을 개인 메모');
  await expect(page.getByRole('link', { name: '디자이너 선택하기', exact: true })).toHaveCount(0);
  await page
    .getByRole('complementary')
    .getByRole('link', { name: '준비 목록으로', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: '준비한 내용', exact: true })).toBeVisible();
  await page.reload();
  await goMenu(page, '내 기록');
  await expect(page.getByText('요청에 포함하지 않을 개인 메모', { exact: true })).toBeVisible();
  await goMenu(page, '커트 준비');
  await expect(page.locator('main')).toContainText('이번에는 옆머리를 조금 짧게 해 주세요');
});

test('예시 진입·수정·초기화·종료 후 개인 기록·사진·작성 초안 유지', async ({ page }) => {
  await page.goto('/records/new');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('예시와 섞이지 않을 내 기록');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
  await goToRequest(page);
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('내 커트 준비 초안');
  await page.getByRole('link', { name: 'SALU 홈', exact: true }).click();
  await page.getByRole('link', { name: '커트 기록 남기기', exact: true }).click();
  await page.getByLabel('좋았던 점').fill('아직 저장하지 않은 개인 기록');
  await page.getByRole('link', { name: 'SALU 홈', exact: true }).click();
  await page.getByRole('link', { name: '예시로 둘러보기', exact: true }).click();
  await expect(page.locator('main')).not.toContainText('예시와 섞이지 않을 내 기록');
  await page.getByRole('link').filter({ hasText: '9월 1일 커트' }).click();
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await page.getByLabel('좋았던 점').fill('예시에서만 수정한 내용');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await resetPrototype(page);
  await expect(
    page.getByText('앞머리 길이가 마음에 듦', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '예시 체험 끝내기', exact: true }).click();
  await page.getByRole('link', { name: '커트 기록 남기기', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('아직 저장하지 않은 개인 기록');
  await goMenu(page, '내 기록');
  await expect(page.locator('.journal-entry')).toHaveCount(1);
  await page.getByRole('link').filter({ hasText: '예시와 섞이지 않을 내 기록' }).click();
  await expect(page.locator('img').first()).toBeVisible();
  expect(
    await page
      .locator('img')
      .first()
      .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
  ).toBe(true);
  await page.getByRole('link', { name: '작성 중인 커트 준비 이어쓰기', exact: true }).click();
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue('내 커트 준비 초안');
  await withinViewport(page);
});

test('새 커트 준비에서는 참고 기록을 직접 선택하고 없는 ID를 자동 대체하지 않음', async ({
  page,
}) => {
  await page.goto('/examples/requests');
  await page.getByRole('link', { name: '새 커트 준비', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '참고할 지난 커트를 골라 주세요', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '원하는 점 적기', exact: true })).toHaveCount(0);
  await page.getByRole('link').filter({ hasText: '8월 12일 커트' }).click();
  await expect(page.getByLabel('참고할 지난 커트', { exact: true })).toHaveValue('cut-august');
  await page.goto('/examples/requests/materials?record=missing');
  await expect(
    page.getByRole('heading', { name: '기록 또는 작성 중인 요청을 찾을 수 없어요', exact: true }),
  ).toBeVisible();
});

test('빈 초안 ID와 객체 속성 이름 URL은 복구 안내, 개인 영역에는 샘플 ID 없음', async ({
  page,
}) => {
  for (const path of [
    '/examples/requests/materials?draft=',
    '/examples/requests/materials?draft=__proto__',
    '/examples/requests/write?draft=__proto__',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/찾을 수 없어요/);
    await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveCount(0);
  }
  await page.goto('/records/cut-september');
  await expect(
    page.getByRole('heading', { name: '자료를 찾을 수 없어요', exact: true }),
  ).toBeVisible();
});
