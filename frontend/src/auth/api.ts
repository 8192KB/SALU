export type SessionMember = {
  id: string;
  email: string | null;
  displayName: string;
  storageContext: string;
};

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
  CSRF_INVALID: '요청 확인 정보가 만료됐어요. 다시 시도해 주세요.',
  ACCESS_DENIED: '이 기능을 사용할 권한이 없어요.',
  AUTHENTICATION_REQUIRED: '로그인이 끝났어요. 다시 로그인해 주세요.',
  AUTHENTICATION_UNAVAILABLE: '로그인 서버를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.',
  DATABASE_UNAVAILABLE: '계정 정보를 확인할 수 없어요. 잠시 후 다시 시도해 주세요.',
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
      '서버에 연결할 수 없어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
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
      ? '계정 요청이 많아요. 1분 뒤 다시 시도해 주세요.'
      : (messages[code] ??
        (response.status >= 500
          ? '서버를 사용할 수 없어요. 잠시 후 다시 시도해 주세요.'
          : '요청을 처리하지 못했어요. 입력과 로그인 상태를 확인해 주세요.'));
  return new ApiFailure(response.status, code, message);
}

async function readMember(response: Response): Promise<SessionMember> {
  if (!response.ok) throw await failure(response);
  const body = await readObject(response);
  if (
    !Number.isSafeInteger(body.id) ||
    Number(body.id) < 1 ||
    (body.email !== null && typeof body.email !== 'string') ||
    typeof body.displayName !== 'string' ||
    typeof body.storageContext !== 'string' ||
    !body.storageContext
  )
    throw new ApiFailure(
      0,
      'INVALID_RESPONSE',
      '로그인 상태를 확인하지 못했어요. 다시 확인해 주세요.',
    );
  return {
    id: String(body.id),
    email: body.email,
    displayName: body.displayName,
    storageContext: body.storageContext,
  };
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
      '요청 확인 정보를 가져올 수 없어요. 다시 시도해 주세요.',
    );
  return { [body.headerName]: body.token };
}

async function post(path: string, body?: URLSearchParams | string): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request(path, {
      method: 'POST',
      headers: {
        ...(await csrfHeaders()),
        ...(body
          ? {
              'Content-Type':
                typeof body === 'string' ? 'application/json' : 'application/x-www-form-urlencoded',
            }
          : {}),
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
  const response = await post('/api/auth/login', new URLSearchParams({ email, password })).catch(
    (error: unknown) => {
      // 서버는 형식이 맞지 않는 이메일·72바이트를 넘는 비밀번호를 400으로 거절함
      if (error instanceof ApiFailure && error.status === 400)
        throw new ApiFailure(400, error.code, '이메일 주소와 비밀번호를 다시 확인해 주세요.');
      throw error;
    },
  );
  const member = await readMember(response);
  // 성공한 인증을 후속 토큰 조회 실패 때문에 실패로 바꾸지 않음
  return member;
}

export async function logout(): Promise<void> {
  await post('/api/auth/logout');
}

export async function signup(email: string, displayName: string, password: string): Promise<void> {
  try {
    await post('/api/auth/signup', JSON.stringify({ email, displayName, password }));
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 409)
      throw new ApiFailure(409, error.code, '이 이메일로 가입한 계정이 있어요. 로그인해 주세요.');
    if (error instanceof ApiFailure && error.status === 400)
      throw new ApiFailure(400, error.code, '이메일·이름과 비밀번호를 다시 확인해 주세요.');
    throw error;
  }
}

export async function backupRequest(
  path: string,
  member: SessionMember,
  options: RequestInit = {},
  signal?: AbortSignal,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new Error('cancelled');
    const csrf = options.method === 'PUT' || options.method === 'POST' ? await csrfHeaders() : {};
    if (signal?.aborted) throw new Error('cancelled');
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000),
      headers: { ...csrf, ...options.headers, 'X-SALU-Storage-Context': member.storageContext },
    });
    if (response.ok) return response;
    const error = await failure(response);
    if (attempt === 0 && error.code === 'CSRF_INVALID') continue;
    throw error;
  }
  throw new Error('csrf');
}

export async function directoryRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T | null> {
  const response = await request(path, {
    method,
    headers:
      method === 'GET' ? {} : { ...(await csrfHeaders()), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw await failure(response);
  if (response.status === 204) return null;
  return response.json() as Promise<T>;
}

// 로그인한 회원의 계정 공간(storageContext)을 함께 보내는 요청. 사진을 올리는 요청은 시간 제한을 길게 줌
export async function memberRequest(
  path: string,
  member: SessionMember,
  options: RequestInit = {},
  timeout = 8000,
): Promise<Response> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const csrf = options.method === 'POST' ? await csrfHeaders() : {};
    let response: Response;
    try {
      response = await fetch(path, {
        ...options,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeout),
        headers: { ...csrf, ...options.headers, 'X-SALU-Storage-Context': member.storageContext },
      });
    } catch {
      throw new ApiFailure(
        0,
        'CONNECTION_UNAVAILABLE',
        '서버에 연결할 수 없어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
      );
    }
    if (response.ok) return response;
    const error = await failure(response);
    if (attempt === 0 && error.status === 403 && error.code === 'CSRF_INVALID') continue;
    throw error;
  }
  throw new ApiFailure(403, 'CSRF_INVALID', messages.CSRF_INVALID);
}
