export type SessionMember = { id: string; email: string; displayName: string };

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const messages: Record<string, string> = {
  LOGIN_FAILED: '이메일 또는 비밀번호를 확인해 주세요.',
  CSRF_INVALID: '요청 확인 정보가 만료되었습니다. 다시 시도해 주세요.',
  ACCESS_DENIED: '이 요청에 대한 권한이 없습니다.',
  AUTHENTICATION_UNAVAILABLE: '로그인 서버를 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.',
  DATABASE_UNAVAILABLE: '계정 정보를 확인할 수 없습니다. 잠시 후 다시 확인해 주세요.',
};

async function request(path: string, options: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ApiFailure(
      0,
      'CONNECTION_UNAVAILABLE',
      '서버에 연결할 수 없습니다. 연결을 확인한 뒤 로그인 상태를 다시 확인해 주세요.',
    );
  }
}

async function readObject(response: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && !Array.isArray(body))
      return body as Record<string, unknown>;
  } catch {
    /* 프록시 오류 등 JSON이 아닌 응답도 고정 문구로 처리함 */
  }
  return {};
}

async function failure(response: Response): Promise<ApiFailure> {
  const body = await readObject(response);
  const code = typeof body.code === 'string' ? body.code : 'REQUEST_FAILED';
  const message =
    response.status === 429
      ? '로그인 시도가 많습니다. 1분 뒤 다시 시도해 주세요.'
      : (messages[code] ??
        (response.status >= 500
          ? '서버를 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.'
          : '요청을 처리하지 못했습니다. 입력과 로그인 상태를 확인해 주세요.'));
  return new ApiFailure(response.status, code, message);
}

async function readMember(response: Response): Promise<SessionMember> {
  if (!response.ok) throw await failure(response);
  const body = await readObject(response);
  if (
    !Number.isSafeInteger(body.id) ||
    Number(body.id) < 1 ||
    typeof body.email !== 'string' ||
    typeof body.displayName !== 'string'
  )
    throw new ApiFailure(
      0,
      'INVALID_RESPONSE',
      '계정 응답을 확인할 수 없습니다. 로그인 상태를 다시 확인해 주세요.',
    );
  return { id: String(body.id), email: body.email, displayName: body.displayName };
}

export async function fetchMember(): Promise<SessionMember | null> {
  const response = await request('/api/auth/me');
  if (response.status === 401) return null;
  return readMember(response);
}

async function csrfHeaders(): Promise<Record<string, string>> {
  const response = await request('/api/csrf');
  if (!response.ok) throw await failure(response);
  const body = await readObject(response);
  if (
    typeof body.headerName !== 'string' ||
    !/^X-[A-Za-z0-9-]+$/i.test(body.headerName) ||
    typeof body.token !== 'string' ||
    !body.token
  )
    throw new ApiFailure(
      0,
      'INVALID_CSRF_RESPONSE',
      '요청 확인 정보를 가져올 수 없습니다. 다시 시도해 주세요.',
    );
  return { [body.headerName]: body.token };
}

async function post(path: string, body?: URLSearchParams): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request(path, {
      method: 'POST',
      headers: {
        ...(await csrfHeaders()),
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body,
    });
    if (response.ok) return response;
    const error = await failure(response);
    // 서버가 처리를 거부한 CSRF 오류만 한 번 재시도함. 네트워크 오류·권한 거부는 재전송하지 않음
    if (attempt === 0 && error.status === 403 && error.code === 'CSRF_INVALID') continue;
    throw error;
  }
  throw new ApiFailure(403, 'CSRF_INVALID', messages.CSRF_INVALID);
}

export async function login(email: string, password: string): Promise<SessionMember> {
  const member = await readMember(
    await post('/api/auth/login', new URLSearchParams({ email, password })),
  );
  // 성공한 인증을 후속 토큰 조회 실패 때문에 실패로 바꾸지 않음
  await csrfHeaders().catch(() => {});
  return member;
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout');
  await csrfHeaders().catch(() => {});
}
