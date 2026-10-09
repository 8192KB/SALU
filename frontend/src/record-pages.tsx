import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Alert, Icon, Missing, PageHeading } from './components';
import { AreaChoices, Field, PhotoList, PhotoPicker } from './fields';
import { useProgressDraft, usePrototype } from './prototype/context';
import { AREAS } from './prototype/types';
import type { Area, CutRecord, RecordPhoto, ProgressEntry } from './prototype/types';
import { cutTitle, daysAfter, displayDate, today } from './prototype/dates';
import { InputError, newCutDraft } from './prototype/memory-repository';

export function AreaChips({ areas }: { areas: Area[] }) { return <div className="chip-row">{areas.map(area => <span className="chip" key={area}>{AREAS[area]}</span>)}</div>; }
function Cover({ photo }: { photo?: RecordPhoto }) { return <div className="record-cover">{photo ? <img src={photo.url} alt={photo.caption}/> : <div className="cover-placeholder"><Icon name="cut" size={42}/></div>}</div>; }

export function RecordList() {
  const { state } = usePrototype();
  const cuts = [...state.cuts].sort((a, b) => b.cutDate.localeCompare(a.cutDate));
  return <><PageHeading eyebrow="MY HAIR JOURNAL" title="나의 커트 기록" description="커트한 날부터 집에서 느낀 변화까지, 하나의 기록에." action={<Link className="button primary" to="/records/new"><Icon name="plus"/>새 기록</Link>}/>
    <div className="two-column"><section><div className="hero-banner"><div><p className="eyebrow">A LITTLE NOTE, A BETTER CONVERSATION</p><h2>내 머리를 가장 잘 아는 기록</h2><p>좋았던 점과 불편했던 점을 남기고, 다음 상담에 꺼내 보세요.</p></div><span className="hero-symbol"><Icon name="cut" size={32}/></span></div>
      <div className="section-heading"><h2>최근 커트</h2><span className="count-label">{cuts.length}개의 기록</span></div><div className="record-grid">{cuts.map(cut => <Link to={`/records/${cut.id}`} className="record-card" key={cut.id}><Cover photo={state.photos.find(photo => photo.cutId === cut.id && !photo.progressId)}/><div className="card-content"><time dateTime={cut.cutDate}>{displayDate(cut.cutDate)}</time><h3>{cutTitle(cut.cutDate, cut.service)}</h3><AreaChips areas={cut.areas}/><p className="card-note">{cut.goodNote || '커트 후 느낀 점을 이어서 남겨 보세요.'}</p><div className="card-bottom"><span>경과 {state.progress.filter(entry => entry.cutId === cut.id).length}건</span><span>기록 보기 <span aria-hidden="true">↗</span></span></div></div></Link>)}</div>{!cuts.length && <Missing title="첫 커트 기록을 남겨 보세요"/>}</section>
      <aside className="sidebar"><section className="panel"><p className="eyebrow">FROM RECORD TO CONSULTATION</p><h2>기록 다음에는?</h2><p className="muted">말로 설명하기 어려운 부분을 사진과 기록으로 정리해 보세요.</p><div className="small-step"><b>1</b><span>커트와 이후 변화 남기기</span></div><div className="small-step"><b>2</b><span>상담할 디자이너 선택</span></div><div className="small-step"><b>3</b><span>필요한 자료와 요청 정리</span></div><Link className="button full" style={{ marginTop: 24 }} to="/designers">디자이너 찾아보기<Icon name="arrow"/></Link></section><section className="panel"><h3>나만 보는 기록에서 시작</h3><p className="muted">모든 기록을 전달할 필요는 없어요. 상담에 사용할 자료만 직접 고릅니다.</p></section></aside>
    </div></>;
}

