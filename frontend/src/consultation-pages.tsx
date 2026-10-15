import { draftDesigner, refreshDirectory } from './directory-cache';
import { useDirectory } from './directory';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Completion } from './completion';
import { useActivePage } from './main-navigation';
import type { FormEvent } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router';
import { useBackTrail } from './back-trail';
import { Link, useNavigate, useWorkspace } from './workspace';
import {
  Alert,
  Avatar,
  BackLink,
  Icon,
  Missing,
  PageHeading,
  PhotoPlaceholder,
  PhotoThumbnail,
  focusFirstError,
} from './components';
import { Field, PhotoList, PhotoButton } from './fields';
import { MaterialChoice } from './material-choice';
import { AnimatedDetails } from './animated-details';
import { AreaChips, ProgressBlock } from './record-pages';
import { usePrototype } from './prototype/context';
import { prepareRequest } from './prototype/memory-repository';
import { AREAS, INTENTS } from './prototype/types';
import type { Area, RequestDraft, DesignerProfile, Intent, RequestItem } from './prototype/types';
import { cutTitle, daysAfter, displayDate } from './prototype/dates';
import {
  completeUrl,
  reviewUrl,
  draftFromPreview,
  latestMaterials,
  materialSource,
  materialUrl,
  newRequest,
  newRequestDraft,
  photoOrigin,
  previewUrl,
  requestUrl,
  selectedCount,
} from './prototype/request-flow';

const ConsultationDesignerProfile = lazy(() =>
  import('./consultation-flow').then((module) => ({ default: module.ConsultationDesignerProfile })),
);

