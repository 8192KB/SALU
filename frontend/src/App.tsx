import { useEffect, useRef, useState } from 'react';
import { fetchHealth } from './api';
import LoginPanel from './LoginPanel';
import type { HealthResponse } from './api';

type Connection =
  | { phase: 'checking' }
  | { phase: 'received'; health: HealthResponse }
  | { phase: 'unavailable' };

export default function App() {
  const [connection, setConnection] = useState<Connection>({ phase: 'checking' });
  const request = useRef<AbortController | null>(null);

  async function checkConnection() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setConnection({ phase: 'checking' });
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const health = await fetchHealth(controller.signal);
      if (request.current === controller) setConnection({ phase: 'received', health });
    } catch {
      if (request.current === controller) setConnection({ phase: 'unavailable' });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  useEffect(() => {
    void checkConnection();
    return () => { request.current?.abort(); request.current = null; };
  }, []);

  const health = connection.phase === 'received' ? connection.health : null;
  const ready = health?.status === 'UP';
  const message = connection.phase === 'checking' ? '서버 연결 확인 중'
    : health?.message ?? '서버에 연결할 수 없습니다. 서버 실행 로그에서 환경변수 누락 또는 DB 연결 오류를 확인하세요.';

  return (
    <div className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="SALU 홈">salu<span>.</span></a>
        <span className="header-note">기록에서 시작하는 헤어 케어</span>
        <span className="environment-label">개발 준비</span>
      </header>

      <main>
        <section className="intro" aria-labelledby="intro-title">
          <div className="intro-copy">
            <p className="eyebrow">MY HAIR, MY STORY</p>
            <h1 id="intro-title">나의 커트 기록이,<br />다음 상담의 시작.</h1>
            <p className="intro-description">커트와 그 이후의 변화를 한곳에.<br />필요한 기록을 골라 디자이너와 이야기를 이어갑니다.</p>
            <div className="principles"><span>나만의 기록</span><i aria-hidden="true" /><span>선택한 자료로 상담</span><i aria-hidden="true" /><span>동의한 내용만 공개</span></div>
          </div>
          <div className="story-art" aria-hidden="true">
            <div className="art-orbit" />
            <div className="art-card card-back"><span>DAY 14</span><div className="hair-lines" /><p>조금 달라진 오늘</p></div>
            <div className="art-card card-front"><span>DAY 01</span><div className="hair-lines" /><p>새로운 기록의 시작</p></div>
            <span className="art-caption">YOUR NEXT CHAPTER</span>
          </div>
        </section>

        <LoginPanel />

        <section className="connection-card" aria-labelledby="connection-title">
          <div className="connection-heading">
            <div><p className="eyebrow">GETTING STARTED</p><h2 id="connection-title">개발 환경 연결</h2></div>
            <button onClick={() => void checkConnection()} disabled={connection.phase === 'checking'}>
              <span aria-hidden="true">↻</span> {connection.phase === 'checking' ? '확인 중' : '다시 확인'}
            </button>
          </div>
          <div className="services">
            <Service label="React 화면" detail="브라우저 실행" state="UP" />
            <Service label="Spring 서버" detail="API 연결" state={health ? 'UP' : connection.phase === 'checking' ? 'CHECKING' : 'DOWN'} />
            <Service label="MySQL DB" detail="독립 개발 데이터베이스" state={health?.database ?? (connection.phase === 'checking' ? 'CHECKING' : 'UNKNOWN')} />
          </div>
          <div className={`connection-message ${ready ? 'is-ready' : ''}`} role="status" aria-live="polite">
            <span className="status-dot" aria-hidden="true" /><p>{message}</p>
            {health && <time dateTime={health.checkedAt}>{new Date(health.checkedAt).toLocaleTimeString('ko-KR')} 확인</time>}
          </div>
        </section>

        <section className="next-step" aria-labelledby="next-title">
          <div><p className="eyebrow">UP NEXT</p><h2 id="next-title">차근차근, 하나씩.</h2><p>로그인 다음에는 회원가입과 개인 기록을 연결합니다.</p></div>
          <ol className="roadmap"><li><span>01</span> 회원·권한</li><li><span>02</span> 커트·경과·사진</li><li><span>03</span> 디자이너·상담</li><li><span>04</span> 개인 후기·커뮤니티</li></ol>
        </section>
      </main>
      <footer><span className="footer-logo">salu.</span><p>회원가입과 기록 기능은 다음 단계에서 추가할 예정입니다.</p><span>Personal hair journal</span></footer>
    </div>
  );
}

function Service({ label, detail, state }: { label: string; detail: string; state: 'UP' | 'DOWN' | 'CHECKING' | 'UNKNOWN' }) {
  const states = { UP: '연결 정상', DOWN: '연결 실패', CHECKING: '확인 중', UNKNOWN: '확인 불가' };
  return <div className="service"><div><h3>{label}</h3><p>{detail}</p></div><span className={`service-state state-${state.toLowerCase()}`}><i aria-hidden="true" />{states[state]}</span></div>;
}
