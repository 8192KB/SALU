import { useCallback, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from './auth/context';
import { Icon, PhotoThumbnail } from './components';
import { listSentConsultations } from './consultation-api';
import type { Consultation } from './consultation-api';
import { usePrototype } from './prototype/context';
import { cutTitle, daysAfter, today } from './prototype/dates';
import { useLiveRefresh } from './realtime';

export function HomePage() {
  const { state } = usePrototype();
  const auth = useAuth();
  // 로그인해서 기록이 있으면 소개 대신 내 최근 커트·상담·다음 할 일을 먼저 보여 줌(2026-11-17 사용자 결정)
  if (auth.state.status === 'authenticated' && state.cuts.length > 0)
    return <MyHome name={auth.state.member.displayName} />;
  return (
    <div className="home-page">
      <section className="home-intro">
        <h1 tabIndex={-1}>
          커트 기록,
          <br />
          남겨볼까요?
        </h1>
        <p className="home-description">
          좋았던 점과 이후 변화를 남겨, <br className="home-line-break" />
          다음 커트 때 원하는 내용을 쉽게 설명하세요.
        </p>
        <Link className="button primary home-start" to="/records/new">
          <Icon name="plus" />
          커트 기록 남기기
        </Link>
        <div className="home-links">
          {state.cuts.length > 0 && <Link to="/records">내 기록 보기</Link>}
          <Link to="/examples/records">
            예시로 둘러보기 <Icon name="arrow" size={16} />
          </Link>
        </div>
      </section>
      <section className="home-journey" aria-label="SALU 사용 방법">
        <h2>남긴 기록이 다음 커트의 힌트가 돼요</h2>
        <ol>
          <li>
            <Icon name="cut" size={24} />
            <div>
              <h3>커트한 날을 기록해요</h3>
              <p>날짜와 좋았던 점부터 간단히 남겨 보세요.</p>
            </div>
          </li>
          <li>
            <Icon name="calendar" size={24} />
            <div>
              <h3>
                변화가 느껴지면 경과를 남겨요 <small>선택</small>
              </h3>
              <p>집에서 손질하며 느낀 점을 이어 적어 보세요.</p>
            </div>
          </li>
          <li>
            <Icon name="chat" size={24} />
            <div>
              <h3>다음 커트에서 원하는 점을 정리해요</h3>
              <p>지난 기록을 보며 유지할 점과 바꿀 점을 정리해 보세요.</p>
            </div>
          </li>
          <li>
            <Icon name="consult" size={24} />
            <div>
              <h3>
                정리한 내용으로 디자이너에게 상담해요 <small>선택</small>
              </h3>
              <p>디자이너의 답변은 상담 내역에서 볼 수 있어요.</p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}

const STATUS_TEXT: Record<Consultation['status'], string> = {
  PAYMENT_PENDING: '결제 대기',
  REQUESTED: '답변 대기',
  ANSWERED: '답변 도착',
  CANCELED: '취소함',
};

function MyHome({ name }: { name: string }) {
  const { state } = usePrototype();
  const auth = useAuth();
  const member = auth.state.status === 'authenticated' ? auth.state.member : null;
  const [consultations, setConsultations] = useState<Consultation[] | null>(null);
  const load = useCallback(() => {
    if (!member) return;
    return listSentConsultations(member).then(
      (items) => setConsultations(items ?? []),
      // 상담을 못 불러와도 기록 쪽은 그대로 보여 줌
      () => setConsultations([]),
    );
  }, [member]);
  useLiveRefresh(load);
  const latest = [...state.cuts].sort((a, b) => b.cutDate.localeCompare(a.cutDate))[0];
  const photo = state.photos.find((item) => item.cutId === latest.id && !item.progressId);
  const progress = state.progress
    .filter((entry) => entry.cutId === latest.id)
    .sort((a, b) => b.observedOn.localeCompare(a.observedOn));
  const days = daysAfter(latest.cutDate, today());
  const recent = (consultations ?? [])
    .filter((item) => item.status !== 'CANCELED')
    .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
    .slice(0, 2);
  return (
    <div className="my-home">
      <h1 tabIndex={-1}>{name}님의 커트</h1>
      <section className="my-home-card" aria-labelledby="my-home-latest">
        <h2 id="my-home-latest">최근 커트</h2>
        <Link className="my-home-cut" to={`/records/${latest.id}`}>
          <PhotoThumbnail src={photo?.url} alt={photo ? photo.caption : '커트 대표 사진'} />
          <span>
            <strong>{cutTitle(latest.cutDate, latest.service)}</strong>
            <small>{days > 0 ? `커트한 지 ${days}일` : '오늘 커트'}</small>
            <small>
              {progress.length
                ? `마지막 경과: ${progress[0].discomfort || progress[0].styling || '메모 없음'}`
                : '아직 남긴 경과가 없어요'}
            </small>
          </span>
          <Icon name="arrow" size={18} />
        </Link>
        <Link className="button primary full" to={`/records/${latest.id}/progress/new`}>
          <Icon name="plus" size={20} />
          경과 남기기
        </Link>
      </section>
      {recent.length > 0 && (
        <section className="my-home-card" aria-labelledby="my-home-consult">
          <div className="my-home-heading">
            <h2 id="my-home-consult">상담</h2>
            <Link className="text-link" to="/consultations">
              전체 보기
            </Link>
          </div>
          <ul className="my-home-rows">
            {recent.map((item) => (
              <li key={item.id}>
                <Link to={`/consultations/${item.id}`}>
                  <span>
                    <strong>{item.designer.name} 디자이너</strong>
                    <small>{cutTitle(item.attachment.cutDate, item.attachment.service)}</small>
                  </span>
                  <span className={`my-home-status${item.status === 'ANSWERED' ? ' done' : ''}`}>
                    {STATUS_TEXT[item.status]}
                    {item.unreadCount > 0 && (
                      <b aria-label={`새 메시지 ${item.unreadCount}개`}>{item.unreadCount}</b>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="my-home-card" aria-labelledby="my-home-next">
        <h2 id="my-home-next">다음 할 일</h2>
        <ul className="my-home-rows">
          <li>
            <Link to={`/records/${latest.id}`}>
              <span>
                <strong>다음 커트 준비</strong>
                <small>{cutTitle(latest.cutDate, latest.service)} 기록을 보고 원하는 점 정리</small>
              </span>
              <Icon name="arrow" size={16} />
            </Link>
          </li>
          <li>
            <Link to="/records/new">
              <span>
                <strong>새 커트 기록</strong>
                <small>오늘 커트했다면 좋았던 점부터</small>
              </span>
              <Icon name="arrow" size={16} />
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
