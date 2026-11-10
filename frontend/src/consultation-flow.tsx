import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useActivePage } from './main-navigation';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import { Link, useNavigate, useWorkspace } from './workspace';
import { usePrototype } from './prototype/context';
import { useDirectory } from './directory';
import {
  Alert,
  Avatar,
  BackLink,
  Icon,
  LoadFailure,
  loadProblem,
  Missing,
  PageHeading,
  PhotoPlaceholder,
  Loading,
} from './components';
import type { LoadProblem } from './components';
import { Completion } from './completion';
import { useConsultations } from './consultation-store';
import type {
  ConsultationAttachment,
  ConsultationReply,
  ConsultationRepository,
  ConsultationThread,
} from './consultation-store';
import { AREAS, INTENTS } from './prototype/types';
import type { DesignerProfile, PrototypeState, RequestPreview } from './prototype/types';
import { cutTitle, daysAfter, displayDate, sentTime } from './prototype/dates';
import { photoOrigin, previewUrl } from './prototype/request-flow';
import { MAX_CONSULTATION_PHOTOS } from './consultation-api';
import { useAuth } from './auth/context';
import { useLoginPath } from './auth/pages';
import { listReceivedConsultations } from './consultation-api';
import { consultationEvent, useLiveRefresh } from './realtime';
import { ConsultationConversation } from './consultation-conversation';
import { ConsultationReviewPanel, DesignerReviewList } from './consultation-review';
import { useReadNotifications } from './notifications';
import { AffiliationHistory, FavoriteButton } from './designer-parts';
import { SalonMap } from './salon-map';
import { RequestDraftHelper } from './ai-assist';
import {
  chargedFee,
  ConsultationPaymentPanel,
  isLinkedDesigner,
  startPayment,
  won,
} from './payment';
import { refreshDirectory } from './directory-cache';
import { useFavorites } from './designer-favorites';

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
    // 준비할 때 고른 사진·좋았던 점·경과를 모두 보냄. 사진은 서버 한도(6장)까지
    return {
      cutId,
      designerId,
      cutDate: preview.cut.cutDate,
      service: preview.cut.service,
      summary: previewSummary(preview),
      linkedDesigner: isLinkedDesigner(state, designerId),
      photos: preview.photos.slice(0, MAX_CONSULTATION_PHOTOS).map((photo) => ({
        id: photo.id,
        url: photo.url,
        caption: photo.caption,
        label: photoOrigin(photo, preview.cut.cutDate),
      })),
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
    linkedDesigner: true,
    photos: photo
      ? [{ id: photo.id, url: photo.url, caption: photo.caption, label: '커트 당일' }]
      : [],
  };
}
// 준비 내용의 좋았던 점·경과를 한 줄씩. 디자이너가 어느 날 어느 부위 이야기인지 알 수 있게 함
function previewSummary(preview: RequestPreview) {
  const lines = [
    ...(preview.goodNote ? [`좋았던 점: ${preview.goodNote}`] : []),
    ...preview.progress.map((entry) => {
      const areas = entry.areas.map((area) => AREAS[area]).join('·');
      const notes = [
        entry.discomfort && `불편한 점 ${entry.discomfort}`,
        entry.styling && `손질 ${entry.styling}`,
        entry.question && `질문 ${entry.question}`,
      ].filter(Boolean);
      return `경과 D+${daysAfter(preview.cut.cutDate, entry.observedOn)}${areas ? `(${areas})` : ''}: ${notes.join(' / ') || '사진만 남김'}`;
    }),
  ];
  return (lines.join('\n') || '커트한 날의 기록').slice(0, 2000);
}
// 준비 내용의 원하는 점·집에서 손질·질문을 한 줄씩. 부위와 방향을 앞에 붙임
function requestFromPreview(preview: RequestPreview) {
  return [
    ...preview.requests
      .filter((value) => value.content.trim())
      .map((value) => `${AREAS[value.area]}(${INTENTS[value.intent]}): ${value.content.trim()}`),
    ...(preview.homeStyling.trim() ? [`집에서 손질: ${preview.homeStyling.trim()}`] : []),
    ...(preview.additionalQuestion.trim() ? [`질문: ${preview.additionalQuestion.trim()}`] : []),
  ]
    .join('\n')
    .slice(0, 2000);
}
// 사진이 한 장 이하면 옆에, 여러 장이면 글 아래에 어느 때 사진인지와 함께 나란히 보여 줌
export function AttachmentCard({
  attachment,
  dropped = 0,
  compact = false,
}: {
  attachment: ConsultationAttachment;
  dropped?: number;
  // 목록 카드는 첫 사진과 장수만 보여 줌
  compact?: boolean;
}) {
  const title = cutTitle(attachment.cutDate, attachment.service);
  const several = !compact && attachment.photos.length > 1;
  return (
    <div className={`consultation-attachment${several ? ' several' : ''}`}>
      {!several &&
        (attachment.photos[0] ? (
          <img src={attachment.photos[0].url} alt={`${title} ${attachment.photos[0].label} 사진`} />
        ) : (
          <PhotoPlaceholder />
        ))}
      <div>
        <strong>{title}</strong>
        <p className="consultation-attachment-summary">{attachment.summary}</p>
        {compact && attachment.photos.length > 1 && (
          <span className="consultation-attachment-count">사진 {attachment.photos.length}장</span>
        )}
        {several && (
          <ul
            className="consultation-attachment-photos"
            aria-label={`첨부 사진 ${attachment.photos.length}장`}
          >
            {attachment.photos.map((photo) => (
              <li key={photo.id}>
                <img src={photo.url} alt={`${title} ${photo.label} 사진`} />
                <span>{photo.label}</span>
              </li>
            ))}
          </ul>
        )}
        {dropped > 0 && (
          <p className="consultation-attachment-note">
            사진은 {MAX_CONSULTATION_PHOTOS}장까지 보낼 수 있어 앞의 {MAX_CONSULTATION_PHOTOS}장만
            보내요. 나머지 {dropped}장은 보내지 않아요.
          </p>
        )}
      </div>
    </div>
  );
}

