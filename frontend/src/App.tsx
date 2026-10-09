import { useEffect } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { Icon, Missing, PageHeading } from './components';

function Layout() {
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return <div className="app-shell">
    <header className="app-header"><div className="header-inner">
      <Link className="brand" to="/" aria-label="SALU 홈">salu<span>.</span></Link>
      <nav aria-label="주 메뉴"><NavLink to="/" end><Icon name="cut"/>내 기록</NavLink><NavLink to="/designers"><Icon name="user"/>디자이너</NavLink></nav>
      <span className="member-label">나의 헤어 기록</span>
    </div></header>
    <div className="prototype-notice"><div><span className="demo-badge">초기 화면 · 가상 데이터</span><span>새로고침하면 작성한 내용이 초기화됩니다.</span></div></div>
    <main id="main-content"><Routes>
      <Route path="/" element={<Placeholder title="나의 커트 기록" description="커트한 날부터 집에서 느낀 변화까지, 하나의 기록에."/>}/>
      <Route path="/records/new" element={<Placeholder title="이번 머리 남기기"/>}/>
      <Route path="/records/:id" element={<Placeholder title="커트 기록 · 경과"/>}/>
      <Route path="/records/:id/progress/new" element={<Placeholder title="시간이 지난 뒤 남기기"/>}/>
      <Route path="/designers" element={<Placeholder title="디자이너 찾기"/>}/>
      <Route path="/designers/:id" element={<Placeholder title="디자이너 프로필"/>}/>
      <Route path="/consultations/materials" element={<Placeholder title="상담 자료 선택"/>}/>
      <Route path="/consultations/request" element={<Placeholder title="이번 요청 정리"/>}/>
      <Route path="/consultations/previews/:id" element={<Placeholder title="상담 요청 미리보기"/>}/>
      <Route path="*" element={<Missing title="페이지를 찾을 수 없습니다" message="내 기록에서 다시 시작해 주세요."/>}/>
    </Routes></main>
    <footer className="app-footer"><span className="brand">salu<span>.</span></span><span>나의 기록에서 시작하는 상담</span><span>초기 화면</span></footer>
  </div>;
}

function Placeholder({ title, description }: { title: string; description?: string }) {
  return <><PageHeading eyebrow="MY HAIR JOURNAL" title={title} description={description}/><section className="panel empty-state"><p>화면 구성 중</p><Link className="button primary" to="/records/new">커트 기록 작성<Icon name="plus"/></Link></section></>;
}

export default function App() { return <BrowserRouter><Layout/></BrowserRouter>; }
