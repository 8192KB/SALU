import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Client, ReconnectionTimeMode } from '@stomp/stompjs';
import { useAuth } from './auth/context';
import { fetchMember } from './auth/api';

// 알림·실시간 API 계약(docs/notification-api.md) 4장. 신호에는 종류와 ID만 있고 내용은 API로 다시 받음
export type RealtimeEvent = { type: 'NOTIFICATION' | 'CONSULTATION'; id: string };

class RealtimeHub {
  private events = new Set<(event: RealtimeEvent) => void>();
  private connects = new Set<() => void>();
  onEvent(listener: (event: RealtimeEvent) => void) {
    this.events.add(listener);
    return () => {
      this.events.delete(listener);
    };
  }
  onConnect(listener: () => void) {
    this.connects.add(listener);
    return () => {
      this.connects.delete(listener);
    };
  }
  emit(event: RealtimeEvent) {
    this.events.forEach((listener) => listener(event));
  }
  connected() {
    this.connects.forEach((listener) => listener());
  }
}
const HubContext = createContext<RealtimeHub | null>(null);

function parse(body: string): RealtimeEvent | null {
  try {
    const value: unknown = JSON.parse(body);
    if (!value || typeof value !== 'object') return null;
    const { type, id } = value as Record<string, unknown>;
    if ((type === 'NOTIFICATION' || type === 'CONSULTATION') && typeof id === 'string' && id)
      return { type, id };
  } catch {
    /* 모양이 다른 신호는 무시함 */
  }
  return null;
}

// 로그인한 동안 하나만 연결하고 로그아웃·계정 변경 때 끊음. 기능 화면은 직접 연결하지 않고 useLiveRefresh만 씀
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { state, refresh } = useAuth();
  const [hub] = useState(() => new RealtimeHub());
  const memberId = state.status === 'authenticated' ? state.member.id : null;
  const checkLogin = useRef(refresh);
  useEffect(() => {
    checkLogin.current = refresh;
  });
  useEffect(() => {
    if (!memberId) return;
    const client = new Client({
      brokerURL: `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`,
      heartbeatIncoming: 20000,
      heartbeatOutgoing: 20000,
      connectionTimeout: 10000,
      reconnectDelay: 1000,
      maxReconnectDelay: 30000,
      reconnectTimeMode: ReconnectionTimeMode.EXPONENTIAL,
    });
    let attempts = 0;
    // 브라우저는 연결 거절 이유를 알려 주지 않아 다시 연결하기 전에 로그인 상태를 먼저 확인함.
    // 서버가 꺼진 동안은 계속 다시 연결하고, 로그인이 끝났거나 계정이 바뀌었으면 연결을 멈춤
    client.beforeConnect = async () => {
      if (attempts++ === 0) return;
      try {
        if ((await fetchMember())?.id === memberId) return;
      } catch {
        return;
      }
      await client.deactivate();
      void checkLogin.current();
    };
    client.onConnect = () => {
      client.subscribe('/user/queue/events', (message) => {
        const event = parse(message.body);
        if (event) hub.emit(event);
      });
      // 끊긴 동안의 신호는 다시 오지 않으므로 보고 있던 화면이 한 번 다시 불러옴
      hub.connected();
    };
    client.activate();
    return () => void client.deactivate();
  }, [memberId, hub]);
  return <HubContext.Provider value={hub}>{children}</HubContext.Provider>;
}

// 화면이 보는 서버 자료를 최신으로 맞춤. 처음 볼 때, 창으로 돌아올 때, 실시간 연결이 이어질 때,
// matches에 맞는 신호가 올 때 action을 다시 부름
export function useLiveRefresh(
  action?: () => unknown,
  matches?: (event: RealtimeEvent) => boolean,
) {
  const hub = useContext(HubContext);
  const current = useRef({ action, matches });
  useEffect(() => {
    current.current = { action, matches };
  });
  const enabled = Boolean(action);
  useEffect(() => {
    if (!enabled) return;
    const run = () => void current.current.action?.();
    run();
    window.addEventListener('focus', run);
    const offConnect = hub?.onConnect(run);
    const offEvent = hub?.onEvent((event) => {
      if (current.current.matches?.(event)) run();
    });
    return () => {
      window.removeEventListener('focus', run);
      offConnect?.();
      offEvent?.();
    };
  }, [enabled, hub]);
}

export const consultationEvent = (id?: string) => (event: RealtimeEvent) =>
  event.type === 'CONSULTATION' && (id === undefined || event.id === id);
