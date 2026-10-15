import { useCallback, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router';
import { Link, useNavigate, useWorkspace } from './workspace';
import { Alert, Avatar, BackLink, Missing, PageHeading } from './components';
import { Completion } from './completion';
import { useAuth } from './auth/context';
import { ApiFailure, directoryRequest } from './auth/api';
import { getConsultation, listReceivedConsultations, replyConsultation } from './consultation-api';
import type { Consultation } from './consultation-api';
import { threadFrom } from './consultation-store';
import {
  AttachmentCard,
  ConsultationAnswer,
  sentTime,
  useConsultationAccess,
  useRefreshOnFocus,
} from './consultation-flow';

// 디자이너가 받은 상담. 로그인한 실제 회원 화면이며 예시 체험과 섞지 않음
function useMember() {
  const { state } = useAuth();
  return state.status === 'authenticated' ? state.member : null;
}
const statusLabel = (value: Consultation) =>
  value.status === 'ANSWERED' ? '답변 완료' : '답변 전';

function ExampleNotice() {
  return (
    <div className="consultation-screen">
      <PageHeading title="받은 상담" back={<BackLink to="/consultations">상담 내역</BackLink>} />
      <section className="consultation-soft-panel">
        <h2>예시 체험에서는 받은 상담을 볼 수 없어요</h2>
        <p>디자이너 프로필을 등록한 계정으로 로그인하면 받은 상담을 확인할 수 있어요.</p>
      </section>
    </div>
  );
}

export function ReceivedList() {
  const example = useWorkspace() === 'example';
  const access = useConsultationAccess();
  const member = useMember();
  const [items, setItems] = useState<Consultation[] | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!member) return;
    setLoading(true);
    try {
      const [list, profile] = await Promise.all([
        listReceivedConsultations(member),
        directoryRequest<{ id: string }>('/api/my/designer-profile'),
      ]);
      setItems(list);
      setHasProfile(Boolean(profile));
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '받은 상담을 불러오지 못했어요.');
    } finally {
      setLoading(false);
    }
  }, [member]);
  useRefreshOnFocus(member && !example ? load : undefined);
  if (example) return <ExampleNotice />;
  return (
    <div className="consultation-screen">
      <PageHeading
        title="받은 상담"
        description="고객이 보낸 요청과 첨부한 커트 기록을 보고 답변해 주세요."
        back={<BackLink to="/consultations">상담 내역</BackLink>}
      />
      {access ??
        (error ? (
          <section className="consultation-soft-panel">
            <Alert message={error} />
            <button type="button" className="button" onClick={() => void load()}>
              다시 불러오기
            </button>
          </section>
        ) : !items ? (
          <p role="status">받은 상담을 불러오고 있어요.</p>
        ) : items.length ? (
          <div className="consultation-history">
            {items.map((item) => (
              <Link
                className="consultation-history-card"
                key={item.id}
                to={`/consultations/received/${item.id}`}
              >
                <div className="consultation-history-heading">
                  <Avatar name={item.customer.displayName} />
                  <h2>{item.customer.displayName}님</h2>
                  <span className="consultation-status">{statusLabel(item)}</span>
                </div>
                <p>{item.request}</p>
                <AttachmentCard attachment={threadFrom(item).attachment} />
                <time dateTime={item.sentAt}>{sentTime(item.sentAt)}</time>
              </Link>
            ))}
          </div>
        ) : (
          <section className="consultation-soft-panel">
            <h2>아직 받은 상담이 없어요</h2>
            {hasProfile ? (
              <p>고객이 상담을 보내면 이곳에 보여요.</p>
            ) : (
              <>
                <p>디자이너 프로필을 공개로 등록하면 고객이 상담을 보낼 수 있어요.</p>
                <Link className="button" to="/account/designer">
                  디자이너 프로필 등록
                </Link>
              </>
            )}
          </section>
        ))}
      {!access && items && (
        <div className="consultation-list-actions">
          <button
            type="button"
            className="text-link"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? '확인 중' : '새 상담 확인'}
          </button>
        </div>
      )}
    </div>
  );
}

