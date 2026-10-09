import { Link } from 'react-router';
import { Icon, PageHeading } from './components';
import { usePrototype } from './prototype/context';
import { cutTitle } from './prototype/dates';
import { materialUrl, previewUrl, unfinishedDrafts } from './prototype/request-flow';

export function RequestList() {
  const { state, requestDrafts } = usePrototype();
  const drafts = unfinishedDrafts(state, requestDrafts);
  const previews = [...state.previews].reverse();
  return (
    <>
      <PageHeading
        title="요청 자료"
        description="작성 중인 내용과 완성한 준비본을 다시 확인하세요."
      />
      <p className="form-note list-notice">
        개인 준비본과 전송 전 미리보기입니다. 디자이너에게 보낸 상담 내역은 아닙니다.
      </p>
      {drafts.length > 0 && (
        <section className="request-list-section">
          <div className="section-heading">
            <h2>작성 중</h2>
            <span className="count-label">{drafts.length}개</span>
          </div>
          <div className="saved-request-grid">
            {drafts.map((draft) => {
              const cut = state.cuts.find((value) => value.id === draft.cutId);
              const designer = state.designers.find((value) => value.id === draft.designerId);
              return (
                <Link className="panel saved-request-card" key={draft.id} to={materialUrl(draft)}>
                  <span className="request-status">
                    작성 중 · {designer ? `${designer.name} 디자이너` : '개인 준비'}
                  </span>
                  <h3>{cut ? cutTitle(cut.cutDate, cut.service) : '이전 커트의 요청'}</h3>
                  <p>
                    {draft.requests.find((item) => item.content.trim())?.content ||
                      '자료를 선택했어요. 요청 내용을 이어서 적어 주세요.'}
                  </p>
                  <span className="text-link">
                    이어서 작성 <Icon name="arrow" size={17} />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}
      <section className="request-list-section">
        <div className="section-heading">
          <h2>만든 요청 자료</h2>
          <span className="count-label">{previews.length}개</span>
        </div>
        {previews.length ? (
          <div className="saved-request-grid">
            {previews.map((preview) => (
              <Link className="panel saved-request-card" key={preview.id} to={previewUrl(preview)}>
                <span className="request-status">
                  {preview.designer ? `${preview.designer.name} 디자이너 · 전송 전` : '개인 준비본'}
                </span>
                <h3>{cutTitle(preview.cut.cutDate, preview.cut.service)}</h3>
                <p>{preview.requests[0]?.content}</p>
                <div className="card-bottom">
                  <time dateTime={preview.createdAt}>
                    {new Date(preview.createdAt).toLocaleString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  <span>
                    미리보기 <span aria-hidden="true">↗</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <section className="panel empty-request">
            <Icon name="chat" size={28} />
            <h3>다음 커트에서 어떻게 요청할까요?</h3>
            <p className="muted">
              내 기록을 보고 그대로 둘 부분과 바꿀 부분, 물어볼 점을 정리해 보세요.
            </p>
            <Link className="button primary" to="/">
              내 기록에서 준비하기 <Icon name="arrow" />
            </Link>
          </section>
        )}
      </section>
    </>
  );
}
