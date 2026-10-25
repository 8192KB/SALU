import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth/context';
import { directoryRequest } from './auth/api';
import type { SessionMember } from './auth/api';
import { listSentConsultations } from './consultation-api';
import { Alert, BackLink, Icon, PageHeading, Loading } from './components';
import { Link, useNavigate, useWorkspace } from './workspace';
import { useLoginPath } from './auth/pages';
import { sentTime } from './prototype/dates';
import { useLiveRefresh, useLocalSignal } from './realtime';
import { useActivePage } from './main-navigation';
import type { RealtimeEvent } from './realtime';

// 알림·실시간 API 계약(docs/notification-api.md)의 응답 모양
export type NotificationType =
  | 'CONSULTATION_REQUESTED'
  | 'CONSULTATION_ANSWERED'
  | 'CONSULTATION_MESSAGE'
  | 'REVIEW_RECEIVED'
  | 'COMMUNITY_COMMENT'
  | 'COMMUNITY_POST_HIDDEN'
  | 'COMMUNITY_COMMENT_HIDDEN'
  | 'COMMUNITY_SUSPENDED';
const TYPES: NotificationType[] = [
  'CONSULTATION_REQUESTED',
  'CONSULTATION_ANSWERED',
  'CONSULTATION_MESSAGE',
  'REVIEW_RECEIVED',
  'COMMUNITY_COMMENT',
  'COMMUNITY_POST_HIDDEN',
  'COMMUNITY_COMMENT_HIDDEN',
  'COMMUNITY_SUSPENDED',
];
export type Notification = {
  id: number;
  type: NotificationType;
  targetId: string;
  actorName: string | null;
  createdAt: string;
  read: boolean;
};
type Inbox = { unreadCount: number; items: Notification[] };

const notificationEvent = (event: RealtimeEvent) => event.type === 'NOTIFICATION';
const path = (value: string) => encodeURIComponent(value);

// 서버는 종류와 대상 ID만 보내므로 문구와 갈 화면은 이곳 한 곳에서 정함.
// 상담 메시지는 받는 사람이 고객인지 디자이너인지에 따라 갈 화면이 달라 보낸 상담 ID 목록으로 정함.
// 목록을 아직 못 받았으면(sent가 null) 누를 때 다시 받아 정함
function describe(item: Notification, sent: Set<string> | null) {
  const actor = item.actorName ?? '회원';
  switch (item.type) {
    case 'CONSULTATION_REQUESTED':
      return {
        text: `${actor}님이 상담을 보냈어요`,
        to: `/consultations/received/${path(item.targetId)}`,
      };
    case 'CONSULTATION_ANSWERED':
      return {
        text: `${actor} 디자이너가 답변했어요`,
        to: `/consultations/${path(item.targetId)}`,
      };
    case 'CONSULTATION_MESSAGE':
      return sent?.has(item.targetId)
        ? {
            text: `${actor} 디자이너가 메시지를 보냈어요`,
            to: `/consultations/${path(item.targetId)}`,
          }
        : {
            text: `${actor}님이 메시지를 보냈어요`,
            to: `/consultations/received/${path(item.targetId)}`,
          };
    case 'REVIEW_RECEIVED':
      return {
        text: `${actor}님이 후기를 남겼어요`,
        to: `/consultations/received/${path(item.targetId)}`,
      };
    case 'COMMUNITY_COMMENT':
      return {
        text: `${actor}님이 내 글에 댓글을 남겼어요`,
        to: `/community/${path(item.targetId)}`,
      };
    case 'COMMUNITY_POST_HIDDEN':
      return { text: '내 글이 숨겨져 다른 사람에게 보이지 않아요', to: '/community/mine' };
    case 'COMMUNITY_COMMENT_HIDDEN':
      return {
        text: '내 댓글이 숨겨져 다른 사람에게 보이지 않아요',
        to: `/community/${path(item.targetId)}`,
      };
    case 'COMMUNITY_SUSPENDED':
      return { text: '커뮤니티 글·댓글 쓰기가 제한됐어요', to: '/community/mine' };
  }
}

