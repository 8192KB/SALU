import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { openDB } from 'idb';
import { fetchMember, login as loginRequest, logout as logoutRequest } from './api';
import type { SessionMember } from './api';

type AuthState =
  | { status: 'prototype' }
  | { status: 'checking' }
  | { status: 'guest' }
  | { status: 'authenticated'; member: SessionMember }
  | { status: 'unavailable'; message: string };
type AuthContextValue = {
  state: AuthState;
  initialized: boolean;
  activeMember: SessionMember | null;
  pending: boolean;
  checking: boolean;
  actionError: string;
  sessionChange: string;
  clearSessionChange: () => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<boolean>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
const prototypeOnly = import.meta.env.VITE_SALU_AUTH_MODE === 'prototype';
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '로그인 상태를 확인할 수 없어요.';
// 서버 연결 없이 앱을 열어도 마지막 계정의 기기 기록을 열기 위한 표시.
// 인증 계약상 회원 정보는 localStorage·sessionStorage에 두지 않으므로 기기 기록과 같은 IndexedDB에
// 회원 번호와 표시 이름만 둠. 이메일·storageContext는 저장하지 않음
const HINT_DB = 'salu-member-hint-v1';
async function hintStore() {
  return openDB(HINT_DB, 1, {
    upgrade(db) {
      db.createObjectStore('hint');
    },
  });
}
async function rememberMember(member: SessionMember | null) {
  try {
    const db = await hintStore();
    if (member) await db.put('hint', { id: member.id, displayName: member.displayName }, 'last');
    else await db.delete('hint', 'last');
    db.close();
  } catch {
    /* 저장소를 쓸 수 없으면 연결 실패 때 게스트 공간을 엶 */
  }
}
async function rememberedMember(): Promise<SessionMember | null> {
  try {
    const db = await hintStore();
    const value: unknown = await db.get('hint', 'last');
    db.close();
    if (!value || typeof value !== 'object') return null;
    const { id, displayName } = value as Record<string, unknown>;
    if (typeof id !== 'string' || !/^\d+$/.test(id) || typeof displayName !== 'string') return null;
    return { id, email: null, displayName, storageContext: '' };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: prototypeOnly ? 'prototype' : 'checking',
  });
  const [initialized, setInitialized] = useState(prototypeOnly);
  const [activeMember, setActiveMember] = useState<SessionMember | null>(null);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState('');
  const [sessionChange, setSessionChange] = useState('');
  const generation = useRef(0);
  const operation = useRef(false);
  const lastCheck = useRef(0);
  const shownMember = useRef<SessionMember | null>(null);

  const confirm = useCallback((member: SessionMember | null, checked = false) => {
    const previous = shownMember.current;
    // 사용자가 직접 로그인·로그아웃하지 않았는데 계정 공간이 바뀌면 이유를 알림
    if (checked && previous && previous.id !== member?.id)
      setSessionChange(
        member
          ? `다른 탭에서 ${member.displayName}님으로 로그인해 계정이 바뀌었어요. ${previous.displayName}님의 기록은 다시 로그인하면 보여요.`
          : `로그인이 끝났어요. 다시 로그인하면 ${previous.displayName}님의 계정 기록이 보여요.`,
      );
    else if (!checked) setSessionChange('');
    shownMember.current = member;
    void rememberMember(member);
    setActiveMember(member);
    setState(member ? { status: 'authenticated', member } : { status: 'guest' });
    setInitialized(true);
    setActionError('');
  }, []);

  const refresh = useCallback(async () => {
    if (prototypeOnly || operation.current) return;
    const current = ++generation.current;
    lastCheck.current = Date.now();
    setChecking(true);
    try {
      const member = await fetchMember();
      if (generation.current === current) confirm(member, true);
    } catch (error) {
      // 장애 중에는 비로그인으로 단정하거나 이전 작성 내용을 지우지 않음. 마지막 계정의 기기 기록을 엶
      const remembered = shownMember.current ?? (await rememberedMember());
      if (generation.current === current) {
        shownMember.current = remembered;
        setActiveMember(remembered);
        setState({ status: 'unavailable', message: errorText(error) });
      }
    } finally {
      if (generation.current === current) {
        setInitialized(true);
        setChecking(false);
      }
    }
  }, [confirm]);

  useEffect(() => {
    void refresh();
    const onFocus = () => {
      if (Date.now() - lastCheck.current >= 5000) void refresh();
    };
    const onOnline = () => void refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      generation.current++;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [refresh]);
  useEffect(() => {
    if (state.status !== 'unavailable') return;
    // 연결이 돌아오면 창을 다시 누르지 않아도 계정 저장을 이어서 진행함
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [state.status, refresh]);

  async function login(email: string, password: string) {
    if (prototypeOnly || operation.current) return;
    operation.current = true;
    const current = ++generation.current;
    setChecking(false);
    setPending(true);
    setActionError('');
    try {
      const member = await loginRequest(email, password);
      if (generation.current === current) confirm(member);
    } finally {
      operation.current = false;
      if (generation.current === current) setPending(false);
    }
  }

  async function logout() {
    if (prototypeOnly || operation.current) return false;
    operation.current = true;
    const current = ++generation.current;
    setChecking(false);
    setPending(true);
    setActionError('');
    try {
      await logoutRequest();
      if (generation.current === current) confirm(null);
      return true;
    } catch (error) {
      if (generation.current === current) setActionError(errorText(error));
      return false;
    } finally {
      operation.current = false;
      if (generation.current === current) setPending(false);
    }
  }

  return (
    <AuthContext.Provider
      value={{
        state,
        initialized,
        activeMember,
        pending,
        checking,
        actionError,
        sessionChange,
        clearSessionChange: () => setSessionChange(''),
        refresh,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider가 필요합니다.');
  return value;
}
