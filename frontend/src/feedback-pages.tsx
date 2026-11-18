import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, BackLink, ErrorState, FieldFeedback, Loading, PageHeading } from './components';
import { Completion } from './completion';
import { useNavigate, useWorkspace } from './workspace';
import { useAuth } from './auth/context';
import { newId } from './prototype/ids';
import { useTabDraftText, writeTabDraft } from './tab-draft';
import { sendFeedback } from './feedback-api';

const MAX_LENGTH = 2000;

// 이용 의견 보내기. 로그인하지 않아도 보내고, 커뮤니티에 올라가지 않고 관리자만 읽음(docs/feedback-api.md)
export function FeedbackWrite() {
  const { state } = useAuth();
  const example = useWorkspace() === 'example';
  const navigate = useNavigate();
  const memberId = state.status === 'authenticated' ? state.member.id : null;
  const draftKey = `salu-feedback-draft-${memberId ?? 'guest'}`;
  const [content, setContent] = useTabDraftText(draftKey);
  const [invalid, setInvalid] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 같은 내용을 다시 보내면 같은 의견으로 처리되게 키를 내용과 묶어 둠
  const pending = useRef<{ key: string; content: string } | null>(null);
  const heading = (
    <PageHeading
      title="이용 의견"
      description="써 보다 불편했던 점이나 궁금한 점을 적어 주세요."
      back={<BackLink to="/more">더보기</BackLink>}
    />
  );
  if (example || state.status === 'prototype')
    return (
      <div className="community-screen">
        {heading}
        <section className="consultation-soft-panel">
          <h2>예시 체험에서는 의견을 보낼 수 없어요</h2>
        </section>
      </div>
    );
  if (state.status === 'unavailable')
    return (
      <div className="community-screen">
        {heading}
        <ErrorState nested kind="offline" message={state.message} />
      </div>
    );
  if (state.status === 'checking') return <Loading>로그인 상태를 확인하고 있어요.</Loading>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const text = content.trim();
    if (!text) {
      setInvalid('내용을 적어 주세요.');
      document.getElementById('feedback-content')?.focus();
      return;
    }
    if (pending.current?.content !== text) pending.current = { key: newId(), content: text };
    setBusy(true);
    setError('');
    try {
      await sendFeedback(pending.current.key, text);
      writeTabDraft(draftKey, null);
      navigate('/feedback/complete', { replace: true, state: { celebrate: true } });
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : '보내지 못했어요. 적은 내용은 그대로 있어요.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="community-screen">
      {heading}
      <form className="community-form" onSubmit={submit} noValidate>
        <label className="consultation-request-field">
          <span>내용</span>
          <textarea
            id="feedback-content"
            maxLength={MAX_LENGTH}
            rows={8}
            value={content}
            disabled={busy}
            placeholder="예: 기록에서 사진을 고른 뒤 저장 버튼이 눌리지 않았어요."
            aria-invalid={Boolean(invalid) || undefined}
            aria-describedby={invalid ? 'feedback-content-error' : undefined}
            onChange={(event) => {
              setContent(event.target.value);
              setInvalid('');
              setError('');
            }}
          />
          {invalid && <FieldFeedback id="feedback-content-error" message={invalid} />}
        </label>
        <Alert message={error} />
        <div className="consultation-action">
          <button type="submit" className="button primary full" disabled={busy} aria-busy={busy}>
            {busy ? '보내는 중' : '보내기'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function FeedbackComplete() {
  return (
    <Completion
      title="의견을 보냈어요"
      description="보내 주셔서 고마워요."
      primary="더보기로"
      to="/more"
    >
      {null}
    </Completion>
  );
}
