import { draftDesigner } from './directory-cache';
import { useDirectory } from './directory';
import { Link } from './workspace';
import { FloatingAction, Icon, PageHeading, PhotoThumbnail } from './components';
import { usePrototype } from './prototype/context';
import { cutTitle, shortTime } from './prototype/dates';
import { newestPreviews, previewUrl, unfinishedDrafts } from './prototype/request-flow';

export function RequestList() {
  const { state, requestDrafts, resumeUrl } = usePrototype();
  const directory = useDirectory(state);
  const drafts = unfinishedDrafts(state, requestDrafts);
  const previews = newestPreviews(state.previews);
  return (
    <>
      <PageHeading title="커트 준비" />
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
                    {designer ? `${designer.name} 디자이너 상담 작성 중` : '작성 중'}
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
          {previews.length > 0 && <span className="count-label">{previews.length}개</span>}
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
                    ? `${preview.designer.name} 디자이너 상담 준비`
                    : '내 커트 준비'}
                </span>
                <h3>{cutTitle(preview.cut.cutDate, preview.cut.service)}</h3>
                <p>{preview.requests[0]?.content}</p>
                <div className="card-bottom">
                  <time dateTime={preview.createdAt}>{shortTime(preview.createdAt)}</time>
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
            <p className="muted">유지할 부분과 바꿀 부분, 물어볼 점을 정리해 보세요.</p>
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
      {/* 준비가 먼저이고 디자이너 찾기는 보조 길이라, 기록 목록의 아래 링크처럼 목록 아래 글자 링크로 둠 */}
      <div className="journal-links">
        <Link className="journal-next text-link" to="/designers">
          디자이너 찾기 <Icon name="arrow" size={16} />
        </Link>
      </div>
      {/* 아직 준비가 없으면 아래 빈 화면의 버튼 하나로만 시작하게 함 */}
      {state.cuts.length > 0 && (previews.length > 0 || drafts.length > 0) && (
        <FloatingAction to="/requests/materials">
          <Icon name="plus" size={20} />새 커트 준비
        </FloatingAction>
      )}
    </>
  );
}
