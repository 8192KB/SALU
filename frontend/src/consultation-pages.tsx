import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert, Avatar, Icon, Missing, PageHeading } from './components';
import { Field, PhotoList } from './fields';
import { AreaChips, ProgressBlock } from './record-pages';
import { usePrototype } from './prototype/context';
import { AREAS, INTENTS } from './prototype/types';
import type { Area, RequestDraft, DesignerProfile, Intent, RequestItem } from './prototype/types';
import { cutTitle, daysAfter, displayDate } from './prototype/dates';
import {
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
  unfinishedDrafts,
} from './prototype/request-flow';

function currentSalon(designer: DesignerProfile) {
  return designer.affiliations.find((value) => value.current)?.salonName ?? '소속 미등록';
}
function profileUrl(id: string, record: string | null, preview?: string | null) {
  const search = new URLSearchParams();
  if (record) search.set('record', record);
  if (preview) search.set('preview', preview);
  return `/designers/${id}${search.size ? `?${search}` : ''}`;
}
function Steps({ current, personal = false }: { current: number; personal?: boolean }) {
  return (
    <div className="steps" aria-label="상담 준비 단계">
      {[personal ? '내 기록' : '디자이너', '자료 선택', '요청 정리', '미리보기'].map(
        (label, index) => (
          <span
            key={label}
            className={index === current ? 'active' : ''}
            aria-current={index === current ? 'step' : undefined}
          >
            <b>{index + 1}</b>
            {label}
            {index < 3 && <span aria-hidden="true">　›</span>}
          </span>
        ),
      )}
    </div>
  );
}
function SelectedDesigner({ designer }: { designer: DesignerProfile }) {
  return (
    <div className="selected-designer">
      <Avatar name={designer.name} />
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
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 701px)').matches);
  const source = materialSource(state, draft);
  if (!source) return null;
  const cut = source.cut;
  const progress = source.progress
    .filter((entry) => draft.progressIds.includes(entry.id))
    .sort((a, b) => a.observedOn.localeCompare(b.observedOn));
  const photos = source.photos.filter((photo) => draft.photoIds.includes(photo.id));
  return (
    <aside className="sidebar request-reference" aria-label="요청에 첨부할 자료">
      <section className="panel sticky-summary">
        <h2>선택한 기록</h2>
        <p className="reference-cut">{cutTitle(cut.cutDate, cut.service)}</p>
        <details
          className="reference-details"
          open={open}
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary>선택한 자료 {selectedCount(draft)}개 보기</summary>
          <div className="reference-body" role="region" aria-label="선택한 자료 내용" tabIndex={0}>
            {draft.includeGoodNote && cut.goodNote && (
              <article className="reference-entry">
                <h3>커트 당일 · 좋았던 점</h3>
                <p>{cut.goodNote}</p>
                <button
                  className="text-link reference-action"
                  type="button"
                  onClick={() => onUse(cut.areas[0] ?? 'WHOLE', 'KEEP', cut.goodNote)}
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
                        onClick={() => onUse(entry.areas[0] ?? 'WHOLE', 'ASK', entry.discomfort)}
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
                        onClick={() => onUse(entry.areas[0] ?? 'WHOLE', 'ASK', entry.question)}
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
            {photos.map((photo) => (
              <figure className="reference-photo" key={photo.id}>
                <img src={photo.url} alt={photo.caption} />
                <figcaption>
                  <strong>{photoOrigin(photo, cut.cutDate)}</strong>
                  <span>{displayDate(photo.date)}</span>
                  <p>{photo.caption}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
        <p className="form-note">
          선택한 기록은 함께 첨부됩니다. 요청에는 새로 부탁할 내용만 적어 주세요.
        </p>
      </section>
    </aside>
  );
}

export function DesignerList() {
  const { state, requestDraft } = usePrototype();
  const [search] = useSearchParams();
  const previewId = search.get('preview');
  const sourcePreview = state.previews.find((value) => value.id === previewId);
  const record = search.get('record') ?? sourcePreview?.cut.id ?? requestDraft?.cutId ?? null;
  if (previewId && (!sourcePreview || sourcePreview.cut.id !== record))
    return <Missing title="준비한 요청 자료를 찾을 수 없습니다" />;
  if (record && !state.cuts.some((cut) => cut.id === record))
    return <Missing title="선택한 커트 기록을 찾을 수 없습니다" />;
  return (
    <>
      <PageHeading
        eyebrow="YOUR NEXT CONVERSATION"
        title="디자이너 찾기"
        description={
          sourcePreview
            ? '준비한 요청 자료를 함께 볼 디자이너를 골라 보세요. 선택만으로 전송되지는 않습니다.'
            : '소개와 상담 분야를 보고, 이야기를 나눌 디자이너를 골라 보세요.'
        }
      />
      {record && (
        <Link className="back-link" to={`/records/${record}`}>
          ← 선택한 커트 기록
        </Link>
      )}
      <div className="designer-grid">
        {state.designers.map((designer) => (
          <Link
            className="panel designer-card"
            to={profileUrl(designer.id, record, previewId)}
            key={designer.id}
          >
            <div className="designer-top">
              <Avatar name={designer.name} />
              <div>
                <h3>{designer.name} 디자이너</h3>
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
              <span>가상 프로필 · 상담 후기 예시</span>
              <span>프로필 보기 ↗</span>
            </div>
          </Link>
        ))}
      </div>
      <p className="form-note">인물·매장·후기는 화면 확인을 위한 가상 자료입니다.</p>
    </>
  );
}

export function DesignerDetail() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const previewId = search.get('preview');
  const { state, repository, requestDraft, requestDrafts, setRequestDraft } = usePrototype();
  const sourcePreview = state.previews.find((value) => value.id === previewId);
  const record = search.get('record') ?? sourcePreview?.cut.id ?? requestDraft?.cutId ?? null;
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const designer = state.designers.find((value) => value.id === id);
  if (
    !designer ||
    (record && !state.cuts.some((cut) => cut.id === record)) ||
    (previewId && (!sourcePreview || sourcePreview.cut.id !== record))
  )
    return <Missing title="프로필 또는 선택한 기록을 찾을 수 없습니다" />;
  const existing = unfinishedDrafts(state, requestDrafts).find(
    (draft) => draft.designerId === designer.id && (!record || draft.cutId === record),
  );
  const prepareForDesigner = async () => {
    if (!sourcePreview) return;
    setError('');
    if (!selectedCount(sourcePreview.sourceDraft)) {
      const draft = latestMaterials(state, draftFromPreview(sourcePreview, designer.id));
      setRequestDraft(draft);
      navigate(materialUrl(draft));
      return;
    }
    setBusy(true);
    try {
      const preview = await repository.createPreviewForDesigner(sourcePreview.id, designer.id);
      setRequestDraft(preview.sourceDraft);
      navigate(previewUrl(preview));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '자료를 다시 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Link
        className="back-link"
        to={`/designers?${new URLSearchParams({ ...(record ? { record } : {}), ...(previewId ? { preview: previewId } : {}) })}`}
      >
        ← 디자이너 목록
      </Link>
      <Steps current={0} />
      <div className="two-column">
        <section>
          <div className="panel profile-banner">
            <Avatar name={designer.name} large />
            <div>
              <p className="eyebrow">DESIGNER PROFILE</p>
              <h1 tabIndex={-1}>{designer.name} 디자이너</h1>
              <p>현재 소속 · {currentSalon(designer)}</p>
              <div className="chip-row">
                {designer.specialties.map((value) => (
                  <span className="chip" key={value}>
                    {value}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <section className="panel profile-section" style={{ marginTop: 22 }}>
            <h2>소개</h2>
            <p>{designer.introduction}</p>
          </section>
          <section className="panel profile-section">
            <h2>소속 정보</h2>
            {designer.affiliations.map((value) => (
              <div className="detail-values" key={value.period}>
                <strong>{value.salonName}</strong>
                <span>{value.period}</span>
                <span>{value.current ? '현재 소속' : '이전 소속'}</span>
              </div>
            ))}
            <p className="muted">소속이 바뀌어도 같은 디자이너 프로필에서 확인하는 방식입니다.</p>
          </section>
          <section className="panel profile-section">
            <div className="section-heading" style={{ marginTop: 0 }}>
              <h2>상담 후기</h2>
              <span className="chip">가상 후기</span>
            </div>
            {designer.reviewExamples.map((review) => (
              <article className="review-card" key={review.id}>
                <span className="review-meta">상담 고객 · {displayDate(review.date)}</span>
                <p>{review.content}</p>
              </article>
            ))}
          </section>
        </section>
        <aside className="sidebar">
          <section className="panel sticky-summary">
            <h2>기록으로 상담 준비</h2>
            <p className="muted">원하는 디자이너에게 보여 줄 자료와 이번 요청을 정리하세요.</p>
            {sourcePreview ? (
              <>
                <p className="source-note">
                  준비한 요청을 이 디자이너용으로 새로 만듭니다. 개인 준비본과 기존 초안은 그대로
                  남습니다.
                </p>
                <Alert message={error} />
                <button
                  className="button primary full"
                  disabled={busy}
                  onClick={prepareForDesigner}
                >
                  {selectedCount(sourcePreview.sourceDraft)
                    ? '이 자료로 상담 준비'
                    : '자료를 추가해서 상담 준비'}
                  <Icon name="arrow" />
                </button>
              </>
            ) : !existing ? (
              <button
                className="button primary full"
                disabled={!record && !state.cuts.length}
                onClick={() => {
                  const draft = newRequestDraft(record ?? state.cuts[0].id, designer.id);
                  setRequestDraft(draft);
                  navigate(materialUrl(draft));
                }}
              >
                상담 자료 선택
                <Icon name="arrow" />
              </button>
            ) : null}
            {existing && (
              <div className="existing-draft">
                <p>이 디자이너에게 작성 중인 내용이 있어요.</p>
                <Link
                  className={sourcePreview ? 'text-link' : 'button primary full'}
                  to={materialUrl(existing)}
                >
                  기존 초안 이어쓰기 <Icon name="arrow" size={17} />
                </Link>
                {!sourcePreview && (
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => {
                      const draft = newRequestDraft(record ?? existing.cutId, designer.id);
                      setRequestDraft(draft);
                      navigate(materialUrl(draft));
                    }}
                  >
                    새 준비 만들기 <Icon name="plus" size={17} />
                  </button>
                )}
              </div>
            )}
            <p className="form-note">이번 단계에서는 실제 요청을 전송하지 않습니다.</p>
          </section>
        </aside>
      </div>
    </>
  );
}

export function MaterialsPage() {
  const { state, requestDraft, requestDrafts, setRequestDraft, resumeRequestDraft } =
    usePrototype();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const draftId = search.get('draft');
  const explicitDraft = draftId ? requestDrafts[draftId] : undefined;
  const designerId = draftId ? explicitDraft?.designerId : (search.get('designer') ?? undefined);
  const designer = state.designers.find((value) => value.id === designerId);
  const cutId = draftId
    ? explicitDraft?.cutId
    : (search.get('record') ??
      (requestDraft?.designerId === designerId ? requestDraft?.cutId : undefined) ??
      state.cuts[0]?.id);
  const record = state.cuts.find((value) => value.id === cutId);
  const draft = draftId
    ? explicitDraft
    : requestDraft?.designerId === designerId && requestDraft?.cutId === cutId
      ? requestDraft
      : undefined;
  const source = draft ? materialSource(state, draft) : null;
  useEffect(() => {
    if (draftId) {
      if (explicitDraft) setRequestDraft(explicitDraft);
    } else if (record && (!designerId || designer)) {
      resumeRequestDraft(newRequestDraft(record.id, designerId));
    }
    setError('');
  }, [draftId, explicitDraft, record, designerId, designer, resumeRequestDraft, setRequestDraft]);
  useEffect(() => {
    if (!draftId && draft) navigate(materialUrl(draft), { replace: true });
  }, [draftId, draft, navigate]);
  if ((draftId && !explicitDraft) || (designerId && !designer) || (!record && !source))
    return <Missing title="기록 또는 작성 중인 요청을 찾을 수 없습니다" />;
  if (!draft || !source) return <p role="status">자료 확인 중</p>;
  const cut = source.cut;
  const progress = [...source.progress].sort((a, b) => a.observedOn.localeCompare(b.observedOn));
  const photos = source.photos;
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
      <Link
        className="back-link"
        to={designer ? profileUrl(designer.id, cut.id) : `/records/${cut.id}`}
      >
        {designer ? '← 디자이너 프로필' : '← 내 기록'}
      </Link>
      <Steps current={1} personal={!designer} />
      <PageHeading
        title={designer ? '상담 자료 선택' : '다음 커트 준비'}
        description={
          designer
            ? '보여 주고 싶은 메모와 경과, 사진만 골라 주세요.'
            : '참고할 기록을 고르고, 다음에 요청할 내용을 정리하세요. 디자이너는 나중에 선택해도 됩니다.'
        }
      />
      <div className="two-column materials-layout">
        <section className="panel">
          {designer && <SelectedDesigner designer={designer} />}
          {source.frozen && (
            <div className="source-note">
              <strong>미리보기를 만들 때의 자료</strong>
              <p>원본 기록이 바뀌어도 이 준비 내용은 유지됩니다.</p>
              <button
                type="button"
                className="text-link"
                onClick={() => setRequestDraft(latestMaterials(state, draft))}
              >
                최신 기록에서 다시 고르기
              </button>
            </div>
          )}
          <Field label="기준 커트">
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
          <p className="form-note">다른 커트를 둘러보고 돌아와도 작성 중인 내용은 유지됩니다.</p>
          <div className="material-group">
            <h3>커트 당일 메모</h3>
            {cut.goodNote ? (
              <label className="selectable">
                <input
                  aria-label="커트 당일 메모 선택"
                  type="checkbox"
                  checked={draft.includeGoodNote}
                  onChange={(event) => update({ includeGoodNote: event.target.checked })}
                />
                <div className="selectable-content">
                  <strong>좋았던 점</strong>
                  <p>{cut.goodNote}</p>
                </div>
              </label>
            ) : (
              <p className="muted">당일에 남긴 메모가 없습니다.</p>
            )}
          </div>
          <div className="material-group">
            <h3>커트 이후 경과</h3>
            {progress.map((entry) => (
              <label className="selectable" key={entry.id}>
                <input
                  aria-label={`경과 ${entry.observedOn} 선택`}
                  type="checkbox"
                  checked={draft.progressIds.includes(entry.id)}
                  onChange={() => toggle('progressIds', entry.id)}
                />
                <div className="selectable-content">
                  <strong>
                    {displayDate(entry.observedOn)}{' '}
                    <span className="day-label">D+{daysAfter(cut.cutDate, entry.observedOn)}</span>
                  </strong>
                  <p>{entry.areas.map((area) => AREAS[area]).join(' · ')}</p>
                  {entry.discomfort && <p>불편한 점 · {entry.discomfort}</p>}
                  {entry.styling && <p>평소 손질 · {entry.styling}</p>}
                  {entry.question && <p>물어볼 점 · {entry.question}</p>}
                </div>
              </label>
            ))}
            {!progress.length && <p className="muted">아직 경과가 없습니다.</p>}
          </div>
          <div className="material-group">
            <h3>사진</h3>
            {photos.map((photo, index) => (
              <label className="selectable" key={photo.id}>
                <input
                  aria-label={`사진 ${index + 1} 선택`}
                  type="checkbox"
                  checked={draft.photoIds.includes(photo.id)}
                  onChange={() => toggle('photoIds', photo.id)}
                />
                <img src={photo.url} alt={photo.caption} />
                <div className="selectable-content">
                  <strong>
                    {photoOrigin(photo, cut.cutDate)} · {displayDate(photo.date)}
                  </strong>
                  <p>{photo.caption}</p>
                </div>
              </label>
            ))}
            {!photos.length && <p className="muted">사진이 없습니다.</p>}
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
            <p className="muted selection-scope">커트 날짜·시술·부위와 선택한 자료만 포함합니다.</p>
            {!designer && (
              <p className="muted selection-detail">첨부 자료 없이 요청 내용부터 적어도 됩니다.</p>
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
              요청 작성
              <Icon name="arrow" />
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}

export function RequestPage() {
  const { state, repository, requestDraft, requestDrafts, setRequestDraft } = usePrototype();
  const [search] = useSearchParams();
  const draft = search.get('draft') ? requestDrafts[search.get('draft')!] : requestDraft;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    if (draft) setRequestDraft(draft);
  }, [draft, setRequestDraft]);
  const designer = state.designers.find((value) => value.id === draft?.designerId);
  const source = draft ? materialSource(state, draft) : null;
  if (!draft || !source || (draft.designerId && (!designer || !selectedCount(draft))))
    return (
      <Missing
        title="먼저 요청에 사용할 기록을 선택해 주세요"
        message="내 기록에서 요청 준비를 시작할 수 있습니다."
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
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const preview = await repository.createPreview(draft!);
      navigate(previewUrl(preview));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '자료와 요청을 다시 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to={materialUrl(draft)}>
        ← 자료 선택
      </Link>
      <Steps current={2} personal={!designer} />
      <PageHeading
        title="이번 요청 정리"
        description="그대로 둘 부분, 바꿀 부분, 물어볼 점을 부위별로 적어 주세요."
      />
      <div className="two-column request-layout">
        <form className="panel" onSubmit={submit} noValidate>
          {designer ? (
            <SelectedDesigner designer={designer} />
          ) : (
            <p className="personal-label">개인 준비본 · 디자이너 선택 전</p>
          )}
          {source.frozen && (
            <p className="source-note">
              이 미리보기를 만들 때의 자료를 사용합니다. 최신 기록으로 바꾸려면 자료 선택 화면에서
              다시 골라 주세요.
            </p>
          )}
          <Alert message={error} />
          {draft.requests.map((item, index) => (
            <section className="request-row" key={item.id}>
              <div className="request-row-head">
                <strong>요청 {String(index + 1).padStart(2, '0')}</strong>
                {draft.requests.length > 1 && (
                  <button
                    className="remove-link"
                    type="button"
                    aria-label={`요청 ${index + 1} 삭제`}
                    onClick={() =>
                      update({ requests: draft.requests.filter((value) => value.id !== item.id) })
                    }
                  >
                    삭제
                  </button>
                )}
              </div>
              <div className="field-grid">
                <Field label="부위">
                  <select
                    aria-label={`요청 부위 ${index + 1}`}
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
                <Field label="요청 종류">
                  <select
                    aria-label={`요청 종류 ${index + 1}`}
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
              <Field label="요청 내용">
                <textarea
                  aria-label={`요청 내용 ${index + 1}`}
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
            onClick={() => update({ requests: [...draft.requests, newRequest()] })}
          >
            <Icon name="plus" size={17} />
            요청 항목 추가
          </button>
          <div className="form-body" style={{ marginTop: 26 }}>
            <Field label="집에서 손질" hint="선택 · 기록에 없는 내용만 추가">
              <textarea
                maxLength={2000}
                value={draft.homeStyling}
                onChange={(event) => update({ homeStyling: event.target.value })}
                placeholder="드라이만 하고 있어요"
              />
            </Field>
            <Field label="추가 질문" hint="선택 · 기록에 없는 내용만 추가">
              <textarea
                maxLength={2000}
                value={draft.additionalQuestion}
                onChange={(event) => update({ additionalQuestion: event.target.value })}
                placeholder="함께 물어볼 내용이 있나요?"
              />
            </Field>
          </div>
          <div className="form-actions">
            <Link className="button" to={materialUrl(draft)}>
              자료 다시 고르기
            </Link>
            <button type="submit" className="button primary" disabled={busy}>
              미리보기 확인
              <Icon name="arrow" />
            </button>
          </div>
          <p className="form-note">
            아직 실제로 전송하지 않습니다. 다음 화면에서 정리한 내용을 확인합니다.
          </p>
        </form>
        <SelectedMaterials draft={draft} onUse={useRecordedText} />
      </div>
    </>
  );
}

export function PreviewPage() {
  const { id } = useParams();
  const { state, setRequestDraft } = usePrototype();
  const navigate = useNavigate();
  const preview = state.previews.find((value) => value.id === id);
  if (!preview) return <Missing title="상담 미리보기를 찾을 수 없습니다" />;
  return (
    <>
      <Steps current={3} personal={!preview.designer} />
      <div className="preview-banner">
        <span className="success-symbol">
          <Icon name="check" size={32} />
        </span>
        <h1 tabIndex={-1}>{preview.designer ? '상담 요청 미리보기' : '이번 요청 미리보기'}</h1>
        <p>
          {preview.designer
            ? '선택한 자료와 요청을 정리했어요. 실제 요청은 아직 보내지 않았습니다.'
            : '다음 커트에서 요청할 내용을 정리했어요. 디자이너는 필요할 때 선택하세요.'}
        </p>
      </div>
      <div className="two-column">
        <section>
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
              <p className="personal-label">개인 준비본 · 디자이너 선택 전</p>
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
          <section className="panel preview-block">
            <h2>이번 요청</h2>
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
        </section>
        <aside className="sidebar">
          <section className="panel sticky-summary">
            <h2>{preview.designer ? '보여 줄 내용 확인' : '다음 요청 준비 완료'}</h2>
            <p className="muted">고르지 않은 기록과 사진은 포함하지 않았어요.</p>
            <button
              className="button primary full"
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
            <Link className="text-link" style={{ marginTop: 18 }} to="/requests">
              요청 자료 목록 <Icon name="arrow" size={17} />
            </Link>
            <p className="form-note">
              이 미리보기는 확인한 시점의 자료입니다. 실제 저장·전송은 후속 단계에서 연결합니다.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
