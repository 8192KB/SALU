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

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { reset, ready } = usePrototype();
  const { repository: consultations } = useConsultations();
  const mode = useWorkspace();
  useEffect(() => {
    // 미리 받기 실패는 실제 화면 진입 때 LoadBoundary가 안내함
    if (mode === 'example') import('./consultation-flow').catch(() => {});
  }, [mode]);
  const navigation = useMainNavigation(ready);
  const [pageSlot, setPageSlot] = useState<HTMLDivElement | null>(null);
  const path =
    mode === 'example' ? location.pathname.replace(/^\/examples/, '') || '/' : location.pathname;
  const [resetOpen, setResetOpen] = useState(false);
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
              {mode === 'example' &&
                navigation.menu(
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
      {mode !== 'example' && path !== '/' && path !== '/login' && path !== '/signup' ? (
        <StorageNotice compact={focused} />
      ) : null}
      {path === '/login' || path === '/signup' || path === '/account' ? null : (
        <SessionNotice compact />
      )}
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
        {!ready && path !== '/' ? (
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
  const { activeMember } = useAuth();
  const { pathname } = useLocation();
  const example = pathname === '/examples' || pathname.startsWith('/examples/');
  const scope = activeMember ? `member-${activeMember.id}` : 'guest';
  return (
    <PrototypeProvider scope={scope}>
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
          <Route path="/*" element={<Layout />} />
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