export function ReceivedDetail() {
  const { id = '' } = useParams();
  const example = useWorkspace() === 'example';
  const access = useConsultationAccess();
  const member = useMember();
  const navigate = useNavigate();
  const [item, setItem] = useState<Consultation | null>(null);
  const [loadError, setLoadError] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async () => {
    if (!member) return;
    try {
      setItem(await getConsultation(member, id));
      setLoadError('');
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : '상담을 불러오지 못했어요.');
    }
  }, [member, id]);
  // 답변을 쓰는 동안 창으로 돌아와도 입력은 그대로 두고 상담만 다시 받음
  useRefreshOnFocus(member && !example ? load : undefined);
  if (example) return <ExampleNotice />;
  const heading = (
    <PageHeading
      title="받은 상담"
      back={<BackLink to="/consultations/received">받은 상담 목록</BackLink>}
    />
  );
  if (access)
    return (
      <div className="consultation-screen">
        {heading}
        {access}
      </div>
    );
  if (!item)
    return loadError ? (
      <Missing title="상담을 찾을 수 없어요" message={loadError} />
    ) : (
      <p role="status">상담을 불러오고 있어요.</p>
    );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !member) return;
    const text = content.trim();
    if (!text) {
      setError('답변을 적어 주세요.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await replyConsultation(member, id, text);
      setItem(saved);
      navigate(`/consultations/received/${id}/complete`, {
        replace: true,
        state: { celebrate: true },
      });
    } catch (failure) {
      // 이미 답변한 상담이면 저장된 답변을 다시 받아 보여 줌. 그 밖의 실패는 입력을 유지함
      if (failure instanceof ApiFailure && failure.code === 'RESOURCE_CONFLICT') {
        await load();
        setError('이미 답변한 상담이에요. 저장된 답변을 보여 드려요.');
      } else
        setError(
          failure instanceof Error
            ? failure.message
            : '답변을 보내지 못했어요. 다시 시도해 주세요.',
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="consultation-screen">
      {heading}
      <div className="consultation-history-heading">
        <Avatar name={item.customer.displayName} />
        <h2>{item.customer.displayName}님</h2>
        <span className="consultation-status">{statusLabel(item)}</span>
      </div>
      <section className="consultation-soft-panel">
        <h2>받은 요청</h2>
        <p className="consultation-message">{item.request}</p>
        <time dateTime={item.sentAt}>{sentTime(item.sentAt)}</time>
      </section>
      <section className="consultation-soft-panel">
        <h2>첨부한 커트 기록</h2>
        <AttachmentCard attachment={threadFrom(item).attachment} />
      </section>
      {item.canReply ? (
        <form onSubmit={submit} noValidate>
          <label className="consultation-request-field">
            <span>답변</span>
            <textarea
              aria-label="답변"
              maxLength={2000}
              rows={4}
              placeholder="예: 드라이할 때 옆머리를 아래로 눌러 말리면 덜 떠요."
              value={content}
              disabled={busy}
              onChange={(event) => {
                setContent(event.target.value);
                setError('');
              }}
            />
          </label>
          <Alert message={error} />
          <div className="consultation-action">
            <p className="consultation-privacy">
              답변은 한 번만 보낼 수 있고 보낸 뒤에는 고칠 수 없어요.
            </p>
            <button type="submit" className="button primary full" disabled={busy} aria-busy={busy}>
              {busy ? '보내는 중' : '답변 보내기'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <Alert message={error} />
          <ConsultationAnswer reply={item.reply ?? undefined} />
        </>
      )}
    </div>
  );
}

export function ReceivedComplete() {
  const { id = '' } = useParams();
  return (
    <div className="consultation-sent">
      <Completion
        title="답변을 보냈어요"
        description="고객이 상담 내역에서 답변을 확인할 수 있어요."
        primary="받은 상담 목록"
        to="/consultations/received"
        secondary="보낸 답변 보기"
        secondaryTo={`/consultations/received/${id}`}
      >
        {null}
      </Completion>
    </div>
  );
}
