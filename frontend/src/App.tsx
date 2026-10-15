import { lazy, Suspense, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import type { Location } from 'react-router';
import { DirectoryEditor } from './directory-page';
import { RecordComplete } from './completion';
import { Icon, LoadBoundary, Missing } from './components';
import { PrototypeProvider, usePrototype } from './prototype/context';
import { CutForm, ProgressForm, RecordDetail, RecordList } from './record-pages';
import { RequestList } from './request-pages';
import { Dialog } from './dialog';
import { FeedbackProvider } from './feedback';
import { AuthProvider, useAuth } from './auth/context';
import {
  AccountControls,
  LoginPage,
  SignupPage,
  SessionNotice,
  AccountPage,
  AuthCompletePage,
} from './auth/pages';
import { BackupPage, StorageNotice } from './storage-page';
import { CloudSync } from './prototype/cloud-sync';
import { HomePage } from './home-page';
import { Link as WorkspaceLink, useWorkspace, WorkspaceContext } from './workspace';
import { RetainedPage, useMainNavigation, isTaskPath } from './main-navigation';
import { ThemeSettings } from './theme';
import { KEEP_TRAIL, useBackTrailTracker } from './back-trail';
import { ConsultationProvider, useConsultations } from './consultation-store';
import {
  DesignerDetail,
  DesignerList,
  MaterialsPage,
  ReviewPage,
  CompletePage,
  PreviewPage,
  RequestPage,
} from './consultation-pages';

const ConsultationNew = lazy(() =>
  import('./consultation-flow').then((module) => ({ default: module.ConsultationNew })),
);
const ConsultationComplete = lazy(() =>
  import('./consultation-flow').then((module) => ({ default: module.ConsultationComplete })),
);
const ConsultationList = lazy(() =>
  import('./consultation-flow').then((module) => ({ default: module.ConsultationList })),
);
const ConsultationDetail = lazy(() =>
  import('./consultation-flow').then((module) => ({ default: module.ConsultationDetail })),
);
const ReceivedList = lazy(() =>
  import('./received-consultations').then((module) => ({ default: module.ReceivedList })),
);
const ReceivedDetail = lazy(() =>
  import('./received-consultations').then((module) => ({ default: module.ReceivedDetail })),
);
const ReceivedComplete = lazy(() =>
  import('./received-consultations').then((module) => ({ default: module.ReceivedComplete })),
);

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { reset, ready, storage, loadFailed } = usePrototype();
  const { repository: consultations } = useConsultations();
  const mode = useWorkspace();
  useEffect(() => {
    // 미리 받기 실패는 실제 화면 진입 때 LoadBoundary가 안내함
    import('./consultation-flow').catch(() => {});
  }, [mode]);
  useEffect(() => {
    // 로그인 전에 보던 게스트 기록 주소(뒤로 가기 포함)를 계정으로 옮긴 새 ID 주소로 바꿈
    const ids = storage?.migratedIds;
    if (!ready || !ids?.size) return;
    const current = `${location.pathname}${location.search}`;
    const next = current.replace(/[A-Za-z0-9_-]{8,}/g, (id) => ids.get(id) ?? id);
    if (next !== current) navigate(next, { replace: true });
  }, [location, ready, storage, navigate]);
  const navigation = useMainNavigation(ready);
  useBackTrailTracker();
  const [pageSlot, setPageSlot] = useState<HTMLDivElement | null>(null);
  const path =
    mode === 'example' ? location.pathname.replace(/^\/examples/, '') || '/' : location.pathname;
  const [resetOpen, setResetOpen] = useState(false);
  const [exitTo, setExitTo] = useState<string | null>(null);
  const focused = isTaskPath(path);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const active = document.activeElement;
      const editing =
        active instanceof HTMLElement &&
        active.matches(
          'input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true]',
        );
      setKeyboardOpen(Boolean(editing && viewport && window.innerHeight - viewport.height > 120));
    };
    viewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return (
    <div
      onClickCapture={(event) => {
        // 예시 자료는 메모리에만 있어 체험 밖 주소로 가면 사라지므로 먼저 확인함
        if (mode !== 'example' || event.button !== 0 || event.metaKey || event.ctrlKey) return;
        const anchor = (event.target as HTMLElement).closest('a[href]');
        if (!(anchor instanceof HTMLAnchorElement) || anchor.origin !== window.location.origin)
          return;
        if (/^\/examples(\/|$)/.test(anchor.pathname)) return;
        event.preventDefault();
        event.stopPropagation();
        setExitTo(`${anchor.pathname}${anchor.search}${anchor.hash}`);
      }}
      className={`app-shell${path === '/records' ? ' journal-screen' : ''}${path === '/' && mode === 'empty' ? ' home-screen' : ''}${focused ? ' task-focused' : ''}${keyboardOpen ? ' keyboard-open' : ''}`}
    >
      {mode === 'example' && (
        <section className="prototype-notice example-notice" aria-label="예시 체험">
          <div className="example-notice-inner">
            <span className="demo-badge">예시 체험</span>
            <WorkspaceLink className="example-directory" to="/designers">
              디자이너 찾기
            </WorkspaceLink>
            <button className="reset-button" onClick={() => setResetOpen(true)}>
              초기화
            </button>
            <Link className="example-exit" to="/">
              체험 종료
            </Link>
          </div>
        </section>
      )}
      <header className="app-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="SALU 홈">
            salu<span>.</span>
          </Link>
          {!focused && (
            <nav aria-label="주 메뉴">
              {navigation.menu(
                'home',
                <>
                  <Icon name="home" />홈
                </>,
              )}
              {navigation.menu(
                'records',
                <>
                  <Icon name="cut" />내 기록
                </>,
              )}
              {navigation.menu(
                'requests',
                <>
                  <Icon name="chat" />
                  커트 준비
                </>,
              )}
              {navigation.menu(
                'consultations',
                <>
                  <Icon name="consult" />
                  상담
                </>,
              )}
            </nav>
          )}
          <div className="header-actions">
            <ThemeSettings />
            {focused ? (
              <WorkspaceLink
                onClick={(event) => {
                  // 화면 위 뒤로 링크가 있으면 같은 곳으로 나감
                  const back = document.querySelector<HTMLAnchorElement>(
                    'main .heading-back, main .back-link',
                  );
                  // 이전 단계(작업 화면)를 가리키면 작업을 벗어나지 않으므로 기본 목적지로 나감
                  if (!back || event.defaultPrevented || isTaskPath(back.pathname)) return;
                  event.preventDefault();
                  navigate(`${back.pathname}${back.search}`, { state: KEEP_TRAIL });
                }}
                className="task-exit"
                to={
                  path.startsWith('/records/')
                    ? '/records'
                    : path.startsWith('/consultations/')
                      ? '/consultations'
                      : '/requests'
                }
              >
                나가기
              </WorkspaceLink>
            ) : (
              <AccountControls />
            )}
          </div>
        </div>
      </header>
      {mode !== 'example' &&
      !loadFailed &&
      path !== '/' &&
      path !== '/login' &&
      path !== '/signup' ? (
        <StorageNotice compact={focused} />
      ) : null}
      {path === '/login' || path === '/signup' || path === '/account' ? null : (
        <SessionNotice compact />
      )}
      <Dialog open={exitTo !== null} title="예시 체험을 끝낼까요?" onClose={() => setExitTo(null)}>
        <p>체험 중 작성한 기록과 상담 요청은 저장되지 않고 사라져요. 내 기록은 그대로 있어요.</p>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={() => setExitTo(null)}>
            계속 체험
          </button>
          <button
            type="button"
            className="button coral"
            onClick={() => {
              const to = exitTo!;
              setExitTo(null);
              navigate(to);
            }}
          >
            체험 끝내기
          </button>
        </div>
      </Dialog>
      <Dialog
        open={resetOpen}
        title="작성한 내용을 초기화할까요?"
        onClose={() => setResetOpen(false)}
      >
        <p>체험 중 작성한 기록과 상담 요청을 초기화해요. 내 기록은 그대로 남아요.</p>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={() => setResetOpen(false)}>
            계속 작성
          </button>
          <button
            type="button"
            className="button coral"
            onClick={() => {
              setResetOpen(false);
              reset();
              consultations?.reset();
              navigation.forget();
              navigate('/examples/records');
            }}
          >
            모두 초기화
          </button>
        </div>
      </Dialog>
      <main id="main-content">
        {loadFailed && path !== '/' ? (
          <section className="empty-state">
            <h1 tabIndex={-1}>기록을 불러오지 못했어요</h1>
            <p role="alert">
              이 브라우저에서 기기 저장소를 쓸 수 없어요. 사이트 데이터 저장을 허용했는지, 저장
              공간이 남아 있는지 확인한 뒤 다시 시도해 주세요.
            </p>
            <div className="dialog-actions">
              <button type="button" className="button primary" onClick={() => void storage?.load()}>
                다시 시도
              </button>
              <Link className="button" to="/examples/records">
                예시로 둘러보기
              </Link>
            </div>
          </section>
        ) : !ready && path !== '/' ? (
          <section className="empty-state">
            <h1 tabIndex={-1}>기록 불러오기</h1>
            <p role="status">기기에 보관한 기록을 불러오고 있어요.</p>
          </section>
        ) : (
          <div ref={setPageSlot}>
            {Object.entries(navigation.pages).map(([section, page]) => (
              <RetainedPage
                key={section}
                visible={navigation.activePageKey === section}
                slot={pageSlot}
                pageAddress={`${page.pathname}${page.search}${page.hash}`}
                onBackgroundNavigate={(to, options) => navigation.background(page, to, options)}
              >
                <PageRoutes key={`${page.pathname}${page.search}`} location={page} mode={mode} />
              </RetainedPage>
            ))}
            {!navigation.section && (
              <RetainedPage key="other" visible slot={pageSlot}>
                <PageRoutes
                  key={`${location.pathname}${location.search}`}
                  location={location}
                  mode={mode}
                />
              </RetainedPage>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function PageRoutes({
  location,
  mode,
}: {
  location: Location;
  mode: ReturnType<typeof useWorkspace>;
}) {
  return (
    <LoadBoundary key={location.pathname}>
      <Suspense fallback={<p role="status">상담 화면을 불러오고 있어요.</p>}>
        <Routes location={location}>
          <Route
            index
            element={
              mode === 'example' ? <Navigate to="/examples/records" replace /> : <HomePage />
            }
          />
          <Route path="login" element={<LoginPage />} />
          <Route path="signup" element={<SignupPage />} />
          <Route path="backup" element={<BackupPage />} />
          <Route path="account/designer" element={<DirectoryEditor />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="auth/complete" element={<AuthCompletePage />} />
          <Route path="records" element={<RecordList />} />
          <Route path="records/new" element={<CutForm />} />
          <Route path="records/:id/complete" element={<RecordComplete />} />
          <Route path="records/:id/progress/:progressId/complete" element={<RecordComplete />} />
          <Route path="records/:id" element={<RecordDetail />} />
          <Route path="records/:id/edit" element={<CutForm />} />
          <Route path="records/:id/progress/new" element={<ProgressForm />} />
          <Route path="records/:id/progress/:progressId/edit" element={<ProgressForm />} />
          <Route path="designers" element={<DesignerList />} />
          <Route path="designers/:id" element={<DesignerDetail />} />
          <Route path="consultations" element={<ConsultationList />} />
          <Route path="consultations/received" element={<ReceivedList />} />
          <Route path="consultations/received/:id" element={<ReceivedDetail />} />
          <Route path="consultations/received/:id/complete" element={<ReceivedComplete />} />
          <Route path="consultations/new" element={<ConsultationNew />} />
          <Route path="consultations/:id/complete" element={<ConsultationComplete />} />
          <Route path="consultations/:id" element={<ConsultationDetail />} />
          <Route path="consultations/materials" element={<MaterialsPage />} />
          <Route path="consultations/request" element={<RequestPage />} />
          <Route path="consultations/previews/:id" element={<PreviewPage />} />
          <Route path="requests" element={<RequestList />} />
          <Route path="requests/materials" element={<MaterialsPage />} />
          <Route path="requests/write" element={<RequestPage />} />
          <Route path="requests/review" element={<ReviewPage />} />
          <Route path="requests/complete/:id" element={<CompletePage />} />
          <Route path="requests/previews/:id" element={<PreviewPage />} />
          <Route
            path="*"
            element={
              <Missing title="페이지를 찾을 수 없어요" message="내 기록에서 다시 시작해 주세요." />
            }
          />
        </Routes>
      </Suspense>
    </LoadBoundary>
  );
}

function AccountScopedPrototype() {
  const { activeMember, state: auth } = useAuth();
  const { pathname } = useLocation();
  const example = pathname === '/examples' || pathname.startsWith('/examples/');
  const scope = activeMember ? `member-${activeMember.id}` : 'guest';
  return (
    <PrototypeProvider scope={scope} adoptGuest={auth.status === 'authenticated'}>
      <CloudSync />
      <FeedbackProvider key={`${scope}:${example ? 'example' : 'personal'}`}>
        <Routes>
          <Route
            path="/examples/*"
            element={
              <PrototypeProvider seed="example">
                <WorkspaceContext.Provider value="example">
                  <ConsultationProvider>
                    <Layout />
                  </ConsultationProvider>
                </WorkspaceContext.Provider>
              </PrototypeProvider>
            }
          />
          <Route
            path="/*"
            element={
              // 실제 상담은 로그인한 회원의 서버 자료
              <ConsultationProvider member={auth.status === 'authenticated' ? auth.member : null}>
                <Layout />
              </ConsultationProvider>
            }
          />
        </Routes>
      </FeedbackProvider>
    </PrototypeProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AccountScopedPrototype />
      </AuthProvider>
    </BrowserRouter>
  );
}
