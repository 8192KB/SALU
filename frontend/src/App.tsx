import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router';
import { Icon, Missing } from './components';
import { PrototypeProvider, usePrototype } from './prototype/context';
import { CutForm, ProgressForm, RecordDetail, RecordList } from './record-pages';
import { RequestList } from './request-pages';
import { Dialog } from './dialog';
import { FeedbackProvider } from './feedback';
import { AuthProvider, useAuth } from './auth/context';
import { AccountControls, LoginPage, SessionNotice } from './auth/pages';
import {
  DesignerDetail,
  DesignerList,
  MaterialsPage,
  PreviewPage,
  RequestPage,
} from './consultation-pages';

function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { reset } = usePrototype();
  const { initialized, state: auth } = useAuth();
  const [resetOpen, setResetOpen] = useState(false);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <div className={`app-shell${location.pathname === '/' ? ' journal-screen' : ''}`}>
      <header className="app-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="SALU 홈">
            salu<span>.</span>
          </Link>
          <nav aria-label="주 메뉴">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive || location.pathname.startsWith('/records/') ? 'active' : undefined
              }
            >
              <Icon name="cut" />내 기록
            </NavLink>
            <NavLink to="/designers">
              <Icon name="user" />
              디자이너
            </NavLink>
            <NavLink to="/requests">
              <Icon name="chat" />
              요청 자료
            </NavLink>
          </nav>
          <AccountControls />
        </div>
      </header>
      <div className="prototype-notice">
        <div>
          <span className="demo-badge">
            {auth.status === 'prototype' ? '초기 화면 · 가상 데이터' : '예시 기록 · 서버 저장 전'}
          </span>
          <span>새로고침·로그인·로그아웃하면 예시 자료가 초기화됩니다.</span>
          <button className="reset-button" onClick={() => setResetOpen(true)}>
            <Icon name="reset" size={14} />
            초기화
          </button>
        </div>
      </div>
      <SessionNotice />
      <Dialog
        open={resetOpen}
        title="작성한 내용을 초기화할까요?"
        onClose={() => setResetOpen(false)}
      >
        <p>추가한 기록·사진, 작성 중인 요청과 미리보기가 사라지고 예시 데이터로 돌아갑니다.</p>
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
              navigate('/');
            }}
          >
            모두 초기화
          </button>
        </div>
      </Dialog>
      <main id="main-content">
        {!initialized ? (
          <section className="empty-state">
            <h1 tabIndex={-1}>로그인 상태 확인</h1>
            <p role="status">계정 정보를 확인하고 있습니다.</p>
          </section>
        ) : (
          <div className="route-content" key={location.pathname}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<RecordList />} />
              <Route path="/records/new" element={<CutForm />} />
              <Route path="/records/:id" element={<RecordDetail />} />
              <Route path="/records/:id/edit" element={<CutForm />} />
              <Route path="/records/:id/progress/new" element={<ProgressForm />} />
              <Route path="/records/:id/progress/:progressId/edit" element={<ProgressForm />} />
              <Route path="/designers" element={<DesignerList />} />
              <Route path="/designers/:id" element={<DesignerDetail />} />
              <Route path="/consultations/materials" element={<MaterialsPage />} />
              <Route path="/consultations/request" element={<RequestPage />} />
              <Route path="/consultations/previews/:id" element={<PreviewPage />} />
              <Route path="/requests" element={<RequestList />} />
              <Route path="/requests/materials" element={<MaterialsPage />} />
              <Route path="/requests/write" element={<RequestPage />} />
              <Route path="/requests/previews/:id" element={<PreviewPage />} />
              <Route
                path="*"
                element={
                  <Missing
                    title="페이지를 찾을 수 없습니다"
                    message="내 기록에서 다시 시작해 주세요."
                  />
                }
              />
            </Routes>
          </div>
        )}
      </main>
      <footer className="app-footer">
        <span className="brand">
          salu<span>.</span>
        </span>
        <span>나의 기록에서 시작하는 상담</span>
        <span>초기 화면</span>
      </footer>
    </div>
  );
}

function AccountScopedPrototype() {
  const { memoryEpoch } = useAuth();
  return (
    <PrototypeProvider key={memoryEpoch}>
      <FeedbackProvider>
        <Layout />
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
