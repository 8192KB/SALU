import { draftDesigner, refreshDirectory } from './directory-cache';
import { useConsultations } from './consultation-store';
import { useDirectory } from './directory';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Completion } from './completion';
import { useActivePage } from './main-navigation';
import { reloadFavorites, useFavorites } from './designer-favorites';
import type { FormEvent } from 'react';
import { useLocation, useNavigationType, useParams, useSearchParams } from 'react-router';
import { previousEntry, useBackTrail } from './back-trail';
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
  Loading,
} from './components';
import { Field, PhotoList, PhotoButton } from './fields';
import { MaterialChoice } from './material-choice';
import { AnimatedDetails } from './animated-details';
import { AreaChips, ProgressBlock } from './record-pages';
import { usePrototype } from './prototype/context';
import { prepareRequest } from './prototype/memory-repository';
import { AREAS, INTENTS } from './prototype/types';
import type {
  Area,
  CutRecord,
  RequestDraft,
  DesignerProfile,
  Intent,
  RequestItem,
} from './prototype/types';
import { cutTitle, daysAfter, displayDate, otherYear } from './prototype/dates';
import { RequestDraftHelper, useAiEnabled } from './ai-assist';
import { SpecialtyChoices, isSpecialty, recommend } from './designer-specialties';
import { chargedFee, won } from './payment';
import {
  completeUrl,
  reviewUrl,
  editDraft,
  isEditDraft,
  latestMaterials,
  materialSource,
  materialUrl,
  newRequest,
  newRequestDraft,
  photoNote,
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
// 디자이너를 골라 들어온 준비는 확인 뒤 상담 신청 화면으로 이어짐. 신청은 그 화면에서 하므로 마지막 단계는 확인
function Steps({ current, consult }: { current: number; consult?: boolean }) {
  const labels = consult
    ? ['자료 고르기', '상담 내용 적기', '내용 확인']
    : ['자료 고르기', '원하는 점 적기', '내용 확인'];
  return (
    <ol className="steps" aria-label={consult ? '상담 신청 단계' : '커트 준비 단계'}>
      {labels.map((label, index) => (
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
  const { state } = usePrototype();
  const fee = chargedFee(state, designer);
  return (
    <div className="selected-designer">
      <Avatar name={designer.name} src={designer.avatarUrl} />
      <div>
        <strong>{designer.name} 디자이너</strong>
        <p>{currentSalon(designer)}</p>
        {fee > 0 && <p>상담 1회 {won(fee)}</p>}
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
              <span>{displayDate(cut.cutDate)} 커트</span>
              <span className="reference-count">
                {selectedCount(draft) ? `자료 ${selectedCount(draft)}개 보기` : '고른 자료 없음'}
              </span>
            </span>
          }
        >
          <div className="reference-body" role="region" aria-label="선택한 자료 내용" tabIndex={0}>
            <p className="reference-cut">{cutTitle(cut.cutDate, cut.service)}</p>
            {draft.includeGoodNote && cut.goodNote && (
              <article className="reference-entry">
                <h3>커트 당일 좋았던 점</h3>
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
                  {photoNote(photo, cut.cutDate) && <p>{photoNote(photo, cut.cutDate)}</p>}
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
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const previous = useBackTrail(location);
  const previewId = search.get('preview');
  const sourcePreview = state.previews.find((value) => value.id === previewId);
  const record = search.get('record') ?? sourcePreview?.cut.id ?? null;
  const cut = record ? state.cuts.find((value) => value.id === record) : undefined;
  // 이 커트를 해 준 디자이너를 먼저 보여 주고, 다른 디자이너는 원할 때 펼침
  const recorded = directory.designers.find((value) => value.id === cut?.designerProfileId);
  const [showAll, setShowAll] = useState(false);
  const favorites = useFavorites();
  // 더보기의 찜한 디자이너에서 오면 찜한 디자이너만 보여 줌
  const [favoriteOnly, setFavoriteOnly] = useState(() => search.get('favorites') === '1');
  // 켜고 끈 상태를 주소에도 남겨 프로필을 보고 돌아와도 같은 목록을 보여 줌
  const showFavoriteOnly = (on: boolean) => {
    setFavoriteOnly(on);
    const next = new URLSearchParams(search);
    if (on) next.set('favorites', '1');
    else next.delete('favorites');
    setSearch(next, { replace: true });
  };
  const showFavorites = mode !== 'example' && Boolean(favorites?.loaded) && favoriteOnly;
  // 원하는 시술로 찾기(docs/development-contract.md `디자이너 추천`). 고른 항목은 주소에 남겨 프로필을 보고 돌아와도 유지
  const picked = (search.get('tags') ?? '').split(',').filter(isSpecialty);
  const pick = (values: string[]) => {
    const next = new URLSearchParams(search);
    if (values.length) next.set('tags', values.join(','));
    else next.delete('tags');
    setSearch(next, { replace: true });
  };
  const aiEnabled = useAiEnabled();
  const active = useActivePage();
  useEffect(() => {
    if (!active || mode === 'example' || import.meta.env.VITE_SALU_AUTH_MODE === 'prototype')
      return;
    // 탭을 연 뒤 새로 공개된 디자이너도 보이도록 들어올 때·창으로 돌아올 때 다시 받음
    void refreshDirectory();
    const refresh = () => void refreshDirectory();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [active, mode]);
  if (previewId && (!sourcePreview || sourcePreview.cut.id !== record))
    return <Missing title="준비한 요청 자료를 찾을 수 없어요" />;
  if (record && !cut) return <Missing title="선택한 커트 기록을 찾을 수 없어요" />;
  // 준비 내용에서 고르면 바로 상담 작성으로 가므로 내 디자이너 프로필은 빼 둠(자기에게는 보낼 수 없음)
  const others = directory.designers.filter(
    (value) => value !== recorded && !(sourcePreview && value.id === favorites?.ownId),
  );
  // 준비 내용에서 왔으면 디자이너를 고르는 즉시 그 준비 내용으로 상담을 작성함
  const card = (designer: DesignerProfile, matched?: string[]) => (
    <Link
      className="panel designer-card"
      to={
        sourcePreview
          ? `/consultations/new?${new URLSearchParams({ designer: designer.id, preview: sourcePreview.id })}`
          : profileUrl(designer.id, record, previewId)
      }
      key={designer.id}
    >
      <div className="designer-top">
        <Avatar name={designer.name} src={designer.avatarUrl} />
        <div>
          <h2>{designer.name} 디자이너</h2>
          <p>{currentSalon(designer)}</p>
          {mode !== 'example' && favorites?.ids.has(designer.id) && (
            <p className="designer-card-favorite">
              <Icon name="heart" size={14} />
              찜한 디자이너
            </p>
          )}
        </div>
      </div>
      {designer.specialties.length > 0 && (
        <div className="chip-row">
          {designer.specialties.map((value) => (
            <span className="chip" key={value}>
              {value}
            </span>
          ))}
        </div>
      )}
      {matched && (
        <p className="designer-card-match">
          고른 시술 {matched.length}개 맞음: {matched.join(', ')}
        </p>
      )}
      <p>{designer.introduction.split('\n')[0]}</p>
      <div className="card-bottom">
        <span>
          {/* 예시 후기에는 별점이 없어 개수만, 없으면 실제 디자이너와 같은 안내 */}
          {mode === 'example'
            ? designer.reviewExamples.length
              ? `후기 ${designer.reviewExamples.length}개`
              : '아직 후기가 없어요'
            : designer.rating?.count
              ? `★ ${designer.rating.average?.toFixed(1)} (후기 ${designer.rating.count}개)`
              : '아직 후기가 없어요'}
        </span>
        <span className="card-action">
          {sourcePreview ? '상담 신청' : '프로필 보기'} <Icon name="arrow" size={16} />
        </span>
      </div>
    </Link>
  );
  return (
    <div className="designer-list-screen">
      <PageHeading
        title={showFavorites ? '찜한 디자이너' : '디자이너 찾기'}
        back={
          sourcePreview ? (
            <BackLink to={previewUrl(sourcePreview)}>준비 내용으로</BackLink>
          ) : record ? (
            <BackLink to={`/records/${record}`}>커트 기록으로</BackLink>
          ) : previous ? (
            <BackLink to={previous.to}>{previous.label}</BackLink>
          ) : undefined
        }
        description={sourcePreview ? '준비한 내용을 보낼 디자이너를 골라 주세요.' : undefined}
      />
      {/* 찜한 디자이너만 볼 때는 시술 고르기를 숨김(찜 목록 밖의 사람을 추천하므로) */}
      {!showFavorites && (
        <section className="panel designer-pick" aria-label="원하는 시술로 찾기">
          <SpecialtyChoices
            legend="원하는 시술로 찾기"
            hint="고르면 그 시술을 하는 디자이너를 후기 점수 순으로 보여 줘요."
            values={picked}
            onChange={pick}
          />
          {aiEnabled && (
            <Link className="text-link" to="/ai">
              손질 방법이 궁금하면 AI 상담
            </Link>
          )}
        </section>
      )}
      {mode !== 'example' && favorites?.loaded && (
        <button
          type="button"
          className="button favorite-filter"
          aria-pressed={favoriteOnly}
          onClick={() => showFavoriteOnly(!favoriteOnly)}
        >
          <Icon name="heart" size={16} />
          찜한 디자이너만 보기
        </button>
      )}
      {showFavorites ? (
        <section aria-label="찜한 디자이너">
          {favorites!.error ? (
            <section className="empty-state">
              <Alert title="찜한 디자이너를 불러오지 못했어요" message={favorites!.error} />
              <button type="button" className="button" onClick={reloadFavorites}>
                다시 불러오기
              </button>
            </section>
          ) : directory.designers.some((value) => favorites!.ids.has(value.id)) ? (
            <div className="designer-grid">
              {directory.designers
                .filter((value) => favorites!.ids.has(value.id))
                .map((value) => card(value))}
            </div>
          ) : (
            <section className="empty-state">
              <h2>찜한 디자이너가 없어요</h2>
              <p>디자이너 프로필에서 찜하면 여기에 모여요.</p>
              <button type="button" className="button" onClick={() => showFavoriteOnly(false)}>
                전체 디자이너 보기
              </button>
            </section>
          )}
        </section>
      ) : picked.length ? (
        <section aria-labelledby="designer-picked-heading">
          {(() => {
            const items = recommend(
              directory.designers.filter(
                (value) => !(sourcePreview && value.id === favorites?.ownId),
              ),
              picked,
            );
            return items.length ? (
              <>
                <h2 className="designer-others-heading" id="designer-picked-heading">
                  추천 디자이너 {items.length}명
                </h2>
                <div className="designer-grid">
                  {items.map((item) => card(item.designer, item.matched))}
                </div>
              </>
            ) : (
              <section className="empty-state">
                <h2 id="designer-picked-heading">고른 시술을 하는 디자이너가 아직 없어요</h2>
                <button type="button" className="button" onClick={() => pick([])}>
                  고른 시술 지우기
                </button>
              </section>
            );
          })()}
        </section>
      ) : (
        <>
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
              <div className="designer-grid">{others.map((value) => card(value))}</div>
            </section>
          )}
        </>
      )}
      {mode !== 'example' && (
        <>
          {directory.loading && !directory.designers.length && (
            <Loading>디자이너를 불러오고 있어요.</Loading>
          )}
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
              <p>디자이너라면 소개를 등록하세요.</p>
              <Link className="button" to="/examples/designers">
                디자이너 예시로 둘러보기
              </Link>
            </section>
          )}
          {/* 상담할 디자이너를 고르는 중에는 디자이너용 길을 끼워 넣지 않음 */}
          {!record && !previewId && (
            <p className="designer-manage">
              디자이너로 활동하나요?{' '}
              <Link className="text-link" to="/account/designer">
                디자이너 프로필 만들기 <Icon name="arrow" size={16} />
              </Link>
            </p>
          )}
        </>
      )}
    </div>
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
  // 목록을 다시 받는 동안에도 이미 받은 프로필은 그대로 보여 줌
  if (mode !== 'example' && directory.loading && !designer)
    return <Loading>프로필을 불러오고 있어요.</Loading>;
  if (mode !== 'example' && directory.error && !designer)
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
    return (
      <Missing
        title={designer ? '선택한 커트 기록을 찾을 수 없어요' : '디자이너를 찾을 수 없어요'}
      />
    );
  // 예시와 실제 공간이 같은 상담 동선을 씀. 실제 공간은 로그인한 회원의 서버 상담으로 보냄
  return (
    <Suspense fallback={<Loading>프로필을 불러오고 있어요.</Loading>}>
      {/* 상담은 주소로 고른 커트만 첨부함. 개인 커트 준비 초안의 커트로 대신 채우지 않음 */}
      <ConsultationDesignerProfile designer={designer} record={record} preview={sourcePreview} />
    </Suspense>
  );
}

// 저장한 준비와 같은 초안을 뒤로 가기로 다시 열면 그 준비 내용으로 보냄. 고쳐 저장해 같은 준비가 늘지 않게 함.
// 준비를 고치는 초안은 저장해도 같은 준비를 바꾸므로 그대로 엶
function useSavedDraftRedirect(draft: RequestDraft | null | undefined, active: boolean) {
  const { state } = usePrototype();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const saved =
    draft && !isEditDraft(state, draft)
      ? state.previews.find((value) => JSON.stringify(value.sourceDraft) === JSON.stringify(draft))
      : undefined;
  const draftId = draft?.id;
  // 개발 모드에서 효과가 두 번 돌아도 한 번만 뒤로 가게 이 기록 위치에서 처리했는지 기억함
  const { key } = useLocation();
  const handled = useRef('');
  useEffect(() => {
    if (!active || !saved || handled.current === key) return;
    handled.current = key;
    // 저장한 뒤 브라우저 뒤로 가기로 왔고 바로 앞 기록도 같은 초안의 단계면 한 칸 더 뒤로 감.
    // 단계마다 준비 내용으로 바꾸면 뒤로 가기에 같은 준비 내용이 여러 번 쌓임
    const before = previousEntry();
    const beforeDraft =
      before && new URLSearchParams(before.split('?')[1]?.split('#')[0]).get('draft');
    if (navigationType === 'POP' && beforeDraft === draftId) navigate(-1);
    else navigate(previewUrl(saved), { replace: true });
  }, [active, saved, navigate, navigationType, draftId, key]);
  return Boolean(saved);
}

// 커트 준비 목록에서 지난 커트를 골라 시작한 초안. 자료 선택의 뒤로 링크가 고르던 화면으로 돌아감.
// 기록 ID라 브라우저 저장소에 남기지 않고 이 탭 메모리와 주소의 picked 표시로만 둠(새로고침해도 유지)
const pickedDrafts = new Set<string>();

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
    : requestDraft?.designerId === designerId &&
        requestDraft?.cutId === cutId &&
        // 이미 준비 내용으로 저장한 초안과 준비를 고치는 초안은 새 준비로 이어 쓰지 않음(resumeRequestDraft와 같은 기준)
        !(requestDraft && isEditDraft(state, requestDraft)) &&
        !state.previews.some(
          (preview) => JSON.stringify(preview.sourceDraft) === JSON.stringify(requestDraft),
        )
      ? requestDraft
      : undefined;
  const source = draft ? materialSource(state, draft) : null;
  useEffect(() => {
    if (!active) return;
    if (draftId) {
      if (explicitDraft) setRequestDraft(explicitDraft);
    } else if (record && (!designerId || designer)) {
      resumeRequestDraft(newRequestDraft(record.id, designerId, record.areas[0]));
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
    if (!active || draftId || !draft) return;
    const picked = search.has('picked');
    if (picked) pickedDrafts.add(draft.id);
    navigate(`${materialUrl(draft)}${picked ? '&picked=1' : ''}`, { replace: true });
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
        <PageHeading
          back={
            designer ? (
              <BackLink to={profileUrl(designer.id, null)}>디자이너 프로필</BackLink>
            ) : (
              <BackLink to="/requests">커트 준비로</BackLink>
            )
          }
          title="참고할 지난 커트를 골라 주세요"
        />
        <Steps current={0} consult={Boolean(designer)} />
        {/* 디자이너 상세에서 시작하면 누구에게 얼마로 보내는지 첫 단계부터 보여 줌 */}
        {designer && <SelectedDesigner designer={designer} />}
        {state.cuts.length ? (
          <div className="reference-record-list">
            {newestCuts(state.cuts).map((cut) => (
              <Link
                className="panel reference-record-choice"
                key={cut.id}
                to={`/requests/materials?${new URLSearchParams({ record: cut.id, picked: '1', ...(designerId ? { designer: designerId } : {}) })}`}
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
                  {otherYear(cut.cutDate) && (
                    <time dateTime={cut.cutDate}>{otherYear(cut.cutDate)}</time>
                  )}
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
            {/* 디자이너를 골라 왔으면 기록을 남긴 뒤 완료 화면에서 그 디자이너 상담으로 이어감 */}
            <Link
              className="button primary"
              to={
                designerId
                  ? `/records/new?${new URLSearchParams({ consult: designerId })}`
                  : '/records/new'
              }
            >
              커트 기록 남기기
            </Link>
          </section>
        )}
      </>
    );
  if ((draftId && !explicitDraft) || (designerId && !designer) || (!record && !source))
    return <Missing title="기록 또는 작성 중인 요청을 찾을 수 없어요" />;
  if (!draft || !source) return <Loading>자료를 확인하고 있어요.</Loading>;
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
          isEditDraft(state, draft) ? (
            <BackLink to={previewUrl(draft)}>준비 내용으로</BackLink>
          ) : pickedDrafts.has(draft.id) || search.has('picked') ? (
            <BackLink
              to={designer ? `/requests/materials?designer=${designer.id}` : '/requests/materials'}
              trail={false}
            >
              지난 커트 다시 고르기
            </BackLink>
          ) : (
            <BackLink to={designer ? profileUrl(designer.id, cut.id) : `/records/${cut.id}`}>
              {designer ? '디자이너 프로필' : '커트 기록으로'}
            </BackLink>
          )
        }
        title={designer ? '상담에 보낼 자료 고르기' : '참고 자료 선택'}
        description="같이 보낼 내용을 골라 주세요."
      />
      <Steps current={0} consult={Boolean(designer) && !isEditDraft(state, draft)} />
      <div className="two-column materials-layout">
        <section className="material-picker">
          {designer && <SelectedDesigner designer={designer} />}
          {source.frozen && (
            <div className="source-note">
              <strong>준비할 때 담아 둔 자료</strong>
              <p>기록을 고쳐도 여기 담아 둔 내용은 바뀌지 않아요.</p>
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
                onChange={(event) => {
                  // 글을 쓰지 않고 자료만 고른 초안은 다른 커트로 바꾸면 비워 `작성 중`에 쌓이지 않게 함. 쓴 글은 커트별로 남김
                  if (
                    !isEditDraft(state, draft) &&
                    !draft.requests.some((item) => item.content.trim()) &&
                    !draft.homeStyling.trim() &&
                    !draft.additionalQuestion.trim()
                  )
                    setRequestDraft({
                      ...draft,
                      includeGoodNote: false,
                      progressIds: [],
                      photoIds: [],
                    });
                  setSearch({
                    ...(designer ? { designer: designer.id } : {}),
                    record: event.target.value,
                  });
                }}
              >
                {newestCuts(state.cuts).map((value) => (
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
                summary={photoNote(photo, cut.cutDate) || displayDate(photo.date)}
                checked={draft.photoIds.includes(photo.id)}
                onChange={() => toggle('photoIds', photo.id)}
                image={<PhotoButton photo={photo} cutDate={cut.cutDate} />}
              />
            ))}
            {!photos.length && (
              <div className="material-empty-photo">
                <PhotoPlaceholder />
                <p>
                  {eligibleCount
                    ? '사진 없이 메모나 경과를 골라도 돼요.'
                    : designer
                      ? '고를 자료가 없어도 커트 날짜와 시술로 상담을 신청할 수 있어요.'
                      : '고를 자료가 없어도 원하는 점만 적을 수 있어요.'}
                </p>
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
                name={`${displayDate(entry.observedOn)} 경과 선택`}
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
              메모 {Number(draft.includeGoodNote)}개, 경과 {draft.progressIds.length}개, 사진{' '}
              {draft.photoIds.length}장
            </p>
            <p className="muted selection-scope">커트 날짜, 시술, 부위와 고른 자료만 담아요.</p>
            {!designer && (
              <p className="muted selection-detail">자료를 고르지 않고 바로 적어도 돼요.</p>
            )}
            <Alert message={error} />
            <button
              className="button primary full"
              onClick={() => {
                if (designer && eligibleCount && !selectedCount(draft))
                  setError('상담에 사용할 자료를 하나 이상 선택해 주세요.');
                else navigate(requestUrl(draft));
              }}
            >
              {designer ? '상담 내용 적기' : '원하는 점 적기'}
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
        message="이미 저장했거나 지운 내용일 수 있어요. 커트 준비에서 다시 골라 주세요."
      />
    );
  const hasMaterials = Boolean(
    source && (source.cut.goodNote || source.progress.length || source.photos.length),
  );
  if (
    !draft ||
    !source ||
    (draft.designerId && (!designer || (hasMaterials && !selectedCount(draft))))
  )
    return (
      <Missing
        title="먼저 요청에 사용할 기록을 선택해 주세요"
        message="내 기록에서 다음 커트를 준비하세요."
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
  // AI 다듬기에 보낼 칸. 한 칸이 한 줄이 되도록 줄바꿈 없는 칸만 보냄(줄 순서대로 되돌려 넣음)
  const draftLines = [
    ...draft.requests.map((item) => ({
      key: item.id,
      label: `${AREAS[item.area]}(${INTENTS[item.intent]})`,
      value: item.content.trim(),
    })),
    { key: 'homeStyling', label: '집에서 손질', value: draft.homeStyling.trim() },
    { key: 'additionalQuestion', label: '추가 질문', value: draft.additionalQuestion.trim() },
  ].filter((line) => line.value && !line.value.includes('\n'));
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
            자료 고르기
          </BackLink>
        }
        title={
          designer
            ? '디자이너에게 상담할 내용을 적어 주세요'
            : '이번 커트에서 원하는 점을 적어 주세요'
        }
        description={
          isEditDraft(state, draft) ? '저장하면 원래 준비가 고친 내용으로 바뀌어요.' : undefined
        }
      />
      <Steps current={1} consult={Boolean(designer) && !isEditDraft(state, draft)} />
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
                  placeholder="예: 옆머리 아래는 조금 짧게, 위쪽 길이는 남기고 싶어요"
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
                <span>손질 방법과 추가 질문 더 적기</span>
                <small>
                  {draft.homeStyling.trim() || draft.additionalQuestion.trim()
                    ? [
                        draft.homeStyling.trim() && '손질 방법',
                        draft.additionalQuestion.trim() && '질문',
                      ]
                        .filter(Boolean)
                        .join(', ') + ' 작성됨'
                    : '선택'}
                </small>
              </span>
            }
          >
            <div className="form-body">
              <Field label="집에서 손질" hint="고른 기록에 없는 내용만 적어 주세요">
                <textarea
                  maxLength={2000}
                  value={draft.homeStyling}
                  onChange={(event) => update({ homeStyling: event.target.value })}
                  placeholder="예: 드라이만 하고 있어요"
                />
              </Field>
              <Field label="추가 질문" hint="고른 기록에 없는 내용만 적어 주세요">
                <textarea
                  maxLength={2000}
                  value={draft.additionalQuestion}
                  onChange={(event) => update({ additionalQuestion: event.target.value })}
                  placeholder="함께 물어볼 내용이 있나요?"
                />
              </Field>
            </div>
          </AnimatedDetails>
          <RequestDraftHelper
            text={draftLines.map((line) => `${line.label}: ${line.value}`).join('\n')}
            label="적은 내용 AI로 다듬기"
            onApply={(value) => {
              // 서버가 줄 수·줄 앞 표시를 지킨 답만 주므로 줄 순서대로 칸에 되돌림(docs/ai-api.md)
              const rows = value.split('\n');
              if (rows.length !== draftLines.length) return;
              const next = { ...draft, requests: [...draft.requests] };
              rows.forEach((row, index) => {
                const line = draftLines[index];
                const prefix = `${line.label}:`;
                const content = row.startsWith(prefix)
                  ? row.slice(prefix.length).trim()
                  : row.trim();
                if (line.key === 'homeStyling') next.homeStyling = content;
                else if (line.key === 'additionalQuestion') next.additionalQuestion = content;
                else
                  next.requests = next.requests.map((item) =>
                    item.id === line.key ? { ...item, content } : item,
                  );
              });
              update({
                requests: next.requests,
                homeStyling: next.homeStyling,
                additionalQuestion: next.additionalQuestion,
              });
            }}
          />
          {designer && (
            <p className="request-designer-context">
              <Icon name="user" size={18} />
              <span>{designer.name} 디자이너</span>
            </p>
          )}
          <div className="form-actions request-editor-actions">
            <button type="submit" className="button primary">
              작성 완료 <Icon name="arrow" />
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

// 고치기 초안이 저장한 준비와 내용이 다른지 볼 때 쓰는 값. 항목 ID처럼 내용과 무관한 값은 뺌
const draftContent = (draft: RequestDraft) =>
  JSON.stringify([
    draft.requests.map((item) => [item.area, item.intent, item.content]),
    draft.homeStyling,
    draft.additionalQuestion,
    draft.includeGoodNote,
    [...draft.progressIds].sort(),
    [...draft.photoIds].sort(),
  ]);

export function PreviewPage() {
  const { id } = useParams();
  const { state, requestDrafts, setRequestDraft } = usePrototype();
  const navigate = useNavigate();
  const directory = useDirectory(state);
  const { state: consultations, repository } = useConsultations();
  // 새로고침 뒤에는 보낸 상담을 아직 안 받았으므로 이 준비로 보낸 상담이 있으면 받아 와 표시함
  const sentBefore = Boolean(id && consultations.sentFrom?.[id]?.length);
  useEffect(() => {
    if (sentBefore && consultations.loaded === false) void repository?.refresh?.();
  }, [sentBefore, consultations.loaded, repository]);
  const preview = state.previews.find((value) => value.id === id);
  if (!preview) return <Missing title="준비한 내용을 찾을 수 없어요" />;
  // 보여 줄 디자이너: 디자이너용으로 준비했으면 그 디자이너, 아니면 이 커트를 해 준 디자이너
  const cut = state.cuts.find((value) => value.id === preview.cut.id);
  const target =
    directory.designers.find(
      (value) => value.id === (preview.designer?.id ?? cut?.designerProfileId),
    ) ?? undefined;
  // 준비 내용은 프로필을 거치지 않고 바로 상담 작성으로 가며, 고른 디자이너 누구에게나 보낼 수 있음
  const consultUrl = (designerId: string) =>
    `/consultations/new?${new URLSearchParams({ designer: designerId, preview: preview.id })}`;
  const designerQuery = new URLSearchParams({ preview: preview.id });
  const sent = consultations.threads.filter((thread) =>
    consultations.sentFrom?.[preview.id]?.includes(thread.id),
  );
  // 같은 디자이너에게 여러 번 보냈으면 이름은 한 번만. 취소한 상담은 보낸 것으로 세지 않음(모두 취소했으면 그대로 보여 줌)
  const live = sent.filter((thread) => thread.status !== 'CANCELED');
  const sentNames = [...new Set((live.length ? live : sent).map((thread) => thread.designer.name))];
  const sentToTarget = target
    ? [...sent]
        .reverse()
        .find((thread) => thread.designer.id === target.id && thread.status !== 'CANCELED')
    : undefined;
  return (
    <>
      <PageHeading
        back={<BackLink to="/requests">커트 준비로</BackLink>}
        title={preview.designer ? '디자이너에게 보여 줄 내용' : '다음 커트 준비 내용'}
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
                  {preview.designer.salonName && <p>{preview.designer.salonName}</p>}
                </div>
              </div>
            ) : (
              <p className="personal-label">개인 커트 준비</p>
            )}
            <h2>{cutTitle(preview.cut.cutDate, preview.cut.service)}</h2>
            {/* 제목에 월·일이 있어 올해가 아닌 기록만 연도까지 붙인 날짜를 더 보여 줌 */}
            {otherYear(preview.cut.cutDate) && (
              <p className="muted">{displayDate(preview.cut.cutDate)}</p>
            )}
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
            <h2>{preview.designer ? '보여 줄 내용 확인' : '다음에 할 일'}</h2>
            <p className="muted">고르지 않은 기록과 사진은 포함하지 않았어요.</p>
            {sent.length > 0 && (
              <p className="working-notice" role="status">
                {sentNames.join(', ')} 디자이너에게 보냈어요.{' '}
                {/* 주 버튼이 이미 보낸 상담이면 같은 링크를 겹쳐 두지 않음 */}
                {!sentToTarget && (
                  <Link to={`/consultations/${sent.at(-1)!.id}`}>보낸 상담 보기</Link>
                )}
              </p>
            )}
            {/* 준비를 마친 다음 할 일은 대개 디자이너에게 상담 요청이라 가장 먼저 둠.
                같은 디자이너에게 이미 보냈으면 다시 보내지 않게 보낸 상담으로 안내함 */}
            {sentToTarget ? (
              <Link className="button primary full" to={`/consultations/${sentToTarget.id}`}>
                {sentToTarget.designer.name} 디자이너에게 보낸 상담 보기 <Icon name="arrow" />
              </Link>
            ) : target ? (
              <Link className="button primary full" to={consultUrl(target.id)}>
                {target.name} 디자이너에게 상담 신청 <Icon name="arrow" />
              </Link>
            ) : (
              <Link className="button primary full" to={`/designers?${designerQuery}`}>
                디자이너 선택하기 <Icon name="arrow" />
              </Link>
            )}
            {/* 주 버튼 하나 아래에 보조 길을 같은 모양의 글자 링크로 모음. 목록으로는 위의 뒤로 링크가 맡음 */}
            <div className="preview-secondary-actions">
              {target && (
                <Link className="text-link" to={`/designers?${designerQuery}`}>
                  다른 디자이너 선택
                </Link>
              )}
              {/* 고치다 만 초안이 있으면 이어 씀. 원하는 점 적기부터 열고 자료는 그 화면에서 다시 고름 */}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  const draft = requestDrafts[preview.id] ?? editDraft(preview);
                  setRequestDraft(draft);
                  navigate(requestUrl(draft));
                }}
              >
                {requestDrafts[preview.id] &&
                draftContent(requestDrafts[preview.id]!) !== draftContent(editDraft(preview))
                  ? '고치던 내용 이어쓰기'
                  : '준비 고치기'}
              </button>
              <Link
                className="text-link"
                to={`/records/${preview.cut.id}?preview=${encodeURIComponent(preview.id)}`}
              >
                원본 기록 보기
              </Link>
            </div>
            {sent.length > 0 && <p className="form-note">고쳐도 이미 보낸 상담은 바뀌지 않아요.</p>}
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
            메모 {Number(Boolean(prepared.goodNote))}개, 경과 {prepared.progress.length}개, 사진{' '}
            {prepared.photos.length}장
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
  const editing = isEditDraft(state, draft);
  // 디자이너를 골라 시작한 새 준비는 저장한 뒤 바로 그 디자이너 상담 신청으로 이어짐
  const consult = Boolean(draft.designerId) && !editing;
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
      if (editing) {
        const preview = await repository.updatePreview(draft.id, draft);
        navigate(completeUrl(preview), { replace: true });
        return;
      }
      const existing = state.previews.find(
        (value) => JSON.stringify(value.sourceDraft) === JSON.stringify(draft),
      );
      const preview = existing ?? (await repository.createPreview(draft));
      if (consult && draft.designerId) {
        navigate(
          `/consultations/new?${new URLSearchParams({ designer: draft.designerId, preview: preview.id })}`,
          { replace: true },
        );
        return;
      }
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
            {consult ? '상담 내용 적기' : '원하는 점 적기'}
          </BackLink>
        }
        title={
          editing
            ? '고친 내용을 확인해 주세요'
            : consult
              ? '상담 신청 전에 확인해 주세요'
              : '저장할 내용을 확인해 주세요'
        }
      />
      <Steps current={2} consult={consult} />
      <Alert message={error || validationError} />
      {prepared && <PreparationSummary prepared={prepared} />}
      <div className="review-edit-actions">
        <Link className="text-link" to={materialUrl(draft)}>
          자료 수정
        </Link>
        <Link className="text-link" to={requestUrl(draft)}>
          {consult ? '상담 내용 수정' : '원하는 점 수정'}
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
              {editing ? '고친 내용 저장' : consult ? '상담 신청으로' : '준비 저장하기'}{' '}
              <Icon name={consult ? 'arrow' : 'check'} />
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
      // 고친 준비는 고치는 초안의 ID가 준비 ID와 같음
      title={
        preview.sourceDraft.id === preview.id ? '커트 준비를 고쳤어요' : '커트 준비를 마쳤어요'
      }
      primary="준비한 내용 보기"
      to={previewUrl(preview)}
      // 준비와 상담은 다른 기능이지만 마친 자리에서 바로 상담으로 이어짐
      secondary={
        preview.designer
          ? `${preview.designer.name} 디자이너에게 상담 신청`
          : '디자이너 골라 상담 신청'
      }
      secondaryTo={
        preview.designer
          ? `/consultations/new?${new URLSearchParams({ designer: preview.designer.id, preview: preview.id })}`
          : `/designers?${new URLSearchParams({ preview: preview.id })}`
      }
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
          <span>사진 {preview.photos.length}장</span>
        </div>
      </div>
    </Completion>
  );
}

// 기록 목록(`/records`)과 같은 최신 커트 먼저 순서
function newestCuts(cuts: readonly CutRecord[]) {
  return [...cuts].sort((a, b) => b.cutDate.localeCompare(a.cutDate));
}
