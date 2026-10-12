import { inspectRender } from './audit-metrics.mjs';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.SALU_CAPTURE_URL ?? 'http://127.0.0.1:5174';
const output = resolve(process.env.SALU_CAPTURE_OUTPUT ?? '/tmp/salu-ui-audit-20261012');
const edge = process.env.SALU_AUDIT_SET === 'edge';
const dimensions = edge
  ? [
      [320, 740],
      [390, 500],
      [701, 900],
      [1440, 1000],
    ]
  : [
      [390, 844],
      [820, 1180],
      [1180, 820],
      [1440, 1000],
    ];
const results = [];
const requestedNames = new Set((process.env.SALU_CAPTURE_NAMES ?? '').split(',').filter(Boolean));
const extras = process.env.SALU_AUDIT_SET === 'extras';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const theme of ['light', 'dark'])
    for (const [width, height] of dimensions) {
      const context = await browser.newContext({
        viewport: edge && width === 1440 ? { width: 720, height: 500 } : { width, height },
        deviceScaleFactor: edge && width === 1440 ? 2 : 1,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      let unavailable = false;
      let social = false;
      let authenticated = false;
      let cloudUnavailable = false;
      let linkedUnavailable = false;
      const problems = [];
      page.on('pageerror', (error) => problems.push({ type: 'pageerror', message: error.message }));
      // 캡처에는 공개 예시와 합성 인증 응답만 사용. 실제 계정·요청 본문 수집 금지
      await context.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === '/api/auth/me' && authenticated && !unavailable)
          return route.fulfill({
            json: {
              id: 99001,
              displayName: '화면 확인 계정',
              email: 'visual@example.invalid',
              storageContext: 'visual-fixture',
            },
          });
        if (path === '/api/auth/oauth2/linked')
          return route.fulfill({
            status: linkedUnavailable ? 503 : 200,
            json: linkedUnavailable ? { code: 'INTERNAL_ERROR' } : ['google'],
          });
        if (path === '/api/personal-backups')
          return route.fulfill({
            status: cloudUnavailable ? 503 : 200,
            json: cloudUnavailable ? { code: 'INTERNAL_ERROR' } : [],
          });
        if (path.startsWith('/api/personal-backups/')) {
          const payload = route.request().postDataJSON();
          return route.fulfill({ json: { revision: 1, mutationId: payload.mutationId } });
        }
        if (path === '/api/auth/me')
          return route.fulfill({
            status: unavailable ? 503 : 401,
            json: { code: unavailable ? 'AUTHENTICATION_UNAVAILABLE' : 'AUTHENTICATION_REQUIRED' },
          });
        if (path === '/api/csrf')
          return route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'visual-fixture' } });
        if (path === '/api/auth/oauth2/providers')
          return route.fulfill({
            status: unavailable ? 503 : 200,
            json: social ? ['google', 'naver'] : [],
          });
        if (path === '/api/auth/login')
          return route.fulfill({
            status: unavailable ? 503 : 401,
            json: { code: unavailable ? 'AUTHENTICATION_UNAVAILABLE' : 'LOGIN_FAILED' },
          });
        problems.push({ type: 'unexpected-api', method: route.request().method(), path });
        return route.fulfill({ status: 404, json: { code: 'RESOURCE_NOT_FOUND' } });
      });
      const expectedHeadings = {
        materials: '참고 자료 선택',
        'materials-selected': '참고 자료 선택',
        'request-write': '이번 커트에서 원하는 점을 적어 주세요',
        'request-reference-open': '이번 커트에서 원하는 점을 적어 주세요',
        'request-review': '저장할 내용을 확인해 주세요',
        'request-complete': '커트 준비를 마쳤어요',
        'request-stored': '다음 커트 준비 내용',
      };
      const capture = async (name) => {
        if (requestedNames.size && !requestedNames.has(name)) return;
        if (expectedHeadings[name])
          await page.getByRole('heading', { name: expectedHeadings[name], exact: true }).waitFor();
        await page.locator('main h1').first().waitFor();
        await page.evaluate(async () => {
          await Promise.all(Array.from(document.images, (image) => image.decode().catch(() => {})));
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        const stem = `${name}-${theme}-${width}x${height}`;
        await page.screenshot({
          path: resolve(output, `${stem}-first.png`),
          animations: 'disabled',
        });
        await page.screenshot({
          path: resolve(output, `${stem}-full.png`),
          fullPage: true,
          animations: 'disabled',
        });
        const metrics = await page.evaluate(() => {
          const rect = (element) => {
            const r = element.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          };
          return {
            overflow: document.documentElement.scrollWidth > window.innerWidth,
            heading: document.querySelector('main h1')?.textContent,
            alerts: Array.from(document.querySelectorAll('[role=alert]')).filter(
              (e) => e.getClientRects().length,
            ).length,
            groups: Array.from(document.querySelectorAll('main h2'))
              .filter((e) => e.getClientRects().length)
              .map((e) => e.textContent),
            back: document.querySelector('.heading-back')
              ? rect(document.querySelector('.heading-back'))
              : null,
          };
        });
        const accessibility = await page.evaluate(inspectRender);
        results.push({
          name,
          theme,
          width,
          height,
          stem,
          metrics,
          accessibility,
          problems: problems.splice(0),
        });
        console.log(`캡처: ${stem}`);
      };
      const go = async (path, name) => {
        await page.goto(`${base}${path}`);
        await capture(name);
      };
      if (!extras && !edge) {
        await go('/', 'home');
        await go('/records', 'records-empty');
        await go('/records/new', 'cut-new');
        await page.getByRole('button', { name: '커트 기록 저장', exact: true }).click();
        await capture('cut-error');
        await page.getByRole('button', { name: '화면 설정', exact: true }).click();
        await capture('theme-dialog');
        await page.keyboard.press('Escape');
        await go('/requests', 'requests-empty');
        await go('/requests/materials', 'materials-empty');
        await go('/designers', 'designers-empty');
        await go('/account', 'account-guest');
        await go('/backup', 'backup');
        await page.getByLabel('SALU 백업 파일').setInputFiles({
          name: 'broken.zip',
          mimeType: 'application/zip',
          buffer: Buffer.from('broken'),
        });
        await page.getByRole('alert').waitFor();
        await capture('backup-invalid');
        await go('/login', 'login');
        social = true;
        await go('/login', 'login-social-fixture');
        await page.getByLabel('이메일').fill('visual@example.invalid');
        await page.getByLabel('비밀번호').fill('visual-fixture');
        await page.getByRole('button', { name: '로그인', exact: true }).click();
        await page.getByRole('alert').waitFor();
        await capture('login-invalid');
        unavailable = true;
        await go('/login', 'login-unavailable');
        await page.getByLabel('이메일').fill('visual@example.invalid');
        await page.getByLabel('비밀번호').fill('visual-fixture');
        await page.getByRole('button', { name: '로그인', exact: true }).click();
        await page.locator('.login-form > [role="alert"]').waitFor();
        await capture('login-unavailable-submit');
        unavailable = false;
        await page.getByRole('button', { name: '로그인 상태 다시 확인', exact: true }).click();
        await page.getByRole('alert').waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Google로 계속하기', exact: true }).waitFor();
        await capture('login-recovered');
        unavailable = true;

        await go('/records/new', 'cut-unavailable');
        unavailable = false;
        await go('/missing-route', 'missing-route');
        await go('/records/missing', 'missing-record');
        await go('/examples/records', 'records-populated');
        await go('/examples/records/cut-august', 'record-no-photo');
        await go(
          '/examples/records/cut-september/progress/progress-september/edit',
          'progress-edit',
        );
        await go('/examples/records/cut-september', 'record-detail');
        await page.getByRole('button', { name: '커트 당일 · 예시 사진 확대', exact: true }).click();
        await capture('photo-dialog');
        await page.keyboard.press('Escape');
        await go('/examples/records/cut-september/edit', 'cut-edit');
        await go('/examples/records/cut-september/progress/new', 'progress-new');
        await page.getByRole('button', { name: '경과 저장', exact: true }).click();
        await capture('progress-error');
        await go('/examples/designers', 'designers-populated');
        await go('/examples/designers/designer-jiu', 'designer-profile');
        await go('/examples/records/cut-september', 'preparation-start');
        await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
        await capture('materials');
        await page.getByRole('button', { name: '자료 전체 선택', exact: true }).click();
        await capture('materials-selected');
        await page.getByRole('button', { name: '원하는 점 적기', exact: true }).click();
        await capture('request-write');
        const summary = page.locator('.reference-details > summary');
        if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click();
        await capture('request-reference-open');
        await page
          .getByLabel('원하는 내용 1', { exact: true })
          .fill('앞머리는 그대로 두고 옆머리를 정리해 주세요.');
        await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
        await capture('request-review');
        await page.getByRole('button', { name: '준비 저장하기', exact: true }).click();
        await capture('request-complete');
        await page.getByRole('link', { name: '준비한 내용 보기', exact: true }).click();
        await capture('request-stored');
        await go('/examples/requests', 'requests-populated');
      } else if (edge) {
        await go('/', 'home');
        await go('/records/new', 'cut-new');
        await go('/login', 'login');
        await go('/examples/designers/designer-jiu', 'designer-profile');
        await go('/examples/records/cut-september', 'record-detail');
        await page.getByRole('button', { name: '이 기록으로 다음 커트 준비', exact: true }).click();
        await capture('materials');
        await page.getByRole('button', { name: '원하는 점 적기', exact: true }).click();
        await page
          .getByRole('heading', { name: '이번 커트에서 원하는 점을 적어 주세요', exact: true })
          .waitFor();
        await capture('request-write');
        await page.getByLabel('원하는 내용 1', { exact: true }).fill('옆머리는 정리해 주세요.');
        await page.locator('.request-options > summary').click();
        await page.getByLabel('추가 질문', { exact: true }).fill('어느 방향으로 말리면 좋을까요?');
        await page.getByLabel('추가 질문', { exact: true }).press('Tab');
        await capture('request-options');
        await page.getByRole('button', { name: '내용 확인하기', exact: true }).click();
        await capture('request-review');
      } else {
        await page.goto(`${base}/examples/records/cut-september`);
        const blockImages = (route) => route.abort('failed');
        await context.route('**/images/**', blockImages);
        await page.reload();
        await page.getByText('사진을 불러오지 못했어요', { exact: true }).first().waitFor();
        await capture('record-photo-failure');
        await context.unroute('**/images/**', blockImages);
        await page.goto(`${base}/examples/records/new`);
        await page.getByLabel('좋았던 점').fill('사진 확인용 작성 초안');
        await page.getByRole('button', { name: '작성 내용 지우기', exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await capture('cut-discard-dialog');
        await page.keyboard.press('Escape');
        await page.locator('.task-exit').click();
        await page.locator('.example-help > summary').click();
        await page.getByRole('button', { name: '초기화', exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await capture('example-reset-dialog');
        await page.keyboard.press('Escape');
        authenticated = true;
        social = true;
        await go('/account', 'account-authenticated-fixture');
        await page.getByRole('button', { name: 'Google 연결됨', exact: true }).waitFor();
        await capture('account-linked-fixture');
        linkedUnavailable = true;
        await page.reload();
        await page
          .getByRole('alert')
          .filter({ hasText: '연결한 계정을 확인하지 못했어요.' })
          .waitFor();
        await capture('account-link-error-fixture');
        linkedUnavailable = false;
        await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
        await page.getByRole('button', { name: 'Google 연결됨', exact: true }).waitFor();
        await capture('account-link-recovered-fixture');

        await page.getByRole('button', { name: '로그아웃', exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await capture('logout-dialog-fixture');
        await page.keyboard.press('Escape');
        await go('/backup', 'backup-account-fixture');
        cloudUnavailable = true;
        await go('/backup', 'backup-cloud-unavailable-fixture');
        await page
          .getByText(/저장 대기|계정 저장 대기/)
          .first()
          .waitFor();
        await capture('backup-cloud-unavailable-fixture');
        cloudUnavailable = false;
        await page.evaluate(async () => {
          // 새 브라우저의 합성 계정만 사용. 실제 자료·업무 DB 변경 없음
          const { emptyBundle } = await import('/src/prototype/storage-model.ts');
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('salu-personal-v1', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          await new Promise((resolve, reject) => {
            const tx = db.transaction('workspaces', 'readwrite');
            const store = tx.objectStore('workspaces');
            const request = store.get('member-99001');
            request.onsuccess = () => {
              const document = request.result ?? {
                scope: 'member-99001',
                generation: 0,
                bundle: emptyBundle(),
                items: {},
              };
              document.bundle.drafts.recoveredCuts = [
                {
                  ...document.bundle.drafts.cutDraft,
                  cutDate: '2026-10-10',
                  service: '커트',
                  goodNote: '복원한 작성 초안',
                  photos: [],
                },
              ];
              document.items = {
                drafts: {
                  revision: 2,
                  mutationId: 'visual-fixture-conflict',
                  dirty: true,
                  payload: structuredClone(document.bundle),
                  conflict: structuredClone(document.bundle),
                },
              };
              document.generation += 1;
              store.put(document);
            };
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
          });
          db.close();
        });
        await page.goto(`${base}/backup`);
        await page
          .getByRole('heading', { name: '다른 기기의 변경과 충돌했어요', exact: true })
          .waitFor();
        await page.locator('.storage-state').filter({ hasText: '변경 확인 필요' }).waitFor();
        await capture('backup-conflict-fixture');
        await page.getByRole('heading', { name: '복원한 작성 초안', exact: true }).waitFor();
        await capture('backup-recovered-draft-fixture');
        authenticated = false;
        await go('/auth/complete', 'auth-callback-fixture');
      }
      await context.close();
    }
} finally {
  await browser.close();
  await writeFile(resolve(output, 'matrix.json'), JSON.stringify(results, null, 2));
  await writeFile(
    resolve(output, 'index.html'),
    `<!doctype html><html lang="ko"><meta charset="utf-8"><title>SALU 화면 검증</title><style>body{font:16px sans-serif;background:#edf1ef;margin:24px}section{margin-bottom:40px}img{max-width:100%;width:360px;vertical-align:top}a{display:inline-block;margin:8px}h2{font-size:20px}</style><h1>SALU 화면 검증</h1><p>공개 예시·합성 로그인 상태. 실제 인증·DB 검증은 별도 테스트.</p>${results.map((r) => `<section><h2>${r.stem}</h2><a href="${r.stem}-first.png"><img src="${r.stem}-first.png" loading="lazy" alt="첫 화면"></a><a href="${r.stem}-full.png"><img src="${r.stem}-full.png" loading="lazy" alt="전체 화면"></a></section>`).join('')}`,
  );
}