export function CutForm() {
  const { repository, cutDraft: draft, setCutDraft } = usePrototype();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const update = (input: Partial<typeof draft>) => setCutDraft(previous => ({ ...previous, ...input }));
  async function submit(event: FormEvent) {
    event.preventDefault(); setErrors({}); setBusy(true);
    try { const cut = await repository.createCut(draft); setCutDraft(newCutDraft()); navigate(`/records/${cut.id}`); }
    catch (failure) { setErrors(failure instanceof InputError ? failure.fields : { form: '기록을 확인하고 다시 시도해 주세요.' }); }
    finally { setBusy(false); }
  }
  return <div className="form-layout"><Link className="back-link" to="/">← 내 기록</Link><PageHeading eyebrow="CUT RECORD" title="이번 머리 남기기" description="커트한 날짜와 사진, 마음에 든 부분을 남겨 보세요."/><form className="panel" onSubmit={submit} noValidate><Alert message={errors.form ?? ''}/><div className="form-body"><PhotoPicker photos={draft.photos} onChange={photos => update({ photos })}/><div className="field-grid"><Field label="커트 날짜" error={errors.cutDate}><input type="date" required max={today()} value={draft.cutDate} onChange={event => update({ cutDate: event.target.value })} aria-invalid={!!errors.cutDate}/></Field><Field label="시술" error={errors.service}><input required maxLength={60} value={draft.service} onChange={event => update({ service: event.target.value })} placeholder="커트" aria-invalid={!!errors.service}/></Field></div><AreaChoices values={draft.areas} onChange={areas => update({ areas })} error={errors.areas}/><Field label="좋았던 점" hint="선택"><textarea maxLength={2000} value={draft.goodNote} onChange={event => update({ goodNote: event.target.value })} placeholder="앞머리 길이가 마음에 들어요"/></Field><details className="optional-fields"><summary>선택 정보 · 미용실, 담당자, 가격</summary><div className="field-grid"><Field label="미용실"><input maxLength={100} value={draft.salonName} onChange={event => update({ salonName: event.target.value })} placeholder="매장 이름"/></Field><Field label="담당자"><input maxLength={100} value={draft.designerName} onChange={event => update({ designerName: event.target.value })} placeholder="디자이너 이름"/></Field><Field label="가격" hint="원" error={errors.price}><input type="number" min="0" step="1" value={draft.price} onChange={event => update({ price: event.target.value })} placeholder="25000" aria-invalid={!!errors.price}/></Field></div></details>{errors.photos && <Alert message={errors.photos}/>}</div><div className="form-actions"><Link className="button" to="/">돌아가기</Link><button disabled={busy} className="button coral" type="submit">커트 기록 저장<Icon name="check"/></button></div><p className="form-note">이번에는 화면 안에만 저장됩니다. 새로고침하면 사라집니다.</p></form></div>;
}

export function ProgressBlock({ entry, cutDate, photos = [] }: { entry: ProgressEntry; cutDate: string; photos?: RecordPhoto[] }) {
  return <article className="panel timeline-entry"><div className="timeline-head"><time dateTime={entry.observedOn}>{displayDate(entry.observedOn)}</time><span className="day-label">D+{daysAfter(cutDate, entry.observedOn)}</span></div><AreaChips areas={entry.areas}/><dl>{entry.discomfort && <div><dt>불편한 점</dt><dd>{entry.discomfort}</dd></div>}{entry.styling && <div><dt>평소 손질</dt><dd>{entry.styling}</dd></div>}{entry.question && <div><dt>물어볼 점</dt><dd>{entry.question}</dd></div>}</dl><PhotoList photos={photos}/></article>;
}

export function RecordDetail() {
  const { id } = useParams();
  const { state } = usePrototype();
  const cut = state.cuts.find(value => value.id === id);
  if (!cut) return <Missing/>;
  const entries = state.progress.filter(entry => entry.cutId === id).sort((a, b) => a.observedOn.localeCompare(b.observedOn));
  const photos = state.photos.filter(photo => photo.cutId === id);
  return <><Link className="back-link" to="/">← 내 기록</Link><PageHeading eyebrow="CUT & AFTER" title="커트 기록 · 경과" description="당일의 느낌과 이후 변화를 함께 확인하세요."/><div className="two-column"><section><article className="panel record-hero"><Cover photo={photos.find(photo => !photo.progressId)}/><div className="record-hero-content"><p className="eyebrow">{displayDate(cut.cutDate)}</p><h2>{cutTitle(cut.cutDate, cut.service)}</h2><AreaChips areas={cut.areas}/><p className="card-note">{cut.goodNote || '당일에 남긴 메모가 없습니다.'}</p><div className="detail-values">{cut.salonName && <span>{cut.salonName}</span>}{cut.designerName && <span>{cut.designerName} 디자이너</span>}{cut.price !== undefined && <span>{cut.price.toLocaleString()}원</span>}</div><Link className="text-link" to={`/records/${cut.id}/progress/new`}>경과 추가<Icon name="plus"/></Link></div></article><PhotoList photos={photos.filter(photo => !photo.progressId).slice(1)}/><div className="section-heading"><h2>커트 이후의 변화</h2><span className="count-label">경과 {entries.length}건</span></div><div className="timeline">{entries.map(entry => <ProgressBlock key={entry.id} entry={entry} cutDate={cut.cutDate} photos={photos.filter(photo => photo.progressId === entry.id)}/>)}</div>{!entries.length && <section className="panel"><p className="muted">아직 경과를 남기지 않았어요. 집에서 느낀 점을 이어서 적어 보세요.</p><Link className="text-link" to={`/records/${cut.id}/progress/new`}>첫 경과 남기기<Icon name="arrow"/></Link></section>}</section><aside className="sidebar"><section className="panel"><Icon name="chat" size={25}/><h2 style={{ marginTop: 13 }}>이 기록으로 상담하기</h2><p className="muted">디자이너를 고르고, 필요한 사진과 경과만 선택하세요.</p><Link className="button primary full" to={`/designers?record=${cut.id}`}>디자이너 선택<Icon name="arrow"/></Link></section><section className="panel"><h3>관찰한 날짜의 기록</h3><p className="muted">경과 날짜는 그날 확인한 내용입니다. 불편이 처음 생긴 날을 뜻하지는 않아요.</p></section></aside></div></>;
}