function isNotification(value: unknown): value is Notification {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(item.id) &&
    TYPES.includes(item.type as NotificationType) &&
    typeof item.targetId === 'string' &&
    (item.actorName === null || typeof item.actorName === 'string') &&
    typeof item.createdAt === 'string' &&
    typeof item.read === 'boolean'
  );
}
async function fetchInbox(): Promise<Inbox> {
  const body = await directoryRequest<Inbox>('/api/my/notifications');
  if (!body || !Number.isSafeInteger(body.unreadCount) || !Array.isArray(body.items))
    throw new Error('알림을 읽지 못했어요. 다시 시도해 주세요.');
  // 화면이 모르는 종류는 건너뜀. 종류를 늘릴 때 이 파일의 describe를 함께 고침
  return { unreadCount: body.unreadCount, items: body.items.filter(isNotification) };
}
async function fetchUnreadCount() {
  const body = await directoryRequest<{ count: number }>('/api/my/notifications/unread-count');
  return body && Number.isSafeInteger(body.count) ? body.count : 0;
}

function useMember(): SessionMember | null {
  const { state } = useAuth();
  return state.status === 'authenticated' ? state.member : null;
}

// 상담·글 상세를 보고 있으면 그 대상의 안 읽은 알림을 읽음으로 바꿈. 알림 목록을 거치지 않고 열어도
// 배지가 남지 않게 함. 메뉴를 옮겨 숨겨진 화면에서는 바꾸지 않음
export function useReadNotifications(
  targetId: string | undefined,
  types: NotificationType[],
  // 실시간 신호로 저절로 바뀌지 않는 화면은 새 알림의 내용을 먼저 다시 받아 보여 준 뒤 읽음으로 바꿈
  refresh?: () => Promise<unknown>,
) {
  const member = useMember();
  const example = useWorkspace() === 'example';
  const active = useActivePage();
  const signal = useLocalSignal();
  const kinds = types.join(',');
  const latest = useRef(refresh);
  useEffect(() => {
    latest.current = refresh;
  });
  const read = useCallback(async () => {
    if (!active || !targetId || document.visibilityState === 'hidden') return;
    try {
      const inbox = await fetchInbox();
      const unread = inbox.items.filter(
        (item) => !item.read && item.targetId === targetId && kinds.split(',').includes(item.type),
      );
      if (!unread.length) return;
      await latest.current?.();
      await Promise.all(
        unread.map((item) => directoryRequest(`/api/my/notifications/${item.id}/read`, 'POST')),
      );
      signal({ type: 'NOTIFICATION', id: targetId });
    } catch {
      /* 읽음으로 못 바꾸면 알림 목록에서 그대로 보이므로 화면을 막지 않음 */
    }
  }, [active, targetId, kinds, signal]);
  useLiveRefresh(member && !example && targetId ? read : undefined, notificationEvent);
}

