import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ref } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Alert, BackLink, FieldFeedback, Icon, PageHeading } from '../components';
import { Field, PasswordInput } from '../fields';
import { Dialog } from '../dialog';
import { useAuth } from './context';
import { usePrototype } from '../prototype/context';
import {
  ApiFailure,
  backupRequest,
  changePassword,
  directoryRequest,
  emailAvailable,
  renameMember,
  signup,
} from './api';
import type { SessionMember } from './api';
import { listReceivedConsultations } from '../consultation-api';
import { flushPersonalStores, readGuestRecords } from '../prototype/personal-store';
import type { GuestRecords, PersonalStore } from '../prototype/personal-store';
import { cutTitle } from '../prototype/dates';
import { useFeedback } from '../feedback';

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
  const [unsent, setUnsent] = useState(0);
  const [storageError, setStorageError] = useState('');
  const { storage } = usePrototype();
  // 평소에는 바로 로그아웃함. 서버에 못 올린 기록이 있거나 기기 저장이 실패했을 때만 창으로 물음
  const finish = async () => {
    try {
      await flushPersonalStores();
    } catch {
      setStorageError('기기에 저장하지 못했어요. 입력을 보관한 뒤 다시 시도해 주세요.');
      setOpen(true);
      return;
    }
    const success = await logout();
    setOpen(false);
    if (success) navigate('/');
  };
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
              const waiting = storage
                ? Object.entries(storage.getItems()).filter(
                    ([id, item]) => id !== 'new-cut-draft' && (item.dirty || item.conflict),
                  ).length
                : 0;
              setUnsent(waiting);
              if (waiting > 0) setOpen(true);
              else void finish();
            }}
          >
            {pending ? '로그아웃 중' : '로그아웃'}
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
        title={storageError ? '로그아웃하지 못했어요' : '아직 올리지 못한 기록이 있어요'}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
      >
        <Alert message={storageError} />
        {!storageError && unsent > 0 && (
          <p>기록 {unsent}건을 아직 계정에 저장하지 못했어요.<br />이 기기에서 다시 로그인하면 저장돼요.</p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            취소
          </button>
          <button
            type="button"
            className="button primary"
            disabled={pending}
            onClick={() => void finish()}
          >
            {pending ? '로그아웃 중' : '로그아웃'}
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
      {!compact && <p>기기에 저장한 기록은 그대로 있어요.</p>}
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
  return withNext('/auth/complete', next);
}
// 로그인·회원가입 사이를 오가도 처음 보던 화면으로 돌아갈 수 있게 next를 넘겨 줌
function withNext(path: string, next: string | null) {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
// 뒤로 링크는 돌아갈 화면 이름으로 부름(DESIGN.md). 모르는 주소는 이전 화면
const RETURN_LABELS: [RegExp, string][] = [
  [/^\/community/, '커뮤니티로'],
  [/^\/designers/, '디자이너 찾기로'],
  [/^\/consultations/, '상담으로'],
  [/^\/requests/, '커트 준비로'],
  [/^\/records/, '내 기록으로'],
  [/^\/more/, '더보기로'],
  [/^\/account/, '내 계정으로'],
  [/^\/backup/, '기록 백업으로'],
  [/^\/notifications/, '알림으로'],
  [/^\/admin/, '신고 처리로'],
];
const returnLabel = (next: string | null) =>
  next ? (RETURN_LABELS.find(([path]) => path.test(next))?.[1] ?? '이전 화면으로') : '홈으로';

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
        back={<BackLink to={next ?? '/'}>{returnLabel(next)}</BackLink>}
        title="로그인"
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
            {returnLabel(next)}
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
            <PasswordInput
              name="password"
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
          아직 계정이 없나요? <Link to={withNext('/signup', next)}>회원가입</Link>
        </p>
      )}
    </div>
  );
}

// 확인 칸이 비었거나 아직 앞부분이 같으면 판단하지 않음. 다르면 바로 알려 가입 버튼을 누르기 전에 고치게 함
function passwordMatch(password: string, confirm: string): 'same' | 'different' | null {
  if (!confirm) return null;
  if (confirm === password) return 'same';
  return password.startsWith(confirm) ? null : 'different';
}
function PasswordConfirmField({
  ref,
  match,
  value,
  disabled,
  onChange,
}: {
  ref?: Ref<HTMLInputElement>;
  match: ReturnType<typeof passwordMatch>;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Field label="비밀번호 확인" error={match === 'different' ? '비밀번호가 서로 달라요.' : ''}>
        <PasswordInput
          name="passwordConfirm"
          autoComplete="new-password"
          maxLength={72}
          required
          ref={ref}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </Field>
      {match === 'same' && (
        <p className="field-match" aria-live="polite">
          <Icon name="check" size={16} /> 비밀번호가 같아요.
        </p>
      )}
    </div>
  );
}

