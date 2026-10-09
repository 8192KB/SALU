import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiFailure, fetchMember, login, logout } from './api';
import type { SessionMember } from './api';

export default function LoginPanel() {
  const [member, setMember] = useState<SessionMember | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void fetchMember().then(value => { if (active) setMember(value); })
      .catch(() => { if (active) setMessage('로그인 상태를 확인할 수 없습니다. 다시 시도하세요.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { setMember(await login(email, password)); setPassword(''); }
    catch (error) { setPassword(''); setMessage(error instanceof ApiFailure ? error.message : '서버에 연결할 수 없습니다. 다시 시도하세요.'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setMessage('');
    try { await logout(); setMember(null); setPassword(''); }
    catch { setMessage('로그아웃을 확인할 수 없습니다. 다시 시도하세요.'); }
    finally { setBusy(false); }
  }
  return <section className="login-card" aria-labelledby="login-title">
    <p className="eyebrow">MY SALU</p><h2 id="login-title">{member ? '나의 SALU' : '로그인'}</h2>
    {member ? <div className="signed-in"><p><strong>{member.displayName}</strong>님, 안녕하세요.</p><p>{member.email}</p>
      <button disabled={busy} onClick={() => void signOut()}>로그아웃</button></div>
      : <form onSubmit={event => void submit(event)}>
        <label htmlFor="email">이메일</label><input id="email" type="email" name="email" autoComplete="username" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} />
        <label htmlFor="password">비밀번호</label><input id="password" type="password" name="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={busy} />
        <button type="submit" disabled={busy}>{busy ? '확인 중' : '로그인'}</button>
        <p className="login-note">회원가입은 준비 중입니다. 등록된 계정으로 로그인하세요.</p>
      </form>}
    {message && <p className="login-error" role="alert">{message}</p>}
  </section>;
}
