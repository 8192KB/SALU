import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ApiFailure, directoryRequest } from './auth/api';
import { useAuth } from './auth/context';
import { Alert, BackLink, Loading, PageHeading } from './components';
import { useLoginPath } from './auth/pages';
import { readTabDraft, writeTabDraft } from './tab-draft';
import { Link, useWorkspace } from './workspace';

// AI 도우미(docs/ai-api.md). 결과는 제안일 뿐이고 사용자가 고르면 입력 칸에 들어감
const AI_TIMEOUT = 70000;

let status: Promise<boolean> | null = null;
// 로그인한 실제 공간에서만, 서버가 AI를 켜 둔 때만 보임. 한 번 받은 결과를 화면끼리 같이 씀
export function useAiEnabled() {
  return useAiStatus() === true;
}
// null은 아직 확인 중. AI 상담 화면은 확인 중과 꺼짐을 나눠 보여 줌
function useAiStatus() {
  const { state } = useAuth();
  const mode = useWorkspace();
  const allowed = mode !== 'example' && state.status === 'authenticated';
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!allowed) return;
    let current = true;
    status ??= directoryRequest<{ enabled: boolean }>('/api/ai/status').then(
      (value) => Boolean(value?.enabled),
      () => {
        status = null;
        return false;
      },
    );
    void status.then((value) => current && setEnabled(value));
    return () => {
      current = false;
    };
  }, [allowed]);
  return allowed ? enabled : false;
}

// 서버 문구는 합니다체라 AI 화면에 맞는 해요체로 바꿔 보여 줌
const aiError = (error: unknown) => {
  if (!(error instanceof ApiFailure))
    return 'AI 도우미를 쓰지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  if (error.code === 'AI_RATE_LIMITED')
    return 'AI 도우미를 짧은 시간에 많이 썼어요. 1분쯤 뒤에 다시 시도해 주세요.';
  if (error.code === 'AI_UNAVAILABLE' || error.code === 'CONNECTION_UNAVAILABLE')
    return 'AI 도우미가 지금 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.';
  if (error.status === 400) return '글을 다시 확인해 주세요.';
  return error.message;
};

// 다듬은 글에서 원래 글에 없던 단어만 표시. 단어 단위 최장 공통 부분으로 비교
function changedParts(before: string, after: string) {
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  const same: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      same[i][j] =
        a[i] === b[j] ? same[i + 1][j + 1] + 1 : Math.max(same[i + 1][j], same[i][j + 1]);
  const parts: { text: string; changed: boolean }[] = [];
  let i = 0;
  for (let j = 0; j < b.length; j++) {
    while (i < a.length && a[i] !== b[j] && same[i + 1][j] >= same[i][j + 1]) i++;
    const kept = i < a.length && a[i] === b[j];
    if (kept) i++;
    const changed = !kept && b[j].trim() !== '';
    const last = parts[parts.length - 1];
    // 바뀐 단어 사이 공백도 같은 묶음으로 이어 붙임
    if (last && (last.changed === changed || (!b[j].trim() && last.changed))) last.text += b[j];
    else parts.push({ text: b[j], changed });
  }
  return parts;
}

const TONES = [
  ['plain', '편하게'],
  ['polite', '정중하게'],
] as const;
type Tone = (typeof TONES)[number][0];

