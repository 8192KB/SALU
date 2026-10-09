import { useEffect } from 'react';
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
  useEffect(() => {
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <Link className="brand" to="/" aria-label="SALU 홈">
            salu<span>.</span>
          </Link>
          <nav aria-label="주 메뉴">
            <NavLink to="/" end>
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
          <span className="member-label">나의 헤어 기록</span>
        </div>
      </header>
      <div className="prototype-notice">
        <div>
          <span className="demo-badge">초기 화면 · 가상 데이터</span>
          <span>새로고침하면 작성한 내용이 초기화됩니다.</span>
          <button
            className="reset-button"
            onClick={() => {
              reset();
              navigate('/');
            }}
          >
            <Icon name="reset" size={14} />
            초기화
          </button>
        </div>
      </div>
      <main id="main-content">
        <Routes>
          <Route path="/" element={<RecordList />} />
          <Route path="/records/new" element={<CutForm />} />
          <Route path="/records/:id" element={<RecordDetail />} />
          <Route path="/records/:id/progress/new" element={<ProgressForm />} />
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

export default function App() {
  return (
    <BrowserRouter>
      <PrototypeProvider>
        <Layout />
      </PrototypeProvider>
    </BrowserRouter>
  );
}