// 실제 상담은 로그인한 회원만 사용. 확인 중·연결 실패·비로그인이면 안내를 돌려줌
export function useConsultationAccess() {
  const { state } = useAuth();
  const loginPath = useLoginPath();
  const example = useWorkspace() === 'example';
  if (example || state.status === 'authenticated') return null;
  if (state.status === 'checking') return <Loading>로그인 상태를 확인하고 있어요.</Loading>;
  const copy = {
    prototype: ['예시 화면을 보는 중이에요', '상담 흐름은 예시 체험에서 볼 수 있어요.'],
    unavailable: ['연결할 수 없어요', '연결이 돌아오면 상담을 이어서 볼 수 있어요.'],
    guest: ['로그인이 필요해요', '로그인하면 보낸 상담과 받은 상담을 이어서 볼 수 있어요.'],
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
  // 연결할 디자이너를 미리 골라 둔 채 기록 수정을 엶
  const editRecordUrl = recordCut
    ? `/records/${encodeURIComponent(recordCut.id)}/edit?${new URLSearchParams({ designer: designer.id, consult: designer.id })}`
    : '';
  const salon = designer.affiliations.find((value) => value.current)?.salonName;
  const fromRecord = useSearchParams()[0].get('from') === 'record';
  const mode = useWorkspace();
  const favorites = useFavorites();
  const own = mode !== 'example' && favorites?.ownId === designer.id;
  const fee = chargedFee(state, designer);
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
              디자이너 찾기
            </BackLink>
          )
        }
      />
      <div className="consultation-profile-identity">
        <Avatar name={designer.name} large src={designer.avatarUrl} />
        <div>
          <h2>{designer.name} 디자이너</h2>
          {salon && <p>{salon}</p>}
          <p>{designer.specialties.join(', ')}</p>
          {fee > 0 && <p>상담 1회 {won(fee)}</p>}
        </div>
      </div>
      <FavoriteButton designer={designer} />
      {recordCut && !own && (
        <section className="consultation-soft-panel consultation-viewing-record">
          <h2>보던 기록</h2>
          <p>
            <strong>{cutTitle(recordCut.cutDate, recordCut.service)}</strong>
          </p>
          {recordCut.goodNote && <p>{recordCut.goodNote}</p>}
        </section>
      )}
      <section className="consultation-soft-panel">
        <h2>소개</h2>
        <p>{designer.introduction}</p>
      </section>
      {salon && designer.salonLocation && (
        <SalonMap name={salon} location={designer.salonLocation} />
      )}
      <AffiliationHistory designer={designer} />
      {mode !== 'example' ? (
        <DesignerReviewList designerId={designer.id} />
      ) : (
        <section className="consultation-soft-panel consultation-profile-reviews">
          <h2>상담 후기</h2>
          {designer.reviewExamples.length ? (
            designer.reviewExamples.map((review) => (
              <article key={review.id}>
                <span className="avatar consultation-review-avatar" aria-hidden="true">
                  <Icon name="user" size={22} />
                </span>
                <p>{review.content}</p>
                <time dateTime={review.date}>{displayDate(review.date, true)}</time>
              </article>
            ))
          ) : (
            <p>아직 남겨진 후기가 없어요.</p>
          )}
        </section>
      )}
      <div className="consultation-action">
        {own ? (
          // 내 프로필에는 나에게 상담을 보내는 길 대신 프로필 관리로 보냄
          <>
            <p className="muted">고객에게 보이는 내 프로필이에요.</p>
            <Link className="button primary full" to="/account/designer">
              내 프로필 고치기 <Icon name="arrow" />
            </Link>
          </>
        ) : cuts.length && !(recordCut && !linked) ? (
          <Link className="button primary full" to={`/consultations/new?${query}`}>
            상담 신청
          </Link>
        ) : cuts.length ? (
          // 보던 기록이 이 디자이너의 커트가 아니어도 그 기록으로 상담함. 이 디자이너의 다른 커트는 보조로
          <>
            <Link className="button primary full" to={prepareUrl}>
              이 기록으로 상담 신청
            </Link>
            <Link className="text-link" to={`/consultations/new?${query}`}>
              이 디자이너가 해 준 다른 커트로 상담 신청
            </Link>
            {canLink && (
              <Link className="text-link" to={editRecordUrl}>
                이 기록의 담당 디자이너로 저장
              </Link>
            )}
          </>
        ) : (
          <>
            <Link className="button primary full" to={prepareUrl}>
              {recordCut ? '이 기록으로 상담 신청' : '기록 골라 상담 신청'}
            </Link>
            {canLink && (
              <Link className="text-link" to={editRecordUrl}>
                이 기록의 담당 디자이너로 저장
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
  const favorites = useFavorites();
  const example = useWorkspace() === 'example';
  // 디자이너 목록을 받기 전에는 없는 디자이너로 판정하지 않음
  if (!example && !designer && !directory.loaded && !directory.error)
    return <Loading>디자이너 정보를 불러오고 있어요.</Loading>;
  if (!example && !designer && directory.error)
    return (
      <section className="panel">
        <Alert message={directory.error} />
        <button type="button" className="button" onClick={() => void refreshDirectory()}>
          다시 불러오기
        </button>
      </section>
    );
  // 그사이 비공개로 바뀌었거나 없는 디자이너. 같은 기록·준비로 다른 디자이너를 고르게 함
  if (!designer && search.get('designer'))
    return (
      <div className="consultation-screen">
        <PageHeading title="이 디자이너는 지금 상담을 받지 않아요" />
        <section className="consultation-soft-panel">
          <p>프로필이 비공개로 바뀌었을 수 있어요. 다른 디자이너를 골라 주세요.</p>
          <Link
            className="button primary"
            to={`/designers${
              preview
                ? `?preview=${encodeURIComponent(preview.id)}`
                : record
                  ? `?record=${encodeURIComponent(record)}`
                  : ''
            }`}
          >
            디자이너 고르기
          </Link>
        </section>
      </div>
    );
  if (designer && favorites?.ownId === designer.id)
    return (
      <Missing
        title="내 디자이너 프로필에는 상담을 신청할 수 없어요"
        message="다른 디자이너를 골라 주세요."
      />
    );
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
          title="상담 신청"
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
  const active = useActivePage();
  const base = preview && requestFromPreview(preview);
  const [initial, setInitial] = useState(() =>
    repository.draft(designer.id, record, preview?.id, base),
  );
  // 이 화면은 나갔다 와도 보관되므로, 다시 보일 때 그사이 고친 준비 내용·비운 요청을 다시 확인함
  useEffect(() => {
    if (!active) return;
    const next = repository.draft(designer.id, record, preview?.id, base);
    setInitial((current) => (current.id === next.id ? current : next));
  }, [active, repository, designer.id, record, preview?.id, base]);
  const draft = consultations.drafts[initial.id] ?? initial;
  // 새로고침 뒤에는 보낸 상담을 아직 안 받았으므로 이 준비로 보낸 적이 있으면 받아 옴(준비 내용 화면과 같음)
  const sentBefore = Boolean(preview && consultations.sentFrom?.[preview.id]?.length);
  useEffect(() => {
    if (sentBefore && consultations.loaded === false) void repository.refresh?.();
  }, [sentBefore, consultations.loaded, repository]);
  // 같은 준비 내용으로 이 디자이너에게 이미 보냈으면 알려 줌. 다시 보낼 수는 있음
  const alreadySent = preview
    ? consultations.threads.find(
        (thread) =>
          consultations.sentFrom?.[preview.id]?.includes(thread.id) &&
          thread.designer.id === designer.id &&
          thread.status !== 'CANCELED',
      )
    : undefined;
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fee = chargedFee(state, designer);
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
      // 요금이 있으면 바로 결제창을 엶. 창을 닫거나 못 열면 상세에서 다시 결제함
      if (thread.status === 'PAYMENT_PENDING') {
        await startPayment(thread).catch((failure: unknown) =>
          navigate(`/consultations/${thread.id}`, {
            replace: true,
            state: { paymentError: failure instanceof Error ? failure.message : '' },
          }),
        );
        return;
      }
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
  // 주소로 바로 왔는데 이 디자이너가 맡은 기록이 없으면 고를 것이 없으므로 자료 고르기로 안내함
  if (!prepared && !state.cuts.some((cut) => cut.designerProfileId === designer.id))
    return (
      <div className="consultation-screen">
        <PageHeading
          title={`${designer.name} 디자이너가 맡은 커트 기록이 없어요`}
          back={<BackLink to={`/designers/${designer.id}`}>디자이너 프로필</BackLink>}
        />
        <section className="consultation-soft-panel">
          <p>다른 커트 기록과 경과를 골라 상담할 내용을 준비해 주세요.</p>
          <Link
            className="button primary"
            to={`/consultations/materials?${new URLSearchParams({ designer: designer.id })}`}
          >
            기록 골라 상담 신청
          </Link>
        </section>
      </div>
    );
  return (
    <div className="consultation-screen consultation-compose">
      <PageHeading
        title="상담 신청"
        description={prepared ? undefined : '상담에 쓸 커트 기록을 골라 주세요.'}
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
      {alreadySent && (
        <p className="working-notice" role="status">
          이 준비 내용은 이미 {designer.name} 디자이너에게 보냈어요.{' '}
          <Link to={`/consultations/${alreadySent.id}`}>보낸 상담 보기</Link>
        </p>
      )}
      <form onSubmit={submit} noValidate>
        {prepared ? (
          // 준비 내용으로 왔으면 그 내용만 첨부하고 커트를 다시 고르게 하지 않음
          <section
            className="consultation-prepared"
            aria-labelledby="consultation-prepared-heading"
          >
            <h2 id="consultation-prepared-heading">함께 보낼 기록</h2>
            <AttachmentCard
              attachment={prepared}
              dropped={Math.max(0, (preview?.photos.length ?? 0) - MAX_CONSULTATION_PHOTOS)}
            />
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
        <RequestDraftHelper
          text={draft.request}
          disabled={busy}
          onApply={(value) => update({ request: value })}
        />
        <Alert message={error} />
        <div className="consultation-action">
          {fee > 0 && (
            <dl className="consultation-price">
              <dt>{designer.name} 디자이너 상담 1회</dt>
              <dd>{won(fee)}</dd>
            </dl>
          )}
          <p className="consultation-privacy">
            첨부한 기록과 요청은 {designer.name} 디자이너만 볼 수 있어요.
            {fee > 0 && (
              <>
                <br />
                답변을 받기 전에는 취소하면 환불돼요.
              </>
            )}
          </p>
          <button type="submit" className="button primary full" disabled={busy} aria-busy={busy}>
            {busy ? '신청하는 중' : '상담 신청하기'}
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
  const [error, setError] = useState<LoadProblem | null>(null);
  const load = repository?.load;
  const reload = useCallback(
    () =>
      load?.(id).then(
        () => setError(null),
        (failure: unknown) => setError(loadProblem(failure, '상담을 불러오지 못했어요.')),
      ),
    [load, id],
  );
  useLiveRefresh(load && reload, consultationEvent(id));
  return { thread, error, server: Boolean(load), reload };
}

export function ConsultationComplete() {
  const { id = '' } = useParams();
  const { thread, error, server, reload } = useThread(id);
  const example = useWorkspace() === 'example';
  if (!thread)
    return server && !error ? (
      <Loading>상담 요청을 불러오고 있어요.</Loading>
    ) : (
      <LoadFailure
        problem={error ?? { kind: 'missing', message: '' }}
        title="보낸 상담 요청을 찾을 수 없어요"
        onRetry={() => void reload()}
      />
    );
  const { attachment } = thread;
  // 기록 저장 완료와 같은 완료 화면을 써서 체크·문구·버튼 배치를 통일
  // 예시 체험은 디자이너에게 실제로 가지 않고 알림 메뉴도 없어 답변 알림을 약속하지 않음
  return (
    <div className="consultation-sent">
      <Completion
        title={`${thread.designer.name} 디자이너에게 전달했어요`}
        description={
          example
            ? '예시 체험이라 실제 디자이너에게는 가지 않아요.'
            : thread.payment?.status === 'PAID'
              ? `상담 요금 ${won(thread.fee ?? 0)}을 결제했어요. 답변이 오면 알림이 와요.`
              : '답변이 오면 알림이 와요.'
        }
        primary="보낸 상담 보기"
        to={`/consultations/${thread.id}`}
        secondary="상담 내역으로"
        secondaryTo="/consultations"
      >
        <div className="completed-summary">
          <div className="prepared-cut-photo">
            {attachment.photos[0] ? (
              <img
                src={attachment.photos[0].url}
                alt={`${cutTitle(attachment.cutDate, attachment.service)} 사진`}
              />
            ) : (
              <PhotoPlaceholder />
            )}
          </div>
          <div>
            <strong>{cutTitle(attachment.cutDate, attachment.service)}</strong>
            <p>{attachment.summary.split('\n')[0]}</p>
            {attachment.photos.length > 1 && <span>사진 {attachment.photos.length}장</span>}
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
          <span>{received.waiting ? `답변 대기 ${received.waiting}건` : '모두 답변했어요'}</span>
        </Link>
      )}
      {access ? (
        access
      ) : loading ? (
        <Loading>상담 내역을 불러오고 있어요.</Loading>
      ) : state.threads.length ? (
        <div className="consultation-history">
          {byLatest(state.threads).map((thread) => (
            <Link
              className="consultation-history-card"
              key={thread.id}
              to={`/consultations/${thread.id}`}
            >
              <div className="consultation-history-heading">
                <Avatar name={thread.designer.name} src={thread.designer.avatarUrl} />
                <h2>{thread.designer.name} 디자이너</h2>
                <UnreadBadge count={thread.unreadCount} />
                <ConsultationStatus status={thread.status} />
              </div>
              <p>{thread.request}</p>
              <AttachmentCard attachment={thread.attachment} compact />
              <LatestTime sentAt={thread.sentAt} lastMessageAt={thread.lastMessageAt} />
            </Link>
          ))}
        </div>
      ) : (
        !state.error && (
          <section className="consultation-soft-panel">
            <h2>아직 보낸 상담이 없어요</h2>
            <p>지난 커트의 담당 디자이너에게 궁금한 점을 보내세요.</p>
            <Link className="button" to="/records">
              지난 커트 보기
            </Link>
          </section>
        )
      )}
      {!access && state.error && (
        <section className="consultation-soft-panel">
          <Alert title="불러오지 못했어요" message={state.error} />
          <button type="button" className="button" onClick={() => void repository.refresh?.()}>
            다시 불러오기
          </button>
        </section>
      )}
      {!access && repository.server && !state.error && (
        <div className="consultation-list-actions">
          <button
            type="button"
            className="text-link"
            // 잠그면 누른 버튼에서 초점이 빠지므로 불러오는 중임만 알리고 두 번 누름은 무시함
            aria-busy={state.loading}
            onClick={() => {
              if (!state.loading) void repository.refresh?.();
            }}
          >
            {state.loading ? '불러오는 중' : '목록 새로고침'}
          </button>
        </div>
      )}
    </div>
  );
}
// 답변 도착·결제 대기는 고객이 볼 것이나 할 일이 생긴 상태라 색을 채워 구분함
const statusLabels = {
  PAYMENT_PENDING: '결제 대기',
  REQUESTED: '답변 대기',
  ANSWERED: '답변 도착',
  CANCELED: '취소됨',
};
function ConsultationStatus({ status }: { status: ConsultationThread['status'] }) {
  const filled = status === 'ANSWERED' || status === 'PAYMENT_PENDING';
  return (
    <span className={filled ? 'consultation-status filled' : 'consultation-status'}>
      {statusLabels[status]}
    </span>
  );
}
export function ConsultationAnswer({ reply }: { reply?: ConsultationReply }) {
  const example = useWorkspace() === 'example';
  return (
    <section className="consultation-soft-panel consultation-reply">
      <h2>{reply ? '디자이너 답변' : '답변 대기'}</h2>
      {reply ? (
        <>
          <p>{reply.content}</p>
          <time dateTime={reply.repliedAt}>{sentTime(reply.repliedAt)}</time>
        </>
      ) : (
        <p>
          {example ? '예시 체험이라 답변은 오지 않아요.' : '디자이너의 답변이 오면 여기에 떠요.'}
        </p>
      )}
    </section>
  );
}
// 목록 카드의 이름 옆에 안 읽은 메시지 수를 숫자로 표시함
export function UnreadBadge({ count }: { count?: number }) {
  return count ? (
    <span className="consultation-unread" aria-label={`새 메시지 ${count}개`}>
      {count > 99 ? '99+' : count}
    </span>
  ) : null;
}
// 목록 카드 시각. 정렬(byLatest)과 같은 기준이라 보낸 뒤 메시지가 오갔으면 그 시각을 보여 줌
export function LatestTime({ sentAt, lastMessageAt }: { sentAt: string; lastMessageAt?: string }) {
  const latest = lastMessageAt ?? sentAt;
  return (
    <time dateTime={latest}>
      {latest !== sentAt && '마지막 메시지 '}
      {sentTime(latest)}
    </time>
  );
}
// 마지막 메시지가 최근인 상담부터. 예시 상담은 메시지가 없어 보낸 시각으로 정렬
export const byLatest = <T extends { sentAt: string; lastMessageAt?: string }>(items: T[]) =>
  [...items].sort((a, b) =>
    (b.lastMessageAt ?? b.sentAt).localeCompare(a.lastMessageAt ?? a.sentAt),
  );

export function ConsultationDetail() {
  const { id = '' } = useParams();
  const access = useConsultationAccess();
  const { state } = useAuth();
  const member = state.status === 'authenticated' ? state.member : null;
  const { thread, error, server, reload } = useThread(id);
  const { repository, state: consultations } = useConsultations();
  // 보내기 직후 결제창을 열지 못했으면 그 이유를 결제 영역 위에 보여 줌
  const paymentError = (useLocation().state as { paymentError?: string } | null)?.paymentError;
  useReadNotifications(thread ? id : undefined, ['CONSULTATION_ANSWERED', 'CONSULTATION_MESSAGE']);
  // 받은 디자이너가 보낸 상담 주소를 열면 이름·버튼이 뒤바뀌지 않게 받은 상담 화면으로 바꿈
  if (consultations.received?.[id])
    return <Navigate to={`/consultations/received/${encodeURIComponent(id)}`} replace />;
  if (access)
    return (
      <div className="consultation-screen">
        <PageHeading title="보낸 상담" back={<BackLink to="/consultations">상담 내역</BackLink>} />
        {access}
      </div>
    );
  if (!thread)
    return server && !error ? (
      <Loading>상담 내역을 불러오고 있어요.</Loading>
    ) : (
      <LoadFailure
        problem={error ?? { kind: 'missing', message: '' }}
        title="상담을 찾을 수 없어요"
        onRetry={() => void reload()}
      />
    );
  // 결제 전·취소한 상담은 디자이너와 대화할 수 없음
  const open = thread.status === 'REQUESTED' || thread.status === 'ANSWERED';
  return (
    <div className="consultation-screen">
      <PageHeading title="보낸 상담" back={<BackLink to="/consultations">상담 내역</BackLink>} />
      <div className="consultation-history-heading">
        <Avatar name={thread.designer.name} src={thread.designer.avatarUrl} />
        <h2>{thread.designer.name} 디자이너</h2>
        <ConsultationStatus status={thread.status} />
      </div>
      {paymentError && thread.status === 'PAYMENT_PENDING' && <Alert message={paymentError} />}
      {server && <ConsultationPaymentPanel thread={thread} />}
      {thread.reply && <ConsultationAnswer reply={thread.reply} />}
      <section className="consultation-soft-panel">
        <h2>보낸 요청</h2>
        <p className="consultation-message">{thread.request}</p>
        <time dateTime={thread.sentAt}>{sentTime(thread.sentAt)}</time>
      </section>
      <section className="consultation-soft-panel">
        <h2>첨부한 커트 기록</h2>
        <AttachmentCard attachment={thread.attachment} />
      </section>
      {!open ? null : server && member ? (
        <ConsultationConversation
          id={thread.id}
          member={member}
          partner={`${thread.designer.name} 디자이너`}
          placeholder="예: 다음 주 토요일에 방문할게요."
          emptyMessage={
            thread.reply
              ? '답변을 보고 더 묻고 싶은 점이 있으면 메시지로 보내 주세요.'
              : '디자이너가 답변하면 화면 맨 위에 보여요. 그 전에도 더 전할 내용을 보낼 수 있어요.'
          }
          answerAt={thread.reply?.repliedAt}
        />
      ) : (
        !thread.reply && <ConsultationAnswer />
      )}
      {open && server && member && (
        <ConsultationReviewPanel
          consultation={{
            id: thread.id,
            designerName: thread.designer.name,
            reviewId: thread.reviewId,
            canReview: thread.canReview,
          }}
          onChange={() => repository?.load?.(thread.id)}
        />
      )}
    </div>
  );
}