export function ProgressForm() {
  const { id = '' } = useParams();
  const { state } = usePrototype();
  const cut = state.cuts.find(value => value.id === id);
  const form = useProgressDraft(id);
  if (!cut) return <Missing/>;
  return <ProgressFormBody cut={cut} {...form}/>;
}
function ProgressFormBody({ cut, draft, update, clear }: { cut: CutRecord } & ReturnType<typeof useProgressDraft>) {
  const { repository } = usePrototype();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setErrors({}); setBusy(true);
    try { await repository.addProgress(cut.id, draft); clear(); navigate(`/records/${cut.id}`); }
    catch (failure) { setErrors(failure instanceof InputError ? failure.fields : { form: '경과를 확인하고 다시 시도해 주세요.' }); }
    finally { setBusy(false); }
  }
  const elapsed = draft.observedOn && draft.observedOn >= cut.cutDate ? daysAfter(cut.cutDate, draft.observedOn) : null;
  return <div className="form-layout"><Link className="back-link" to={`/records/${cut.id}`}>← 커트 기록</Link><PageHeading eyebrow="AFTER THE CUT" title="시간이 지난 뒤 남기기" description={`${displayDate(cut.cutDate)} 커트에서 이어지는 기록`}/><form className="panel" onSubmit={submit} noValidate><Alert message={errors.form ?? ''}/><div className="form-body"><div className="field-grid"><Field label="관찰 날짜" error={errors.observedOn}><input type="date" min={cut.cutDate} max={today()} required value={draft.observedOn} onChange={event => update({ observedOn: event.target.value })} aria-invalid={!!errors.observedOn}/></Field><div><span className="field-label">커트 후 경과</span><p className="selection-count">{elapsed !== null && Number.isFinite(elapsed) ? `D+${elapsed}` : '—'}</p></div></div><AreaChoices values={draft.areas} onChange={areas => update({ areas })} error={errors.areas}/><Field label="불편한 점" error={errors.discomfort}><textarea maxLength={2000} value={draft.discomfort} onChange={event => update({ discomfort: event.target.value })} placeholder="옆머리가 금방 떠요" aria-invalid={!!errors.discomfort}/></Field><Field label="평소 손질"><textarea maxLength={2000} value={draft.styling} onChange={event => update({ styling: event.target.value })} placeholder="드라이만 하고 있어요"/></Field><Field label="물어볼 점"><textarea maxLength={2000} value={draft.question} onChange={event => update({ question: event.target.value })} placeholder="다음 커트에서 어떻게 요청하면 좋을까요?"/></Field><PhotoPicker photos={draft.photos} onChange={photos => update({ photos })}/>{errors.photos && <Alert message={errors.photos}/>}</div><div className="form-actions"><Link className="button" to={`/records/${cut.id}`}>돌아가기</Link><button disabled={busy} className="button coral" type="submit">경과 저장<Icon name="check"/></button></div><p className="form-note">관찰 날짜는 내용을 확인한 날입니다. 이번 기록도 메모리에만 저장됩니다.</p></form></div>;
}
