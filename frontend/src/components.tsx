import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router';
import { Link, scopedTo, useWorkspace } from './workspace';
import { KEEP_TRAIL, useBackTrail } from './back-trail';
import { ApiFailure } from './auth/api';

export function Icon({
  name,
  size = 20,
}: {
  name:
    | 'home'
    | 'cut'
    | 'arrow'
    | 'back'
    | 'plus'
    | 'check'
    | 'photo'
    | 'chat'
    | 'user'
    | 'reset'
    | 'calendar'
    | 'consult'
    | 'bell'
    | 'heart'
    | 'more'
    | 'warning'
    | 'search'
    | 'lock'
    | 'offline';
  size?: number;
}) {
  const paths = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </>
    ),
    lock: (
      <>
        <rect x="4" y="10" width="16" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </>
    ),
    offline: (
      <>
        <path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M12 19h.01" />
        <path d="m3 3 18 18" />
      </>
    ),
    warning: (
      <>
        <path d="m12 3 10 18H2L12 3Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
    home: (
      <>
        <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
        <path d="M9 21v-8h6v8" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h2" />
      </>
    ),
    cut: (
      <>
        <circle cx="6" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="m8.5 7.5 12 12M8.5 16.5l12-12M13 12l7.5-7.5" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7M4 12h12" />,
    back: <path d="m15 5-7 7 7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    photo: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="4" />
        <circle cx="8" cy="8" r="1" />
        <path d="m4 17 5-5 4 4 3-3 5 5" />
      </>
    ),
    chat: <path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0ZM7 8h9M7 12h6" />,
    consult: (
      <>
        <path d="M15 4H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h1v3l4-3h5a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Z" />
        <path d="M17 9h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v2l-3-2h-3" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="19" cy="12" r="1.6" />
      </>
    ),
    heart: (
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    ),
    bell: (
      <>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
      </>
    ),
    reset: (
      <>
        <path d="M3 10a9 9 0 1 1 1 8M3 3v7h7" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function SuccessMark({ className, celebrate }: { className: string; celebrate: boolean }) {
  return (
    <div className={`success-mark ${className}${celebrate ? ' celebrate' : ''}`} aria-hidden="true">
      <svg className="success-check" viewBox="0 0 24 24">
        <path d="m5.5 12.5 4 4 9-9.5" pathLength={1} />
      </svg>
    </div>
  );
}

export function PageHeading({
  title,
  description,
  action,
  back,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="heading-content">
        {back && <div className="heading-back-row">{back}</div>}
        <div className="heading-title-row">
          <h1 tabIndex={-1}>{title}</h1>
        </div>
        {description && <p className="subtext">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// 직전에 보던 화면이 있으면 그 화면으로 돌아감. 단계가 정해진 작성 화면은 trail={false}로 이전 단계 유지
export function BackLink({
  to,
  children,
  trail = true,
}: {
  to: string;
  children: ReactNode;
  trail?: boolean;
}) {
  const location = useLocation();
  const mode = useWorkspace();
  const previous = useBackTrail(location);
  const fallback = scopedTo(to, mode) as string;
  if (trail && previous && previous.to !== fallback)
    return (
      <RouterLink className="heading-back" to={previous.to} state={KEEP_TRAIL}>
        <Icon name="back" />
        <span>{previous.label}</span>
      </RouterLink>
    );
  return (
    <RouterLink className="heading-back" to={fallback} state={KEEP_TRAIL}>
      <Icon name="back" />
      <span>{children}</span>
    </RouterLink>
  );
}

// 배포 직후 예전 탭이 사라진 화면 파일을 요청하면 lazy 화면이 실패함. 그 밖의 오류는 화면을 그리다 멈춘 것
const chunkFailure = (error: unknown) =>
  error instanceof Error &&
  /dynamically imported module|importing a module script failed|error loading dynamically|ChunkLoadError/i.test(
    `${error.name} ${error.message}`,
  );

// 화면 하나가 멈춰도 머리글·메뉴는 남겨 다른 메뉴로 갈 수 있게 함
export class LoadBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error: error ?? new Error('unknown') };
  }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (chunkFailure(error))
      return (
        <ErrorState
          kind="offline"
          title="화면을 불러오지 못했어요"
          message="새 버전이 올라왔거나 연결이 끊겼을 수 있어요. 새로고침하면 다시 불러와요."
          onRetry={() => window.location.reload()}
          retryLabel="새로고침"
          home={false}
        />
      );
    return (
      <ErrorState
        kind="crash"
        title="화면을 보여 주지 못했어요"
        message="잠시 문제가 생겼어요. 저장한 기록은 그대로 있어요. 다시 불러오거나 다른 화면에서 다시 시작해 주세요."
        onRetry={() => this.setState({ error: null })}
        retryLabel="다시 불러오기"
      />
    );
  }
}

export type ErrorKind = 'missing' | 'denied' | 'login' | 'offline' | 'crash';
export type LoadProblem = { kind: ErrorKind; message: string };

// 서버 오류를 화면 종류로 나눔. 상태 코드가 없는 실패(연결 끊김·응답 이상)는 다시 시도할 수 있는 연결 문제로 봄
export function loadProblem(
  failure: unknown,
  fallback = '잠시 후 다시 시도해 주세요.',
): LoadProblem {
  if (failure instanceof ApiFailure) {
    if (failure.status === 404) return { kind: 'missing', message: '' };
    if (failure.status === 401) return { kind: 'login', message: '' };
    if (failure.status === 403 && failure.code !== 'CSRF_INVALID')
      return { kind: 'denied', message: failure.message };
    return { kind: 'offline', message: failure.message || fallback };
  }
  return { kind: 'offline', message: fallback };
}

const KIND_COPY: Record<
  ErrorKind,
  { icon: Parameters<typeof Icon>[0]['name']; title: string; message: string }
> = {
  missing: {
    icon: 'search',
    title: '찾을 수 없어요',
    message: '주소가 바뀌었거나 지워졌을 수 있어요.',
  },
  denied: { icon: 'lock', title: '볼 수 없는 화면이에요', message: '이 계정으로는 열 수 없어요.' },
  login: { icon: 'lock', title: '로그인이 필요해요', message: '로그인하면 이어서 볼 수 있어요.' },
  offline: {
    icon: 'offline',
    title: '잠시 연결할 수 없어요',
    message: '연결을 확인한 뒤 다시 시도해 주세요.',
  },
  crash: {
    icon: 'warning',
    title: '화면을 보여 주지 못했어요',
    message: '다시 불러오거나 다른 화면에서 다시 시작해 주세요.',
  },
};

// 오류가 난 화면이 속한 메뉴의 첫 화면. 예시 체험에는 홈이 없어 내 기록으로 감
function sectionHome(pathname: string, example: boolean): [string, string] {
  const path = pathname.replace(/^\/examples/, '') || '/';
  if (path.startsWith('/community')) return ['/community', '커뮤니티로'];
  if (path.startsWith('/consultations/received'))
    return ['/consultations/received', '받은 상담으로'];
  if (path.startsWith('/consultations')) return ['/consultations', '상담 내역으로'];
  if (path.startsWith('/requests')) return ['/requests', '커트 준비로'];
  if (path.startsWith('/designers')) return ['/designers', '디자이너 찾기로'];
  if (path.startsWith('/records') || example) return ['/records', '내 기록으로'];
  if (path.startsWith('/admin') || path.startsWith('/notifications')) return ['/more', '더보기로'];
  return ['/', '홈으로'];
}

// 404·403·401·연결 실패·화면 오류를 같은 모양으로 보여 줌. 버튼은 지금 갈 수 있는 곳만
export function ErrorState({
  kind,
  title,
  message,
  onRetry,
  retryLabel = '다시 시도',
  home = true,
  children,
}: {
  kind: ErrorKind;
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  home?: boolean;
  children?: ReactNode;
}) {
  const location = useLocation();
  const mode = useWorkspace();
  const navigate = useNavigate();
  const copy = KIND_COPY[kind];
  const [homePath, homeLabel] = sectionHome(location.pathname, mode === 'example');
  const next = `${location.pathname}${location.search}`;
  // 같은 탭에서 들어온 화면이 있을 때만 이전 화면 버튼을 둠(react-router가 history.state에 순서를 남김)
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;
  const atHome = scopedTo(homePath, mode) === location.pathname;
  return (
    <section className="empty-state error-state" role={kind === 'crash' ? 'alert' : undefined}>
      <span className="empty-symbol">
        <Icon name={copy.icon} size={30} />
      </span>
      <h1 tabIndex={-1}>{title ?? copy.title}</h1>
      <p>{message || copy.message}</p>
      <div className="error-actions">
        {kind === 'login' && (
          <RouterLink
            className="button primary"
            to={next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          >
            로그인
          </RouterLink>
        )}
        {onRetry && (
          <button
            type="button"
            className={`button${kind === 'login' ? '' : ' primary'}`}
            onClick={onRetry}
          >
            {retryLabel}
          </button>
        )}
        {home && !atHome && (
          <Link className={`button${kind === 'login' || onRetry ? '' : ' primary'}`} to={homePath}>
            {homeLabel}
          </Link>
        )}
        {children}
        {canGoBack && kind !== 'crash' && (
          <button type="button" className="text-link" onClick={() => void navigate(-1)}>
            이전 화면으로
          </button>
        )}
      </div>
    </section>
  );
}

// 앱에 없는 주소
export function NotFound() {
  return (
    <ErrorState
      kind="missing"
      title="페이지를 찾을 수 없어요"
      message="주소가 바뀌었거나 지워진 화면일 수 있어요."
    />
  );
}

// 서버에서 받은 자료가 없거나 불러오지 못했을 때. 없음이면 제목 그대로, 그 밖에는 종류에 맞는 제목
export function LoadFailure({
  problem,
  title,
  missingMessage,
  onRetry,
}: {
  problem: LoadProblem;
  title: string;
  // 대상이 없을 때 그 메뉴에 맞게 바꿀 설명
  missingMessage?: string;
  onRetry?: () => void;
}) {
  const missing = problem.kind === 'missing';
  return (
    <ErrorState
      kind={problem.kind}
      title={missing ? title : undefined}
      message={missing ? missingMessage : problem.message}
      onRetry={problem.kind === 'offline' ? onRetry : undefined}
    />
  );
}

export function Missing({
  title = '자료를 찾을 수 없어요',
  message,
}: {
  title?: string;
  message?: string;
}) {
  const { pathname } = useLocation();
  const record = /^(\/examples)?\/records/.test(pathname);
  return (
    <ErrorState
      kind="missing"
      title={title}
      message={message ?? (record ? '내 기록에서 자료를 다시 선택해 주세요.' : undefined)}
    />
  );
}

// 불러오는 동안 돌아가는 표시와 문구. 버튼 안 진행 표시와 같은 모양
export function Loading({ children }: { children: ReactNode }) {
  return (
    <p className="loading-state" role="status">
      <span className="button-spinner" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Avatar({
  name,
  large = false,
  src,
}: {
  name: string;
  large?: boolean;
  src?: string;
}) {
  return (
    <span className={`avatar ${large ? 'large' : ''}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : name.slice(0, 1)}
    </span>
  );
}

export function Alert({ message }: { message: string }) {
  return message ? (
    <div className="form-error" role="alert" tabIndex={-1}>
      <Icon name="warning" />
      <div>
        <strong>확인이 필요해요</strong>
        <p>{message}</p>
      </div>
    </div>
  ) : null;
}

export function FieldFeedback({ id, message }: { id?: string; message: string }) {
  return (
    <span id={id} className="field-error">
      <Icon name="warning" size={16} />
      <span>{message}</span>
    </span>
  );
}
export function PhotoPlaceholder({ failed = false }: { failed?: boolean }) {
  return (
    <span className="photo-placeholder">
      <Icon name="photo" size={26} />
      <span>{failed ? '사진을 불러오지 못했어요' : '사진 없음'}</span>
    </span>
  );
}
export function focusFirstError(form: HTMLFormElement) {
  requestAnimationFrame(() => {
    const target = form.querySelector<HTMLElement>(
      '[aria-invalid="true"], .invalid input, .invalid textarea, .field-error, .form-error',
    );
    target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    target?.focus({ preventScroll: true });
  });
}

export function PhotoThumbnail({ src, alt }: { src?: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return src && !failed ? (
    <img src={src} alt={alt} onError={() => setFailed(true)} />
  ) : (
    <PhotoPlaceholder failed={failed} />
  );
}
