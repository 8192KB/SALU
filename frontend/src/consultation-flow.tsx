import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Link, useNavigate } from './workspace';
import { usePrototype } from './prototype/context';
import { useDirectory } from './directory';
import {
  Alert,
  Avatar,
  BackLink,
  Icon,
  Missing,
  PageHeading,
  PhotoPlaceholder,
} from './components';
import { Completion } from './completion';
import { useConsultations } from './consultation-store';
import type {
  ConsultationAttachment,
  ConsultationReply,
  ConsultationRepository,
} from './consultation-store';
import type { DesignerProfile, PrototypeState, RequestPreview } from './prototype/types';
import { cutTitle } from './prototype/dates';

function attachmentFor(
  state: PrototypeState,
  cutId: string,
  preview?: RequestPreview,
): ConsultationAttachment | undefined {
  const cut = state.cuts.find((value) => value.id === cutId);
  if (!cut?.designerProfileId) return;
  if (preview?.cut.id === cutId) {
    const photo = preview.photos[0];
    return {
      cutId,
      designerId: cut.designerProfileId,
      cutDate: preview.cut.cutDate,
      service: preview.cut.service,
      summary: preview.goodNote || preview.progress.at(-1)?.discomfort || '커트한 날의 기록',
      photo: photo ? { id: photo.id, url: photo.url, caption: photo.caption } : undefined,
    };
  }
  const latest = state.progress
    .filter((value) => value.cutId === cutId)
    .sort((a, b) => b.observedOn.localeCompare(a.observedOn))[0];
  const photo = state.photos.find((value) => value.cutId === cutId && !value.progressId);
  return {
    cutId,
    designerId: cut.designerProfileId,
    cutDate: cut.cutDate,
    service: cut.service,
    summary: cut.goodNote || latest?.discomfort || '커트한 날의 기록',
    photo: photo ? { id: photo.id, url: photo.url, caption: photo.caption } : undefined,
  };
}
function AttachmentCard({ attachment }: { attachment: ConsultationAttachment }) {
  return (
    <div className="consultation-attachment">
      {attachment.photo ? (
        <img
          src={attachment.photo.url}
          alt={`${cutTitle(attachment.cutDate, attachment.service)} 사진`}
        />
      ) : (
        <PhotoPlaceholder />
      )}
      <div>
        <strong>{cutTitle(attachment.cutDate, attachment.service)}</strong>
        <p>{attachment.summary}</p>
      </div>
    </div>
  );
}
const sentFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  dateStyle: 'medium',
  timeStyle: 'short',
});
const sentTime = (date: string) => sentFormatter.format(new Date(date));

export function ConsultationDesignerProfile({
  designer,
  record,
  preview,
}: {
  designer: DesignerProfile;
  record: string | null;
  preview?: RequestPreview;
}) {
  const { state } = usePrototype();
  const cuts = state.cuts.filter((cut) => cut.designerProfileId === designer.id);
  // 상담은 이 디자이너에게 받은 커트만 첨부함. 다른 커트에서 들어오면 선택 없이 시작
  const linked = record && cuts.some((cut) => cut.id === record) ? record : null;
  const query = new URLSearchParams({ designer: designer.id });
  if (linked) query.set('record', linked);
  if (linked && preview) query.set('preview', preview.id);
  return (
    <div className="consultation-screen consultation-profile">
      <PageHeading
        title="디자이너 프로필"
        back={<BackLink to="/designers">디자이너 목록</BackLink>}
      />
      <div className="consultation-profile-identity">
        <Avatar name={designer.name} large src={designer.avatarUrl} />
        <div>
          <h2>{designer.name} 디자이너</h2>
          <p>{designer.specialties.join(' · ')}</p>
        </div>
      </div>
      <section className="consultation-soft-panel">
        <h2>소개</h2>
        <p>{designer.introduction}</p>
      </section>
      <section className="consultation-soft-panel consultation-profile-reviews">
        <h2>상담 후기</h2>
        {designer.reviewExamples.length ? (
          designer.reviewExamples.map((review) => (
            <article key={review.id}>
              <span className="avatar consultation-review-avatar" aria-hidden="true">
                <Icon name="user" size={22} />
              </span>
              <p>{review.content}</p>
              <time dateTime={review.date}>{review.date.replaceAll('-', '.')}</time>
            </article>
          ))
        ) : (
          <p>아직 남겨진 후기가 없어요.</p>
        )}
      </section>
      <div className="consultation-action">
        {cuts.length ? (
          <Link className="button primary full" to={`/consultations/new?${query}`}>
            상담 요청
          </Link>
        ) : (
          <p className="muted">
            {designer.name} 디자이너에게 받은 커트 기록이 있으면 상담을 요청할 수 있어요.
          </p>
        )}
      </div>
    </div>
  );
}

