import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { Link, useNavigate, useWorkspace } from './workspace';
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
import { AREAS, INTENTS } from './prototype/types';
import type { DesignerProfile, PrototypeState, RequestPreview } from './prototype/types';
import { cutTitle } from './prototype/dates';
import { previewUrl } from './prototype/request-flow';
import { useAuth } from './auth/context';
import { useLoginPath } from './auth/pages';
import { listReceivedConsultations } from './consultation-api';
import { consultationEvent, useLiveRefresh } from './realtime';

// 준비 내용은 고른 디자이너 누구에게나 보낼 수 있고, 기록만 고를 때는 그 커트를 해 준 디자이너에게만 보냄
function attachmentFor(
  state: PrototypeState,
  cutId: string,
  designerId: string,
  preview?: RequestPreview,
): ConsultationAttachment | undefined {
  const cut = state.cuts.find((value) => value.id === cutId);
  if (!cut) return;
  if (preview?.cut.id === cutId) {
    const photo = preview.photos[0];
    return {
      cutId,
      designerId,
      cutDate: preview.cut.cutDate,
      service: preview.cut.service,
      summary: preview.goodNote || preview.progress.at(-1)?.discomfort || '커트한 날의 기록',
      photo: photo ? { id: photo.id, url: photo.url, caption: photo.caption } : undefined,
    };
  }
  if (cut.designerProfileId !== designerId) return;
  const latest = state.progress
    .filter((value) => value.cutId === cutId)
    .sort((a, b) => b.observedOn.localeCompare(a.observedOn))[0];
  const photo = state.photos.find((value) => value.cutId === cutId && !value.progressId);
  return {
    cutId,
    designerId,
    cutDate: cut.cutDate,
    service: cut.service,
    summary: cut.goodNote || latest?.discomfort || '커트한 날의 기록',
    photo: photo ? { id: photo.id, url: photo.url, caption: photo.caption } : undefined,
  };
}
// 준비 내용의 부위·방향을 문장 앞에 붙여 디자이너가 어느 부위 이야기인지 알 수 있게 함
function requestFromPreview(preview: RequestPreview) {
  return [
    ...preview.requests.map(
      (value) => `${AREAS[value.area]} · ${INTENTS[value.intent]}: ${value.content}`,
    ),
    ...(preview.additionalQuestion ? [`질문: ${preview.additionalQuestion}`] : []),
  ]
    .join('\n')
    .slice(0, 2000);
}
export function AttachmentCard({ attachment }: { attachment: ConsultationAttachment }) {
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
export const sentTime = (date: string) => sentFormatter.format(new Date(date));

// 실제 상담은 로그인한 회원만 사용. 확인 중·연결 실패·비로그인이면 안내를 돌려줌
export function useConsultationAccess() {
  const { state } = useAuth();
  const loginPath = useLoginPath();
  const example = useWorkspace() === 'example';
  if (example || state.status === 'authenticated') return null;
  if (state.status === 'checking') return <p role="status">로그인 상태를 확인하고 있어요.</p>;
  const copy = {
    prototype: ['서버 없이 화면만 확인하는 중이에요', '상담 흐름은 예시 체험에서 볼 수 있어요.'],
    unavailable: ['서버에 연결할 수 없어요', '연결이 돌아오면 상담을 이어서 볼 수 있어요.'],
    guest: ['로그인이 필요해요', '로그인 후 디자이너에게 상담을 요청하고 답변을 볼 수 있어요.'],
  }[state.status];
  return (
    <section className="consultation-soft-panel">
      <h2>{copy[0]}</h2>
      <p>{copy[1]}</p>
      {state.status === 'guest' && (
        <Link className="button primary" to={loginPath}>
          로그인
        </Link>
      )}
      {state.status === 'prototype' && (
        <Link className="button" to="/examples/designers">
          예시 체험
        </Link>
      )}
    </section>
  );
}
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
  const recordCut = record ? state.cuts.find((cut) => cut.id === record) : undefined;
  // 이 디자이너가 해 주지 않은 커트도 준비 내용으로 정리하면 상담을 보낼 수 있음
  const prepareUrl = `/consultations/materials?${new URLSearchParams({
    designer: designer.id,
    ...(recordCut ? { record: recordCut.id } : {}),
  })}`;
  // 담당자가 비어 있는 기록만 이 디자이너로 연결하게 함. 다른 담당자가 있는 기록은 바꾸지 않음
  const canLink = Boolean(recordCut && !recordCut.designerProfileId);
  const editRecordUrl = recordCut ? `/records/${encodeURIComponent(recordCut.id)}/edit` : '';
  const salon = designer.affiliations.find((value) => value.current)?.salonName;
  const fromRecord = useSearchParams()[0].get('from') === 'record';
  return (
    <div className="consultation-screen consultation-profile">
      <PageHeading
        title="디자이너 프로필"
        back={
          fromRecord && record ? (
            <BackLink to={`/records/${record}`}>커트 기록으로</BackLink>
          ) : (
            <BackLink
              to={record ? `/designers?record=${encodeURIComponent(record)}` : '/designers'}
            >
              디자이너 목록
            </BackLink>
          )
        }
      />
      <div className="consultation-profile-identity">
        <Avatar name={designer.name} large src={designer.avatarUrl} />
        <div>
          <h2>{designer.name} 디자이너</h2>
          {salon && <p>현재 소속 · {salon}</p>}
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
          <>
            <Link className="button primary full" to={`/consultations/new?${query}`}>
              상담 요청
            </Link>
            {recordCut && !linked && (
              <Link className="text-link" to={canLink ? editRecordUrl : prepareUrl}>
                {canLink ? '보던 기록에도 이 디자이너 연결' : '보던 기록으로 상담 준비'}
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="muted">
              보낼 기록과 원하는 점을 먼저 정리한 뒤 {designer.name} 디자이너에게 상담을 요청해요.
            </p>
            <Link className="button primary full" to={prepareUrl}>
              {recordCut ? '이 기록으로 상담 준비' : '기록 골라 상담 준비'}
            </Link>
            {canLink && (
              <Link className="text-link" to={editRecordUrl}>
                이 디자이너가 해 준 커트라면 담당자로 연결
              </Link>
            )}
          </>
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
  const access = useConsultationAccess();
  if (!repository)
    return (
      <Missing
        title="상담 요청을 연결하고 있어요"
        message="현재는 커트 기록과 개인 준비 내용을 보관할 수 있어요."
      />
    );
  if (access)
    return (
      <div className="consultation-screen">
        <PageHeading
          title="상담 요청"
          back={
            designer ? (
              <BackLink
                to={`/designers/${designer.id}${record ? `?record=${encodeURIComponent(record)}` : ''}`}
              >
                디자이너 프로필
              </BackLink>
            ) : undefined
          }
        />
        {access}
      </div>
    );
  if (
    !designer ||
    (previewId && (!preview || preview.cut.id !== record)) ||
    (!preview &&
      record &&
      !state.cuts.some((value) => value.id === record && value.designerProfileId === designer.id))
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
    repository.draft(designer.id, record, preview?.id, preview && requestFromPreview(preview)),
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
    const attachment = attachmentFor(state, draft.cutId, designer.id, preview);
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
  const prepared = preview && attachmentFor(state, preview.cut.id, designer.id, preview);
  return (
    <div className="consultation-screen consultation-compose">
      <PageHeading
        title={prepared ? '상담 요청' : '상담 자료 선택'}
        description={
          prepared
            ? `준비한 내용을 ${designer.name} 디자이너에게 보내요.`
            : '상담에 사용할 커트 기록을 선택해 주세요.'
        }
        back={
          preview ? (
            <BackLink to={previewUrl(preview)}>준비 내용으로</BackLink>
          ) : (
            <BackLink
              to={`/designers/${designer.id}${record ? `?record=${encodeURIComponent(record)}` : ''}`}
            >
              디자이너 프로필
            </BackLink>
          )
        }
      />
      <form onSubmit={submit} noValidate>
        {prepared ? (
          // 준비 내용으로 왔으면 그 내용만 첨부하고 커트를 다시 고르게 하지 않음
          <section
            className="consultation-prepared"
            aria-labelledby="consultation-prepared-heading"
          >
            <h2 id="consultation-prepared-heading">함께 보낼 기록</h2>
            <AttachmentCard attachment={prepared} />
          </section>
        ) : (
          <fieldset className="consultation-choices" disabled={busy}>
            <legend className="sr-only">첨부할 커트 기록</legend>
            {state.cuts
              .filter((cut) => cut.designerProfileId === designer.id)
              .map((cut) => {
                const attachment = attachmentFor(state, cut.id, designer.id)!;
                const selected = cut.id === draft.cutId;
                return (
                  <label
                    className={`consultation-choice${selected ? ' selected' : ''}`}
                    key={cut.id}
                  >
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
        )}
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

// 서버 상담은 주소로 직접 열거나 새로고침하면 저장소에 없으므로 한 건을 다시 받음
function useThread(id: string) {
  const { state, repository } = useConsultations();
  const thread = state.threads.find((value) => value.id === id);
  const [error, setError] = useState('');
  const load = repository?.load;
  useLiveRefresh(
    load &&
      (() =>
        load(id).then(
          () => setError(''),
          (failure: unknown) =>
            setError(failure instanceof Error ? failure.message : '상담을 불러오지 못했어요.'),
        )),
    consultationEvent(id),
  );
  return { thread, error, server: Boolean(load) };
}

export function ConsultationComplete() {
  const { id = '' } = useParams();
  const { thread, error, server } = useThread(id);
  if (!thread)
    return server && !error ? (
      <p role="status">상담 요청을 불러오고 있어요.</p>
    ) : (
      <Missing title="보낸 상담 요청을 찾을 수 없어요" />
    );
  const { attachment } = thread;
  // 기록 저장 완료와 같은 완료 화면을 써서 체크·문구·버튼 배치를 통일
  return (
    <div className="consultation-sent">
      <Completion
        title={`${thread.designer.name} 디자이너에게 전달했어요`}
        description="답변이 오면 상담 내역에서 확인할 수 있어요."
        primary="보낸 상담 보기"
        to={`/consultations/${thread.id}`}
        secondary="상담 내역으로"
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

// 디자이너 프로필이 있는 회원에게 받은 상담 건수를 알려 줌. 실패해도 보낸 상담 화면은 그대로 둠
function useReceivedSummary(enabled: boolean) {
  const { state } = useAuth();
  const member = state.status === 'authenticated' ? state.member : null;
  const [summary, setSummary] = useState<{ total: number; waiting: number } | null>(null);
  useLiveRefresh(
    enabled && member
      ? () =>
          listReceivedConsultations(member).then(
            (items) =>
              setSummary({
                total: items.length,
                waiting: items.filter((item) => item.canReply).length,
              }),
            () => setSummary(null),
          )
      : undefined,
    consultationEvent(),
  );
  return summary;
}

export function ConsultationList() {
  const { state, repository } = useConsultations();
  const access = useConsultationAccess();
  const mode = useWorkspace();
  useLiveRefresh(access ? undefined : repository?.refresh, consultationEvent());
  const received = useReceivedSummary(!access && mode !== 'example' && Boolean(repository?.server));
  if (!repository)
    return (
      <Missing
        title="상담 내역을 연결하고 있어요"
        message="현재는 커트 기록과 개인 준비 내용을 보관할 수 있어요."
      />
    );
  const loading = state.loaded === false;
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
      {received && received.total > 0 && (
        <Link
          className="consultation-soft-panel consultation-received-link"
          to="/consultations/received"
        >
          <strong>받은 상담 {received.total}건</strong>
          <span>{received.waiting ? `답변 전 ${received.waiting}건` : '모두 답변했어요'}</span>
        </Link>
      )}
      {access ? (
        access
      ) : loading ? (
        <p role="status">상담 내역을 불러오고 있어요.</p>
      ) : state.threads.length ? (
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
        !state.error && (
          <section className="consultation-soft-panel">
            <h2>아직 보낸 상담이 없어요</h2>
            <p>지난 커트의 담당 디자이너에게 궁금한 점을 보내 보세요.</p>
            <Link className="button" to="/records">
              지난 커트 보기
            </Link>
          </section>
        )
      )}
      {!access && state.error && (
        <section className="consultation-soft-panel">
          <Alert message={state.error} />
          <button type="button" className="button" onClick={() => void repository.refresh?.()}>
            다시 불러오기
          </button>
        </section>
      )}
      {!access && repository.server && (
        <div className="consultation-list-actions">
          <button
            type="button"
            className="text-link"
            disabled={state.loading}
            onClick={() => void repository.refresh?.()}
          >
            {state.loading ? '확인 중' : '새 답변 확인'}
          </button>
          {mode !== 'example' && !received?.total && (
            <Link className="text-link" to="/consultations/received">
              받은 상담(디자이너)
            </Link>
          )}
        </div>
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
  const access = useConsultationAccess();
  const { thread, error, server } = useThread(id);
  if (access)
    return (
      <div className="consultation-screen">
        <PageHeading title="보낸 상담" back={<BackLink to="/consultations">상담 내역</BackLink>} />
        {access}
      </div>
    );
  if (!thread)
    return server && !error ? (
      <p role="status">상담 내역을 불러오고 있어요.</p>
    ) : (
      <Missing title="상담 내역을 찾을 수 없어요" message={error || undefined} />
    );
  return (
    <div className="consultation-screen">
      <PageHeading title="보낸 상담" back={<BackLink to="/consultations">상담 내역</BackLink>} />
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
