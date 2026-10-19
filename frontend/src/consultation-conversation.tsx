import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert } from './components';
import { useActivePage } from './main-navigation';
import { ApiFailure } from './auth/api';
import type { SessionMember } from './auth/api';
import { listMessages, markRead, sendMessage } from './consultation-api';
import type { ConsultationMessage } from './consultation-api';
import { newId } from './prototype/ids';
import { consultationEvent, useLiveRefresh, useLocalSignal } from './realtime';
import { sentTime } from './prototype/dates';

function merge(current: ConsultationMessage[], next: ConsultationMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of next) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

// 상담 하나의 메시지. 보낸 상담 상세와 받은 상담 상세가 함께 씀. 디자이너의 첫 메시지가 답변이라 목록 맨 앞에 있음
export function ConsultationConversation({
  id,
  member,
  partner,
  placeholder,
  emptyMessage,
  canWrite = true,
}: {
  id: string;
  member: SessionMember;
  // 상대 이름. 화면 낭독기와 안내 문구에 씀(예: '민준 디자이너', '하늘님')
  partner: string;
  placeholder: string;
  // 메시지가 없을 때 보여 줄 안내. 없으면 대화 구역을 숨김
  emptyMessage?: string;
  // 디자이너의 첫 답변은 답변 화면에서 따로 보내므로 그 전에는 목록만 보여 줌
  canWrite?: boolean;
}) {
  const active = useActivePage();
  const signal = useLocalSignal();
  const [messages, setMessages] = useState<ConsultationMessage[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  // 응답을 못 받은 메시지를 같은 내용으로 다시 보낼 때 같은 키를 써서 한 번만 저장되게 함
  const pending = useRef<{ key: string; content: string } | null>(null);
  const latest = useRef<ConsultationMessage[] | null>(null);
  const marked = useRef(0);
  const input = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const after = latest.current?.at(-1)?.id;
      const next = await listMessages(member, id, after);
      const merged = merge(latest.current ?? [], next);
      latest.current = merged;
      setMessages(merged);
      setLoadError('');
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : '메시지를 불러오지 못했어요.');
    }
  }, [member, id]);
  useLiveRefresh(load, consultationEvent(id));

  // 상대 메시지를 화면에 보여 준 뒤에만 읽음 위치를 올림. 다른 메뉴에 가려져 있거나 창이 숨겨져 있으면 미룸
  useEffect(() => {
    const last = [...(messages ?? [])].reverse().find((message) => !message.mine);
    if (!last || last.id <= marked.current || !active) return;
    const mark = () => {
      if (document.visibilityState !== 'visible' || last.id <= marked.current) return;
      marked.current = last.id;
      markRead(member, id, last.id).then(
        // 읽음은 서버 신호가 없어 목록의 안 읽은 수를 이 탭에서 직접 다시 불러오게 함
        () => signal({ type: 'CONSULTATION', id }),
        () => {
          marked.current = 0;
        },
      );
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => document.removeEventListener('visibilitychange', mark);
  }, [messages, active, member, id, signal]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const content = draft.trim();
    if (!content) {
      setError('보낼 메시지를 적어 주세요.');
      input.current?.focus();
      return;
    }
    if (pending.current?.content !== content) pending.current = { key: newId(), content };
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await sendMessage(member, id, pending.current.key, content);
      pending.current = null;
      latest.current = merge(latest.current ?? [], [saved]);
      setMessages(latest.current);
      setDraft('');
    } catch (failure) {
      // 연결이 끊겨 저장됐는지 모를 때도 입력을 지우지 않음. 다시 보내면 같은 키라 두 번 저장되지 않음
      setError(
        failure instanceof ApiFailure && (failure.status === 0 || failure.status >= 500)
          ? '메시지를 보내지 못했어요. 적은 내용은 그대로 있으니 다시 보내 주세요.'
          : failure instanceof Error
            ? failure.message
            : '메시지를 보내지 못했어요.',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (!messages)
    return loadError ? (
      <section className="consultation-soft-panel">
        <Alert message={loadError} />
        <button type="button" className="button" onClick={() => void load()}>
          다시 불러오기
        </button>
      </section>
    ) : (
      <p role="status">메시지를 불러오고 있어요.</p>
    );
  if (!messages.length && !emptyMessage && !canWrite) return null;
  return (
    <section className="consultation-conversation">
      <h2>대화</h2>
      {messages.length ? (
        <ol className="consultation-thread">
          {messages.map((message) => (
            <li key={message.id} className={message.mine ? 'mine' : 'theirs'}>
              <span className="sr-only">{message.mine ? '나' : partner}</span>
              <p>{message.content}</p>
              <time dateTime={message.sentAt}>{sentTime(message.sentAt)}</time>
            </li>
          ))}
        </ol>
      ) : (
        emptyMessage && <p className="consultation-thread-empty">{emptyMessage}</p>
      )}
      {loadError && <Alert message={loadError} />}
      {canWrite && (
        <form className="consultation-compose" onSubmit={submit} noValidate>
          <label className="consultation-request-field">
            <span>메시지</span>
            <textarea
              ref={input}
              maxLength={2000}
              rows={3}
              placeholder={placeholder}
              value={draft}
              disabled={busy}
              onChange={(event) => {
                setDraft(event.target.value);
                setError('');
              }}
            />
          </label>
          <Alert message={error} />
          <p className="consultation-privacy">
            보낸 메시지는 {partner}만 볼 수 있고 고칠 수 없어요.
          </p>
          <button type="submit" className="button primary full" disabled={busy} aria-busy={busy}>
            {busy ? '보내는 중' : '보내기'}
          </button>
        </form>
      )}
    </section>
  );
}