export function SignupPage() {
  const { state, pending, checking, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeReturnPath(params.get('next'));
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const confirmInput = useRef<HTMLInputElement>(null);
  const match = passwordMatch(password, confirm);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState('');
  // 중복 확인 결과는 확인한 그 이메일에만 맞으므로 이메일을 고치면 지움
  const [checked, setChecked] = useState<{ email: string; available: boolean } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');
  const emailResult = checked?.email === email.trim().toLowerCase() ? checked : null;
  const taken = duplicate || emailResult?.available === false;
  return (
    <div className="login-page">
      <PageHeading
        back={<BackLink to={withNext('/login', next)}>로그인으로</BackLink>}
        title="회원가입"
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
          <Alert message={error} />
          <Link className="button primary full" to={withNext('/login', next)}>
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
            setDuplicate(false);
            if (password.length < 8) {
              setError('비밀번호를 8자 이상 입력해 주세요.');
              return;
            }
            if (new TextEncoder().encode(password).length > 72) {
              setError('비밀번호가 너무 길어요. 글자 수를 줄여 주세요.');
              return;
            }
            if (confirm !== password) {
              requestAnimationFrame(() => confirmInput.current?.focus());
              return;
            }
            setBusy(true);
            // 가입 뒤 자동 로그인하는 동안은 입력 화면을 그대로 두어 '로그인하세요' 카드가 잠깐 보이지 않게 함.
            // 가입은 됐는데 로그인만 실패했을 때만 완료 카드와 로그인 버튼을 보여 줌
            let joined = false;
            try {
              await flushPersonalStores();
              await signup(email.trim(), displayName.trim(), password);
              joined = true;
              await login(email.trim(), password);
              navigate(completePath(next), { replace: true });
            } catch (failure) {
              if (joined) setCreated(true);
              setDuplicate(failure instanceof ApiFailure && failure.status === 409);
              setError(
                failure instanceof Error
                  ? failure.message
                  : '회원가입을 완료하지 못했어요. 다시 시도해 주세요.',
              );
            } finally {
              // 가입한 뒤에는 비밀번호를 지움. 입력 확인 실패는 다시 적지 않게 그대로 둠
              if (joined) {
                setPassword('');
                setConfirm('');
              }
              setBusy(false);
            }
          }}
        >
          {!error && <SessionNotice />}
          <Alert message={duplicate ? '' : error} />
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
          <div className="email-check">
            <Field label="이메일">
              <input
                name="email"
                type="email"
                autoComplete="username"
                maxLength={254}
                required
                value={email}
                disabled={busy || pending}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setDuplicate(false);
                  setEmailError('');
                }}
              />
            </Field>
            <button
              type="button"
              className="button"
              disabled={busy || pending || checkingEmail || !email.trim()}
              onClick={async () => {
                const value = email.trim().toLowerCase();
                setCheckingEmail(true);
                setEmailError('');
                try {
                  setChecked({ email: value, available: await emailAvailable(value) });
                } catch (failure) {
                  setChecked(null);
                  setEmailError(
                    failure instanceof Error
                      ? failure.message
                      : '확인하지 못했어요. 다시 눌러 주세요.',
                  );
                } finally {
                  setCheckingEmail(false);
                }
              }}
            >
              {checkingEmail ? '확인 중' : '중복 확인'}
            </button>
          </div>
          <div aria-live="polite">
            {taken ? (
              <p className="email-taken">
                이미 가입한 이메일이에요.{' '}
                <Link to={withNext('/login', next)}>이 이메일로 로그인</Link>
              </p>
            ) : emailResult?.available ? (
              <p className="email-result">
                <Icon name="check" size={16} /> 사용할 수 있는 이메일이에요.
              </p>
            ) : (
              emailError && <FieldFeedback message={emailError} />
            )}
          </div>
          <Field label="비밀번호" hint="8자 이상">
            <PasswordInput
              name="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
              value={password}
              disabled={busy || pending}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <PasswordConfirmField
            ref={confirmInput}
            match={match}
            value={confirm}
            disabled={busy || pending}
            onChange={setConfirm}
          />
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
          <SocialButtons returnTo={next} />
          <p className="auth-switch">
            이미 계정이 있나요? <Link to={withNext('/login', next)}>로그인</Link>
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
        <PageHeading back={<BackLink to="/">홈으로</BackLink>} title="내 계정" />
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
            기록 백업
          </Link>
        </section>
      </div>
    );
  return (
    <div className="login-page">
      <PageHeading back={<BackLink to="/">홈으로</BackLink>} title="내 계정" />
      <SessionNotice />
      {linkedNotice && (
        <p className="working-notice" role="status">
          소셜 계정을 연결했어요.
        </p>
      )}
      <section className="panel account-profile">
        <p className="account-email">{state.member.email ?? '소셜 로그인 계정'}</p>
        <RenameForm member={state.member} />
        {state.member.email && <PasswordForm />}
      </section>
      <section className="panel">
        <Link className="button primary full" to="/backup">
          기록 백업
        </Link>
      </section>
      {designer?.profile ? (
        <section className="panel account-designer" aria-labelledby="account-designer-heading">
          <h2 id="account-designer-heading">디자이너</h2>
          <Link className="button full" to="/consultations/received">
            받은 상담
            {designer.waiting > 0 && (
              <span className="account-designer-count">답변 대기 {designer.waiting}건</span>
            )}
          </Link>
          <Link className="text-link" to="/account/designer">
            내 디자이너 프로필 관리
          </Link>
        </section>
      ) : (
        <Link className="button full" to="/account/designer">
          디자이너 프로필 만들기
        </Link>
      )}
      <SocialButtons link />
    </div>
  );
}
function RenameForm({ member }: { member: SessionMember }) {
  const { updateMember } = useAuth();
  const notify = useFeedback();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(member.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!editing)
    return (
      <div className="account-row">
        <span>
          <span className="account-row-label">이름</span> {member.displayName}
        </span>
        <button
          type="button"
          className="button"
          onClick={() => {
            setName(member.displayName);
            setError('');
            setEditing(true);
          }}
        >
          이름 바꾸기
        </button>
      </div>
    );
  return (
    <form
      className="account-edit"
      onSubmit={async (event) => {
        event.preventDefault();
        const value = name.trim();
        if (!value) {
          setError('이름을 입력해 주세요.');
          return;
        }
        if (value === member.displayName) {
          setEditing(false);
          return;
        }
        setBusy(true);
        setError('');
        try {
          updateMember(await renameMember(value));
          setEditing(false);
          notify('이름을 바꿨어요');
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : '이름을 바꾸지 못했어요.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="이름" error={error}>
        <input
          name="displayName"
          autoComplete="nickname"
          maxLength={50}
          required
          autoFocus
          value={name}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <div className="account-edit-actions">
        <button type="button" className="button" disabled={busy} onClick={() => setEditing(false)}>
          취소
        </button>
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? '저장 중' : '저장'}
        </button>
      </div>
    </form>
  );
}
function PasswordForm() {
  const notify = useFeedback();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [currentError, setCurrentError] = useState('');
  const match = passwordMatch(next, confirm);
  const close = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
    setCurrentError('');
    setEditing(false);
  };
  if (!editing)
    return (
      <button type="button" className="button full" onClick={() => setEditing(true)}>
        비밀번호 바꾸기
      </button>
    );
  return (
    <form
      className="account-edit"
      onSubmit={async (event) => {
        event.preventDefault();
        setError('');
        setCurrentError('');
        if (next.length < 8) {
          setError('새 비밀번호를 8자 이상 입력해 주세요.');
          return;
        }
        if (new TextEncoder().encode(next).length > 72) {
          setError('새 비밀번호가 너무 길어요. 글자 수를 줄여 주세요.');
          return;
        }
        if (next !== confirm) return;
        setBusy(true);
        try {
          await changePassword(current, next);
          close();
          notify('비밀번호를 바꿨어요');
        } catch (failure) {
          const message =
            failure instanceof Error ? failure.message : '비밀번호를 바꾸지 못했어요.';
          if (failure instanceof ApiFailure && failure.code === 'CURRENT_PASSWORD_INVALID')
            setCurrentError(message);
          else setError(message);
        } finally {
          setCurrent('');
          setBusy(false);
        }
      }}
    >
      <h2>비밀번호 바꾸기</h2>
      <Alert message={error} />
      <Field label="현재 비밀번호" error={currentError}>
        <PasswordInput
          name="currentPassword"
          autoComplete="current-password"
          maxLength={72}
          required
          autoFocus
          value={current}
          disabled={busy}
          onChange={(event) => setCurrent(event.target.value)}
        />
      </Field>
      <Field label="새 비밀번호" hint="8자 이상">
        <PasswordInput
          name="newPassword"
          autoComplete="new-password"
          minLength={8}
          maxLength={72}
          required
          value={next}
          disabled={busy}
          onChange={(event) => setNext(event.target.value)}
        />
      </Field>
      <PasswordConfirmField match={match} value={confirm} disabled={busy} onChange={setConfirm} />
      <div className="account-edit-actions">
        <button type="button" className="button" disabled={busy} onClick={close}>
          취소
        </button>
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? '바꾸는 중' : '비밀번호 바꾸기'}
        </button>
      </div>
    </form>
  );
}
export const guestRecordsLabel = (guest: GuestRecords) =>
  guest.cuts ? `기록 ${guest.cuts}건` : '작성 중이던 기록';