// 상담 요청 칸 아래. 원래 글과 다듬은 글을 함께 보여 주고 `이 글로 바꾸기`를 눌러야 바뀜
export function RequestDraftHelper({
  text,
  disabled,
  label = 'AI로 문장 다듬기',
  onApply,
}: {
  text: string;
  disabled?: boolean;
  label?: string;
  onApply: (value: string) => void;
}) {
  const enabled = useAiEnabled();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ from: string; to: string; kept: boolean } | null>(null);
  // 바꾼 뒤 되돌릴 원래 글. 바꾼 글을 더 고치면 되돌리기를 숨김
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);
  const [error, setError] = useState('');
  const [tone, setTone] = useState<Tone>('plain');
  // 바꾸기·그대로 두기를 누르면 그 버튼이 사라지므로 초점을 되돌리기나 다듬기 버튼으로 옮김
  const startButton = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const [focusTo, setFocusTo] = useState<'start' | 'undo' | null>(null);
  useEffect(() => {
    if (!focusTo) return;
    (focusTo === 'undo'
      ? (undoButton.current ?? startButton.current)
      : startButton.current
    )?.focus();
    setFocusTo(null);
  }, [focusTo]);
  if (!enabled) return null;
  // 제안을 받은 뒤 요청 글을 고쳤으면 옛 글 기준 제안은 버림(덮어쓰면 고친 내용이 사라짐)
  const current = result && result.from === text ? result : null;
  const unchanged = current && current.to.trim() === current.from.trim();
  const kept = unchanged && current.kept;
  const canUndo = undo && undo.after === text;
  const run = async () => {
    if (busy) return;
    if (!text.trim()) return setError('다듬을 요청을 먼저 적어 주세요.');
    // 서버는 2,000자까지 받음. 커트 준비는 여러 칸을 합쳐 보내므로 넘을 수 있어 미리 알림
    if (text.trim().length > 2000)
      return setError(
        `AI는 2,000자까지 다듬을 수 있어요. 지금 ${text.trim().length.toLocaleString()}자예요.`,
      );
    const from = text;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await directoryRequest<{ text: string; kept?: boolean }>(
        '/api/ai/request-draft',
        'POST',
        { text: from, tone },
        AI_TIMEOUT,
      );
      // 서버는 줄 모양이 깨지거나 내용을 더한 답을 버리고 원래 글을 돌려줌(docs/ai-api.md)
      setResult({ from, to: response?.text ?? from, kept: Boolean(response?.kept) });
    } catch (failure) {
      setError(aiError(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ai-helper">
      <div className="ai-helper-start">
        <button
          ref={startButton}
          type="button"
          className="text-link"
          // 기다리는 동안 잠그면 초점이 빠지므로 busy는 aria-busy로만 알리고 run()이 두 번 누름을 무시함
          disabled={disabled || !text.trim()}
          aria-busy={busy}
          onClick={() => void run()}
        >
          {busy ? 'AI가 다듬는 중' : label}
        </button>
        {canUndo ? (
          <button
            ref={undoButton}
            type="button"
            className="text-link"
            onClick={() => {
              onApply(undo.before);
              setUndo(null);
              setFocusTo('start');
            }}
          >
            다듬기 전 글로 되돌리기
          </button>
        ) : (
          <span className="form-note">맞춤법과 말투만 고치고, 적지 않은 내용은 넣지 않아요.</span>
        )}
      </div>
      <div className="community-tabs ai-tone" role="group" aria-label="다듬을 말투">
        {TONES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tone === value}
            disabled={busy}
            onClick={() => {
              setTone(value);
              setResult(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && <Alert message={error} />}
      {unchanged && (
        <p className="form-note" role="status">
          {kept
            ? 'AI가 고친 글이 원래 뜻과 달라져서 보여 드리지 않았어요. 지금 글을 그대로 보내도 돼요.'
            : '고칠 곳을 찾지 못했어요. 지금 글을 그대로 보내도 돼요.'}
        </p>
      )}
      {current && !unchanged && (
        <div className="ai-suggestion" role="status">
          <div className="ai-compare">
            <p className="ai-compare-label">지금 글</p>
            <p className="ai-before">{current.from.trim()}</p>
            <p className="ai-compare-label">다듬은 글</p>
            <p className="ai-after">
              {changedParts(current.from.trim(), current.to).map((part, index) =>
                part.changed ? (
                  <strong key={index}>{part.text}</strong>
                ) : (
                  <span key={index}>{part.text}</span>
                ),
              )}
            </p>
          </div>
          <p className="form-note">
            굵은 글자가 AI가 고친 곳이에요. 보내기 전에 뜻이 그대로인지 확인해 주세요.
          </p>
          <div className="ai-suggestion-actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                setUndo({ before: current.from, after: current.to });
                onApply(current.to);
                setResult(null);
                setFocusTo('undo');
              }}
            >
              이 글로 바꾸기
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setResult(null);
                setFocusTo('start');
              }}
            >
              지금 글 그대로 두기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type ChatTurn = {
  role: 'user' | 'assistant';
  text: string;
  designers?: { designerId: string; name: string }[];
  basis?: string[];
  // 규칙·관련 질문 확인에서 걸러진 안내. 다음 질문의 앞선 대화로 보내지 않음
  blocked?: boolean;
};
const EXAMPLES = [
  '커트하고 일주일 지나면 옆머리가 떠요. 집에서 어떻게 손질해요?',
  '다음 커트 때 디자이너에게 뭐라고 말하면 좋을까요?',
  '지난번 커트에서 좋았던 점을 이어 가려면 어떻게 해요?',
];

// 내 기록을 보고 답하는 AI 상담(docs/ai-api.md `AI 상담`). 대화는 이 탭에만 남김
export function AiChatPage() {
  const { state } = useAuth();
  const mode = useWorkspace();
  const loginPath = useLoginPath();
  const enabled = useAiStatus();
  const memberId = state.status === 'authenticated' ? state.member.id : null;
  const key = memberId ? `salu-ai-chat-${memberId}` : null;
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const restored = useRef<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const last = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (!key || restored.current === key) return;
    restored.current = key;
    setTurns(readTabDraft<ChatTurn[]>(key) ?? []);
  }, [key]);
  useEffect(() => {
    if (key && restored.current === key) writeTabDraft(key, turns.length ? turns : null);
  }, [key, turns]);
  // 새 답이 오면 그 말풍선이 보이게 함
  useLayoutEffect(() => {
    last.current?.scrollIntoView({ block: 'nearest' });
  }, [turns.length]);
  const heading = (
    <PageHeading
      title="AI 상담"
      back={<BackLink to="/more">더보기</BackLink>}
      description="계정에 저장한 내 기록을 보고 손질 방법과 다음 커트 때 말할 점을 알려 드려요."
    />
  );
  if (mode === 'example' || state.status !== 'authenticated' || enabled !== true)
    return (
      <div className="ai-chat-screen">
        {heading}
        <section className="consultation-soft-panel">
          {mode === 'example' ? (
            <h2>예시 체험에서는 AI 상담을 쓸 수 없어요</h2>
          ) : state.status === 'checking' ||
            (state.status === 'authenticated' && enabled === null) ? (
            <Loading>AI 상담을 준비하고 있어요.</Loading>
          ) : state.status !== 'authenticated' ? (
            <>
              <h2>로그인이 필요해요</h2>
              <p>로그인하면 계정에 저장한 내 기록을 보고 AI가 답해 드려요.</p>
              <Link className="button primary" to={loginPath}>
                로그인
              </Link>
            </>
          ) : (
            <h2>지금은 AI 상담을 쓸 수 없어요</h2>
          )}
        </section>
      </div>
    );
  const send = async (question: string) => {
    if (busy) return;
    const asked = question.trim();
    if (!asked) {
      setError('물어볼 내용을 적어 주세요.');
      input.current?.focus();
      return;
    }
    // 걸러진 안내는 빼고 최근 6개만 앞선 대화로 보냄
    const history = turns
      .filter((turn) => !turn.blocked)
      .slice(-6)
      .map(({ role, text: said }) => ({ role, text: said.slice(0, 1500) }));
    setTurns((current) => [...current, { role: 'user', text: asked }]);
    setText('');
    setError('');
    setBusy(true);
    try {
      const result = await directoryRequest<{
        answer: string;
        designers: ChatTurn['designers'];
        basis: string[];
        blocked: boolean;
      }>('/api/ai/chat', 'POST', { message: asked, history }, AI_TIMEOUT);
      setTurns((current) => {
        const answered: ChatTurn[] = [
          ...current,
          {
            role: 'assistant',
            text: result?.answer ?? '',
            designers: result?.designers ?? [],
            basis: result?.basis ?? [],
            blocked: result?.blocked,
          },
        ];
        // 걸러진 질문은 다음 질문의 맥락으로 쓰지 않음
        if (result?.blocked)
          answered[answered.length - 2] = { ...answered[answered.length - 2], blocked: true };
        return answered;
      });
    } catch (failure) {
      // 답을 못 받은 질문은 지우고 입력칸에 되돌림
      setTurns((current) => current.slice(0, -1));
      setText(asked);
      setError(aiError(failure));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => input.current?.focus());
    }
  };
  return (
    <div className="ai-chat-screen">
      {heading}
      <p className="ai-chat-notice">
        AI 답변은 참고용이에요. 직접 봐야 아는 것은 디자이너에게 상담해 주세요.
      </p>
      {turns.length === 0 ? (
        <section className="ai-chat-examples" aria-labelledby="ai-chat-examples">
          <h2 id="ai-chat-examples">이렇게 물어볼 수 있어요</h2>
          <ul>
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  className="button"
                  aria-busy={busy}
                  onClick={() => void send(example)}
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <ol className="consultation-thread ai-chat-thread" aria-live="polite">
          {turns.map((turn, index) => (
            <li
              key={index}
              ref={index === turns.length - 1 ? last : undefined}
              className={turn.role === 'user' ? 'mine' : 'theirs'}
            >
              <span className="sr-only">{turn.role === 'user' ? '나' : 'AI'}</span>
              <p>{turn.text}</p>
              {turn.role === 'assistant' && !!turn.basis?.length && !turn.blocked && (
                <p className="ai-basis">참고한 내 기록: {turn.basis.join(', ')}</p>
              )}
              {turn.role === 'assistant' && !!turn.designers?.length && (
                <ul className="ai-chat-designers">
                  {turn.designers.map((designer) => (
                    <li key={designer.designerId}>
                      <Link to={`/designers/${encodeURIComponent(designer.designerId)}`}>
                        {designer.name} 디자이너 프로필
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {busy && (
            <li className="theirs" ref={last}>
              <p>AI가 답을 쓰고 있어요.</p>
            </li>
          )}
        </ol>
      )}
      <form
        className="consultation-chat-form ai-chat-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void send(text);
        }}
      >
        <label className="consultation-request-field">
          <span>물어볼 내용</span>
          <textarea
            ref={input}
            rows={3}
            maxLength={500}
            placeholder="예: 앞머리가 금방 갈라져요"
            value={text}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setText(event.target.value);
              setError('');
            }}
          />
        </label>
        <Alert message={error} />
        <div className="ai-chat-actions">
          <button type="submit" className="button primary" aria-busy={busy}>
            {busy ? '답을 기다리는 중' : '보내기'}
          </button>
          {turns.length > 0 && (
            <button
              type="button"
              className="button"
              aria-busy={busy}
              onClick={() => {
                if (busy) return;
                setTurns([]);
                setError('');
                input.current?.focus();
              }}
            >
              새 대화
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
