import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Alert, Avatar, Icon, Missing, PageHeading } from './components';
import { Field, PhotoList } from './fields';
import { AreaChips, ProgressBlock } from './record-pages';
import { usePrototype } from './prototype/context';
import { AREAS, INTENTS } from './prototype/types';
import type { Area, ConsultationDraft, DesignerProfile, Intent, RequestItem } from './prototype/types';
import { cutTitle, daysAfter, displayDate } from './prototype/dates';

function currentSalon(designer: DesignerProfile) { return designer.affiliations.find(value => value.current)?.salonName ?? '소속 미등록'; }
function newRequest(): RequestItem { return { id: crypto.randomUUID(), area: 'SIDE', intent: 'ASK', content: '' }; }
function newDraft(designerId: string, cutId: string): ConsultationDraft { return { designerId, cutId, includeGoodNote: false, progressIds: [], photoIds: [], requests: [newRequest()], homeStyling: '', additionalQuestion: '' }; }
function selectedCount(draft: ConsultationDraft) { return Number(draft.includeGoodNote) + draft.progressIds.length + draft.photoIds.length; }
function profileUrl(id: string, record: string | null) { return `/designers/${id}${record ? `?record=${encodeURIComponent(record)}` : ''}`; }
function materialUrl(draft: Pick<ConsultationDraft, 'designerId' | 'cutId'>) { return `/consultations/materials?designer=${encodeURIComponent(draft.designerId)}&record=${encodeURIComponent(draft.cutId)}`; }
function Steps({ current }: { current: number }) {
  return <div className="steps" aria-label="상담 준비 단계">{['디자이너', '자료 선택', '요청 정리', '미리보기'].map((label, index) => <span key={label} className={index === current ? 'active' : ''} aria-current={index === current ? 'step' : undefined}><b>{index + 1}</b>{label}{index < 3 && <span aria-hidden="true">　›</span>}</span>)}</div>;
}
function SelectedDesigner({ designer }: { designer: DesignerProfile }) { return <div className="selected-designer"><Avatar name={designer.name}/><div><strong>{designer.name} 디자이너</strong><p>{currentSalon(designer)}</p></div></div>; }

export function DesignerList() {
  const { state } = usePrototype();
  const [search] = useSearchParams();
  const record = search.get('record');
  if (record && !state.cuts.some(cut => cut.id === record)) return <Missing title="선택한 커트 기록을 찾을 수 없습니다"/>;
  return <><PageHeading eyebrow="YOUR NEXT CONVERSATION" title="디자이너 찾기" description="소개와 상담 분야를 보고, 이야기를 나눌 디자이너를 골라 보세요."/>{record && <Link className="back-link" to={`/records/${record}`}>← 선택한 커트 기록</Link>}<div className="designer-grid">{state.designers.map(designer => <Link className="panel designer-card" to={profileUrl(designer.id, record)} key={designer.id}><div className="designer-top"><Avatar name={designer.name}/><div><h3>{designer.name} 디자이너</h3><p>{currentSalon(designer)}</p></div></div><div className="chip-row">{designer.specialties.map(value => <span className="chip" key={value}>{value}</span>)}</div><p>{designer.introduction.split('\n')[0]}</p><div className="card-bottom"><span>가상 프로필 · 상담 후기 예시</span><span>프로필 보기 ↗</span></div></Link>)}</div><p className="form-note">인물·매장·후기는 화면 확인을 위한 가상 자료입니다.</p></>;
}