export function GuestRecordList({ guest }: { guest: GuestRecords }) {
  if (!guest.recent.length) return null;
  return (
    <ul className="guest-records">
      {guest.recent.map((cut) => (
        <li key={cut.id}>{cutTitle(cut.cutDate, cut.service)}</li>
      ))}
      {guest.cuts > guest.recent.length && <li>외 {guest.cuts - guest.recent.length}건</li>}
    </ul>
  );
}

// 로그인 뒤 옮기기 질문은 이 기기에서 계정마다 한 번만 띄움. 표시를 남기지 못하면 다음 로그인 때 다시 물음
function GuestMoveQuestion({
  storage,
  guest,
  next,
}: {
  storage: PersonalStore;
  guest: GuestRecords;
  next: string;
}) {
  const navigate = useNavigate();
  const notify = useFeedback();
  const heading = useRef<HTMLHeadingElement>(null);
  const [moving, setMoving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  // 같은 주소에서 로그인 확인 문구가 질문으로 바뀌므로 제목으로 초점을 옮김
  useEffect(() => heading.current?.focus(), []);
  const finish = async (moved: boolean) => {
    await storage.markGuestMoveAsked().catch(() => {});
    const ids = storage.migratedIds;
    // 옮긴 기록은 새 ID를 받음. 옮기지 않은 기록의 주소는 계정 공간에 없으므로 내 기록 목록으로 감
    const path = moved
      ? next.replace(/[A-Za-z0-9_-]{8,}/g, (id) => ids.get(id) ?? id)
      : (next.match(/[A-Za-z0-9_-]{8,}/g) ?? []).some((id) => guest.ids.has(id))
        ? '/records'
        : next;
    // 화면이 바로 바뀌므로 옮겼는지 짧게 알려 줌
    notify(moved ? `${label}을 계정으로 옮겼어요` : '기록을 이 기기에 그대로 뒀어요');
    navigate(path, { replace: true });
  };
  const label = guestRecordsLabel(guest);
  return (
    <section className="panel guest-move">
      <h1 tabIndex={-1} ref={heading}>
        이 기기의 {label}을 계정으로 옮길까요?
      </h1>
      <GuestRecordList guest={guest} />
      <p>옮기면 다른 기기에서도 볼 수 있어요. 나중에 기록 백업 화면에서 옮겨도 돼요.</p>
      <Alert message={error} />
      {moving && (
        <p className="working-notice" role="status">
          <span className="button-spinner" aria-hidden="true" />
          기록을 옮기고 있어요.
        </p>
      )}
      <div className="backup-actions">
        <button
          type="button"
          className="button primary"
          disabled={moving || leaving}
          onClick={async () => {
            setMoving(true);
            setError('');
            let moved: boolean;
            try {
              moved = await storage.adoptGuest();
            } catch {
              setError('기록을 옮기지 못했어요. 다시 시도해 주세요.');
              setMoving(false);
              return;
            }
            await finish(moved);
          }}
        >
          계정으로 옮기기
        </button>
        <button
          type="button"
          className="button"
          disabled={moving || leaving}
          onClick={() => {
            setLeaving(true);
            void finish(false);
          }}
        >
          이 기기에 두기
        </button>
      </div>
    </section>
  );
}
export function AuthCompletePage() {
  const { state, initialized, refresh } = useAuth();
  const { ready, storage } = usePrototype();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const done = useRef(false);
  const [question, setQuestion] = useState<{ guest: GuestRecords; next: string } | null>(null);
  useEffect(() => {
    if (done.current || !initialized || !ready || state.status !== 'authenticated') return;
    if (!storage || storage.scope === 'guest') return;
    done.current = true;
    const next = safeReturnPath(params.get('next')) ?? takeReturnPath() ?? '/';
    const leave = () => void navigate(next, { replace: true });
    if (storage.guestMoveAsked) {
      leave();
      return;
    }
    readGuestRecords().then((guest) => (guest ? setQuestion({ guest, next }) : leave()), leave);
  }, [initialized, ready, state, navigate, params, storage]);
  if (question && storage) return <GuestMoveQuestion storage={storage} {...question} />;
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
          로그인을 확인하고 있어요.
        </p>
      )}
    </section>
  );
}
