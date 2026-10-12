import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';

const menu = (page: Page, name: string) =>
  page.getByRole('navigation', { name: '주 메뉴' }).getByRole('link', { name, exact: true });

test('작성 중 메뉴 숨김, 안전한 나가기와 재개는 입력·사진·선택 정보 유지', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('link', { name: '커트 기록 남기기', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('나갔다 돌아와도 이어 쓸 기록');
  await page.getByText('선택 정보 · 미용실, 담당자, 가격', { exact: true }).click();
  await page.getByLabel('미용실', { exact: true }).fill('작성 중 미용실');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await page
    .getByLabel('좋았던 점')
    .evaluate((element) => element.setAttribute('data-navigation-instance', 'original'));
  await page.locator('.task-exit').click();
  await expect(page).toHaveURL(/\/records$/);
  await menu(page, '홈').click();
  await menu(page, '내 기록').click();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByLabel('좋았던 점')).toHaveValue('나갔다 돌아와도 이어 쓸 기록');
  await expect(page.getByLabel('좋았던 점')).toHaveAttribute(
    'data-navigation-instance',
    'original',
  );
  await expect(page.getByLabel('미용실', { exact: true })).toBeVisible();
  await expect(page.getByLabel('미용실', { exact: true })).toHaveValue('작성 중 미용실');
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await page.locator('.task-exit').click();
  await expect(menu(page, '내 기록')).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('커트 준비 나가기·재개는 초안 ID·문장·작성 단계 유지', async ({ page }) => {
  await page.goto('/records/new');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toHaveCount(0);
  await page.getByRole('button', { name: '원하는 점 적기', exact: true }).click();
  await page.getByLabel('원하는 내용 1', { exact: true }).fill('길이는 유지하고 옆머리만 정리');
  const before = page.url();
  await page.locator('.task-exit').click();
  await menu(page, '홈').click();
  await menu(page, '커트 준비').click();
  await page.getByRole('link').filter({ hasText: '길이는 유지하고 옆머리만 정리' }).click();
  await expect(page).toHaveURL(before);
  await expect(page.getByLabel('원하는 내용 1', { exact: true })).toHaveValue(
    '길이는 유지하고 옆머리만 정리',
  );
  await page.locator('.task-exit').click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(menu(page, '커트 준비')).toBeVisible();
});

test('사진 확인 중 홈으로 이동해도 사진 처리를 완료하고 이어서 저장 가능', async ({ page }) => {
  await page.addInitScript(() => {
    const originalDecode = HTMLImageElement.prototype.decode;
    let delayed = false;
    HTMLImageElement.prototype.decode = async function () {
      await originalDecode.call(this);
      if (delayed) return;
      delayed = true;
      await new Promise<void>((resolveDecode) =>
        Reflect.set(window, 'finishPhotoDecode', resolveDecode),
      );
    };
  });
  await page.goto('/records/new');
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('사진 확인 중 이동');
  await page
    .getByLabel('사진 추가', { exact: true })
    .setInputFiles(resolve('public/images/sample-cut.jpg'));
  await expect(page.getByRole('status').filter({ hasText: '사진 확인 중' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => typeof Reflect.get(window, 'finishPhotoDecode')))
    .toBe('function');
  await page.locator('.task-exit').click();
  await menu(page, '홈').click();
  await page.evaluate(() => Reflect.get(window, 'finishPhotoDecode')());
  await menu(page, '내 기록').click();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page).toHaveURL(/\/records\/new$/);
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '커트 기록 저장', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await page.getByRole('link', { name: /^(기록 보기|기록과 경과 보기)$/ }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 · 경과', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'sample-cut.jpg', exact: true })).toBeVisible();
});

test('저장 중 홈으로 이동하면 홈을 유지하고 내 기록 복귀 시 저장 결과 표시', async ({ page }) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (value, key) {
      const request = put.call(this, value, key);
      if (this.name !== 'workspaces' || !value?.bundle?.state?.cuts?.length) return request;
      const add = request.addEventListener.bind(request);
      request.addEventListener = ((
        type: string,
        listener: EventListenerOrEventListenerObject,
        options?: boolean | AddEventListenerOptions,
      ) => {
        if (type !== 'success') return add(type, listener, options);
        add(
          type,
          (event: Event) => {
            Reflect.set(window, 'finishRecordSave', () => {
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
  await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
  await page.getByLabel('좋았던 점').fill('다른 화면에 있어도 저장 완료');
  await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => typeof Reflect.get(window, 'finishRecordSave')))
    .toBe('function');
  await page.locator('.task-exit').click();
  await menu(page, '홈').click();
  await expect(page).toHaveURL(/\/$/);
  await page.evaluate(() => Reflect.get(window, 'finishRecordSave')());
  await expect(menu(page, '내 기록')).toHaveAttribute('href', /\/records\/cut-/);
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('heading', { name: '커트 기록, 남겨볼까요?', exact: true }),
  ).toBeVisible();
  await menu(page, '내 기록').click();
  await expect(
    page.getByRole('heading', { name: '커트 기록을 남겼어요', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: '기록 보기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 · 경과', exact: true })).toBeVisible();
  await expect(page.getByText('다른 화면에 있어도 저장 완료', { exact: true })).toBeVisible();
});

test('작성 재개와 뒤로가기는 스크롤 유지, 목록 메뉴 재선택은 맨 위', async ({ page }) => {
  await page.setViewportSize({ ...page.viewportSize()!, height: 640 });
  await page.goto('/records/new');
  await page.getByLabel('좋았던 점').fill('스크롤 복원 확인');
  const y = await page.evaluate(() => {
    window.scrollTo(0, 320);
    return window.scrollY;
  });
  expect(y).toBeGreaterThan(100);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
  await page.locator('.task-exit').evaluate((element) => (element as HTMLAnchorElement).click());
  await menu(page, '홈').click();
  await menu(page, '내 기록').click();
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.getByRole('heading', { name: '나의 커트 기록', exact: true })).toBeVisible();
  await page.getByRole('link', { name: '새 기록', exact: true }).click();
  await expect(page.getByRole('heading', { name: '커트 기록 남기기', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
  await page.locator('.task-exit').evaluate((element) => (element as HTMLAnchorElement).click());
  await expect(page).toHaveURL(/\/records$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/records\/new$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(y);
  await page.locator('.task-exit').evaluate((element) => (element as HTMLAnchorElement).click());
  await menu(page, '내 기록').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
