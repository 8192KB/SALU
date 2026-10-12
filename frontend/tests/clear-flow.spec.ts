import { test, expect } from '@playwright/test';

for (const viewport of [
  { width: 320, height: 740 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  test(`터치 ${viewport.width}에서 스크롤·회전 후 하단 메뉴와 달력 표시`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
      await page.goto(`${baseURL}/examples/records`);
      const nav = page.getByRole('navigation', { name: '주 메뉴' });
      await expect(nav).toHaveCSS('position', 'fixed');
      await page.evaluate(() => window.scrollTo(0, 1000));
      await expect(nav).toBeInViewport();
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await expect(nav).toHaveCSS('position', 'fixed');
      await expect(nav).toBeInViewport();
      await page.setViewportSize(viewport);
      await page.goto(`${baseURL}/records/new`);
      const trigger = page.getByRole('button', { name: '커트 날짜 달력 열기' });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: '커트 날짜 선택' });
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      const day = dialog.locator('.calendar-day').first();
      expect((await day.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      await dialog.getByRole('button', { name: '취소', exact: true }).click();
      await expect(trigger).toBeFocused();
    } finally {
      await context.close();
    }
  });
}
test('데스크톱 메뉴는 스크롤 후에도 상단 고정', async ({ browser, baseURL }) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    hasTouch: false,
  });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/examples/records`);
    await page.evaluate(() => window.scrollTo(0, 1000));
    await expect(page.locator('.app-header')).toHaveCSS('position', 'sticky');
    await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeInViewport();
  } finally {
    await context.close();
  }
});
test('달력의 월 이동·윤일 선택·취소·키보드·최대 날짜와 경과 최소 날짜', async ({ page }) => {
  await page.goto('/examples/records/new');
  const input = page.getByLabel('커트 날짜', { exact: true });
  await input.fill('2024-02-29');
  await input.press('Tab');
  const trigger = page.getByRole('button', { name: '커트 날짜 달력 열기' });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: '2024년 2월 29일', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '다음 달' }).click();
  await expect(dialog.getByLabel('월', { exact: true })).toHaveValue('3');
  await dialog.getByRole('button', { name: '취소', exact: true }).click();
  await expect(input).toHaveValue('2024년 2월 29일');
  await trigger.click();
  await dialog.getByRole('button', { name: '2024년 2월 28일', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(input).toHaveValue('2024년 2월 28일');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByLabel('연도', { exact: true }).fill('2099');
  await expect(dialog.locator('.calendar-day:not(:disabled)')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(input).toHaveValue('2024년 2월 28일');
  await page.goto('/examples/records/cut-september/progress/new');
  await page.getByRole('button', { name: '관찰 날짜 달력 열기' }).click();
  await page.getByRole('dialog').getByLabel('월', { exact: true }).selectOption('8');
  await expect(page.getByRole('dialog').locator('.calendar-day:not(:disabled)')).toHaveCount(0);
});
test('커트·경과 생성과 수정은 지속되는 완료 화면에서 명시적으로 상세 이동', async ({ page }) => {
  await page.goto('/records/new');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('결과 확인');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).dblclick();
  await expect(
    page.getByRole('heading', { name: '커트 기록을 남겼어요', exact: true }),
  ).toBeVisible();
  const complete = page.url();
  await page.reload();
  await expect(page).toHaveURL(complete);
  await expect(page.locator('.completion-check')).toBeVisible();
  await page.getByRole('link', { name: '기록 보기', exact: true }).click();
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await page.getByLabel('좋았던 점').fill('수정 확인');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '커트 기록을 수정했어요', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '기록 보기', exact: true }).click();
  await page.getByRole('link', { name: '경과 추가', exact: true }).click();
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('불편한 점').fill('경과 확인');
  await page.getByRole('button', { name: '경과 저장', exact: true }).click();
  await expect(page.getByRole('heading', { name: '경과를 추가했어요', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '기록과 경과 보기', exact: true }).click();
  await page.getByRole('link', { name: '경과 수정', exact: true }).click();
  await page.getByLabel('불편한 점').fill('경과 수정 확인');
  await page.getByRole('button', { name: '수정 저장', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: '경과 기록을 수정했어요', exact: true }),
  ).toBeVisible();
  await page.goto('/records/missing/complete');
  await expect(page.getByRole('heading', { name: '저장한 기록을 찾을 수 없어요' })).toBeVisible();
  await expect(page.locator('.completion-check')).toHaveCount(0);
});
