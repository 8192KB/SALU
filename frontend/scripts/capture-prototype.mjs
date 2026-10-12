import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('../docs/screenshots');
const baseURL = process.env.SALU_CAPTURE_URL ?? 'http://127.0.0.1:5174';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.SALU_CHROMIUM_PATH ? { executablePath: process.env.SALU_CHROMIUM_PATH } : {}),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const capture = async (name) => {
    await page.locator('img').evaluateAll(async (images) => {
      await Promise.all(images.map((image) => image.decode()));
    });
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    await page.screenshot({ path: resolve(output, name), fullPage: true, animations: 'disabled' });
    console.log(`캡처: ${name}`);
  };
  await page.goto(baseURL);
  await page.getByRole('heading', { name: '커트 기록, 남겨볼까요?', exact: true }).waitFor();
  await capture('home-desktop.png');
  await page.goto(`${baseURL}/examples/records`);
  await page.getByRole('heading', { name: '나의 커트 기록', exact: true }).waitFor();
  await capture('records-desktop.png');
  await page.goto(`${baseURL}/examples/designers/designer-jiu`);
  await page.getByRole('heading', { name: '지우 디자이너', exact: true }).waitFor();
  await capture('designer-desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseURL}/examples/records/cut-september`);
  await page.getByRole('heading', { name: '커트 기록 · 경과', exact: true }).waitFor();
  await capture('record-mobile.png');
  await page.getByRole('link', { name: '디자이너 선택', exact: true }).click();
  await page.getByRole('link').filter({ hasText: '지우 디자이너' }).click();
  await page.getByRole('button', { name: '상담 자료 선택', exact: true }).click();
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await page.getByRole('checkbox', { name: '사진 1 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page.getByLabel('요청 종류 1', { exact: true }).selectOption('CHANGE');
  await page
    .getByLabel('요청 내용 1', { exact: true })
    .fill('옆머리 아래는 조금 짧게, 위쪽 길이는 남기고 싶어요.');
  await page.getByRole('button', { name: '요청 항목 추가', exact: true }).click();
  await page.getByLabel('요청 부위 2', { exact: true }).selectOption('FRONT');
  await page.getByLabel('요청 종류 2', { exact: true }).selectOption('KEEP');
  await page
    .getByLabel('요청 내용 2', { exact: true })
    .fill('앞머리 길이는 지난번처럼 유지하고 싶어요.');
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await page.getByRole('heading', { name: '상담 요청 미리보기', exact: true }).waitFor();
  await capture('preview-mobile.png');
  await page.getByRole('link', { name: '원본 기록 보기', exact: true }).click();
  await page.getByRole('heading', { name: '커트 기록 · 경과', exact: true }).waitFor();
  await page.getByRole('button', { name: '커트 당일 · 예시 사진 확대', exact: true }).click();
  await page.getByRole('dialog', { name: '사진 확대', exact: true }).waitFor();
  await capture('photo-mobile.png');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: '기록 수정', exact: true }).click();
  await page.getByRole('heading', { name: '커트 기록 수정', exact: true }).waitFor();
  await capture('edit-mobile.png');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
  await page.getByRole('checkbox', { name: '경과 2026-09-15 선택', exact: true }).check();
  await page.getByRole('button', { name: '요청 작성', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const reference = page.getByRole('complementary', { name: '요청에 첨부할 자료', exact: true });
  if ((await reference.locator('details').getAttribute('open')) === null)
    await reference.locator('summary').click();
  await reference.getByRole('button', { name: '이 질문을 요청에 추가', exact: true }).click();
  await capture('request-desktop.png');
  await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
  await page.getByRole('heading', { name: '다음 커트 요청 내용', exact: true }).waitFor();
  await page.getByRole('link', { name: '커트 준비 목록', exact: true }).click();
  await page.getByRole('heading', { name: '커트 준비', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await capture('requests-mobile.png');
} finally {
  await browser.close();
}