// 머리글의 알림 버튼. 로그인한 실제 공간에서만 보이고, 새 알림 신호가 오면 안 읽은 수를 다시 받음
export function NotificationButton() {
  const member = useMember();
  const example = useWorkspace() === 'example';
  const [count, setCount] = useState(0);
  const load = useCallback(
    () =>
      fetchUnreadCount().then(setCount, () => {
        /* 수를 못 받으면 이전 수를 그대로 둠 */
      }),
    [],
  );
  useLiveRefresh(member && !example ? load : undefined, notificationEvent);
  if (!member || example) return null;
  return (
    <Link
      className="notification-button"
      to="/notifications"
      aria-label={count ? `알림, 읽지 않은 알림 ${count}개` : '알림'}
    >
      <Icon name="bell" />
      {count > 0 && (
        <span className="notification-count" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

export function NotificationList() {
  const member = useMember();
  const { state } = useAuth();
  const example = useWorkspace() === 'example';
  const loginPath = useLoginPath();
  const navigate = useNavigate();
  const signal = useLocalSignal();
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [sent, setSent] = useState<Set<string> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!member) return;
    try {
      const [next, sentList] = await Promise.all([
        fetchInbox(),
        // 보낸 상담 목록은 메시지 알림이 갈 화면을 정할 때만 씀. 못 받아도 알림은 보여 줌
        listSentConsultations(member).catch(() => null),
      ]);
      setInbox(next);
      if (sentList) setSent(new Set(sentList.map((item) => item.id)));
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '알림을 불러오지 못했어요.');
    }
  }, [member]);
  useLiveRefresh(member && !example ? load : undefined, notificationEvent);

  async function readAll() {
    setBusy(true);
    try {
      await directoryRequest('/api/my/notifications/read-all', 'POST');
      setInbox(
        (value) =>
          value && {
            unreadCount: 0,
            items: value.items.map((item) => ({ ...item, read: true })),
          },
      );
      signal({ type: 'NOTIFICATION', id: 'read-all' });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '모두 읽음으로 바꾸지 못했어요.');
    } finally {
      setBusy(false);
    }
  }
  async function open(item: Notification, to: string) {
    if (!sent && item.type === 'CONSULTATION_MESSAGE' && member) {
      try {
        const known = new Set((await listSentConsultations(member)).map((value) => value.id));
        setSent(known);
        to = describe(item, known).to;
      } catch {
        setError('알림을 열지 못했어요. 잠시 후 다시 눌러 주세요.');
        return;
      }
    }
    // 읽음 처리를 기다리지 않고 바로 이동함. 실패해도 다음에 목록을 열면 다시 안 읽은 알림으로 보임
    if (!item.read)
      void directoryRequest(`/api/my/notifications/${item.id}/read`, 'POST').then(
        () => signal({ type: 'NOTIFICATION', id: String(item.id) }),
        () => {},
      );
    navigate(to);
  }

  const heading = (
    <PageHeading
      title="알림"
      back={<BackLink to="/">홈</BackLink>}
      action={
        inbox && inbox.unreadCount > 0 ? (
          <button type="button" className="button" disabled={busy} onClick={() => void readAll()}>
            모두 읽음
          </button>
        ) : undefined
      }
    />
  );
  if (example || state.status !== 'authenticated')
    return (
      <div className="notification-screen">
        {heading}
        <section className="consultation-soft-panel">
          {example ? (
            <>
              <h2>예시 체험에는 알림이 없어요</h2>
              <p>로그인하면 새 상담과 메시지를 알림으로 받을 수 있어요.</p>
            </>
          ) : state.status === 'checking' ? (
            <Loading>로그인 상태를 확인하고 있어요.</Loading>
          ) : (
            <>
              <h2>로그인이 필요해요</h2>
              <p>로그인하면 새 상담과 메시지를 알림으로 받을 수 있어요.</p>
              <Link className="button primary" to={loginPath}>
                로그인
              </Link>
            </>
          )}
        </section>
      </div>
    );
  return (
    <div className="notification-screen">
      {heading}
      <Alert message={error} />
      {!inbox ? (
        !error && <Loading>알림을 불러오고 있어요.</Loading>
      ) : inbox.items.length ? (
        <ul className="notification-list">
          {inbox.items.map((item) => {
            const { text, to } = describe(item, sent);
            return (
              <li key={item.id}>
                <a
                  href={to}
                  className={item.read ? '' : 'unread'}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                      return;
                    event.preventDefault();
                    void open(item, to);
                  }}
                >
                  <span className="notification-dot" aria-hidden="true" />
                  <span className="notification-text">
                    {!item.read && <span className="sr-only">읽지 않음. </span>}
                    {text}
                  </span>
                  <time dateTime={item.createdAt}>{sentTime(item.createdAt)}</time>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="consultation-soft-panel">
          <h2>아직 알림이 없어요</h2>
          <p>새 상담이나 메시지가 오면 이곳에서 알려 드려요.</p>
        </section>
      )}
    </div>
  );
}
