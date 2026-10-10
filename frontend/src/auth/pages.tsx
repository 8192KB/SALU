import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, Icon, PageHeading } from '../components';
import { Field } from '../fields';
import { Dialog } from '../dialog';
import { useAuth } from './context';

export function AccountControls() {
  const { state, pending, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  if (state.status === 'prototype') return <span className="member-label">나의 헤어 기록</span>;
  return (
    <div className="account-controls" aria-label="계정">
      {state.status === 'authenticated' ? (
        <>
          <span className="account-name">{state.member.displayName}님</span>
          <button
            type="button"
            className="button account-button"
            disabled={pending}
            onClick={() => setOpen(true)}
          >
            로그아웃
          </button>
        </>
      ) : state.status === 'checking' ? (
        <span className="muted">계정 확인 중</span>
      ) : (
        <Link className="button account-button" to="/login">
          <Icon name="user" size={16} />
          {state.status === 'unavailable' ? '계정 확인' : '로그인'}
        </Link>
      )}
      <Dialog
        open={open}
        title="로그아웃할까요?"
        onClose={() => {
          if (!pending) setOpen(false);
        }}
      >
        <p>
          작성한 예시 기록·사진과 요청 자료가 초기화됩니다. 기록은 아직 서버에 저장되지 않습니다.
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            계속 사용
          </button>
          <button
            type="button"
            className="button primary"
            disabled={pending}
            onClick={async () => {
              const success = await logout();
              if (success) navigate('/');
              setOpen(false);
            }}
          >
            {pending ? '로그아웃 중' : '로그아웃 확인'}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

export function SessionNotice() {
  const { state, actionError, refresh, pending, checking } = useAuth();
  const message = state.status === 'unavailable' ? state.message : actionError;
  if (!message) return null;
  return (
    <div className="session-notice" role="alert">
      <span>{message}</span>
      <button
        type="button"
        className="button account-button"
        disabled={pending || checking}
        onClick={() => void refresh()}
      >
        {checking ? '확인 중' : '로그인 상태 다시 확인'}
      </button>
      <p>
        기록 화면은 예시 데이터입니다. 서버 연결 상태와 관계없이 기록은 서버에 저장되지 않습니다.
      </p>
    </div>
  );
}

export function LoginPage() {
  const { state, pending, checking, login, refresh } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="login-page">
      <PageHeading title="로그인" description="등록된 계정으로 SALU에 로그인합니다." />
      {state.status === 'prototype' ? (
        <section className="panel">
          <h2>화면만 확인하는 모드</h2>
          <p>이 모드에서는 로그인 서버를 사용하지 않습니다.</p>
          <Link className="button primary" to="/">
            예시 기록 보기
          </Link>
        </section>
      ) : state.status === 'authenticated' ? (
        <section className="panel">
          <h2>로그인되어 있습니다</h2>
          <p>
            {state.member.displayName}님 · {state.member.email}
          </p>
          <Link className="button primary" to="/">
            예시 기록 보기
          </Link>
        </section>
      ) : (
        <form
          className="panel login-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending || checking) return;
            setError('');
            try {
              await login(email.trim(), password);
              navigate('/');
            } catch (failure) {
              setError(
                failure instanceof Error ? failure.message : '로그인을 처리하지 못했습니다.',
              );
            } finally {
              setPassword('');
            }
          }}
        >
          <Alert message={error} />
          <Field label="이메일">
            <input
              name="email"
              type="email"
              autoComplete="username"
              maxLength={254}
              required
              value={email}
              disabled={pending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label="비밀번호">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              disabled={pending}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <button type="submit" className="button primary full" disabled={pending || checking}>
            {pending ? '로그인 중' : '로그인'}
          </button>
          <p className="muted login-hint">
            로그인은 서버와 연결됩니다. 기록·사진은 아직 예시 화면이며, 로그인하면 작성 중인 예시
            자료가 초기화됩니다.
          </p>
          {error && (
            <button
              type="button"
              className="text-link"
              disabled={pending || checking}
              onClick={() => void refresh()}
            >
              로그인 상태 다시 확인
            </button>
          )}
        </form>
      )}
      <Link className="back-link" to="/">
        예시 기록으로 돌아가기
      </Link>
    </div>
  );
}
