import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { inspectRender } from './audit-metrics.mjs';
const output = '/tmp/salu-fr04-visual';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
const designer = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '지우',
  introduction: '커트 기록을 살펴보고 원하는 스타일을 함께 정리해요.',
  specialties: '커트,앞머리',
  visibility: 'PUBLIC',
  salonId: '22222222-2222-4222-8222-222222222222',
  salonName: '화면 확인 매장',
  region: '서울',
  branch: '본점',
};
try {
  for (const theme of ['light', 'dark'])
    for (const [width, height, touch] of [
      [320, 740, true],
      [390, 844, true],
      [820, 1180, true],
      [1180, 820, true],
      [1440, 1000, false],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        hasTouch: touch,
        isMobile: touch,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await context.route('**/api/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/me')
          return route.fulfill({
            json: {
              id: 99004,
              email: 'visual@example.invalid',
              displayName: '화면 확인',
              storageContext: 'fr04-visual-fixture',
            },
          });
        if (path === '/api/csrf')
          return route.fulfill({
            json: { headerName: 'X-CSRF-TOKEN', token: 'visual-fixture-token' },
          });
        if (path === '/api/auth/oauth2/providers') return route.fulfill({ json: [] });
        if (path === '/api/auth/oauth2/linked') return route.fulfill({ json: [] });
        if (path === '/api/salons')
          return route.fulfill({
            json: [
              { id: designer.salonId, name: designer.salonName, region: '서울', branch: '본점' },
            ],
          });
        if (path === '/api/designers') return route.fulfill({ json: [designer] });
        if (path === '/api/my/designer-profile' || path === `/api/designers/${designer.id}`)
          return route.fulfill({ json: designer });
        if (path === '/api/personal-backups') return route.fulfill({ json: [] });
        if (path.startsWith('/api/personal-backups/'))
          return route.fulfill({ json: { revision: 1 } });
        return route.fulfill({ status: 404, json: { code: 'RESOURCE_NOT_FOUND' } });
      });
      const capture = async (name) => {
        await page.locator('main h1').first().waitFor();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        await page.screenshot({ path: `${output}/${name}-${theme}-${width}.png`, fullPage: false });
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          heading: [...document.querySelectorAll('main h1')]
            .filter((e) => e.getClientRects().length)
            .map((e) => ({ text: e.textContent, size: getComputedStyle(e).fontSize })),
          sections: [...document.querySelectorAll('main h2')]
            .filter((e) => e.getClientRects().length)
            .map((e) => ({ text: e.textContent, size: getComputedStyle(e).fontSize })),
          nav: document.querySelector('header nav')
            ? getComputedStyle(document.querySelector('header nav')).position
            : null,
        }));
        results.push({
          name,
          theme,
          width,
          height,
          metrics,
          a11y: await page.evaluate(inspectRender),
          errors: errors.splice(0),
        });
      };
      await page.goto('http://127.0.0.1:5174/');
      await capture('home');
      await page.goto('http://127.0.0.1:5174/records/new');
      await page.getByLabel('좋았던 점').fill('커트한 날의 기록');
      await page.getByRole('checkbox', { name: '옆머리', exact: true }).check();
      await capture('record-form');
      await page.getByRole('button', { name: '커트 날짜 달력 열기' }).click();
      await capture('calendar');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
      await page.getByRole('heading', { name: '커트 기록을 남겼어요', exact: true }).waitFor();
      await capture('cut-complete');
      await page.getByRole('link', { name: '기록 보기', exact: true }).click();
      await page.getByRole('heading', { name: '커트 기록 · 경과', exact: true }).waitFor();
      await capture('record-detail');
      await page.goto('http://127.0.0.1:5174/records');
      await page.getByRole('heading', { name: '나의 커트 기록', exact: true }).waitFor();
      await capture('record-list');
      await page.goto(`http://127.0.0.1:5174/designers/${designer.id}`);
      await page.locator('.profile-banner').waitFor();
      await capture('profile-fixture');
      await page.goto('http://127.0.0.1:5174/account/designer');
      await page.getByLabel('활동 이름', { exact: true }).waitFor();
      await capture('profile-editor-fixture');
      await page.goto('http://127.0.0.1:5174/examples/records/cut-september');
      await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
      await page.getByRole('heading', { name: '참고 자료 선택', exact: true }).waitFor();
      await capture('materials-example');
      await page.getByRole('button', { name: '원하는 점 적기', exact: true }).click();
      await page
        .getByRole('heading', { name: '이번 커트에서 원하는 점을 적어 주세요', exact: true })
        .waitFor();
      await capture('request-example');

      await context.close();
    }
  const context = await browser.newContext({
    viewport: { width: 720, height: 500 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:5174/records/new');
  await page.getByRole('heading', { name: '커트 기록 남기기', exact: true }).waitFor();
  await page.screenshot({ path: `${output}/zoom200-reflow.png`, fullPage: true });
  results.push({
    name: 'zoom200-reflow',
    theme: 'light',
    width: 720,
    height: 500,
    metrics: await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
    })),
    a11y: await page.evaluate(inspectRender),
    errors: [],
  });
  await context.close();
} finally {
  await browser.close();
  await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2));
}
console.log(
  JSON.stringify(
    {
      captures: results.length,
      overflow: results.filter((r) => r.metrics.overflow).map((r) => [r.name, r.theme, r.width]),
      errors: results.filter((r) => r.errors.length).map((r) => [r.name, r.errors]),
      contrast: results
        .flatMap((r) =>
          r.a11y.contrast.map((c) => ({ screen: r.name, theme: r.theme, width: r.width, ...c })),
        )
        .slice(0, 18),
    },
    null,
    2,
  ),
);