export function ConsultationNew() {
  const { state } = usePrototype();
  const directory = useDirectory(state);
  const { repository, state: consultationState } = useConsultations();
  const [search] = useSearchParams();
  const designer = directory.designers.find((value) => value.id === search.get('designer'));
  const previewId = search.get('preview');
  const preview = state.previews.find((value) => value.id === previewId);
  const record = search.get('record') ?? preview?.cut.id ?? '';
  if (!repository)
    return (
      <Missing
        title="상담 요청을 연결하고 있어요"
        message="현재는 커트 기록과 개인 준비 내용을 보관할 수 있어요."
      />
    );
  if (
    !designer ||
    (record &&
      !state.cuts.some(
        (value) => value.id === record && value.designerProfileId === designer.id,
      )) ||
    (previewId && (!preview || preview.cut.id !== record))
  )
    return <Missing title="상담할 디자이너와 기록을 찾을 수 없어요" />;
  return (
    <ConsultationForm
      // 보낸 뒤에는 보관된 같은 화면도 새 초안으로 다시 시작
      key={`${consultationState.generation}:${consultationState.threads.length}:${designer.id}:${record}:${previewId ?? ''}`}
      repository={repository}
      designer={designer}
      record={record}
      preview={preview}
    />
  );
}
function ConsultationForm({
  repository,
  designer,
  record,
  preview,
}: {
  repository: ConsultationRepository;
  designer: DesignerProfile;
  record: string;
  preview?: RequestPreview;
}) {
  const { state } = usePrototype();
  const { state: consultations } = useConsultations();
  const navigate = useNavigate();
  const [initial] = useState(() =>
    repository.draft(
      designer.id,
      record,
      preview?.id,
      preview?.requests.map((value) => value.content).join('\n'),
    ),
  );
  const draft = consultations.drafts[initial.id] ?? initial;
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (change: Partial<Pick<typeof draft, 'cutId' | 'request'>>) => {
    repository.updateDraft(draft.id, change);
    setError('');
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const attachment = attachmentFor(state, draft.cutId, preview);
    if (!attachment) {
      setError('상담에 사용할 커트 기록을 선택해 주세요.');
      return;
    }
    if (!draft.request.trim()) {
      setError('이번 요청을 적어 주세요.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const thread = await repository.send({
        draftId: draft.id,
        designer: { id: designer.id, name: designer.name, avatarUrl: designer.avatarUrl },
        attachment,
        request: draft.request,
      });
      navigate(`/consultations/${thread.id}/complete`, {
        replace: true,
        state: { celebrate: true },
      });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : '요청을 보내지 못했어요. 다시 시도해 주세요.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="consultation-screen consultation-compose">
      <PageHeading
        title="상담 자료 선택"
        description="상담에 사용할 커트 기록을 선택해 주세요."
        back={
          <BackLink
            to={`/designers/${designer.id}${record ? `?record=${encodeURIComponent(record)}` : ''}`}
          >
            디자이너 프로필
          </BackLink>
        }
      />
      <form onSubmit={submit} noValidate>
        <fieldset className="consultation-choices" disabled={busy}>
          <legend className="sr-only">첨부할 커트 기록</legend>
          {state.cuts
            .filter((cut) => cut.designerProfileId === designer.id)
            .map((cut) => {
              const attachment = attachmentFor(state, cut.id, preview)!;
              const selected = cut.id === draft.cutId;
              return (
                <label className={`consultation-choice${selected ? ' selected' : ''}`} key={cut.id}>
                  <input
                    type="radio"
                    name="consultation-cut"
                    aria-label={`${cutTitle(cut.cutDate, cut.service)} 선택`}
                    checked={selected}
                    onChange={() => update({ cutId: cut.id })}
                  />
                  <AttachmentCard attachment={attachment} />
                  <span className="consultation-choice-mark" aria-hidden="true">
                    {selected && <Icon name="check" size={20} />}
                  </span>
                </label>
              );
            })}
        </fieldset>
        <label className="consultation-request-field">
          <span>이번 요청</span>
          <textarea
            aria-label="이번 요청"
            maxLength={2000}
            rows={3}
            placeholder="예: 옆머리가 뜨는데 손질 방법이 궁금해요"
            value={draft.request}
            disabled={busy}
            onChange={(event) => update({ request: event.target.value })}
          />
        </label>
        <Alert message={error} />
        <div className="consultation-action">
          <p className="consultation-privacy">
            첨부한 기록과 요청은 {designer.name} 디자이너만 볼 수 있어요.
          </p>
          <button type="submit" className="button primary full" disabled={busy} aria-busy={busy}>
            {busy ? '보내는 중' : '요청 보내기'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ConsultationComplete() {
  const { id = '' } = useParams();
  const { state } = useConsultations();
  const thread = state.threads.find((value) => value.id === id);
  if (!thread) return <Missing title="보낸 상담 요청을 찾을 수 없어요" />;
  const { attachment } = thread;
  // 기록 저장 완료와 같은 완료 화면을 써서 체크·문구·버튼 배치를 통일
  return (
    <div className="consultation-sent">
      <Completion
        title={`${thread.designer.name} 디자이너에게 전달했어요`}
        description="답변이 오면 상담 내역에서 확인할 수 있어요."
        primary="상담 내역 보기"
        to={`/consultations/${thread.id}`}
        secondary="상담 목록"
        secondaryTo="/consultations"
      >
        <div className="completed-summary">
          <div className="prepared-cut-photo">
            {attachment.photo ? (
              <img
                src={attachment.photo.url}
                alt={`${cutTitle(attachment.cutDate, attachment.service)} 사진`}
              />
            ) : (
              <PhotoPlaceholder />
            )}
          </div>
          <div>
            <strong>{cutTitle(attachment.cutDate, attachment.service)}</strong>
            <p>{attachment.summary}</p>
            <span>첨부한 커트 기록</span>
          </div>
        </div>
      </Completion>
    </div>
  );
}

export function ConsultationList() {
  const { state, repository } = useConsultations();
  if (!repository)
    return (
      <Missing
        title="상담 내역을 연결하고 있어요"
        message="현재는 커트 기록과 개인 준비 내용을 보관할 수 있어요."
      />
    );
  return (
    <div className="consultation-screen">
      <PageHeading
        title="상담 내역"
        action={
          <Link className="button" to="/designers">
            디자이너 찾기
          </Link>
        }
      />
      {state.threads.length ? (
        <div className="consultation-history">
          {[...state.threads].reverse().map((thread) => (
            <Link
              className="consultation-history-card"
              key={thread.id}
              to={`/consultations/${thread.id}`}
            >
              <div className="consultation-history-heading">
                <Avatar name={thread.designer.name} src={thread.designer.avatarUrl} />
                <h2>{thread.designer.name} 디자이너</h2>
                <span className="consultation-status">
                  {thread.status === 'ANSWERED' ? '답변 도착' : '답변 대기'}
                </span>
              </div>
              <p>{thread.request}</p>
              <AttachmentCard attachment={thread.attachment} />
              <time dateTime={thread.sentAt}>{sentTime(thread.sentAt)}</time>
            </Link>
          ))}
        </div>
      ) : (
        <section className="consultation-soft-panel">
          <h2>아직 보낸 상담이 없어요</h2>
          <p>지난 커트의 담당 디자이너에게 궁금한 점을 보내 보세요.</p>
          <Link className="button" to="/records">
            지난 커트 보기
          </Link>
        </section>
      )}
    </div>
  );
}
export function ConsultationAnswer({ reply }: { reply?: ConsultationReply }) {
  return (
    <section className="consultation-soft-panel consultation-reply">
      <h2>{reply ? '디자이너 답변' : '답변 대기'}</h2>
      {reply ? (
        <>
          <p>{reply.content}</p>
          <time dateTime={reply.repliedAt}>{sentTime(reply.repliedAt)}</time>
        </>
      ) : (
        <p>디자이너의 답변이 오면 이곳에서 확인할 수 있어요.</p>
      )}
    </section>
  );
}
export function ConsultationDetail() {
  const { id = '' } = useParams();
  const { state } = useConsultations();
  const thread = state.threads.find((value) => value.id === id);
  if (!thread) return <Missing title="상담 내역을 찾을 수 없어요" />;
  return (
    <div className="consultation-screen">
      <PageHeading title="상담 내역" back={<BackLink to="/consultations">상담 목록</BackLink>} />
      <div className="consultation-history-heading">
        <Avatar name={thread.designer.name} src={thread.designer.avatarUrl} />
        <h2>{thread.designer.name} 디자이너</h2>
        <span className="consultation-status">
          {thread.status === 'ANSWERED' ? '답변 도착' : '답변 대기'}
        </span>
      </div>
      <section className="consultation-soft-panel">
        <h2>보낸 요청</h2>
        <p className="consultation-message">{thread.request}</p>
        <time dateTime={thread.sentAt}>{sentTime(thread.sentAt)}</time>
      </section>
      <section className="consultation-soft-panel">
        <h2>첨부한 커트 기록</h2>
        <AttachmentCard attachment={thread.attachment} />
      </section>
      <ConsultationAnswer reply={thread.reply} />
    </div>
  );
}
