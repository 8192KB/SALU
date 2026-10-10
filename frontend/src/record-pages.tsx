import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert, Icon, Missing, PageHeading } from './components';
import { AreaChoices, Field, PhotoList, PhotoPicker, PhotoButton } from './fields';
import {
  useCutEditDraft,
  useProgressEditDraft,
  useProgressDraft,
  usePrototype,
} from './prototype/context';
import { AREAS } from './prototype/types';
import type { Area, CutRecord, RecordPhoto, ProgressEntry } from './prototype/types';
import { cutTitle, daysAfter, displayDate, today } from './prototype/dates';
import { InputError, newCutDraft } from './prototype/memory-repository';
import {
  materialUrl,
  newRequestDraft,
  previewUrl,
  unfinishedDrafts,
} from './prototype/request-flow';

export function AreaChips({ areas }: { areas: Area[] }) {
  return (
    <div className="chip-row">
      {areas.map((area) => (
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
          <img src={photo.url} alt={photo.caption} />
        )
      ) : (
        <div className="cover-placeholder">
          <Icon name="cut" size={42} />
        </div>
      )}
    </div>
  );
}

export function RecordList() {
  const { state } = usePrototype();
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
              <Link
                to={`/records/${cut.id}`}
                className={`journal-entry${photo ? ' with-photo' : ''}`}
                key={cut.id}
              >
                {photo ? <Cover photo={photo} /> : null}
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
        {!cuts.length && <Missing title="첫 커트 기록을 남겨 보세요" />}
        <Link className="journal-next text-link" to="/requests">
          다음 커트 요청 정리하기 <Icon name="arrow" size={16} />
        </Link>
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
            <span>필요할 때 디자이너 선택</span>
          </div>
          <Link className="button full" style={{ marginTop: 24 }} to="/designers">
            디자이너 찾아보기
            <Icon name="arrow" />
          </Link>
        </section>
      </aside>
    </div>
  );
}