function currentSalon(designer: DesignerProfile) {
  return designer.affiliations.find((value) => value.current)?.salonName ?? '소속 미등록';
}
function profileUrl(id: string, record: string | null, preview?: string | null) {
  const search = new URLSearchParams();
  if (record) search.set('record', record);
  if (preview) search.set('preview', preview);
  return `/designers/${id}${search.size ? `?${search}` : ''}`;
}
function Steps({ current }: { current: number }) {
  return (
    <ol className="steps" aria-label="커트 준비 단계">
      {['자료 고르기', '원하는 점 적기', '내용 확인'].map((label, index) => (
        <li
          key={label}
          className={index === current ? 'active' : index < current ? 'done' : ''}
          aria-current={index === current ? 'step' : undefined}
        >
          <b>{index < current ? <Icon name="check" size={14} /> : index + 1}</b>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
function SelectedDesigner({ designer }: { designer: DesignerProfile }) {
  return (
    <div className="selected-designer">
      <Avatar name={designer.name} src={designer.avatarUrl} />
      <div>
        <strong>{designer.name} 디자이너</strong>
        <p>{currentSalon(designer)}</p>
      </div>
    </div>
  );
}

function SelectedMaterials({
  draft,
  onUse,
}: {
  draft: RequestDraft;
  onUse: (area: Area, intent: Intent, content: string) => void;
}) {
  const { state } = usePrototype();
  const [initialOpen] = useState(() => window.matchMedia('(min-width: 701px)').matches);
  const source = materialSource(state, draft);
  if (!source) return null;
  const cut = source.cut;
  const progress = source.progress
    .filter((entry) => draft.progressIds.includes(entry.id))
    .sort((a, b) => a.observedOn.localeCompare(b.observedOn));
  const photos = source.photos.filter((photo) => draft.photoIds.includes(photo.id));
  return (
    <aside className="sidebar request-reference" aria-label="요청에 첨부할 자료">
      <section className="sticky-summary">
        <h2>참고할 지난 기록</h2>
        <AnimatedDetails
          className="reference-details optional-fields"
          defaultOpen={initialOpen}
          summary={
            <span className="reference-context">
              <span>지난 커트 · {displayDate(cut.cutDate)}</span>
              <span className="reference-count">자료 {selectedCount(draft)}개 보기</span>
            </span>
          }
        >
          <div className="reference-body" role="region" aria-label="선택한 자료 내용" tabIndex={0}>
            <p className="reference-cut">{cutTitle(cut.cutDate, cut.service)}</p>
            {draft.includeGoodNote && cut.goodNote && (
              <article className="reference-entry">
                <h3>커트 당일 · 좋았던 점</h3>
                <p>{cut.goodNote}</p>
                <button
                  className="text-link reference-action"
                  type="button"
                  onClick={() =>
                    onUse(
                      cut.areas.includes('WHOLE') ? 'WHOLE' : (cut.areas[0] ?? 'WHOLE'),
                      'KEEP',
                      cut.goodNote,
                    )
                  }
                  disabled={draft.requests.some(
                    (item) => item.content === cut.goodNote && item.intent === 'KEEP',
                  )}
                >
                  그대로 둘 부분으로 추가
                </button>
              </article>
            )}
            {progress.map((entry) => (
              <article className="reference-entry" key={entry.id}>
                <h3>
                  {displayDate(entry.observedOn)}{' '}
                  <span className="day-label">D+{daysAfter(cut.cutDate, entry.observedOn)}</span>
                </h3>
                <AreaChips areas={entry.areas} />
                <dl>
                  {entry.discomfort && (
                    <div>
                      <dt>불편한 점</dt>
                      <dd>{entry.discomfort}</dd>
                      <button
                        className="text-link reference-action"
                        type="button"
                        onClick={() =>
                          onUse(
                            entry.areas.includes('WHOLE') ? 'WHOLE' : (entry.areas[0] ?? 'WHOLE'),
                            'ASK',
                            entry.discomfort,
                          )
                        }
                        disabled={draft.requests.some(
                          (item) => item.content === entry.discomfort && item.intent === 'ASK',
                        )}
                      >
                        이 불편을 요청에 추가
                      </button>
                    </div>
                  )}
                  {entry.styling && (
                    <div>
                      <dt>평소 손질</dt>
                      <dd>{entry.styling}</dd>
                    </div>
                  )}
                  {entry.question && (
                    <div>
                      <dt>물어볼 점</dt>
                      <dd>{entry.question}</dd>
                      <button
                        className="text-link reference-action"
                        type="button"
                        onClick={() =>
                          onUse(
                            entry.areas.includes('WHOLE') ? 'WHOLE' : (entry.areas[0] ?? 'WHOLE'),
                            'ASK',
                            entry.question,
                          )
                        }
                        disabled={draft.requests.some(
                          (item) => item.content === entry.question && item.intent === 'ASK',
                        )}
                      >
                        이 질문을 요청에 추가
                      </button>
                    </div>
                  )}
                </dl>
              </article>
            ))}
            {photos.length > 0 && <h3 className="reference-photos-heading">선택한 사진</h3>}
            {photos.map((photo) => (
              <figure className="reference-photo" key={photo.id}>
                <PhotoButton photo={photo} cutDate={cut.cutDate} />
                <figcaption>
                  <strong>{photoOrigin(photo, cut.cutDate)}</strong>
                  <span>{displayDate(photo.date)}</span>
                  <p>{photo.caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="form-note">고른 기록은 함께 담아요. 새로 부탁할 내용만 적어 주세요.</p>
        </AnimatedDetails>
      </section>
    </aside>
  );
}

export function DesignerList() {
  const { state } = usePrototype();
  const directory = useDirectory(state);
  const mode = useWorkspace();
  const [search] = useSearchParams();
  const location = useLocation();
  const previous = useBackTrail(location);
  const previewId = search.get('preview');
  const sourcePreview = state.previews.find((value) => value.id === previewId);
  const record = search.get('record') ?? sourcePreview?.cut.id ?? null;
  const cut = record ? state.cuts.find((value) => value.id === record) : undefined;
  // 이 커트를 해 준 디자이너를 먼저 보여 주고, 다른 디자이너는 원할 때 펼침
  const recorded = directory.designers.find((value) => value.id === cut?.designerProfileId);
  const [showAll, setShowAll] = useState(false);
  if (previewId && (!sourcePreview || sourcePreview.cut.id !== record))
    return <Missing title="준비한 요청 자료를 찾을 수 없어요" />;
  if (record && !cut) return <Missing title="선택한 커트 기록을 찾을 수 없어요" />;
  const others = directory.designers.filter((value) => value !== recorded);
  const card = (designer: DesignerProfile) => (
    <Link
      className="panel designer-card"
      to={profileUrl(designer.id, record, previewId)}
      key={designer.id}
    >
      <div className="designer-top">
        <Avatar name={designer.name} src={designer.avatarUrl} />
        <div>
          <h2>{designer.name} 디자이너</h2>
          <p>{currentSalon(designer)}</p>
        </div>
      </div>
      <div className="chip-row">
        {designer.specialties.map((value) => (
          <span className="chip" key={value}>
            {value}
          </span>
        ))}
      </div>
      <p>{designer.introduction.split('\n')[0]}</p>
      <div className="card-bottom">
        <span>
          {mode === 'example'
            ? `상담 후기 ${designer.reviewExamples.length}개`
            : '직접 등록한 프로필'}
        </span>
        <span>프로필 보기 ↗</span>
      </div>
    </Link>
  );
  return (
    <>
      <PageHeading
        title="디자이너 찾기"
        back={
          record ? (
            <BackLink to={`/records/${record}`}>참고할 지난 커트</BackLink>
          ) : previous ? (
            <BackLink to={previous.to}>{previous.label}</BackLink>
          ) : undefined
        }
        description={
          sourcePreview
            ? '준비한 내용을 보여 주고 싶은 디자이너를 골라 보세요.'
            : '소개와 상담 분야를 보고, 이야기를 나눌 디자이너를 골라 보세요.'
        }
      />
      {recorded && (
        <section className="designer-recorded" aria-labelledby="designer-recorded-heading">
          <h2 id="designer-recorded-heading">이 커트를 해 준 디자이너</h2>
          <div className="designer-grid">{card(recorded)}</div>
        </section>
      )}
      {recorded && !showAll ? (
        others.length > 0 && (
          <button type="button" className="button" onClick={() => setShowAll(true)}>
            다른 디자이너 찾기
          </button>
        )
      ) : (
        <section aria-label={recorded ? '다른 디자이너' : undefined}>
          {recorded && others.length > 0 && (
            <h2 className="designer-others-heading">다른 디자이너</h2>
          )}
          <div className="designer-grid">{others.map(card)}</div>
        </section>
      )}
      {mode !== 'example' && (
        <>
          {directory.loading && <p role="status">디자이너를 불러오고 있어요.</p>}
          {directory.error && (
            <div className="panel">
              <Alert message={directory.error} />
              <button className="button" type="button" onClick={() => void refreshDirectory()}>
                다시 불러오기
              </button>
            </div>
          )}
          {!directory.loading && !directory.error && !directory.designers.length && (
            <section className="empty-state">
              <h2>등록된 디자이너가 없어요</h2>
              <p>디자이너라면 소개를 등록해 보세요.</p>
              <Link className="button" to="/examples/designers">
                디자이너 예시로 둘러보기
              </Link>
            </section>
          )}
          <Link className="button" to="/account/designer">
            내 디자이너 프로필 등록·관리
          </Link>
        </>
      )}
    </>
  );
}

export function DesignerDetail() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const previewId = search.get('preview');
  const { state } = usePrototype();
  const directory = useDirectory(state);
  const mode = useWorkspace();
  const sourcePreview = state.previews.find((value) => value.id === previewId);
  const record = search.get('record') ?? sourcePreview?.cut.id ?? null;
  const designer = directory.designers.find((value) => value.id === id);
  if (mode !== 'example' && directory.loading)
    return <p role="status">프로필을 불러오고 있어요.</p>;
  if (mode !== 'example' && directory.error)
    return (
      <section className="panel">
        <Alert message={directory.error} />
        <button type="button" className="button" onClick={() => void refreshDirectory()}>
          다시 불러오기
        </button>
      </section>
    );
  if (
    !designer ||
    (record && !state.cuts.some((cut) => cut.id === record)) ||
    (previewId && (!sourcePreview || sourcePreview.cut.id !== record))
  )
    return <Missing title="프로필 또는 선택한 기록을 찾을 수 없어요" />;
  // 예시와 실제 공간이 같은 상담 동선을 씀. 실제 공간은 로그인한 회원의 서버 상담으로 보냄
  return (
    <Suspense fallback={<p role="status">프로필을 불러오고 있어요.</p>}>
      {/* 상담은 주소로 고른 커트만 첨부함. 개인 커트 준비 초안의 커트로 대신 채우지 않음 */}
      <ConsultationDesignerProfile designer={designer} record={record} preview={sourcePreview} />
    </Suspense>
  );
}

// 저장한 준비와 같은 초안을 뒤로 가기로 다시 열면 그 준비 내용으로 보냄. 고쳐 저장해 같은 준비가 늘지 않게 함
function useSavedDraftRedirect(draft: RequestDraft | null | undefined, active: boolean) {
  const { state } = usePrototype();
  const navigate = useNavigate();
  const saved = draft
    ? state.previews.find((value) => JSON.stringify(value.sourceDraft) === JSON.stringify(draft))
    : undefined;
  useEffect(() => {
    if (active && saved) navigate(previewUrl(saved), { replace: true });
  }, [active, saved, navigate]);
  return Boolean(saved);
}

export function MaterialsPage() {
  const active = useActivePage();
  const {
    state,
    requestDraft,
    requestDrafts,
    setRequestDraft,
    resumeRequestDraft,
    markRequestStep,
  } = usePrototype();
  const directory = useDirectory(state);
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const draftId = search.get('draft');
  const explicitDraft =
    draftId && Object.hasOwn(requestDrafts, draftId) ? requestDrafts[draftId] : undefined;
  const designerId = draftId ? explicitDraft?.designerId : (search.get('designer') ?? undefined);
  const designer =
    directory.designers.find((value) => value.id === designerId) ??
    draftDesigner([], explicitDraft);
  const cutId = draftId ? explicitDraft?.cutId : (search.get('record') ?? undefined);
  const record = state.cuts.find((value) => value.id === cutId);
  const draft = draftId
    ? explicitDraft
    : requestDraft?.designerId === designerId && requestDraft?.cutId === cutId
      ? requestDraft
      : undefined;
  const source = draft ? materialSource(state, draft) : null;
  useEffect(() => {
    if (!active) return;
    if (draftId) {
      if (explicitDraft) setRequestDraft(explicitDraft);
    } else if (record && (!designerId || designer)) {
      resumeRequestDraft(newRequestDraft(record.id, designerId));
    }
    setError('');
  }, [
    active,
    draftId,
    explicitDraft,
    record,
    designerId,
    designer,
    resumeRequestDraft,
    setRequestDraft,
  ]);
  useEffect(() => {
    if (active && !draftId && draft) navigate(materialUrl(draft), { replace: true });
  }, [active, draftId, draft, navigate]);
  const alreadySaved = useSavedDraftRedirect(draftId ? draft : undefined, active);
  useEffect(() => {
    if (active && draft && source) markRequestStep(draft.id, 'materials');
  }, [active, draft?.id, Boolean(source), markRequestStep]);
  if (search.has('draft') && !explicitDraft)
    return <Missing title="기록 또는 작성 중인 요청을 찾을 수 없어요" />;
  if (alreadySaved) return null;
  if (!search.has('draft') && !search.has('record') && (!designerId || designer))
    return (
      <>
        <Link className="back-link" to={designer ? profileUrl(designer.id, null) : '/requests'}>
          {designer ? '← 디자이너 프로필' : '← 커트 준비'}
        </Link>
        <Steps current={0} />
        <PageHeading
          title="참고할 지난 커트를 골라 주세요"
          description="이 기록을 바탕으로 다음 커트에서 원하는 점을 정리해요."
        />
        {state.cuts.length ? (
          <div className="reference-record-list">
            {state.cuts.map((cut) => (
              <Link
                className="panel reference-record-choice"
                key={cut.id}
                to={`/requests/materials?${new URLSearchParams({ record: cut.id, ...(designerId ? { designer: designerId } : {}) })}`}
              >
                <div className="reference-record-image">
                  <PhotoThumbnail
                    src={
                      state.photos.find((photo) => photo.cutId === cut.id && !photo.progressId)?.url
                    }
                    alt="커트 사진"
                  />
                </div>
                <div>
                  <time>{displayDate(cut.cutDate)}</time>
                  <h2>{cutTitle(cut.cutDate, cut.service)}</h2>
                  <p>{cut.goodNote || '당일 기록과 경과를 참고할 수 있어요.'}</p>
                </div>
                <Icon name="arrow" />
              </Link>
            ))}
          </div>
        ) : (
          <section className="record-empty">
            <h2>먼저 커트 기록을 남겨 주세요</h2>
            <p>날짜와 좋았던 점만 간단히 적어도 시작할 수 있어요.</p>
            <Link className="button primary" to="/records/new">
              커트 기록 남기기
            </Link>
          </section>
        )}
      </>
    );
  if ((draftId && !explicitDraft) || (designerId && !designer) || (!record && !source))
    return <Missing title="기록 또는 작성 중인 요청을 찾을 수 없어요" />;
  if (!draft || !source) return <p role="status">자료 확인 중</p>;
  const cut = source.cut;
  const progress = [...source.progress].sort((a, b) => a.observedOn.localeCompare(b.observedOn));
  const photos = source.photos;
  const eligibleCount = Number(Boolean(cut.goodNote)) + progress.length + photos.length;
  const allSelected =
    eligibleCount > 0 &&
    (!cut.goodNote || draft.includeGoodNote) &&
    progress.every((entry) => draft.progressIds.includes(entry.id)) &&
    photos.every((photo) => draft.photoIds.includes(photo.id));
  const update = (input: Partial<RequestDraft>) => {
    setError('');
    setRequestDraft({ ...draft, ...input });
  };
  const toggle = (key: 'progressIds' | 'photoIds', id: string) =>
    update({
      [key]: draft[key].includes(id)
        ? draft[key].filter((value) => value !== id)
        : [...draft[key], id],
    });
  return (
    <>
      <PageHeading
        back={
          <BackLink to={designer ? profileUrl(designer.id, cut.id) : `/records/${cut.id}`}>
            {designer ? '디자이너 프로필' : '커트 기록으로'}
          </BackLink>
        }
        title={designer ? '상담에 참고할 자료 선택' : '참고 자료 선택'}
        description="함께 담을 메모와 경과, 사진을 골라 주세요."
      />
      <Steps current={0} />
      <div className="two-column materials-layout">
        <section className="material-picker">
          {designer && <SelectedDesigner designer={designer} />}
          {source.frozen && (
            <div className="source-note">
              <strong>미리보기를 만들 때의 자료</strong>
              <p>기록을 수정해도 여기 담아 둔 내용은 그대로 남아요.</p>
              <button
                type="button"
                className="text-link"
                onClick={() => setRequestDraft(latestMaterials(state, draft))}
              >
                최신 기록에서 다시 고르기
              </button>
            </div>
          )}
          <div className="task-context">
            <Icon name="check" size={18} />
            <span>{cutTitle(cut.cutDate, cut.service)}</span>
          </div>
          <AnimatedDetails className="source-switch" summary="참고할 커트 바꾸기">
            <Field label="참고할 지난 커트">
              <select
                value={cut.id}
                disabled={source.frozen}
                onChange={(event) =>
                  setSearch({
                    ...(designer ? { designer: designer.id } : {}),
                    record: event.target.value,
                  })
                }
              >
                {state.cuts.map((value) => (
                  <option key={value.id} value={value.id}>
                    {cutTitle(value.cutDate, value.service)}
                  </option>
                ))}
              </select>
            </Field>
          </AnimatedDetails>
          <div className="material-toolbar">
            <span>선택할 자료 {eligibleCount}개</span>
            <button
              type="button"
              className="text-link"
              disabled={!eligibleCount}
              aria-label={allSelected ? '자료 전체 해제' : '자료 전체 선택'}
              aria-pressed={allSelected}
              onClick={() =>
                update({
                  includeGoodNote: !allSelected && Boolean(cut.goodNote),
                  progressIds: allSelected ? [] : progress.map((entry) => entry.id),
                  photoIds: allSelected ? [] : photos.map((photo) => photo.id),
                })
              }
            >
              {allSelected ? '전체 해제' : '전체 선택'}
            </button>
          </div>
          <div className="material-group">
            <h3>사진</h3>
            {photos.map((photo, index) => (
              <MaterialChoice
                key={photo.id}
                name={`사진 ${index + 1} 선택`}
                title={photoOrigin(photo, cut.cutDate)}
                summary={`${displayDate(photo.date)} · ${photo.caption}`}
                checked={draft.photoIds.includes(photo.id)}
                onChange={() => toggle('photoIds', photo.id)}
                image={<PhotoButton photo={photo} cutDate={cut.cutDate} />}
              />
            ))}
            {!photos.length && (
              <div className="material-empty-photo">
                <PhotoPlaceholder />
                <p>사진 없이 메모나 경과를 골라도 돼요.</p>
              </div>
            )}
          </div>
          <div className="material-group">
            <h3>커트 당일 메모</h3>
            {cut.goodNote ? (
              <MaterialChoice
                name="커트 당일 메모 선택"
                title="좋았던 점"
                summary={cut.goodNote}
                checked={draft.includeGoodNote}
                onChange={() => update({ includeGoodNote: !draft.includeGoodNote })}
                detailLabel="메모 전체 보기"
                detail={<p>{cut.goodNote}</p>}
              />
            ) : (
              <p className="muted">커트 당일 메모가 없어요.</p>
            )}
          </div>
          <div className="material-group">
            <h3>커트 이후 경과</h3>
            {progress.map((entry) => (
              <MaterialChoice
                key={entry.id}
                name={`경과 ${entry.observedOn} 선택`}
                title={
                  <>
                    {displayDate(entry.observedOn)}{' '}
                    <span className="day-label">D+{daysAfter(cut.cutDate, entry.observedOn)}</span>
                  </>
                }
                summary={entry.discomfort || entry.question || entry.styling}
                checked={draft.progressIds.includes(entry.id)}
                onChange={() => toggle('progressIds', entry.id)}
                detailLabel="경과 자세히 보기"
                detail={
                  <>
                    <AreaChips areas={entry.areas} />
                    <dl>
                      {entry.discomfort && (
                        <div>
                          <dt>불편한 점</dt>
                          <dd>{entry.discomfort}</dd>
                        </div>
                      )}
                      {entry.styling && (
                        <div>
                          <dt>평소 손질</dt>
                          <dd>{entry.styling}</dd>
                        </div>
                      )}
                      {entry.question && (
                        <div>
                          <dt>물어볼 점</dt>
                          <dd>{entry.question}</dd>
                        </div>
                      )}
                    </dl>
                  </>
                }
              />
            ))}
            {!progress.length && <p className="muted">아직 남긴 경과가 없어요.</p>}
          </div>
        </section>
        <aside className="sidebar material-selection-bar">
          <section className="panel sticky-summary">
            <h2>선택한 자료</h2>
            <p className="selection-count" aria-live="polite">
              <span className="mobile-selection-label">선택 </span>
              {selectedCount(draft)}
              <small style={{ fontSize: 14, marginLeft: 6 }}>개</small>
            </p>
            <p className="muted selection-detail">
              메모 {Number(draft.includeGoodNote)} · 경과 {draft.progressIds.length} · 사진{' '}
              {draft.photoIds.length}
            </p>
            <p className="muted selection-scope">커트 날짜·시술·부위와 고른 자료만 담아요.</p>
            {!designer && (
              <p className="muted selection-detail">자료를 고르지 않고 바로 적어도 돼요.</p>
            )}
            <Alert message={error} />
            <button
              className="button primary full"
              onClick={() => {
                if (designer && !selectedCount(draft))
                  setError('상담에 사용할 자료를 하나 이상 선택해 주세요.');
                else navigate(requestUrl(draft));
              }}
            >
              원하는 점 적기
              <Icon name="arrow" />
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}

export function RequestPage() {
  const active = useActivePage();
  const { state, requestDraft, requestDrafts, setRequestDraft, markRequestStep } = usePrototype();
  const directory = useDirectory(state);
  const [search] = useSearchParams();
  const draftId = search.get('draft');
  const draft = search.has('draft')
    ? draftId && Object.hasOwn(requestDrafts, draftId)
      ? requestDrafts[draftId]
      : undefined
    : requestDraft;
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const alreadySaved = useSavedDraftRedirect(draft, active);
  useEffect(() => {
    if (active && draft && !alreadySaved) {
      setRequestDraft(draft);
      markRequestStep(draft.id, 'write');
    }
  }, [active, draft, alreadySaved, setRequestDraft, markRequestStep]);
  const designer = draftDesigner(directory.designers, draft);
  const source = draft ? materialSource(state, draft) : null;
  if (alreadySaved) return null;
  if (search.has('draft') && !draft)
    return (
      <Missing
        title="작성 중인 요청을 찾을 수 없어요"
        message="준비할 기록과 초안을 찾을 수 없어요. 내 기록에서 다시 선택해 주세요."
      />
    );
  if (!draft || !source || (draft.designerId && (!designer || !selectedCount(draft))))
    return (
      <Missing
        title="먼저 요청에 사용할 기록을 선택해 주세요"
        message="내 기록에서 다음 커트를 준비해 보세요."
      />
    );
  const update = (input: Partial<RequestDraft>) => {
    setError('');
    setRequestDraft({ ...draft, ...input });
  };
  const useRecordedText = (area: Area, intent: Intent, content: string) => {
    const emptyIndex = draft.requests.findIndex((item) => !item.content.trim());
    const requests = [...draft.requests];
    const item =
      emptyIndex >= 0
        ? { ...requests[emptyIndex], area, intent, content }
        : newRequest(area, intent, content);
    if (emptyIndex >= 0) requests[emptyIndex] = item;
    else requests.push(item);
    update({ requests });
    requestAnimationFrame(() => document.getElementById(`request-${item.id}`)?.focus());
  };
  const updateRequest = (id: string, input: Partial<RequestItem>) =>
    update({
      requests: draft.requests.map((value) => (value.id === id ? { ...value, ...input } : value)),
    });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      prepareRequest(state, draft!);
      navigate(reviewUrl(draft!));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '자료와 요청을 다시 확인해 주세요.');
      focusFirstError(event.currentTarget);
    }
  }
  return (
    <section className="request-screen">
      <PageHeading
        back={
          <BackLink to={materialUrl(draft)} trail={false}>
            자료 선택
          </BackLink>
        }
        title="이번 커트에서 원하는 점을 적어 주세요"
        description="그대로 둘 부분과 바꿀 부분, 궁금한 점을 적어 주세요."
      />
      <Steps current={1} />
      <div className="two-column request-layout">
        <SelectedMaterials draft={draft} onUse={useRecordedText} />
        <form className="request-editor" onSubmit={submit} noValidate>
          <h2>이번 요청</h2>
          {source.frozen && (
            <p className="source-note">
              이전에 담아 둔 자료예요. 최근 기록을 담으려면 ‘자료 다시 고르기’를 눌러 주세요.
            </p>
          )}
          <Alert message={error} />
          {draft.requests.map((item, index) => (
            <section className="request-row" key={item.id}>
              {draft.requests.length > 1 && (
                <div className="request-row-head">
                  <strong>원하는 점 {index + 1}</strong>
                  <button
                    className="remove-link"
                    type="button"
                    aria-label={`원하는 점 ${index + 1} 삭제`}
                    onClick={() => {
                      const rest = draft.requests.filter((value) => value.id !== item.id);
                      update({ requests: rest });
                      // 지운 칸 대신 바로 앞(없으면 다음) 칸의 내용으로 초점을 옮김
                      const nextFocus = rest[Math.max(0, index - 1)];
                      requestAnimationFrame(() =>
                        document.getElementById(`request-${nextFocus?.id}`)?.focus(),
                      );
                    }}
                  >
                    삭제
                  </button>
                </div>
              )}
              <div className="field-grid">
                <Field label="부위">
                  <select
                    aria-label={`부위 ${index + 1}`}
                    value={item.area}
                    onChange={(event) =>
                      updateRequest(item.id, { area: event.target.value as Area })
                    }
                  >
                    {Object.entries(AREAS).map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="원하는 변화">
                  <select
                    aria-label={`원하는 변화 ${index + 1}`}
                    value={item.intent}
                    onChange={(event) =>
                      updateRequest(item.id, { intent: event.target.value as Intent })
                    }
                  >
                    {Object.entries(INTENTS).map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="원하는 내용">
                <textarea
                  aria-label={`원하는 내용 ${index + 1}`}
                  id={`request-${item.id}`}
                  required
                  maxLength={2000}
                  value={item.content}
                  onChange={(event) => updateRequest(item.id, { content: event.target.value })}
                  placeholder="옆머리 아래는 조금 짧게, 위쪽 길이는 남기고 싶어요"
                />
              </Field>
            </section>
          ))}
          <button
            className="text-link"
            type="button"
            onClick={() => {
              const added = newRequest();
              update({ requests: [...draft.requests, added] });
              requestAnimationFrame(() => document.getElementById(`request-${added.id}`)?.focus());
            }}
          >
            <Icon name="plus" size={17} />
            원하는 점 추가
          </button>
          <AnimatedDetails
            key={draft.id}
            className="optional-fields request-options"
            defaultOpen={Boolean(draft.homeStyling.trim() || draft.additionalQuestion.trim())}
            summary={
              <span className="request-options-summary">
                <span>손질 방법·추가 질문 더 적기</span>
                <small>
                  {draft.homeStyling.trim() || draft.additionalQuestion.trim()
                    ? [
                        draft.homeStyling.trim() && '손질 방법',
                        draft.additionalQuestion.trim() && '질문',
                      ]
                        .filter(Boolean)
                        .join(' · ') + ' 작성됨'
                    : '선택'}
                </small>
              </span>
            }
          >
            <div className="form-body">
              <Field label="집에서 손질" hint="선택 · 고른 기록에 없는 내용만 추가">
                <textarea
                  maxLength={2000}
                  value={draft.homeStyling}
                  onChange={(event) => update({ homeStyling: event.target.value })}
                  placeholder="드라이만 하고 있어요"
                />
              </Field>
              <Field label="추가 질문" hint="선택 · 고른 기록에 없는 내용만 추가">
                <textarea
                  maxLength={2000}
                  value={draft.additionalQuestion}
                  onChange={(event) => update({ additionalQuestion: event.target.value })}
                  placeholder="함께 물어볼 내용이 있나요?"
                />
              </Field>
            </div>
          </AnimatedDetails>
          {designer && (
            <p className="request-designer-context">
              <Icon name="user" size={18} />
              <span>
                {designer.name} 디자이너 · {currentSalon(designer)}
              </span>
            </p>
          )}
          <div className="form-actions request-editor-actions">
            <button type="submit" className="button primary">
              내용 확인하기 <Icon name="arrow" />
            </button>
          </div>
          <Link className="text-link request-reselect" to={materialUrl(draft)}>
            자료 다시 고르기
          </Link>
        </form>
      </div>
    </section>
  );
}

export function PreviewPage() {
  const { id } = useParams();
  const { state, setRequestDraft } = usePrototype();
  const navigate = useNavigate();
  const preview = state.previews.find((value) => value.id === id);
  if (!preview) return <Missing title="준비한 내용을 찾을 수 없어요" />;
  return (
    <>
      <PageHeading
        back={<BackLink to="/requests">준비 목록으로</BackLink>}
        title={preview.designer ? '디자이너에게 보여 줄 내용' : '다음 커트 준비 내용'}
        description={
          preview.designer
            ? '디자이너에게 보여 줄 자료와 원하는 커트를 정리했어요.'
            : '다음 커트에서 요청할 내용을 정리했어요.'
        }
      />
      <div className="two-column">
        <section>
          <section className="panel preview-block">
            <h2>다음 커트에서 원하는 점</h2>
            {preview.requests.map((item) => (
              <article className="request-summary" key={item.id}>
                <h3>
                  {AREAS[item.area]}
                  <span className="request-chip">{INTENTS[item.intent]}</span>
                </h3>
                <p>{item.content}</p>
              </article>
            ))}
            {preview.homeStyling && (
              <dl>
                <div>
                  <dt>집에서 손질</dt>
                  <dd>{preview.homeStyling}</dd>
                </div>
              </dl>
            )}
            {preview.additionalQuestion && (
              <dl>
                <div>
                  <dt>추가 질문</dt>
                  <dd>{preview.additionalQuestion}</dd>
                </div>
              </dl>
            )}
          </section>
          <section className="panel preview-block">
            {preview.designer ? (
              <div className="selected-designer">
                <Avatar name={preview.designer.name} />
                <div>
                  <strong>{preview.designer.name} 디자이너와 상담할 내용</strong>
                  <p>{preview.designer.salonName}</p>
                </div>
              </div>
            ) : (
              <p className="personal-label">개인 커트 준비</p>
            )}
            <h2>{cutTitle(preview.cut.cutDate, preview.cut.service)}</h2>
            <p className="muted">{displayDate(preview.cut.cutDate)}</p>
            <AreaChips areas={preview.cut.areas} />
            {preview.goodNote && (
              <dl>
                <div>
                  <dt>좋았던 점</dt>
                  <dd>{preview.goodNote}</dd>
                </div>
              </dl>
            )}
          </section>
          {preview.progress.length > 0 && (
            <section className="preview-block">
              <div className="section-heading">
                <h2>선택한 경과</h2>
                <span className="count-label">{preview.progress.length}건</span>
              </div>
              <div className="timeline">
                {preview.progress.map((entry) => (
                  <ProgressBlock key={entry.id} entry={entry} cutDate={preview.cut.cutDate} />
                ))}
              </div>
            </section>
          )}
          {preview.photos.length > 0 && (
            <section className="panel preview-block">
              <h2>선택한 사진</h2>
              <PhotoList photos={preview.photos} cutDate={preview.cut.cutDate} />
            </section>
          )}
        </section>
        <aside className="sidebar">
          <section className="panel sticky-summary">
            <h2>{preview.designer ? '보여 줄 내용 확인' : '다음 커트 준비 완료'}</h2>
            <p className="muted">고르지 않은 기록과 사진은 포함하지 않았어요.</p>
            <Link className="button primary full" to="/requests">
              준비 목록으로 <Icon name="arrow" />
            </Link>
            <button
              className="button full"
              style={{ marginTop: 12 }}
              onClick={() => {
                const draft = draftFromPreview(preview);
                setRequestDraft(draft);
                navigate(requestUrl(draft));
              }}
            >
              내용 수정
            </button>
            {!preview.designer && (
              <Link
                className="button full"
                style={{ marginTop: 12 }}
                to={`/designers?record=${encodeURIComponent(preview.cut.id)}&preview=${encodeURIComponent(preview.id)}`}
              >
                디자이너 선택하기 <Icon name="arrow" />
              </Link>
            )}
            <Link
              className="button full"
              style={{ marginTop: 12 }}
              to={`/records/${preview.cut.id}?preview=${encodeURIComponent(preview.id)}`}
            >
              원본 기록 보기
            </Link>
            <p className="form-note">정리한 내용은 커트 준비 목록에서 다시 볼 수 있어요.</p>
          </section>
        </aside>
      </div>
    </>
  );
}

function PreparationSummary({ prepared }: { prepared: ReturnType<typeof prepareRequest> }) {
  return (
    <div className="preparation-summary">
      <div className="prepared-cut">
        <div className="prepared-cut-photo">
          {prepared.photos[0] ? (
            <PhotoButton photo={prepared.photos[0]} cutDate={prepared.cut.cutDate} />
          ) : (
            <PhotoPlaceholder />
          )}
        </div>
        <div>
          <strong>{cutTitle(prepared.cut.cutDate, prepared.cut.service)}</strong>
          <p>
            {prepared.designer
              ? `${prepared.designer.name} 디자이너에게 보여 줄 내용`
              : '내 커트 준비'}
          </p>
          <span>
            메모 {Number(Boolean(prepared.goodNote))} · 경과 {prepared.progress.length} · 사진{' '}
            {prepared.photos.length}
          </span>
        </div>
      </div>
      <section className="review-requests">
        <h2>이번 요청</h2>
        {prepared.requests.map((item) => (
          <article key={item.id}>
            <h3>
              {AREAS[item.area]} <span className="request-chip">{INTENTS[item.intent]}</span>
            </h3>
            <p>{item.content}</p>
          </article>
        ))}
      </section>
      {(prepared.homeStyling || prepared.additionalQuestion) && (
        <dl>
          {prepared.homeStyling && (
            <div>
              <dt>평소 손질</dt>
              <dd>{prepared.homeStyling}</dd>
            </div>
          )}
          {prepared.additionalQuestion && (
            <div>
              <dt>추가 질문</dt>
              <dd>{prepared.additionalQuestion}</dd>
            </div>
          )}
        </dl>
      )}
      <AnimatedDetails className="review-materials" summary="선택한 자료 확인">
        {prepared.goodNote && (
          <section>
            <h3>좋았던 점</h3>
            <p>{prepared.goodNote}</p>
          </section>
        )}
        {prepared.progress.map((entry) => (
          <ProgressBlock key={entry.id} entry={entry} cutDate={prepared.cut.cutDate} />
        ))}
        {prepared.photos.length ? (
          <PhotoList photos={prepared.photos} cutDate={prepared.cut.cutDate} />
        ) : (
          <PhotoPlaceholder />
        )}
        {!prepared.goodNote && !prepared.progress.length && !prepared.photos.length && (
          <p>첨부 자료 없이 요청만 정리했어요.</p>
        )}
      </AnimatedDetails>
    </div>
  );
}

export function ReviewPage() {
  const { state, requestDrafts, repository } = usePrototype();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const draftId = search.get('draft');
  const draft =
    draftId && Object.hasOwn(requestDrafts, draftId) ? requestDrafts[draftId] : undefined;
  if (!draft) return <Missing title="작성 중인 요청을 찾을 수 없어요" />;
  let prepared: ReturnType<typeof prepareRequest> | undefined;
  let validationError = '';
  try {
    prepared = prepareRequest(state, draft);
  } catch (failure) {
    validationError =
      failure instanceof Error ? failure.message : '자료와 요청을 다시 확인해 주세요.';
  }
  async function save() {
    if (lock.current || !draft) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const existing = state.previews.find(
        (value) => JSON.stringify(value.sourceDraft) === JSON.stringify(draft),
      );
      const preview = existing ?? (await repository.createPreview(draft));
      navigate(completeUrl(preview), { replace: true, state: { celebrate: !existing } });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : '저장하지 못했어요. 다시 시도해 주세요.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="review-screen">
      <PageHeading
        back={
          <BackLink to={requestUrl(draft)} trail={false}>
            요청 작성으로
          </BackLink>
        }
        title="저장할 내용을 확인해 주세요"
        description="자료와 원하는 점이 맞으면 준비를 마쳐요."
      />
      <Steps current={2} />
      <Alert message={error || validationError} />
      {prepared && <PreparationSummary prepared={prepared} />}
      <div className="review-edit-actions">
        <Link className="text-link" to={materialUrl(draft)}>
          자료 수정
        </Link>
        <Link className="text-link" to={requestUrl(draft)}>
          요청 수정
        </Link>
      </div>
      <div className="task-primary-actions">
        <button
          className="button primary full"
          disabled={busy || !prepared}
          aria-busy={busy}
          onClick={() => void save()}
        >
          {busy ? (
            <>
              저장하는 중 <span className="button-spinner" aria-hidden="true" />
            </>
          ) : (
            <>
              준비 저장하기 <Icon name="check" />
            </>
          )}
        </button>
      </div>
    </section>
  );
}

export function CompletePage() {
  const { id } = useParams();
  const { state } = usePrototype();
  const preview = state.previews.find((value) => value.id === id);
  if (!preview) return <Missing title="준비한 내용을 찾을 수 없어요" />;
  return (
    <Completion
      title="커트 준비를 마쳤어요"
      primary="준비한 내용 보기"
      to={previewUrl(preview)}
      secondary="준비 목록으로"
      secondaryTo="/requests"
    >
      <div className="completed-summary">
        <div className="prepared-cut-photo">
          {preview.photos[0] ? (
            <PhotoButton photo={preview.photos[0]} cutDate={preview.cut.cutDate} />
          ) : (
            <PhotoPlaceholder />
          )}
        </div>
        <div>
          <strong>{cutTitle(preview.cut.cutDate, preview.cut.service)}</strong>
          <p>{preview.requests[0]?.content}</p>
          <span>
            {preview.designer
              ? `${preview.designer.name} 디자이너에게 보여 줄 준비`
              : '내 커트 준비'}{' '}
            · 사진 {preview.photos.length}장
          </span>
        </div>
      </div>
    </Completion>
  );
}
