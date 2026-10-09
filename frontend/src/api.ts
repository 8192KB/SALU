export type HealthResponse = {
  status: 'UP' | 'DEGRADED';
  server: 'UP';
  database: 'UP' | 'DOWN';
  checkedAt: string;
  code: string | null;
  message: string;
};

export async function fetchHealth(signal: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', {
    credentials: 'same-origin', cache: 'no-store', signal,
  });
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('server' in body) || !('database' in body)
      || !('status' in body) || !('checkedAt' in body) || !('message' in body)
      || body.server !== 'UP' || !['UP', 'DOWN'].includes(String(body.database))
      || !['UP', 'DEGRADED'].includes(String(body.status))
      || typeof body.checkedAt !== 'string' || !Number.isFinite(Date.parse(body.checkedAt))
      || typeof body.message !== 'string'
      || (response.status !== 200 && response.status !== 503)) {
    throw new Error('서버 상태 응답을 확인할 수 없습니다.');
  }
  return body as HealthResponse;
}

export type SessionMember = { id: number; email: string; displayName: string };
export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
async function readResponse(response: Response): Promise<SessionMember> {
  const body = await response.json();
  if (!response.ok) throw new ApiFailure(response.status, body.code ?? 'REQUEST_FAILED', body.message ?? '요청을 처리할 수 없습니다.');
  if (!Number.isSafeInteger(body.id) || typeof body.email !== 'string' || typeof body.displayName !== 'string')
    throw new Error('회원 응답을 확인할 수 없습니다.');
  return body;
}
export async function fetchMember(): Promise<SessionMember | null> {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (response.status === 401) return null;
  return readResponse(response);
}
async function csrfHeaders(): Promise<Record<string, string>> {
  const response = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error('요청을 준비할 수 없습니다.');
  const body = await response.json();
  if (typeof body.headerName !== 'string' || typeof body.token !== 'string') throw new Error('요청을 준비할 수 없습니다.');
  return { [body.headerName]: body.token };
}
export async function login(email: string, password: string): Promise<SessionMember> {
  const response = await fetch('/api/auth/login', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(8000),
    headers: { ...await csrfHeaders(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password }),
  });
  const member = await readResponse(response);
  await csrfHeaders().catch(() => { /* 다음 변경 요청에서 새 토큰을 다시 조회함 */ });
  return member;
}
export async function logout(): Promise<void> {
  const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(8000), headers: await csrfHeaders() });
  if (!response.ok) await readResponse(response);
  await csrfHeaders().catch(() => { /* 다음 변경 요청에서 새 토큰을 다시 조회함 */ });
}
