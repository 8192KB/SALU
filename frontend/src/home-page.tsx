import { Link } from 'react-router';
import { Icon } from './components';
import { usePrototype } from './prototype/context';

export function HomePage() {
  const { state } = usePrototype();
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
              <p>날짜와 좋았던 점부터 간단히 남겨요.</p>
            </div>
          </li>
          <li>
            <Icon name="calendar" size={24} />
            <div>
              <h3>
                변화가 느껴지면 경과를 남겨요 <small>선택</small>
              </h3>
              <p>집에서 손질하며 느낀 점을 이어 적어요.</p>
            </div>
          </li>
          <li>
            <Icon name="chat" size={24} />
            <div>
              <h3>다음 커트에서 원하는 점을 정리해요</h3>
              <p>참고할 자료를 고르고, 유지할 점과 바꿀 점을 정리해요.</p>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
