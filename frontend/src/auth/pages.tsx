import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Alert, BackLink, Icon, PageHeading } from '../components';
import { Field } from '../fields';
import { Dialog } from '../dialog';
import { useAuth } from './context';
import { usePrototype } from '../prototype/context';
import { ApiFailure, backupRequest, directoryRequest, signup } from './api';
import type { SessionMember } from './api';
import { listReceivedConsultations } from '../consultation-api';
import { flushPersonalStores } from '../prototype/personal-store';

// 로그인 뒤 돌아갈 앱 안 주소. 외부 주소와 계정 화면은 받지 않음
export function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return null;
  return /^\/(login|signup|auth)(\/|\?|$)/.test(value) ? null : value;
}
export function useLoginPath() {
  const location = useLocation();
  const next = safeReturnPath(`${location.pathname}${location.search}`);
  return next && next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login';
}

export function AccountControls() {
  const { state, activeMember, pending, logout } = useAuth();
  const navigate = useNavigate();
  const loginPath = useLoginPath();
  const [open, setOpen] = useState(false);
  const [storageError, setStorageError] = useState('');
  const { storage } = usePrototype();
  const unsent =
    open && storage
      ? Object.entries(storage.getItems()).filter(
          ([id, item]) => id !== 'new-cut-draft' && (item.dirty || item.conflict),
        ).length
      : 0;
  if (state.status === 'prototype') return <span className="member-label">나의 헤어 기록</span>;
  return (
    <div className="account-controls" role="group" aria-label="계정">
      {state.status === 'authenticated' ? (
        <>
          <Link className="account-name" to="/account" title={state.member.displayName}>
            {state.member.displayName}님
          </Link>
          <button
            type="button"
            className="button account-button"
            disabled={pending}
            onClick={() => {
              setStorageError('');
              setOpen(true);
            }}
          >
            로그아웃
          </button>
        </>
      ) : state.status === 'checking' ? (
        <span className="muted">계정 확인 중</span>
      ) : state.status === 'unavailable' && activeMember ? (
        <span className="muted">{activeMember.displayName}님 · 연결 확인 중</span>
      ) : (
        <Link className="button account-button" to={loginPath}>
          <Icon name="user" size={16} />
          {state.status === 'unavailable' ? '계정 확인' : '로그인'}
        </Link>
      )}
      <Dialog
        open={open}
        title="로그아웃할까요?"
        onClose={() => {
          if (!pending) setOpen(false);
        }}
      >
        <Alert message={storageError} />
        <p>계정 기록은 이 화면에서 숨겨집니다. 다시 로그인하면 이어서 사용할 수 있어요.</p>
        {unsent > 0 && (
          <p>
            서버에 아직 올리지 못한 기록 {unsent}건이 있어요. 이 기기에서 다시 로그인해야 서버에
            올라가고 다른 기기에서도 보여요.
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            계속 사용
          </button>
          <button
            type="button"
            className="button primary"
            disabled={pending}
            onClick={async () => {
              try {
                await flushPersonalStores();
              } catch {
                setStorageError('기기에 저장하지 못했어요. 입력을 보관한 뒤 다시 시도해 주세요.');
                return;
              }
              const success = await logout();
              if (success) navigate('/');
              setOpen(false);
            }}
          >
            {pending ? '로그아웃 중' : '로그아웃 확인'}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

export function SessionNotice({ compact = false }: { compact?: boolean }) {
  const { state, actionError, sessionChange, clearSessionChange, refresh, pending, checking } =
    useAuth();
  const loginPath = useLoginPath();
  const message = state.status === 'unavailable' ? state.message : actionError;
  if (!message && sessionChange)
    return (
      <div className={`session-notice${compact ? ' compact-session' : ''}`} role="alert">
        <div className="session-error-content">
          <Icon name="warning" />
          <span>{sessionChange}</span>
        </div>
        {state.status !== 'authenticated' && (
          <Link className="button account-button" to={loginPath} onClick={clearSessionChange}>
            다시 로그인
          </Link>
        )}
        <button type="button" className="button account-button" onClick={clearSessionChange}>
          닫기
        </button>
      </div>
    );
  if (!message) return null;
  return (
    <div className={`session-notice${compact ? ' compact-session' : ''}`} role="alert">
      <div className="session-error-content">
        <Icon name="warning" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        className="button account-button"
        disabled={pending || checking}
        onClick={() => void refresh()}
      >
        {checking ? '확인 중' : '로그인 상태 다시 확인'}
      </button>
      {!compact && (
        <p>
          기기에 저장한 기록은 그대로 있어요. 로그인 상태를 확인하면 계정 저장도 이어서 진행해요.
        </p>
      )}
    </div>
  );
}

const RETURN_KEY = 'salu-return';
// 소셜 로그인은 서버의 고정 주소로 돌아오므로 출발 전 돌아갈 화면을 탭에 남김
function keepReturnPath(path: string | null) {
  try {
    if (path) sessionStorage.setItem(RETURN_KEY, path);
    else sessionStorage.removeItem(RETURN_KEY);
  } catch {
    /* 돌아갈 화면을 남기지 못하면 홈으로 감 */
  }
}
function takeReturnPath() {
  try {
    const value = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return safeReturnPath(value);
  } catch {
    return null;
  }
}
function completePath(next: string | null) {
  return next ? `/auth/complete?next=${encodeURIComponent(next)}` : '/auth/complete';
}

export function LoginPage() {
  const { state, pending, checking, login, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeReturnPath(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    params.has('socialError') ? '소셜 로그인을 완료하지 못했어요. 다시 시도해 주세요.' : '',
  );
  const [credentialError, setCredentialError] = useState(false);
  const { storage, state: records } = usePrototype();
  const guestRecords = storage?.scope === 'guest' ? records.cuts.length : 0;
  const passwordInput = useRef<HTMLInputElement>(null);
  const performLogin = async () => {
    if (pending || checking) return;
    setError('');
    try {
      await flushPersonalStores();
      await login(email.trim(), password);
      navigate(completePath(next), { replace: true });
    } catch (failure) {
      setCredentialError(
        failure instanceof ApiFailure &&
          failure.status < 500 &&
          failure.status !== 0 &&
          failure.code !== 'CSRF_INVALID',
      );
      setError(
        failure instanceof Error ? failure.message : '로그인하지 못했어요. 다시 시도해 주세요.',
      );
      requestAnimationFrame(() => passwordInput.current?.focus());
    } finally {
      setPassword('');
    }
  };
  return (
    <div className="login-page">
      <PageHeading
        back={<BackLink to={next ?? '/records'}>{next ? '이전 화면으로' : '내 기록으로'}</BackLink>}
        title="로그인"
        description="로그인하면 기록이 계정에도 자동으로 저장돼요."
      />
      {state.status === 'prototype' ? (
        <section className="panel">
          <h2>화면만 확인하는 모드</h2>
          <p>화면 체험에서는 로그인 없이 기록을 작성해 볼 수 있어요.</p>
          <Link className="button primary" to="/">
            홈으로
          </Link>
        </section>
      ) : state.status === 'authenticated' && params.has('socialError') ? (
        // 로그인한 사람의 소셜 계정 연결 실패도 서버가 이 주소로 보냄
        <section className="panel">
          <h2>계정을 연결하지 못했어요</h2>
          <p>이미 다른 SALU 계정에 연결된 소셜 계정이거나 연결 시간이 지났을 수 있어요.</p>
          <Link className="button primary" to="/account" replace>
            내 계정에서 다시 연결
          </Link>
        </section>
      ) : state.status === 'authenticated' ? (
        <section className="panel">
          <h2>이미 로그인했어요</h2>
          <p>
            {state.member.displayName}님 · {state.member.email}
          </p>
          <Link className="button primary" to={next ?? '/'} replace>
            {next ? '이전 화면으로' : '홈으로'}
          </Link>
        </section>
      ) : (
        <form
          className="panel login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || checking) return;
            await performLogin();
          }}
        >
          {!error && <SessionNotice />}
          <Alert message={error} />
          {guestRecords > 0 && (
            <p>
              이 기기에 로그인 전에 남긴 기록 {guestRecords}건이 있어요. 로그인하면 이 기록을
              계정으로 옮겨요.
            </p>
          )}
          <Field label="이메일">
            <input
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              required
              value={email}
              disabled={pending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="비밀번호">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              ref={passwordInput}
              value={password}
              disabled={pending}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <button type="submit" className="button primary full" disabled={pending || checking}>
            {pending ? '로그인 중' : '로그인'}
          </button>
          {error && !credentialError && (
            <button
              type="button"
              className="text-link"
              disabled={pending || checking}
              onClick={async () => {
                await refresh();
                setError('');
              }}
            >
              로그인 상태 다시 확인
            </button>
          )}
        </form>
      )}
      {state.status !== 'prototype' && state.status !== 'authenticated' && (
        <SocialButtons returnTo={next} />
      )}
      {state.status !== 'prototype' && state.status !== 'authenticated' && (
        <p className="auth-switch">
          아직 계정이 없나요? <Link to="/signup">회원가입</Link>
        </p>
      )}
    </div>
  );
}

export function SignupPage() {
  const { state, pending, checking, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // 제출한 뒤부터 불일치를 알림. 칸을 떠날 때 알리면 문구가 버튼을 밀어 첫 클릭이 빗나감
  const [confirmChecked, setConfirmChecked] = useState(false);
  const confirmInput = useRef<HTMLInputElement>(null);
  const mismatch = confirmChecked && confirm !== password ? '비밀번호가 서로 달라요.' : '';
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="login-page">
      <PageHeading
        back={<BackLink to="/login">로그인으로</BackLink>}
        title="회원가입"
        description="SALU에서 사용할 계정을 만들어요."
      />
      {state.status === 'prototype' || state.status === 'authenticated' ? (
        <section className="panel">
          <p>
            {state.status === 'authenticated'
              ? '이미 로그인했어요.'
              : '화면 체험에서는 회원가입을 진행하지 않아요.'}
          </p>
          <Link className="button primary" to="/">
            홈으로
          </Link>
        </section>
      ) : created ? (
        <section className="panel">
          <h2>회원가입을 마쳤어요</h2>
          <p>로그인해서 기록을 이어서 남겨보세요.</p>
          <Alert message={error} />
          <Link className="button primary full" to="/login">
            로그인
          </Link>
        </section>
      ) : (
        <form
          className="panel login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || pending || checking) return;
            setError('');
            if (password.length < 12) {
              setError('비밀번호를 12자 이상 입력해 주세요.');
              return;
            }
            if (new TextEncoder().encode(password).length > 72) {
              setError('비밀번호가 너무 길어요. 글자 수를 줄여 주세요.');
              return;
            }
            if (confirm !== password) {
              setConfirmChecked(true);
              requestAnimationFrame(() => confirmInput.current?.focus());
              return;
            }
            setBusy(true);
            try {
              await flushPersonalStores();
              await signup(email.trim(), displayName.trim(), password);
              setCreated(true);
              await login(email.trim(), password);
              navigate(completePath(null), { replace: true });
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : '회원가입을 완료하지 못했어요. 다시 시도해 주세요.',
              );
            } finally {
              setPassword('');
              setConfirm('');
              setConfirmChecked(false);
              setBusy(false);
            }
          }}
        >
          {!error && <SessionNotice />}
          <Alert message={error} />
          <Field label="이름">
            <input
              name="displayName"
              autoComplete="nickname"
              maxLength={50}
              required
              value={displayName}
              disabled={busy || pending}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <Field label="이메일">
            <input
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              required
              value={email}
              disabled={busy || pending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="비밀번호" hint="12자 이상">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              required
              value={password}
              disabled={busy || pending}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Field label="비밀번호 확인" error={mismatch}>
            <input
              name="passwordConfirm"
              type="password"
              autoComplete="new-password"
              maxLength={72}
              required
              ref={confirmInput}
              value={confirm}
              disabled={busy || pending}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>
          <button
            type="submit"
            className="button primary full"
            disabled={busy || pending || checking}
          >
            {busy || pending ? '계정 만드는 중' : '회원가입'}
          </button>
        </form>
      )}
      {!created && state.status !== 'prototype' && state.status !== 'authenticated' && (
        <>
          <SocialButtons />
          <p className="auth-switch">
            이미 계정이 있나요? <Link to="/login">로그인</Link>
          </p>
        </>
      )}
    </div>
  );
}

function SocialButtons({
  link = false,
  returnTo = null,
}: {
  link?: boolean;
  returnTo?: string | null;
}) {
  const { state } = useAuth();
  const current = link && state.status === 'authenticated' ? state.member : null;
  // 창으로 돌아올 때마다 로그인 상태 객체가 새로 만들어져도 같은 계정이면 다시 불러오지 않음
  const linkMember = useMemo(() => current, [current?.storageContext]);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [linked, setLinked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const readProviders = fetch('/api/auth/oauth2/providers', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('providers');
        const values: unknown = await response.json();
        if (!Array.isArray(values)) throw new Error('providers');
        return [
          ...new Set(
            values.filter(
              (value): value is string =>
                typeof value === 'string' && ['google', 'naver'].includes(value),
            ),
          ),
        ];
      })
      .catch(() => {
        throw new Error('간편 로그인을 불러오지 못했어요. 다시 시도해 주세요.');
      });
    const readLinked = linkMember
      ? backupRequest('/api/auth/oauth2/linked', linkMember, {}, controller.signal)
          .then(async (response) => {
            const values: unknown = await response.json();
            if (!Array.isArray(values)) throw new Error('linked');
            return values.filter(
              (value): value is string =>
                typeof value === 'string' && ['google', 'naver'].includes(value),
            );
          })
          .catch(() => {
            throw new Error('연결한 계정을 확인하지 못했어요. 다시 불러와 주세요.');
          })
      : Promise.resolve<string[]>([]);
    void Promise.all([readProviders, readLinked])
      .then(([configured, identities]) => {
        if (controller.signal.aborted) return;
        setProviders(configured);
        setLinked(identities);
      })
      .catch((failure: Error) => {
        if (!controller.signal.aborted) {
          setProviders([]);
          setLinked([]);
          setError(failure.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [linkMember, retry]);
  if (loading)
    return (
      <p className="working-notice" role="status">
        <span className="button-spinner" aria-hidden="true" />
        간편 로그인 확인 중
      </p>
    );
  if (state.status === 'unavailable') return null;
  if (!providers.length)
    return error ? (
      <section>
        <Alert message={error} />
        <button type="button" className="button" onClick={() => setRetry((value) => value + 1)}>
          다시 불러오기
        </button>
      </section>
    ) : null;
  return (
    <section className="panel social-buttons" aria-label={link ? '소셜 계정 연결' : '간편 로그인'}>
      {providers.map((provider) => (
        <button
          className="button full"
          key={provider}
          disabled={busy || linked.includes(provider)}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await flushPersonalStores();
              let url = `/api/auth/oauth2/authorize/${provider}`;
              if (link && state.status === 'authenticated')
                url = (
                  await (
                    await backupRequest(`/api/auth/oauth2/link/${provider}`, state.member, {
                      method: 'POST',
                    })
                  ).json()
                ).url;
              keepReturnPath(link ? '/account?linked=1' : returnTo);
              window.location.assign(url);
            } catch {
              setBusy(false);
              setError('연결을 시작하지 못했어요. 다시 시도해 주세요.');
            }
          }}
        >
          <span className={`social-brand ${provider}`} aria-hidden="true">
            {provider === 'google' ? 'G' : 'N'}
          </span>
          {provider === 'google' ? 'Google' : '네이버'}
          {linked.includes(provider) ? ' 연결됨' : link ? ' 계정 연결' : '로 계속하기'}
        </button>
      ))}
      <Alert message={error} />
    </section>
  );
}
// 디자이너 프로필이 있는 회원에게만 받은 상담을 버튼으로 보여 주고 답변 전 건수를 함께 알림
function useDesignerSummary(member: SessionMember | null) {
  const [summary, setSummary] = useState<{ profile: boolean; waiting: number } | null>(null);
  useEffect(() => {
    if (!member) return;
    let live = true;
    directoryRequest<{ id: string }>('/api/my/designer-profile')
      .then(async (own) => {
        if (!own) return { profile: false, waiting: 0 };
        const items = await listReceivedConsultations(member);
        return { profile: true, waiting: items.filter((item) => item.canReply).length };
      })
      .then(
        (value) => live && setSummary(value),
        () => live && setSummary(null),
      );
    return () => {
      live = false;
    };
  }, [member]);
  return summary;
}
export function AccountPage() {
  const { state } = useAuth();
  const [params] = useSearchParams();
  const linkedNotice = params.has('linked');
  const designer = useDesignerSummary(state.status === 'authenticated' ? state.member : null);
  if (state.status !== 'authenticated')
    return (
      <div className="login-page">
        <PageHeading
          back={<BackLink to="/">홈으로</BackLink>}
          title="내 계정"
          description="로그인하면 기록을 계정에도 보관할 수 있어요."
        />
        <SessionNotice />
        <section className="panel">
          <Link className="button primary full" to="/login">
            로그인
          </Link>
          {state.status !== 'prototype' && (
            <Link className="button full" to="/signup">
              회원가입
            </Link>
          )}
          <Link className="text-link" to="/backup">
            기록 저장·백업
          </Link>
        </section>
      </div>
    );
  return (
    <div className="login-page">
      <PageHeading
        back={<BackLink to="/">홈으로</BackLink>}
        title="내 계정"
        description={`${state.member.displayName}님의 계정`}
      />
      <SessionNotice />
      {linkedNotice && (
        <p className="working-notice" role="status">
          소셜 계정을 연결했어요.
        </p>
      )}
      <section className="panel">
        <p>{state.member.email ?? '소셜 로그인 계정'}</p>
        <Link className="button primary full" to="/backup">
          기록 저장·백업
        </Link>
      </section>
      {designer?.profile ? (
        <section className="panel account-designer" aria-labelledby="account-designer-heading">
          <h2 id="account-designer-heading">디자이너</h2>
          <Link className="button full" to="/consultations/received">
            받은 상담
            {designer.waiting > 0 && (
              <span className="account-designer-count">답변 전 {designer.waiting}건</span>
            )}
          </Link>
          <Link className="text-link" to="/account/designer">
            내 디자이너 프로필 관리
          </Link>
        </section>
      ) : (
        <Link className="button full" to="/account/designer">
          내 디자이너 프로필 등록·관리
        </Link>
      )}
      <SocialButtons link />
    </div>
  );
}
export function AuthCompletePage() {
  const { state, initialized, refresh } = useAuth();
  const { ready, storage } = usePrototype();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !initialized || !ready || state.status !== 'authenticated') return;
    done.current = true;
    const next = safeReturnPath(params.get('next')) ?? takeReturnPath() ?? '/';
    // 로그인하며 계정으로 옮긴 게스트 기록은 새 ID를 받으므로 보던 주소도 새 ID로 바꿈
    const ids = storage?.migratedIds;
    navigate(ids?.size ? next.replace(/[A-Za-z0-9_-]{8,}/g, (id) => ids.get(id) ?? id) : next, {
      replace: true,
    });
  }, [initialized, ready, state, navigate, params, storage]);
  return (
    <section className="panel">
      <h1 tabIndex={-1}>로그인 확인</h1>
      {state.status === 'unavailable' ? (
        <button className="button" onClick={() => void refresh()}>
          다시 확인
        </button>
      ) : state.status === 'guest' ? (
        <Link className="button" to="/login">
          로그인 다시 시도
        </Link>
      ) : (
        <p className="working-notice" role="status">
          <span className="button-spinner" aria-hidden="true" />
          기록을 계정에 연결하고 있어요.
        </p>
      )}
    </section>
  );
}
