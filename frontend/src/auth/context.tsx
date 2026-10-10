import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
  memoryEpoch: number;
  pending: boolean;
  checking: boolean;
  actionError: string;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<boolean>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
const prototypeOnly = import.meta.env.VITE_SALU_AUTH_MODE === 'prototype';
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : '로그인 상태를 확인할 수 없습니다.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: prototypeOnly ? 'prototype' : 'checking',
  });
  const [initialized, setInitialized] = useState(prototypeOnly);
  const [memoryEpoch, setMemoryEpoch] = useState(0);
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState('');
  const identity = useRef<string | null | undefined>(undefined);
  const generation = useRef(0);
  const operation = useRef(false);
  const lastCheck = useRef(0);

  const confirm = useCallback((member: SessionMember | null, clearMemory = false) => {
    const nextId = member?.id ?? null;
    if (clearMemory || (identity.current !== undefined && identity.current !== nextId))
      setMemoryEpoch((value) => value + 1);
    identity.current = nextId;
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
      if (generation.current === current) confirm(member);
    } catch (error) {
      // 장애 중에는 비로그인으로 단정하거나 이전 작성 내용을 지우지 않음
      if (generation.current === current)
        setState({ status: 'unavailable', message: errorText(error) });
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
    window.addEventListener('focus', onFocus);
    return () => {
      generation.current++;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  async function login(email: string, password: string) {
    if (prototypeOnly || operation.current) return;
    operation.current = true;
    const current = ++generation.current;
    setChecking(false);
    setPending(true);
    setActionError('');
    try {
      const member = await loginRequest(email, password);
      if (generation.current === current) confirm(member, true);
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
      if (generation.current === current) confirm(null, true);
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
        memoryEpoch,
        pending,
        checking,
        actionError,
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
