import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const base = process.env.SALU_CAPTURE_URL ?? 'http://127.0.0.1:5174';
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const state of ['guest', 'unavailable', 'invalid-login', 'provider-failure']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const events = [];
    const pendingCodes = [];
    const expected = (path, status) =>
      (path === '/api/auth/me' && status === (state === 'unavailable' ? 503 : 401)) ||
      (path === '/api/auth/login' && status === 401 && state === 'invalid-login') ||
      (path === '/api/auth/oauth2/providers' &&
        status === 503 &&
        ['unavailable', 'provider-failure'].includes(state));
    page.on('response', (response) => {
      const path = new URL(response.url()).pathname;
      if (path === '/api/auth/oauth2/providers' && response.status() === 200)
        events.push({ type: 'provider-response', path, status: 200, expected: true });
      if (response.status() < 400) return;
      const event = {
        type: 'http-error',
        method: response.request().method(),
        path,
        status: response.status(),
        expected: expected(path, response.status()),
      };
      events.push(event);
      pendingCodes.push(
        response
          .json()
          .then((body) => {
            event.code = [
              'AUTHENTICATION_REQUIRED',
              'AUTHENTICATION_UNAVAILABLE',
              'LOGIN_FAILED',
              'INTERNAL_ERROR',
              'RESOURCE_NOT_FOUND',
            ].includes(body.code)
              ? body.code
              : 'UNKNOWN_CODE';
          })
          .catch(() => {
            event.code = 'INVALID_JSON';
          }),
      );
    });
    page.on('requestfailed', (request) => {
      const path = new URL(request.url()).pathname;
      events.push({
        type: 'request-failed',
        method: request.method(),
        path,
        cancelled: request.failure()?.errorText === 'net::ERR_ABORTED',
        expected: false,
      });
    });
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const url = message.location().url;
      const path = url ? new URL(url).pathname : '';
      events.push({
        type: 'console-error',
        path,
        expected:
          message.text().startsWith('Failed to load resource:') &&
          events.some((e) => e.type === 'http-error' && e.expected && e.path === path),
      });
    });
    page.on('pageerror', () => events.push({ type: 'pageerror', expected: false }));
    await context.route('**/api/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me')
        return route.fulfill({
          status: state === 'unavailable' ? 503 : 401,
          json: {
            code:
              state === 'unavailable' ? 'AUTHENTICATION_UNAVAILABLE' : 'AUTHENTICATION_REQUIRED',
          },
        });
      if (path === '/api/csrf')
        return route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'visual-fixture' } });
      if (path === '/api/auth/oauth2/providers')
        return route.fulfill({
          status: ['unavailable', 'provider-failure'].includes(state) ? 503 : 200,
          json: ['unavailable', 'provider-failure'].includes(state)
            ? { code: 'INTERNAL_ERROR' }
            : [],
        });
      if (path === '/api/auth/login')
        return route.fulfill({ status: 401, json: { code: 'LOGIN_FAILED' } });
      return route.fulfill({ status: 404, json: { code: 'RESOURCE_NOT_FOUND' } });
    });
    const providersReady = page.waitForResponse(
      (r) => new URL(r.url()).pathname === '/api/auth/oauth2/providers',
    );
    await page.goto(`${base}/login`);
    await providersReady;
    await page.getByLabel('이메일').waitFor();
    if (state === 'invalid-login') {
      await page.getByLabel('이메일').fill('visual@example.invalid');
      await page.getByLabel('비밀번호').fill('visual-fixture');
      await page.getByRole('button', { name: '로그인', exact: true }).click();
      await page.getByRole('alert').waitFor();
    }
    if (['unavailable', 'provider-failure'].includes(state))
      await page.getByRole('alert').waitFor();
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await Promise.all(pendingCodes);
    for (const event of events)
      if (
        event.type === 'request-failed' &&
        event.path === '/api/auth/oauth2/providers' &&
        event.cancelled
      )
        event.expected = events.some(
          (other) => other.path === event.path && other.type !== 'request-failed' && other.expected,
        );
    results.push({ state, events });
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile('/tmp/salu-ui-network-audit.json', JSON.stringify(results, null, 2));
const unexpected = results.flatMap((r) => r.events).filter((e) => !e.expected);
console.log(`네트워크 검증: ${results.length}개 상태, 예상 밖 오류 ${unexpected.length}개`);
process.exitCode = unexpected.length ? 1 : 0;
