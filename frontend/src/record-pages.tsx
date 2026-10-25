import { refreshDirectory, salonLabel } from './directory-cache';
import { useDirectory } from './directory';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Link, useNavigate, useWorkspace } from './workspace';
import { useAuth } from './auth/context';
import {
  Alert,
  BackLink,
  Icon,
  Missing,
  PageHeading,
  PhotoThumbnail,
  focusFirstError,
} from './components';
import {
  AreaChoices,
  Field,
  PhotoList,
  PhotoPicker,
  PhotoButton,
  preventEnterSubmit,
} from './fields';
import { DateField } from './date-field';
import { Dialog } from './dialog';
import { AnimatedDetails } from './animated-details';
import {
  useCutEditDraft,
  useProgressEditDraft,
  useProgressDraft,
  usePrototype,
} from './prototype/context';
import { AREAS } from './prototype/types';
import type { Area, CutRecord, RecordPhoto, ProgressEntry } from './prototype/types';
import { cutTitle, daysAfter, displayDate, today } from './prototype/dates';
import { InputError, isBlankCutDraft, newCutDraft } from './prototype/memory-repository';
import {
  materialUrl,
  newRequestDraft,
  previewUrl,
  unfinishedDrafts,
} from './prototype/request-flow';

export function AreaChips({ areas }: { areas: Area[] }) {
  return (
    <div className="chip-row">
      {(areas.includes('WHOLE') ? (['WHOLE'] as Area[]) : areas).map((area) => (
        <span className="chip" key={area}>
          {AREAS[area]}
        </span>
      ))}
    </div>
  );
}
function Cover({
  photo,
  expandable = false,
  cutDate,
}: {
  photo?: RecordPhoto;
  expandable?: boolean;
  cutDate?: string;
}) {
  return (
    <div className="record-cover">
      {photo ? (
        expandable ? (
          <PhotoButton photo={photo} cutDate={cutDate} />
        ) : (
          <PhotoThumbnail src={photo.url} alt={photo.caption} />
        )
      ) : (
        <PhotoThumbnail alt="커트 대표 사진" />
      )}
    </div>
  );
}

export function RecordList() {
  const { state } = usePrototype();
  const mode = useWorkspace();
  const cuts = [...state.cuts].sort((a, b) => b.cutDate.localeCompare(a.cutDate));
  return (
    <div className="two-column journal-layout">
      <section>
        <PageHeading
          title="나의 커트 기록"
          description="커트한 날부터 달라진 모습까지."
          action={
            <Link className="button primary" to="/records/new">
              <Icon name="plus" />새 기록
            </Link>
          }
        />
        <div className="section-heading">
          <h2>최근 커트</h2>
          <span className="count-label">{cuts.length}개의 기록</span>
        </div>
        <div className="journal-list">
          {cuts.map((cut) => {
            const photo = state.photos.find((photo) => photo.cutId === cut.id && !photo.progressId);
            return (
              <Link to={`/records/${cut.id}`} className="journal-entry with-photo" key={cut.id}>
                <Cover photo={photo} />
                <div className="card-content">
                  <time dateTime={cut.cutDate}>{displayDate(cut.cutDate)}</time>
                  <h3>{cutTitle(cut.cutDate, cut.service)}</h3>
                  <AreaChips areas={cut.areas} />
                  <p className="card-note">
                    {cut.goodNote || '커트 후 느낀 점을 이어서 남겨 보세요.'}
                  </p>
                  <div className="card-bottom">
                    <span>
                      경과 {state.progress.filter((entry) => entry.cutId === cut.id).length}건
                    </span>
                  </div>
                </div>
                <span className="journal-chevron" aria-hidden="true">
                  <Icon name="arrow" />
                </span>
              </Link>
            );
          })}
        </div>
        {!cuts.length && (
          <div className="record-empty">
            <Icon name="cut" size={28} />
            <h3>아직 남긴 커트 기록이 없어요</h3>
            <p>위의 새 기록 버튼으로 날짜와 좋았던 점부터 남겨 보세요.</p>
          </div>
        )}
        {/* 두 링크가 한 줄에 붙어 하나로 읽히지 않게 따로 줄을 나눔 */}
        <div className="journal-links">
          <Link className="journal-next text-link" to="/requests">
            커트 준비 목록 보기 <Icon name="arrow" size={16} />
          </Link>
          {mode !== 'example' && (
            <Link className="journal-next text-link" to="/backup">
              기록 저장·백업 <Icon name="arrow" size={16} />
            </Link>
          )}
        </div>
      </section>
      <aside className="sidebar journal-guide">
        <section className="panel">
          <h2>기록을 더 잘 남기는 방법</h2>
          <p className="muted">말로 설명하기 어려운 부분을 사진과 기록으로 정리해 보세요.</p>
          <div className="small-step">
            <b>1</b>
            <span>커트와 이후 변화 남기기</span>
          </div>
          <div className="small-step">
            <b>2</b>
            <span>다음 커트에서 요청할 내용 정리</span>
          </div>
          <div className="small-step">
            <b>3</b>
            <span>준비한 내용 확인하기</span>
          </div>
          {mode === 'example' && (
            <Link className="text-link" style={{ marginTop: 24 }} to="/designers">
              디자이너 찾기 <Icon name="arrow" />
            </Link>
          )}
        </section>
      </aside>
    </div>
  );
}

