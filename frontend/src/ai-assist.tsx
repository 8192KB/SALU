import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiFailure, directoryRequest } from './auth/api';
import { useAuth } from './auth/context';
import { Alert } from './components';
import { Link, useWorkspace } from './workspace';

// AI 도우미(docs/ai-api.md). 결과는 제안일 뿐이고 사용자가 고르면 입력 칸에 들어감
const AI_TIMEOUT = 70000;

let status: Promise<boolean> | null = null;
// 로그인한 실제 공간에서만, 서버가 AI를 켜 둔 때만 보임. 한 번 받은 결과를 화면끼리 같이 씀
export function useAiEnabled() {
  const { state } = useAuth();
  const mode = useWorkspace();
  const allowed = mode !== 'example' && state.status === 'authenticated';
  const [enabled, setEnabled] = useState(false);
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
  return allowed && enabled;
}

const aiError = (error: unknown) =>
  error instanceof ApiFailure && error.code === 'CONNECTION_UNAVAILABLE'
    ? 'AI 도우미가 응답하지 않아요. 잠시 뒤 다시 시도해 주세요.'
    : error instanceof ApiFailure && error.status === 400
      ? '글을 다시 확인해 주세요.'
      : error instanceof Error
        ? error.message
        : 'AI 도우미를 쓰지 못했어요.';

// 상담 요청 칸 아래. 다듬은 글을 보여 주고 `이 글로 바꾸기`를 눌러야 바뀜
export function RequestDraftHelper({
  text,
  disabled,
  onApply,
}: {
  text: string;
  disabled?: boolean;
  onApply: (value: string) => void;
}) {
  const enabled = useAiEnabled();
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [error, setError] = useState('');
  if (!enabled) return null;
  const run = async () => {
    if (!text.trim()) return setError('다듬을 요청을 먼저 적어 주세요.');
    setBusy(true);
    setError('');
    setSuggestion('');
    try {
      const result = await directoryRequest<{ text: string }>(
        '/api/ai/request-draft',
        'POST',
        { text },
        AI_TIMEOUT,
      );
      setSuggestion(result?.text ?? '');
    } catch (failure) {
      setError(aiError(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ai-helper">
      <button
        type="button"
        className="text-link"
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={() => void run()}
      >
        {busy ? 'AI가 다듬는 중' : 'AI로 문장 다듬기'}
      </button>
      {error && <Alert message={error} />}
      {suggestion && (
        <div className="ai-suggestion" role="status">
          <p>{suggestion}</p>
          <div className="ai-suggestion-actions">
            <button
              type="button"
              className="button"
              onClick={() => {
                onApply(suggestion);
                setSuggestion('');
              }}
            >
              이 글로 바꾸기
            </button>
            <button type="button" className="text-link" onClick={() => setSuggestion('')}>
              그대로 두기
            </button>
          </div>
          <p className="form-note">AI가 고친 글이에요. 보내기 전에 내용을 확인해 주세요.</p>
        </div>
      )}
    </div>
  );
}

type Match = { designerId: string; name: string; reason: string };

// 디자이너 찾기 위. 고민을 적으면 공개 디자이너 중 최대 3명과 이유를 보여 줌
export function DesignerMatch({ profileUrl }: { profileUrl: (id: string) => string }) {
  const enabled = useAiEnabled();
  const [concern, setConcern] = useState('');
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<Match[] | null>(null);
  const [error, setError] = useState('');
  if (!enabled) return null;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!concern.trim()) return setError('머리 고민을 먼저 적어 주세요.');
    setBusy(true);
    setError('');
    setItems(null);
    try {
      const result = await directoryRequest<{ items: Match[] }>(
        '/api/ai/designer-match',
        'POST',
        { concern },
        AI_TIMEOUT,
      );
      setItems(result?.items ?? []);
    } catch (failure) {
      setError(aiError(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ai-match" aria-labelledby="ai-match-heading">
      <h2 id="ai-match-heading">고민으로 디자이너 찾기</h2>
      <form onSubmit={submit} noValidate>
        <label className="sr-only" htmlFor="ai-match-concern">
          머리 고민
        </label>
        <textarea
          id="ai-match-concern"
          rows={2}
          maxLength={1000}
          placeholder="예: 곱슬이라 단발이 자꾸 부해져요"
          value={concern}
          onChange={(event) => setConcern(event.target.value)}
        />
        <button type="submit" className="button" disabled={busy} aria-busy={busy}>
          {busy ? 'AI가 찾는 중' : 'AI로 찾기'}
        </button>
      </form>
      {error && <Alert message={error} />}
      {items && (
        <div role="status">
          {items.length ? (
            <ul>
              {items.map((item) => (
                <li key={item.designerId}>
                  <Link to={profileUrl(item.designerId)}>{item.name} 디자이너</Link>
                  <p>{item.reason}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p>고민에 맞는 디자이너를 찾지 못했어요. 아래 목록에서 직접 골라 주세요.</p>
          )}
          <p className="form-note">AI가 공개 프로필의 전문 분야와 소개만 보고 고른 결과예요.</p>
        </div>
      )}
    </section>
  );
}