export function CutForm() {
  const { id } = useParams();
  const { state, repository, cutDraft, setCutDraft } = usePrototype();
  const original = state.cuts.find((cut) => cut.id === id);
  const edit = useCutEditDraft(original);
  if (id && !original) return <Missing />;
  const form = id
    ? edit
    : {
        draft: cutDraft,
        update: (input: Partial<typeof cutDraft>) =>
          setCutDraft((previous) => ({ ...previous, ...input })),
        clear: () => setCutDraft(newCutDraft()),
      };
  return <CutFormBody key={id ?? 'new'} {...form} editingId={id} repository={repository} />;
}
function CutFormBody({
  draft,
  update,
  clear,
  editingId,
  repository,
}: ReturnType<typeof useCutEditDraft> & {
  editingId?: string;
  repository: ReturnType<typeof usePrototype>['repository'];
}) {
  const { state } = usePrototype();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [photosBusy, setPhotosBusy] = useState(false);
  const navigate = useNavigate();
  const returnUrl = editingId ? `/records/${editingId}` : '/';
  const cancel = () => {
    if (!editingId) draft.photos.forEach(repository.releasePhoto);
    clear();
    navigate(returnUrl);
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (photosBusy) return;
    setErrors({});
    setBusy(true);
    try {
      const cut = editingId
        ? await repository.updateCut(editingId, draft)
        : await repository.createCut(draft);
      clear();
      navigate(`/records/${cut.id}`);
    } catch (failure) {
      setErrors(
        failure instanceof InputError
          ? failure.fields
          : { form: '기록을 확인하고 다시 시도해 주세요.' },
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-layout">
      <Link className="back-link" to={returnUrl}>
        ← {editingId ? '커트 기록' : '내 기록'}
      </Link>
      <PageHeading
        title={editingId ? '커트 기록 수정' : '이번 머리 남기기'}
        description="커트한 날짜와 마음에 든 부분을 남겨 보세요."
      />
      <form className="panel" onSubmit={submit} noValidate>
        <Alert message={errors.form ?? ''} />
        <div className="form-body">
          {editingId ? (
            <PhotoList
              photos={state.photos.filter(
                (photo) => photo.cutId === editingId && !photo.progressId,
              )}
              cutDate={draft.cutDate}
            />
          ) : (
            <PhotoPicker
              photos={draft.photos}
              onChange={(photos) => update({ photos })}
              onBusyChange={setPhotosBusy}
            />
          )}
          <div className="field-grid">
            <Field label="커트 날짜" error={errors.cutDate}>
              <input
                type="date"
                required
                max={today()}
                value={draft.cutDate}
                onChange={(event) => update({ cutDate: event.target.value })}
                aria-invalid={!!errors.cutDate}
              />
            </Field>
            <Field label="시술" error={errors.service}>
              <input
                required
                maxLength={60}
                value={draft.service}
                onChange={(event) => update({ service: event.target.value })}
                placeholder="커트"
                aria-invalid={!!errors.service}
              />
            </Field>
          </div>
          <AreaChoices
            values={draft.areas}
            onChange={(areas) => update({ areas })}
            error={errors.areas}
          />
          <Field label="좋았던 점" hint="선택">
            <textarea
              maxLength={2000}
              value={draft.goodNote}
              onChange={(event) => update({ goodNote: event.target.value })}
              placeholder="앞머리 길이가 마음에 들어요"
            />
          </Field>
          <details className="optional-fields">
            <summary>선택 정보 · 미용실, 담당자, 가격</summary>
            <div className="field-grid">
              <Field label="미용실">
                <input
                  maxLength={100}
                  value={draft.salonName}
                  onChange={(event) => update({ salonName: event.target.value })}
                  placeholder="매장 이름"
                />
              </Field>
              <Field
                label="연결할 디자이너 프로필"
                hint="선택 · 직접 고른 프로필만 연결"
                error={errors.designerProfileId}
              >
                <select
                  value={draft.designerProfileId ?? ''}
                  onChange={(event) => {
                    const designer = state.designers.find(
                      (value) => value.id === event.target.value,
                    );
                    update({
                      designerProfileId: designer?.id,
                      designerName: designer?.name ?? draft.designerName,
                    });
                  }}
                >
                  <option value="">프로필 연결 안 함 · 이름 직접 입력</option>
                  {state.designers.map((designer) => (
                    <option key={designer.id} value={designer.id}>
                      {designer.name} ·{' '}
                      {designer.affiliations.find((value) => value.current)?.salonName ||
                        '소속 없음'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="담당자">
                <input
                  maxLength={100}
                  value={draft.designerName}
                  readOnly={!!draft.designerProfileId}
                  onChange={(event) => update({ designerName: event.target.value })}
                  placeholder="디자이너 이름"
                />
              </Field>
              <Field label="가격" hint="원" error={errors.price}>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.price}
                  onChange={(event) => update({ price: event.target.value })}
                  placeholder="25000"
                  aria-invalid={!!errors.price}
                />
              </Field>
            </div>
          </details>
          {errors.photos && <Alert message={errors.photos} />}
        </div>
        <div className="form-actions">
          <button className="button" type="button" onClick={cancel}>
            취소
          </button>
          <button disabled={busy || photosBusy} className="button coral" type="submit">
            {editingId ? '수정 저장' : '커트 기록 저장'}
            <Icon name="check" />
          </button>
        </div>
        <p className="form-note">
          {editingId
            ? '사진은 그대로 유지됩니다. 원본 수정은 이전 요청 미리보기를 바꾸지 않습니다.'
            : '이번에는 화면 안에만 저장됩니다. 새로고침하면 사라집니다.'}
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
  const { state, requestDrafts, setRequestDraft } = usePrototype();
  const navigate = useNavigate();
  const cut = state.cuts.find((value) => value.id === id);
  const preview = state.previews.find(
    (value) => value.id === search.get('preview') && value.cut.id === id,
  );
  if (!cut) return <Missing />;
  const recordedDesigner = state.designers.find(
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
      <Link className="back-link" to="/">
        ← 내 기록
      </Link>
      {preview && (
        <Link className="preview-return-link" to={previewUrl(preview)}>
          상담 미리보기로 돌아가기 <Icon name="arrow" size={17} />
        </Link>
      )}
      <PageHeading
        title="커트 기록 · 경과"
        description="당일의 느낌과 이후 변화를 함께 확인하세요."
      />
      <div className="two-column">
        <section>
          <article className="panel record-hero">
            <Cover
              photo={photos.find((photo) => !photo.progressId)}
              expandable
              cutDate={cut.cutDate}
            />
            <div className="record-hero-content">
              <p className="eyebrow">{displayDate(cut.cutDate)}</p>
              <h2>{cutTitle(cut.cutDate, cut.service)}</h2>
              <AreaChips areas={cut.areas} />
              <p className="card-note">{cut.goodNote || '당일에 남긴 메모가 없습니다.'}</p>
              <div className="detail-values">
                {cut.salonName && <span>{cut.salonName}</span>}
                {cut.designerName && <span>{cut.designerName} 디자이너</span>}
                {cut.price !== undefined && <span>{cut.price.toLocaleString()}원</span>}
              </div>
              <div className="record-edit-actions">
                <Link className="text-link" to={`/records/${cut.id}/edit`}>
                  기록 수정 <Icon name="arrow" size={17} />
                </Link>
                <Link className="text-link" to={`/records/${cut.id}/progress/new`}>
                  경과 추가
                  <Icon name="plus" />
                </Link>
              </div>
            </div>
          </article>
          <PhotoList
            photos={photos.filter((photo) => !photo.progressId).slice(1)}
            cutDate={cut.cutDate}
          />
          <div className="section-heading">
            <h2>커트 이후의 변화</h2>
            <span className="count-label">경과 {entries.length}건</span>
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
            <section className="panel">
              <p className="muted">
                아직 경과를 남기지 않았어요. 집에서 느낀 점을 이어서 적어 보세요.
              </p>
              <Link className="text-link" to={`/records/${cut.id}/progress/new`}>
                첫 경과 남기기
                <Icon name="arrow" />
              </Link>
            </section>
          )}
        </section>
        <aside className="sidebar">
          <section className="panel">
            <Icon name="chat" size={25} />
            <h2 style={{ marginTop: 13 }}>다음 커트 준비</h2>
            <p className="muted">
              기록을 보고 이번에 요청할 내용을 정리하세요. 디자이너는 나중에 선택해도 됩니다.
            </p>
            {drafts.length ? (
              <>
                <Link className="button primary full" to={materialUrl(drafts[0])}>
                  작성 중인 요청 이어쓰기 <Icon name="arrow" />
                </Link>
                <button
                  className="text-link"
                  type="button"
                  style={{ marginTop: 16 }}
                  onClick={startPersonalRequest}
                >
                  새 요청 준비 <Icon name="plus" size={17} />
                </button>
              </>
            ) : (
              <button className="button primary full" onClick={startPersonalRequest}>
                이번 요청 정리 <Icon name="arrow" />
              </button>
            )}
            <Link
              className="button full"
              style={{ marginTop: 16 }}
              to={`/designers?record=${cut.id}`}
            >
              디자이너 선택
              <Icon name="arrow" />
            </Link>
          </section>
          {recordedDesigner && (
            <section className="panel recorded-designer">
              <p className="eyebrow">기록에 연결한 디자이너</p>
              <h2>{recordedDesigner.name} 디자이너</h2>
              <p className="muted">
                현재 소속 ·{' '}
                {recordedDesigner.affiliations.find((value) => value.current)?.salonName ??
                  '등록 전'}
              </p>
              <Link
                className="button full"
                to={`/designers/${recordedDesigner.id}?record=${cut.id}`}
              >
                프로필 · 상담 준비 <Icon name="arrow" size={17} />
              </Link>
            </section>
          )}
          {previews.length > 0 && (
            <section className="panel record-request-list">
              <h2>작성한 요청 자료</h2>
              {previews.slice(0, 3).map((value) => (
                <Link className="record-request-link" key={value.id} to={previewUrl(value)}>
                  <span>{value.designer ? `${value.designer.name} · 전송 전` : '개인 준비본'}</span>
                  <strong>{value.requests[0]?.content}</strong>
                  <span>
                    미리보기 <span aria-hidden="true">↗</span>
                  </span>
                </Link>
              ))}
              <Link className="text-link" to="/requests">
                요청 자료 전체 보기 <Icon name="arrow" size={17} />
              </Link>
            </section>
          )}
          <section className="panel">
            <h3>관찰한 날짜의 기록</h3>
            <p className="muted">
              경과 날짜는 그날 확인한 내용입니다. 불편이 처음 생긴 날을 뜻하지는 않아요.
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
  if (!cut || (progressId && !original)) return <Missing />;
  return (
    <ProgressFormBody
      key={progressId ?? `new-${id}`}
      cut={cut}
      {...(progressId ? edit : fresh)}
      editingId={progressId}
    />
  );
}
function ProgressFormBody({
  cut,
  draft,
  update,
  clear,
  editingId,
}: { cut: CutRecord; editingId?: string } & ReturnType<typeof useProgressDraft>) {
  const { repository, state } = usePrototype();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [photosBusy, setPhotosBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (photosBusy) return;
    setErrors({});
    setBusy(true);
    try {
      if (editingId) await repository.updateProgress(cut.id, editingId, draft);
      else await repository.addProgress(cut.id, draft);
      clear();
      navigate(`/records/${cut.id}`);
    } catch (failure) {
      setErrors(
        failure instanceof InputError
          ? failure.fields
          : { form: '경과를 확인하고 다시 시도해 주세요.' },
      );
    } finally {
      setBusy(false);
    }
  }
  const elapsed =
    draft.observedOn && draft.observedOn >= cut.cutDate
      ? daysAfter(cut.cutDate, draft.observedOn)
      : null;
  return (
    <div className="form-layout">
      <Link className="back-link" to={`/records/${cut.id}`}>
        ← 커트 기록
      </Link>
      <PageHeading
        title={editingId ? '경과 기록 수정' : '시간이 지난 뒤 남기기'}
        description={`${displayDate(cut.cutDate)} 커트에서 이어지는 기록`}
      />
      <form className="panel" onSubmit={submit} noValidate>
        <Alert message={errors.form ?? ''} />
        <div className="form-body">
          <div className="field-grid">
            <Field label="관찰 날짜" error={errors.observedOn}>
              <input
                type="date"
                min={cut.cutDate}
                max={today()}
                required
                value={draft.observedOn}
                onChange={(event) => update({ observedOn: event.target.value })}
                aria-invalid={!!errors.observedOn}
              />
            </Field>
            <div>
              <span className="field-label">커트 후 경과</span>
              <p className="selection-count">
                {elapsed !== null && Number.isFinite(elapsed) ? `D+${elapsed}` : '—'}
              </p>
            </div>
          </div>
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
              placeholder="옆머리가 금방 떠요"
              aria-invalid={!!errors.discomfort}
            />
          </Field>
          <Field label="평소 손질">
            <textarea
              maxLength={2000}
              value={draft.styling}
              onChange={(event) => update({ styling: event.target.value })}
              placeholder="드라이만 하고 있어요"
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
          {editingId ? (
            <PhotoList
              photos={state.photos.filter((photo) => photo.progressId === editingId)}
              cutDate={cut.cutDate}
            />
          ) : (
            <PhotoPicker
              photos={draft.photos}
              onChange={(photos) => update({ photos })}
              onBusyChange={setPhotosBusy}
            />
          )}
          {errors.photos && <Alert message={errors.photos} />}
        </div>
        <div className="form-actions">
          <button
            className="button"
            type="button"
            onClick={() => {
              if (!editingId) draft.photos.forEach(repository.releasePhoto);
              clear();
              navigate(`/records/${cut.id}`);
            }}
          >
            취소
          </button>
          <button disabled={busy || photosBusy} className="button coral" type="submit">
            {editingId ? '수정 저장' : '경과 저장'}
            <Icon name="check" />
          </button>
        </div>
        <p className="form-note">
          {editingId
            ? '사진은 그대로 유지됩니다. 수정 내용은 이전 요청 미리보기에 반영되지 않습니다.'
            : '관찰 날짜는 내용을 확인한 날입니다. 이번 기록도 메모리에만 저장됩니다.'}
        </p>
      </form>
    </div>
  );
}