// 메뉴를 옮겼다 돌아오거나 새로고침해도 저장 전 내용은 남아 있음. 저장된 것으로 오해하지 않게 알림
function ResumedNotice() {
  return (
    <p className="working-notice resumed-notice" role="status">
      저장하지 않은 내용을 이어서 보여 줘요. 처음부터 쓰려면 맨 아래 ‘작성 내용 지우기’를 눌러
      주세요.
    </p>
  );
}

export function CutForm() {
  const { id } = useParams();
  const { state, repository, cutDraft, setCutDraft, cutEdits } = usePrototype();
  const original = state.cuts.find((cut) => cut.id === id);
  const edit = useCutEditDraft(original);
  const [resumed] = useState(() => (id ? Boolean(cutEdits[id]) : !isBlankCutDraft(cutDraft)));
  // 전날 저장하고 비운 초안을 열면 커트 날짜를 오늘로 다시 채움. 화면을 연 뒤 고른 날짜는 그대로 둠
  const [staleDate] = useState(
    () => !id && isBlankCutDraft(cutDraft) && cutDraft.cutDate !== today(),
  );
  useEffect(() => {
    if (staleDate)
      setCutDraft((previous) =>
        isBlankCutDraft(previous) ? { ...previous, cutDate: today() } : previous,
      );
  }, [staleDate, setCutDraft]);
  if (id && !original) return <Missing />;
  const form = id
    ? edit
    : {
        draft: cutDraft,
        update: (input: Partial<typeof cutDraft>) =>
          setCutDraft((previous) => ({ ...previous, ...input })),
        clear: () => setCutDraft(newCutDraft()),
      };
  return (
    <CutFormBody
      key={id ?? 'new'}
      {...form}
      editingId={id}
      repository={repository}
      resumed={resumed}
    />
  );
}
function CutFormBody({
  draft,
  update,
  clear,
  editingId,
  repository,
  resumed,
}: ReturnType<typeof useCutEditDraft> & {
  editingId?: string;
  repository: ReturnType<typeof usePrototype>['repository'];
  resumed: boolean;
}) {
  const { state } = usePrototype();
  const directory = useDirectory(state);
  const mode = useWorkspace();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [photosBusy, setPhotosBusy] = useState(false);
  const [manualDesigner, setManualDesigner] = useState(false);
  const navigate = useNavigate();
  // 디자이너 상세의 '담당자로 연결'에서 오면 그 디자이너를 담당자로 골라 둠. 저장해야 연결됨
  const [search] = useSearchParams();
  const connectId = editingId ? search.get('designer') : null;
  const connectDesigner = connectId
    ? directory.designers.find((value) => value.id === connectId)
    : undefined;
  const connected = useRef(false);
  useEffect(() => {
    if (connected.current || !connectDesigner || draft.designerProfileId) return;
    connected.current = true;
    update({
      designerProfileId: connectDesigner.id,
      designerName: connectDesigner.name,
      salonName:
        draft.salonName ||
        connectDesigner.affiliations.find((value) => value.current)?.salonName ||
        '',
      salonId: draft.salonName ? draft.salonId : connectDesigner.salonId,
    });
  }, [connectDesigner]);
  const previousDesigners = Array.from(
    [...state.cuts]
      .sort((a, b) => b.cutDate.localeCompare(a.cutDate))
      .reduce((choices, cut) => {
        const name = cut.designerName.trim();
        const salon = cut.salonName.trim();
        const key = JSON.stringify([name, salon]);
        if (name && !choices.has(key)) choices.set(key, cut);
        return choices;
      }, new Map<string, CutRecord>())
      .values(),
  ).filter(
    // 등록 디자이너와 이름·현재 매장이 같으면 아래 ‘SALU 등록 디자이너’로만 표시
    (cut) =>
      !directory.designers.some(
        (designer) =>
          designer.name === cut.designerName.trim() &&
          designer.affiliations.find((value) => value.current)?.salonName === cut.salonName.trim(),
      ),
  );
  const previousDesigner = previousDesigners.find(
    (cut) =>
      cut.designerName.trim() === draft.designerName.trim() &&
      cut.salonName.trim() === draft.salonName.trim(),
  );
  const designerChoice = manualDesigner
    ? ''
    : draft.designerProfileId
      ? `profile/${draft.designerProfileId}`
      : previousDesigner
        ? `previous/${previousDesigner.id}`
        : '';
  const designerSelect = Boolean(
    previousDesigners.length > 0 ||
    directory.designers.length > 0 ||
    draft.designerProfileId ||
    mode !== 'example',
  );
  const returnUrl = editingId ? `/records/${editingId}` : '/records';
  async function submit(event: FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    // 같은 작업 안에서 두 번 보낸 저장 요청이 기록을 두 건 만들지 않게 즉시 잠금
    if (busy || photosBusy || saving.current) return;
    saving.current = true;
    setErrors({});
    setBusy(true);
    try {
      const cut = editingId
        ? await repository.updateCut(editingId, draft)
        : await repository.createCut(draft);
      clear();
      navigate(`/records/${cut.id}/complete`, {
        replace: true,
        state: { operation: editingId ? 'update' : 'create', celebrate: true },
      });
    } catch (failure) {
      setErrors(
        failure instanceof InputError
          ? failure.fields
          : { form: '기록을 저장하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요.' },
      );
      focusFirstError(form);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="form-layout">
      <PageHeading
        back={<BackLink to={returnUrl}>{editingId ? '커트 기록으로' : '기록 목록으로'}</BackLink>}
        title={editingId ? '커트 기록 수정' : '커트 기록 남기기'}
        description="커트한 날짜와 마음에 든 부분을 남겨 보세요."
      />
      {resumed && <ResumedNotice />}
      <Dialog
        open={discardOpen}
        title="작성한 내용을 지울까요?"
        onClose={() => setDiscardOpen(false)}
      >
        <p>
          {editingId
            ? '저장 전 수정한 내용을 지워요. 저장된 기록은 그대로 남아요.'
            : '작성 중인 기록과 선택한 사진을 지워요.'}
        </p>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={() => setDiscardOpen(false)}>
            계속 작성
          </button>
          <button
            type="button"
            className="button coral"
            onClick={() => {
              setDiscardOpen(false);
              if (!editingId) draft.photos.forEach(repository.releasePhoto);
              clear();
              navigate(returnUrl);
            }}
          >
            작성 내용 지우기
          </button>
        </div>
      </Dialog>
      <form
        className="panel record-form"
        onSubmit={submit}
        onKeyDown={preventEnterSubmit}
        noValidate
      >
        <Alert message={errors.form ?? ''} />
        <fieldset className="form-body" disabled={busy}>
          <section className="form-section" aria-label="커트 정보">
            <h2>커트 정보</h2>
            <div className="field-grid">
              <DateField
                label="커트 날짜"
                error={errors.cutDate}
                max={today()}
                value={draft.cutDate}
                onChange={(cutDate) => update({ cutDate })}
              />
              <Field label="시술" error={errors.service}>
                <input
                  required
                  maxLength={60}
                  value={draft.service}
                  onChange={(event) => update({ service: event.target.value })}
                  placeholder="예: 커트"
                  aria-invalid={!!errors.service}
                />
              </Field>
            </div>
            <AreaChoices
              values={draft.areas}
              onChange={(areas) => update({ areas })}
              error={errors.areas}
            />
          </section>
          <section className="form-section" aria-label="당일 기록">
            <h2>당일 기록</h2>
            <Field label="좋았던 점" hint="선택">
              <textarea
                maxLength={2000}
                value={draft.goodNote}
                onChange={(event) => update({ goodNote: event.target.value })}
                placeholder="예: 앞머리 길이가 마음에 들어요"
              />
            </Field>
            {editingId ? (
              <>
                <PhotoList
                  photos={state.photos.filter(
                    (photo) => photo.cutId === editingId && !photo.progressId,
                  )}
                  cutDate={draft.cutDate}
                />
                <p className="form-note">저장한 사진은 수정 화면에서 바꾸거나 뺄 수 없어요.</p>
              </>
            ) : (
              <PhotoPicker
                photos={draft.photos}
                onChange={(photos) => update({ photos })}
                onBusyChange={setPhotosBusy}
              />
            )}
          </section>
          <AnimatedDetails
            className="optional-fields"
            defaultOpen={Boolean(connectId || draft.salonName || draft.designerName || draft.price)}
            summary={
              <span className="optional-summary">
                <span>미용실, 담당자, 가격</span>
                <small>
                  {draft.salonName || draft.designerName || draft.price ? '작성됨' : '선택'}
                </small>
              </span>
            }
          >
            {connectDesigner && draft.designerProfileId === connectDesigner.id && (
              <p className="form-note connect-note" role="status">
                {connectDesigner.name} 디자이너를 담당자로 골라 두었어요. 수정 저장을 누르면 이
                기록에 연결돼요.
              </p>
            )}
            <div className="field-grid">
              {mode !== 'example' && (
                <Field label="미용실" hint="선택">
                  <select
                    value={draft.salonId ?? ''}
                    onChange={(event) => {
                      const salon = directory.salons.find(
                        (value) => value.id === event.target.value,
                      );
                      update({
                        salonId: salon?.id,
                        salonName: salon
                          ? [salon.name, salon.branch].filter(Boolean).join(' ')
                          : draft.salonName,
                      });
                    }}
                  >
                    <option value="">매장 이름 직접 입력</option>
                    {draft.salonId &&
                      !directory.salons.some((value) => value.id === draft.salonId) && (
                        <option value={draft.salonId}>{draft.salonName} · 이전 선택</option>
                      )}
                    {directory.salons.map((salon) => (
                      <option key={salon.id} value={salon.id}>
                        {salonLabel(salon)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {/* 목록에서 고르면 이름 칸을 숨겨 같은 내용을 두 번 적는 칸이 보이지 않게 함 */}
              {(mode === 'example' || !draft.salonId) && (
                <Field label={mode === 'example' ? '미용실' : '미용실 이름'}>
                  <input
                    maxLength={100}
                    value={draft.salonName}
                    onChange={(event) =>
                      update({ salonName: event.target.value, salonId: undefined })
                    }
                    placeholder="예: 하늘헤어 강남점"
                  />
                </Field>
              )}
              {designerSelect && (
                <Field label="담당자" hint="선택" error={errors.designerProfileId}>
                  <select
                    value={designerChoice}
                    onChange={(event) => {
                      setManualDesigner(!event.target.value);
                      const previous = previousDesigners.find(
                        (value) => `previous/${value.id}` === event.target.value,
                      );
                      if (previous) {
                        update({
                          designerProfileId: previous.designerProfileId,
                          designerName: previous.designerName.trim(),
                          salonName: previous.salonName.trim(),
                          salonId: previous.salonId,
                        });
                        return;
                      }
                      const designer = directory.designers.find(
                        (value) => `profile/${value.id}` === event.target.value,
                      );
                      update({
                        designerProfileId: designer?.id,
                        designerName: designer?.name ?? draft.designerName,
                        salonName:
                          draft.salonName ||
                          designer?.affiliations.find((value) => value.current)?.salonName ||
                          '',
                        salonId: draft.salonName ? draft.salonId : designer?.salonId,
                      });
                    }}
                  >
                    <option value="">이름 직접 입력</option>
                    {draft.designerProfileId &&
                      !directory.designers.some(
                        (value) => value.id === draft.designerProfileId,
                      ) && (
                        <option value={`profile/${draft.designerProfileId}`}>
                          {draft.designerName} · 이전 선택
                        </option>
                      )}
                    {previousDesigners.length > 0 && (
                      <optgroup label="이전 기록의 담당자">
                        {previousDesigners.map((cut) => (
                          <option key={cut.id} value={`previous/${cut.id}`}>
                            {cut.designerName} · {cut.salonName || '매장 이름 없음'}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {directory.designers.length > 0 && (
                      <optgroup label="SALU 등록 디자이너">
                        {directory.designers.map((designer) => (
                          <option key={designer.id} value={`profile/${designer.id}`}>
                            {designer.name} ·{' '}
                            {designer.affiliations.find((value) => value.current)?.salonName ||
                              '소속 없음'}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </Field>
              )}
              {!draft.designerProfileId && (
                <Field label={designerSelect ? '담당자 이름' : '담당자'}>
                  <input
                    maxLength={100}
                    value={draft.designerName}
                    onChange={(event) => update({ designerName: event.target.value })}
                    placeholder="예: 김지우"
                  />
                </Field>
              )}
              <Field label="가격" hint="원" error={errors.price}>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={draft.price}
                  onChange={(event) => update({ price: event.target.value })}
                  placeholder="예: 25000"
                  aria-invalid={!!errors.price}
                />
              </Field>
            </div>
            {mode !== 'example' && (
              <>
                <p className="form-note">목록에 없어도 매장과 담당자 이름을 직접 적을 수 있어요.</p>
                {directory.error && (
                  <div className="directory-error">
                    <p role="status">{directory.error} 직접 입력한 내용은 저장할 수 있어요.</p>
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => void refreshDirectory()}
                    >
                      목록 다시 불러오기
                    </button>
                  </div>
                )}
              </>
            )}
          </AnimatedDetails>
          {errors.photos && <Alert message={errors.photos} />}
        </fieldset>
        <div className="form-actions">
          <button
            disabled={busy || photosBusy}
            aria-busy={busy || photosBusy}
            aria-label={editingId ? '수정 저장' : '커트 기록 저장'}
            className="button primary"
            type="submit"
          >
            {busy
              ? '기록 남기는 중'
              : photosBusy
                ? '사진을 확인하고 있어요'
                : editingId
                  ? '수정 저장'
                  : '커트 기록 저장'}
            {busy || photosBusy ? (
              <span className="button-spinner" aria-hidden="true" />
            ) : (
              <Icon name="check" />
            )}
          </button>
        </div>
        <button
          type="button"
          className="text-link discard-draft"
          disabled={busy || photosBusy}
          onClick={() => setDiscardOpen(true)}
        >
          작성 내용 지우기
        </button>
        <p className="form-note">
          {editingId
            ? '기록을 수정해도 이미 정리한 커트 준비 내용은 그대로 남아요.'
            : '기기에 저장해 로그인 없이도 이어서 사용할 수 있어요.'}
        </p>
      </form>
    </div>
  );
}

export function ProgressBlock({
  entry,
  cutDate,
  photos = [],
  editUrl,
}: {
  entry: ProgressEntry;
  cutDate: string;
  photos?: RecordPhoto[];
  editUrl?: string;
}) {
  return (
    <article className="panel timeline-entry">
      <div className="timeline-head">
        <time dateTime={entry.observedOn}>{displayDate(entry.observedOn)}</time>
        <span className="day-label">D+{daysAfter(cutDate, entry.observedOn)}</span>
      </div>
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
      <PhotoList photos={photos} cutDate={cutDate} />
      {editUrl && (
        <Link className="text-link" to={editUrl}>
          경과 수정 <Icon name="arrow" size={17} />
        </Link>
      )}
    </article>
  );
}

export function RecordDetail() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const { state, requestDrafts, setRequestDraft, resumeUrl } = usePrototype();
  const directory = useDirectory(state);
  const navigate = useNavigate();
  const mode = useWorkspace();
  const signedIn = useAuth().state.status === 'authenticated';
  const cut = state.cuts.find((value) => value.id === id);
  const preview = state.previews.find(
    (value) => value.id === search.get('preview') && value.cut.id === id,
  );
  if (!cut) return <Missing />;
  const recordedDesigner = directory.designers.find(
    (designer) => designer.id === cut.designerProfileId,
  );
  const entries = state.progress
    .filter((entry) => entry.cutId === id)
    .sort((a, b) => a.observedOn.localeCompare(b.observedOn));
  const photos = state.photos.filter((photo) => photo.cutId === id);
  const drafts = unfinishedDrafts(state, requestDrafts).filter((draft) => draft.cutId === id);
  const previews = state.previews.filter((value) => value.cut.id === id).reverse();
  const startPersonalRequest = () => {
    const draft = newRequestDraft(cut.id);
    setRequestDraft(draft);
    navigate(materialUrl(draft));
  };
  return (
    <>
      {preview && (
        <Link className="preview-return-link" to={previewUrl(preview)}>
          준비 내용으로 돌아가기 <Icon name="arrow" size={17} />
        </Link>
      )}
      <PageHeading
        back={<BackLink to="/records">기록 목록으로</BackLink>}
        title="커트 기록 · 경과"
      />
      <div className="two-column">
        <section>
          <article
            className={`panel record-hero${photos.some((photo) => !photo.progressId) ? '' : ' no-photo'}`}
          >
            <Cover
              photo={photos.find((photo) => !photo.progressId)}
              expandable
              cutDate={cut.cutDate}
            />
            <div className="record-hero-content">
              <time className="record-date" dateTime={cut.cutDate}>
                {displayDate(cut.cutDate)}
              </time>
              <h2>{cutTitle(cut.cutDate, cut.service)}</h2>
              <AreaChips areas={cut.areas} />
              <p className="card-note">{cut.goodNote || '커트 당일 메모를 남겨 보세요.'}</p>
              <div className="detail-values">
                {cut.salonName && <span>{cut.salonName}</span>}
                {cut.designerName && <span>{cut.designerName} 디자이너</span>}
                {cut.price !== undefined && <span>{cut.price.toLocaleString()}원</span>}
              </div>
              {/* 같은 날 찍은 나머지 사진은 기록 카드 안에 작게 모아 둠 */}
              <PhotoList
                photos={photos.filter((photo) => !photo.progressId).slice(1)}
                cutDate={cut.cutDate}
                captions={false}
              />
              <div className="record-edit-actions">
                <Link className="text-link" to={`/records/${cut.id}/edit`}>
                  기록 수정 <Icon name="arrow" size={17} />
                </Link>
              </div>
            </div>
          </article>
          <div className="section-heading">
            <h2>커트 이후의 변화</h2>
            <div className="section-heading-actions">
              <span className="count-label">경과 {entries.length}건</span>
              <Link className="text-link" to={`/records/${cut.id}/progress/new`}>
                경과 추가 <Icon name="plus" />
              </Link>
            </div>
          </div>
          <div className="timeline">
            {entries.map((entry) => (
              <ProgressBlock
                key={entry.id}
                editUrl={`/records/${cut.id}/progress/${entry.id}/edit`}
                entry={entry}
                cutDate={cut.cutDate}
                photos={photos.filter((photo) => photo.progressId === entry.id)}
              />
            ))}
          </div>
          {!entries.length && (
            <section className="record-progress-empty">
              <p className="muted">
                아직 경과를 남기지 않았어요. 집에서 느낀 점을 이어서 적어 보세요.
              </p>
            </section>
          )}
          <section className="record-next-action" aria-label="다음 커트 준비">
            <Icon name="chat" size={25} />
            <h2 style={{ marginTop: 13 }}>다음 커트 준비</h2>
            <p className="muted">이 기록으로 다음 커트에서 원하는 점을 정리해요.</p>
            {drafts.length ? (
              <>
                <Link className="button primary full" to={resumeUrl(drafts[0])}>
                  작성 중인 커트 준비 이어쓰기 <Icon name="arrow" />
                </Link>
                <button
                  className="text-link"
                  type="button"
                  style={{ marginTop: 16 }}
                  onClick={startPersonalRequest}
                >
                  새 커트 준비 <Icon name="plus" size={17} />
                </button>
              </>
            ) : (
              <button className="button primary full" onClick={startPersonalRequest}>
                이 기록으로 다음 커트 준비 <Icon name="arrow" />
              </button>
            )}
            <Link className="text-link designer-secondary" to={`/designers?record=${cut.id}`}>
              디자이너 골라 상담 <Icon name="arrow" size={16} />
            </Link>
          </section>
        </section>
        <aside className="sidebar">
          {recordedDesigner && (
            <section className="panel recorded-designer">
              <p className="muted">기록에 연결한 디자이너</p>
              <h2>{recordedDesigner.name} 디자이너</h2>
              <p className="muted">
                현재 소속 ·{' '}
                {recordedDesigner.affiliations.find((value) => value.current)?.salonName ??
                  '등록 전'}
              </p>
              {/* 주 버튼은 다음 커트 준비 하나. 준비 내용에서 상담해야 고른 자료가 함께 첨부됨 */}
              <Link
                className="button full"
                to={`/designers/${recordedDesigner.id}?record=${cut.id}&from=record`}
              >
                프로필 · 상담 요청 <Icon name="arrow" size={17} />
              </Link>
            </section>
          )}
          {previews.length > 0 && (
            <section className="panel record-request-list">
              <h2>준비한 내용</h2>
              {previews.slice(0, 3).map((value) => (
                <Link className="record-request-link" key={value.id} to={previewUrl(value)}>
                  <span>
                    {value.designer ? `${value.designer.name} · 상담 준비` : '내 커트 준비'}
                  </span>
                  <strong>{value.requests[0]?.content}</strong>
                  <span className="card-action">
                    내용 보기 <Icon name="arrow" size={16} />
                  </span>
                </Link>
              ))}
              <Link className="text-link" to="/requests">
                커트 준비 전체 보기 <Icon name="arrow" size={17} />
              </Link>
            </section>
          )}
          {/* 글은 로그인해야 올릴 수 있어 로그인한 실제 공간에서만 권함 */}
          {mode !== 'example' && signedIn && (
            <section className="panel record-community">
              <h3>커뮤니티에 공유</h3>
              <p className="muted">
                이 커트를 사례로 올리면 비슷한 고민을 가진 사람이 참고할 수 있어요. 올릴 사진은 직접
                골라요.
              </p>
              <Link
                className="text-link"
                to={`/community/new?record=${encodeURIComponent(cut.id)}`}
              >
                사례로 올리기 <Icon name="arrow" size={17} />
              </Link>
            </section>
          )}
          <section className="panel">
            <h3>경과를 남기는 시점</h3>
            <p className="muted">
              손질하면서 변화를 느꼈을 때 남겨 주세요. 날짜는 그날 확인한 시점이에요.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

export function ProgressForm() {
  const { id = '', progressId } = useParams();
  const { state } = usePrototype();
  const cut = state.cuts.find((value) => value.id === id);
  const fresh = useProgressDraft(id);
  const original = state.progress.find((entry) => entry.id === progressId && entry.cutId === id);
  const edit = useProgressEditDraft(original);
  const { progressDrafts, progressEdits } = usePrototype();
  const [resumed] = useState(() =>
    Boolean(progressId ? progressEdits[progressId] : progressDrafts[id]),
  );
  if (!cut || (progressId && !original)) return <Missing />;
  return (
    <ProgressFormBody
      key={progressId ?? `new-${id}`}
      cut={cut}
      {...(progressId ? edit : fresh)}
      editingId={progressId}
      resumed={resumed}
    />
  );
}
function ProgressFormBody({
  cut,
  draft,
  update,
  clear,
  editingId,
  resumed,
}: { cut: CutRecord; editingId?: string; resumed: boolean } & ReturnType<typeof useProgressDraft>) {
  const { repository, state } = usePrototype();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [photosBusy, setPhotosBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    // 같은 작업 안에서 두 번 보낸 저장 요청이 기록을 두 건 만들지 않게 즉시 잠금
    if (busy || photosBusy || saving.current) return;
    saving.current = true;
    setErrors({});
    setBusy(true);
    try {
      const progress = editingId
        ? await repository.updateProgress(cut.id, editingId, draft)
        : await repository.addProgress(cut.id, draft);
      clear();
      navigate(`/records/${cut.id}/progress/${progress.id}/complete`, {
        replace: true,
        state: { operation: editingId ? 'update' : 'create', celebrate: true },
      });
    } catch (failure) {
      setErrors(
        failure instanceof InputError
          ? failure.fields
          : { form: '경과를 저장하지 못했어요. 입력은 그대로 있어요. 다시 시도해 주세요.' },
      );
      focusFirstError(form);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const elapsed =
    draft.observedOn && draft.observedOn >= cut.cutDate
      ? daysAfter(cut.cutDate, draft.observedOn)
      : null;
  return (
    <div className="form-layout">
      <PageHeading
        back={<BackLink to={`/records/${cut.id}`}>커트 기록으로</BackLink>}
        title={editingId ? '경과 기록 수정' : '시간이 지난 뒤 남기기'}
        description={`${displayDate(cut.cutDate)} 커트에서 이어지는 기록`}
      />
      {resumed && <ResumedNotice />}
      <Dialog
        open={discardOpen}
        title="작성한 내용을 지울까요?"
        onClose={() => setDiscardOpen(false)}
      >
        <p>
          {editingId
            ? '저장 전 수정한 내용을 지워요. 저장된 경과는 그대로 남아요.'
            : '작성 중인 경과와 선택한 사진을 지워요.'}
        </p>
        <div className="dialog-actions">
          <button type="button" className="button" onClick={() => setDiscardOpen(false)}>
            계속 작성
          </button>
          <button
            type="button"
            className="button coral"
            onClick={() => {
              setDiscardOpen(false);
              if (!editingId) draft.photos.forEach(repository.releasePhoto);
              clear();
              navigate(`/records/${cut.id}`);
            }}
          >
            작성 내용 지우기
          </button>
        </div>
      </Dialog>
      <form
        className="panel record-form"
        onSubmit={submit}
        onKeyDown={preventEnterSubmit}
        noValidate
      >
        <Alert message={errors.form ?? ''} />
        <fieldset className="form-body" disabled={busy}>
          <section className="form-section" aria-label="관찰 시점">
            <h2>관찰 시점</h2>
            <div className="field-grid">
              <DateField
                label="관찰 날짜"
                error={errors.observedOn}
                min={cut.cutDate}
                max={today()}
                value={draft.observedOn}
                onChange={(observedOn) => update({ observedOn })}
              />
              <div>
                <span className="field-label">커트 후 경과</span>
                <p className="selection-count">
                  {elapsed !== null && Number.isFinite(elapsed) ? `D+${elapsed}` : '—'}
                </p>
              </div>
            </div>
          </section>
          <section className="form-section" aria-label="변화 기록">
            <h2>변화 기록</h2>
            <AreaChoices
              values={draft.areas}
              onChange={(areas) => update({ areas })}
              error={errors.areas}
            />
            <Field label="불편한 점" error={errors.discomfort}>
              <textarea
                maxLength={2000}
                value={draft.discomfort}
                onChange={(event) => update({ discomfort: event.target.value })}
                placeholder="예: 옆머리가 금방 떠요"
                aria-invalid={!!errors.discomfort}
              />
            </Field>
            {editingId ? (
              <>
                <PhotoList
                  photos={state.photos.filter((photo) => photo.progressId === editingId)}
                  cutDate={cut.cutDate}
                />
                <p className="form-note">저장한 사진은 수정 화면에서 바꾸거나 뺄 수 없어요.</p>
              </>
            ) : (
              <PhotoPicker
                photos={draft.photos}
                onChange={(photos) => update({ photos })}
                onBusyChange={setPhotosBusy}
              />
            )}
            {errors.photos && <Alert message={errors.photos} />}
          </section>
          <AnimatedDetails
            className="optional-fields record-optional"
            summary={
              <span className="optional-summary">
                <span>손질 방법, 물어볼 점</span>
                <small>{draft.styling || draft.question ? '작성됨' : '선택'}</small>
              </span>
            }
            defaultOpen={Boolean(draft.styling || draft.question)}
          >
            <Field label="평소 손질">
              <textarea
                maxLength={2000}
                value={draft.styling}
                onChange={(event) => update({ styling: event.target.value })}
                placeholder="예: 드라이만 하고 있어요"
              />
            </Field>
            <Field label="물어볼 점">
              <textarea
                maxLength={2000}
                value={draft.question}
                onChange={(event) => update({ question: event.target.value })}
                placeholder="다음 커트에서 어떻게 요청하면 좋을까요?"
              />
            </Field>
          </AnimatedDetails>
        </fieldset>
        <div className="form-actions">
          <button
            disabled={busy || photosBusy}
            aria-busy={busy || photosBusy}
            aria-label={editingId ? '수정 저장' : '경과 저장'}
            className="button primary"
            type="submit"
          >
            {busy
              ? '경과 남기는 중'
              : photosBusy
                ? '사진을 확인하고 있어요'
                : editingId
                  ? '수정 저장'
                  : '경과 저장'}
            {busy || photosBusy ? (
              <span className="button-spinner" aria-hidden="true" />
            ) : (
              <Icon name="check" />
            )}
          </button>
        </div>
        <p className="form-note">
          {editingId
            ? '경과를 수정해도 이미 정리한 커트 준비 내용은 그대로 남아요.'
            : '관찰 날짜는 내용을 확인한 날입니다. 커트 기록에 이어서 보관해요.'}
        </p>
        <button
          type="button"
          className="text-link discard-draft"
          disabled={busy || photosBusy}
          onClick={() => setDiscardOpen(true)}
        >
          작성 내용 지우기
        </button>
      </form>
    </div>
  );
}
