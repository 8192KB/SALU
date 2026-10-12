import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function savedCount(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const opening = indexedDB.open('salu-personal-v1', 1);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction('workspaces', 'readonly');
          const request = tx.objectStore('workspaces').get('guest');
          request.onsuccess = () => resolve(request.result?.bundle?.state?.previews?.length ?? 0);
          request.onerror = () => reject(request.error);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}
async function beginPreparation(page: Page) {
  await page.goto('/records/new');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('준비 과정과 분리해 보관할 개인 메모');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
  await page.getByRole('button', { name: '원하는 점 적기', exact: true }).click();
  await page
    .getByLabel('원하는 내용 1', { exact: true })
    .fill('길이는 유지하고 옆머리만 정리해 주세요');
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await expect(page).toHaveURL(/\/requests\/review\?draft=/);
}

test('저장 전 확인·수정은 준비본을 만들지 않고 저장 성공 후 결과와 상세를 구분', async ({
  page,
}) => {
  await beginPreparation(page);
  const review = page.url();
  expect(await savedCount(page)).toBe(0);
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
  await expect(page.locator('[aria-current="step"]')).toContainText('내용 확인');
  await page.getByRole('link', { name: '요청 수정', exact: true }).click();
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('앞머리 길이는 유지해 주세요');
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  expect(await savedCount(page)).toBe(0);
  await page.getByRole('button', { name: '준비 저장하기', exact: true }).dblclick();
  await expect(
    page.getByRole('heading', { name: '커트 준비를 마쳤어요', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible();
  const complete = page.url();
  expect(await savedCount(page)).toBe(1);
  await page.reload();
  await expect(page.locator('.completion-check')).toBeVisible();
  expect(await savedCount(page)).toBe(1);
  await page.getByRole('link', { name: '준비한 내용 보기', exact: true }).click();
  await expect(page).toHaveURL(/\/requests\/previews\//);
  await expect(page.locator('.completion-check')).toHaveCount(0);
  await expect(page.getByText('앞머리 길이는 유지해 주세요', { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('준비 과정과 분리해 보관할 개인 메모');
  await page.goto(review);
  await page.getByRole('button', { name: '준비 저장하기', exact: true }).click();
  await expect(page).toHaveURL(complete);
  expect(await savedCount(page)).toBe(1);
});

test('기기 저장 실패는 확인 단계에 머물며 입력 보존 후 재시도 가능', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    let failed = false;
    IDBObjectStore.prototype.put = function (value, key) {
      if (!failed && this.name === 'workspaces' && value?.bundle?.state?.previews?.length) {
        failed = true;
        throw new DOMException('simulated quota', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    };
  });
  await beginPreparation(page);
  await page.getByRole('button', { name: '준비 저장하기', exact: true }).click();
  await expect(page.locator('.review-screen [role="alert"]')).toBeVisible();
  await expect(page).toHaveURL(/\/requests\/review\?draft=/);
  await expect(page.locator('.completion-check')).toHaveCount(0);
  expect(await savedCount(page)).toBe(0);
  await expect(
    page.getByText('길이는 유지하고 옆머리만 정리해 주세요', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '준비 저장하기', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '커트 준비를 마쳤어요', exact: true }),
  ).toBeVisible();
  expect(await savedCount(page)).toBe(1);
});

test('날짜는 한국어 표시와 숫자 편집을 왕복하고 오류는 항목 제목과 구분', async ({ page }) => {
  await page.goto('/records/new');
  const date = page.getByLabel('커트 날짜', { exact: true });
  await date.fill('2024-02-29');
  await date.press('Tab');
  await expect(date).toHaveValue('2024년 2월 29일');
  await date.focus();
  await expect(date).toHaveValue('2024년 2월 29일');
  await date.fill('2026-02-30');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect(date).toHaveAttribute('aria-invalid', 'true');
  const error = page.locator('.date-field .field-error');
  await expect(error).toBeVisible();
  await expect(error.locator('svg')).toBeVisible();
  const colors = await page.locator('.date-field').evaluate((element) => ({
    label: getComputedStyle(element.querySelector('.field-label')!).color,
    error: getComputedStyle(element.querySelector('.field-error')!).color,
  }));
  expect(colors.error).not.toBe(colors.label);
  await date.fill('2024년 2월 29일');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByText('2024년 2월 29일', { exact: true })).toBeVisible();
});

test('자료 사진은 첫 화면에서 보이고 없는 사진·불러오기 실패도 명확히 표시', async ({ page }) => {
  await page.goto('/examples/requests/materials?record=cut-august');
  await expect(page.locator('.material-empty-photo')).toContainText('사진 없음');
  await expect(page.getByRole('checkbox', { name: /사진 \d+ 선택/ })).toHaveCount(0);
  await page.route('**/images/sample-cut.jpg', (route) => route.abort());
  await page.goto('/examples/requests/materials?record=cut-september');
  const image = page.locator('.material-choice-image').first();
  await expect(image).toBeInViewport();
  await expect(image).toContainText('사진을 불러오지 못했어요');
  await page.getByRole('checkbox', { name: '사진 1 선택', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: '사진 1 선택', exact: true })).toBeChecked();
});
