import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert, BackLink, Icon, PageHeading } from '../components';
import { Field } from '../fields';
import { Dialog } from '../dialog';
import { useAuth } from './context';
import { usePrototype } from '../prototype/context';
import { backupRequest, signup } from './api';
import { flushPersonalStores } from '../prototype/personal-store';

export function AccountControls() {
  const { state, pending, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [storageError, setStorageError] = useState('');
  if (state.status === 'prototype') return <span className="member-label">나의 헤어 기록</span>;
  return (
    <div className="account-controls" aria-label="계정">
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
      ) : (
        <Link className="button account-button" to="/login">
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
  const { state, actionError, refresh, pending, checking } = useAuth();
  const message = state.status === 'unavailable' ? state.message : actionError;
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

export function LoginPage() {
  const { state, pending, checking, login, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    params.has('socialError') ? '소셜 로그인을 완료하지 못했어요. 다시 시도해 주세요.' : '',
  );
  const performLogin = async () => {
    if (pending || checking) return;
    setError('');
    try {
      await flushPersonalStores();
      await login(email.trim(), password);
      navigate('/');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : '로그인하지 못했어요. 다시 시도해 주세요.',
      );
    } finally {
      setPassword('');
    }
  };
  return (
    <div className="login-page">
      <PageHeading
        back={<BackLink to="/records">내 기록으로 돌아가기</BackLink>}
        title="로그인"
        description="SALU 계정으로 로그인해 주세요."
      />
      {state.status === 'prototype' ? (
        <section className="panel">
          <h2>화면만 확인하는 모드</h2>
          <p>화면 체험에서는 로그인 없이 기록을 작성해 볼 수 있어요.</p>
          <Link className="button primary" to="/">
            홈으로
          </Link>
        </section>
      ) : state.status === 'authenticated' ? (
        <section className="panel">
          <h2>이미 로그인했어요</h2>
          <p>
            {state.member.displayName}님 · {state.member.email}
          </p>
          <Link className="button primary" to="/">
            홈으로
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
              value={password}
              disabled={pending}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <button type="submit" className="button primary full" disabled={pending || checking}>
            {pending ? '로그인 중' : '로그인'}
          </button>
          {error && (
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
      {state.status !== 'prototype' && state.status !== 'authenticated' && <SocialButtons />}
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
            setBusy(true);
            try {
              await flushPersonalStores();
              await signup(email.trim(), displayName.trim(), password);
              setCreated(true);
              await login(email.trim(), password);
              navigate('/');
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : '회원가입을 완료하지 못했어요. 다시 시도해 주세요.',
              );
            } finally {
              setPassword('');
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

function SocialButtons({ link = false }: { link?: boolean }) {
  const { state } = useAuth();
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
    const readLinked =
      link && state.status === 'authenticated'
        ? backupRequest('/api/auth/oauth2/linked', state.member, {}, controller.signal)
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
  }, [link, state, retry]);
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
export function AccountPage() {
  const { state } = useAuth();
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
      <section className="panel">
        <p>{state.member.email ?? '소셜 로그인 계정'}</p>
        <Link className="button primary full" to="/backup">
          기록 저장·백업
        </Link>
      </section>
      <Link className="button full" to="/account/designer">
        내 디자이너 프로필 등록·관리
      </Link>
      <SocialButtons link />
    </div>
  );
}
export function AuthCompletePage() {
  const { state, initialized, refresh } = useAuth();
  const { ready } = usePrototype();
  const navigate = useNavigate();
  useEffect(() => {
    if (initialized && ready && state.status === 'authenticated') navigate('/', { replace: true });
  }, [initialized, ready, state, navigate]);
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
