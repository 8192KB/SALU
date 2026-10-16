import { draftDesigner } from './directory-cache';
import { useDirectory } from './directory';
import { Link } from './workspace';
import { Icon, PageHeading, PhotoThumbnail } from './components';
import { usePrototype } from './prototype/context';
import { cutTitle } from './prototype/dates';
import { previewUrl, unfinishedDrafts } from './prototype/request-flow';

export function RequestList() {
  const { state, requestDrafts, resumeUrl } = usePrototype();
  const directory = useDirectory(state);
  const drafts = unfinishedDrafts(state, requestDrafts);
  const previews = [...state.previews].reverse();
  return (
    <>
      <PageHeading
        title="커트 준비"
        description="지난 기록을 보고, 다음 커트에서 원하는 점을 정리해 보세요."
        action={
          state.cuts.length > 0 ? (
            <Link className="button primary" to="/requests/materials">
              <Icon name="plus" />새 커트 준비
            </Link>
          ) : undefined
        }
      />
      <Link className="button" to="/designers">
        디자이너 찾기
      </Link>
      {drafts.length > 0 && (
        <section className="request-list-section">
          <div className="section-heading">
            <h2>작성 중</h2>
            <span className="count-label">{drafts.length}개</span>
          </div>
          <div className="saved-request-grid">
            {drafts.map((draft) => {
              const cut = state.cuts.find((value) => value.id === draft.cutId);
              const designer = draftDesigner(directory.designers, draft);
              const photo = state.photos.find(
                (value) => value.cutId === draft.cutId && !value.progressId,
              );
              return (
                <Link className="panel saved-request-card" key={draft.id} to={resumeUrl(draft)}>
                  <div className="saved-request-photo">
                    <PhotoThumbnail src={photo?.url} alt="준비할 커트 사진" />
                  </div>
                  <span className="request-status">
                    작성 중 · {designer ? `${designer.name} 디자이너` : '개인 준비'}
                  </span>
                  <h3>{cut ? cutTitle(cut.cutDate, cut.service) : '이전 커트의 요청'}</h3>
                  <p>
                    {draft.requests.find((item) => item.content.trim())?.content ||
                      '자료를 골랐어요. 원하는 점을 이어서 적어 주세요.'}
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
          <h2>준비한 내용</h2>
          <span className="count-label">{previews.length}개</span>
        </div>
        {previews.length ? (
          <div className="saved-request-grid">
            {previews.map((preview) => (
              <Link className="panel saved-request-card" key={preview.id} to={previewUrl(preview)}>
                <div className="saved-request-photo">
                  <PhotoThumbnail src={preview.photos[0]?.url} alt="준비한 커트 사진" />
                </div>
                <span className="request-status">
                  {preview.designer
                    ? `${preview.designer.name} 디자이너 · 상담 준비`
                    : '내 커트 준비'}
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
                  <span className="card-action">
                    내용 보기 <Icon name="arrow" size={16} />
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
            <Link
              className="button"
              to={state.cuts.length ? '/requests/materials' : '/records/new'}
            >
              {state.cuts.length ? '참고할 기록 고르기' : '먼저 커트 기록 남기기'}{' '}
              <Icon name="arrow" />
            </Link>
          </section>
        )}
      </section>
    </>
  );
}