export function DesignerDetail() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const record = search.get('record');
  const { state } = usePrototype();
  const designer = state.designers.find(value => value.id === id);
  if (!designer || (record && !state.cuts.some(cut => cut.id === record))) return <Missing title="프로필 또는 선택한 기록을 찾을 수 없습니다"/>;
  return <><Link className="back-link" to={`/designers${record ? `?record=${encodeURIComponent(record)}` : ''}`}>← 디자이너 목록</Link><Steps current={0}/><div className="two-column"><section><div className="panel profile-banner"><Avatar name={designer.name} large/><div><p className="eyebrow">DESIGNER PROFILE</p><h1 tabIndex={-1}>{designer.name} 디자이너</h1><p>현재 소속 · {currentSalon(designer)}</p><div className="chip-row">{designer.specialties.map(value => <span className="chip" key={value}>{value}</span>)}</div></div></div><section className="panel profile-section" style={{ marginTop: 22 }}><h2>소개</h2><p>{designer.introduction}</p></section><section className="panel profile-section"><h2>소속 정보</h2>{designer.affiliations.map(value => <div className="detail-values" key={value.period}><strong>{value.salonName}</strong><span>{value.period}</span><span>{value.current ? '현재 소속' : '이전 소속'}</span></div>)}<p className="muted">소속이 바뀌어도 같은 디자이너 프로필에서 확인하는 방식입니다.</p></section><section className="panel profile-section"><div className="section-heading" style={{ marginTop: 0 }}><h2>상담 후기</h2><span className="chip">가상 후기</span></div>{designer.reviewExamples.map(review => <article className="review-card" key={review.id}><span className="review-meta">상담 고객 · {displayDate(review.date)}</span><p>{review.content}</p></article>)}</section></section><aside className="sidebar"><section className="panel sticky-summary"><h2>기록으로 상담 준비</h2><p className="muted">원하는 디자이너에게 보여 줄 자료와 이번 요청을 정리하세요.</p><Link className="button primary full" to={`/consultations/materials?designer=${designer.id}${record ? `&record=${encodeURIComponent(record)}` : ''}`}>상담 자료 선택<Icon name="arrow"/></Link><p className="form-note">이번 단계에서는 실제 요청을 전송하지 않습니다.</p></section></aside></div></>;
}

export function MaterialsPage() {
  const { state, consultationDraft, setConsultationDraft } = usePrototype();
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const designer = state.designers.find(value => value.id === search.get('designer'));
  const cutId = search.get('record') ?? (consultationDraft?.designerId === designer?.id ? consultationDraft?.cutId : undefined) ?? state.cuts[0]?.id;
  const cut = state.cuts.find(value => value.id === cutId);
  const draft = consultationDraft?.designerId === designer?.id && consultationDraft?.cutId === cut?.id ? consultationDraft : null;
  useEffect(() => {
    if (designer && cut) setConsultationDraft(previous => previous?.designerId === designer.id && previous?.cutId === cut.id ? previous : newDraft(designer.id, cut.id));
    setError('');
  }, [designer, cut, setConsultationDraft]);
  if (!designer || !cut) return <Missing title="상담할 디자이너와 기록을 선택해 주세요" message="새로고침하면 새로 작성한 자료는 사라집니다. 내 기록에서 다시 시작해 주세요."/>;
  if (!draft) return <p role="status">자료 확인 중</p>;
  const progress = state.progress.filter(value => value.cutId === cut.id).sort((a, b) => a.observedOn.localeCompare(b.observedOn));
  const photos = state.photos.filter(value => value.cutId === cut.id);
  const update = (input: Partial<ConsultationDraft>) => setConsultationDraft(previous => previous ? { ...previous, ...input } : previous);
  const toggle = (key: 'progressIds' | 'photoIds', id: string) => update({ [key]: draft[key].includes(id) ? draft[key].filter(value => value !== id) : [...draft[key], id] });
  return <><Link className="back-link" to={profileUrl(designer.id, cut.id)}>← 디자이너 프로필</Link><Steps current={1}/><PageHeading title="상담 자료 선택" description="보여 주고 싶은 메모와 경과, 사진만 골라 주세요."/><div className="two-column"><section className="panel"><SelectedDesigner designer={designer}/><Field label="기준 커트"><select value={cut.id} onChange={event => setSearch({ designer: designer.id, record: event.target.value })}>{state.cuts.map(value => <option key={value.id} value={value.id}>{cutTitle(value.cutDate, value.service)}</option>)}</select></Field><p className="form-note">다른 커트로 바꾸면 자료 선택과 요청 내용이 초기화됩니다.</p><div className="material-group"><h3>커트 당일 메모</h3>{cut.goodNote ? <label className="selectable"><input aria-label="커트 당일 메모 선택" type="checkbox" checked={draft.includeGoodNote} onChange={event => update({ includeGoodNote: event.target.checked })}/><div className="selectable-content"><strong>좋았던 점</strong><p>{cut.goodNote}</p></div></label> : <p className="muted">당일에 남긴 메모가 없습니다.</p>}</div><div className="material-group"><h3>커트 이후 경과</h3>{progress.map(entry => <label className="selectable" key={entry.id}><input aria-label={`경과 ${entry.observedOn} 선택`} type="checkbox" checked={draft.progressIds.includes(entry.id)} onChange={() => toggle('progressIds', entry.id)}/><div className="selectable-content"><strong>{displayDate(entry.observedOn)} <span className="day-label">D+{daysAfter(cut.cutDate, entry.observedOn)}</span></strong><p>{entry.areas.map(area => AREAS[area]).join(' · ')}</p>{entry.discomfort && <p>불편한 점 · {entry.discomfort}</p>}{entry.styling && <p>평소 손질 · {entry.styling}</p>}{entry.question && <p>물어볼 점 · {entry.question}</p>}</div></label>)}{!progress.length && <p className="muted">아직 경과가 없습니다.</p>}</div><div className="material-group"><h3>사진</h3>{photos.map((photo, index) => <label className="selectable" key={photo.id}><input aria-label={`사진 ${index + 1} 선택`} type="checkbox" checked={draft.photoIds.includes(photo.id)} onChange={() => toggle('photoIds', photo.id)}/><img src={photo.url} alt={photo.caption}/><div className="selectable-content"><strong>{displayDate(photo.date)}</strong><p>{photo.caption}</p></div></label>)}{!photos.length && <p className="muted">사진이 없습니다.</p>}</div></section><aside className="sidebar"><section className="panel sticky-summary"><h2>선택한 자료</h2><p className="selection-count">{selectedCount(draft)}<small style={{ fontSize: 14, marginLeft: 6 }}>개</small></p><p className="muted">메모 {Number(draft.includeGoodNote)} · 경과 {draft.progressIds.length} · 사진 {draft.photoIds.length}</p><p className="muted">커트 날짜·시술·부위와 선택한 자료만 포함합니다.</p><Alert message={error}/><button className="button primary full" onClick={() => { if (!selectedCount(draft)) setError('상담에 사용할 자료를 하나 이상 선택해 주세요.'); else navigate('/consultations/request'); }}>요청 작성<Icon name="arrow"/></button></section></aside></div></>;
}

export function RequestPage() {
  const { state, repository, consultationDraft: draft, setConsultationDraft } = usePrototype();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const designer = state.designers.find(value => value.id === draft?.designerId);
  if (!draft || !designer || !selectedCount(draft)) return <Missing title="먼저 상담 자료를 선택해 주세요" message="디자이너와 자료를 고른 뒤 요청을 작성할 수 있습니다."/>;
  const update = (input: Partial<ConsultationDraft>) => setConsultationDraft(previous => previous ? { ...previous, ...input } : previous);
  const updateRequest = (id: string, input: Partial<RequestItem>) => update({ requests: draft.requests.map(value => value.id === id ? { ...value, ...input } : value) });
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try { const preview = await repository.createPreview(draft!); navigate(`/consultations/previews/${preview.id}`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '자료와 요청을 다시 확인해 주세요.'); }
    finally { setBusy(false); }
  }
  return <div className="form-layout"><Link className="back-link" to={materialUrl(draft)}>← 자료 선택</Link><Steps current={2}/><PageHeading title="이번 요청 정리" description="그대로 둘 부분, 바꿀 부분, 물어볼 점을 부위별로 적어 주세요."/><form className="panel" onSubmit={submit} noValidate><SelectedDesigner designer={designer}/><p className="muted">선택한 자료 {selectedCount(draft)}개</p><Alert message={error}/>{draft.requests.map((item, index) => <section className="request-row" key={item.id}><div className="request-row-head"><strong>요청 {String(index + 1).padStart(2, '0')}</strong>{draft.requests.length > 1 && <button className="remove-link" type="button" aria-label={`요청 ${index + 1} 삭제`} onClick={() => update({ requests: draft.requests.filter(value => value.id !== item.id) })}>삭제</button>}</div><div className="field-grid"><Field label="부위"><select aria-label={`요청 부위 ${index + 1}`} value={item.area} onChange={event => updateRequest(item.id, { area: event.target.value as Area })}>{Object.entries(AREAS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field><Field label="요청 종류"><select aria-label={`요청 종류 ${index + 1}`} value={item.intent} onChange={event => updateRequest(item.id, { intent: event.target.value as Intent })}>{Object.entries(INTENTS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></Field></div><Field label="요청 내용"><textarea aria-label={`요청 내용 ${index + 1}`} required maxLength={2000} value={item.content} onChange={event => updateRequest(item.id, { content: event.target.value })} placeholder="옆머리 아래는 조금 짧게, 위쪽 길이는 남기고 싶어요"/></Field></section>)}<button className="text-link" type="button" onClick={() => update({ requests: [...draft.requests, newRequest()] })}><Icon name="plus" size={17}/>요청 항목 추가</button><div className="form-body" style={{ marginTop: 26 }}><Field label="집에서 손질" hint="선택"><textarea maxLength={2000} value={draft.homeStyling} onChange={event => update({ homeStyling: event.target.value })} placeholder="드라이만 하고 있어요"/></Field><Field label="추가 질문" hint="선택"><textarea maxLength={2000} value={draft.additionalQuestion} onChange={event => update({ additionalQuestion: event.target.value })} placeholder="함께 물어볼 내용이 있나요?"/></Field></div><div className="form-actions"><Link className="button" to={materialUrl(draft)}>자료 다시 고르기</Link><button type="submit" className="button primary" disabled={busy}>미리보기 확인<Icon name="arrow"/></button></div><p className="form-note">아직 실제로 전송하지 않습니다. 다음 화면에서 정리한 내용을 확인합니다.</p></form></div>;
}

export function PreviewPage() {
  const { id } = useParams();
  const { state, setConsultationDraft } = usePrototype();
  const navigate = useNavigate();
  const preview = state.previews.find(value => value.id === id);
  if (!preview) return <Missing title="상담 미리보기를 찾을 수 없습니다"/>;
  return <><Steps current={3}/><div className="preview-banner"><span className="success-symbol"><Icon name="check" size={32}/></span><h1 tabIndex={-1}>상담 요청 미리보기</h1><p>선택한 자료와 요청을 정리했어요. 실제 요청은 아직 보내지 않았습니다.</p></div><div className="two-column"><section><section className="panel preview-block"><div className="selected-designer"><Avatar name={preview.designer.name}/><div><strong>{preview.designer.name} 디자이너와 상담할 내용</strong><p>{preview.designer.salonName}</p></div></div><h2>{cutTitle(preview.cut.cutDate, preview.cut.service)}</h2><p className="muted">{displayDate(preview.cut.cutDate)}</p><AreaChips areas={preview.cut.areas}/>{preview.goodNote && <dl><div><dt>좋았던 점</dt><dd>{preview.goodNote}</dd></div></dl>}</section>{preview.progress.length > 0 && <section className="preview-block"><div className="section-heading"><h2>선택한 경과</h2><span className="count-label">{preview.progress.length}건</span></div><div className="timeline">{preview.progress.map(entry => <ProgressBlock key={entry.id} entry={entry} cutDate={preview.cut.cutDate}/>)}</div></section>}{preview.photos.length > 0 && <section className="panel preview-block"><h2>선택한 사진</h2><PhotoList photos={preview.photos}/></section>}<section className="panel preview-block"><h2>이번 요청</h2>{preview.requests.map(item => <article className="request-summary" key={item.id}><h3>{AREAS[item.area]}<span className="request-chip">{INTENTS[item.intent]}</span></h3><p>{item.content}</p></article>)}{preview.homeStyling && <dl><div><dt>집에서 손질</dt><dd>{preview.homeStyling}</dd></div></dl>}{preview.additionalQuestion && <dl><div><dt>추가 질문</dt><dd>{preview.additionalQuestion}</dd></div></dl>}</section></section><aside className="sidebar"><section className="panel sticky-summary"><h2>보여 줄 내용 확인</h2><p className="muted">고르지 않은 기록과 사진은 포함하지 않았어요.</p><button className="button primary full" onClick={() => { setConsultationDraft(structuredClone(preview.sourceDraft)); navigate('/consultations/request'); }}>내용 수정</button><Link className="button full" style={{ marginTop: 12 }} to={`/records/${preview.cut.id}`}>원본 기록 보기</Link><p className="form-note">이 미리보기는 확인한 시점의 자료입니다. 실제 저장·전송은 후속 단계에서 연결합니다.</p></section></aside></div></>;
}
