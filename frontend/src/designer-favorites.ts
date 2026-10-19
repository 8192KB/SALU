import { useEffect, useSyncExternalStore } from 'react';
import { directoryRequest } from './auth/api';
import { useAuth } from './auth/context';

// 로그인한 회원이 찜한 디자이너 ID. 디자이너 찾기와 상세가 같은 값을 보도록 한곳에 둠
type FavoriteState = {
  memberId: string | null;
  ids: Set<string>;
  // 내 디자이너 프로필 ID. 내 프로필은 찜할 수 없어 버튼을 숨김
  ownId: string | null;
  loaded: boolean;
  error: string;
};
let state: FavoriteState = {
  memberId: null,
  ids: new Set(),
  ownId: null,
  loaded: false,
  error: '',
};
const listeners = new Set<() => void>();
const publish = (next: FavoriteState) => {
  state = next;
  listeners.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

async function load(memberId: string) {
  publish({ memberId, ids: new Set(), ownId: null, loaded: false, error: '' });
  try {
    const [favorites, own] = await Promise.all([
      directoryRequest<{ id: string }[]>('/api/my/favorite-designers'),
      directoryRequest<{ id: string }>('/api/my/designer-profile'),
    ]);
    if (state.memberId !== memberId) return;
    publish({
      memberId,
      ids: new Set((favorites ?? []).map((value) => value.id)),
      ownId: own?.id ?? null,
      loaded: true,
      error: '',
    });
  } catch (error) {
    if (state.memberId === memberId)
      publish({
        ...state,
        loaded: true,
        error: error instanceof Error ? error.message : '찜한 디자이너를 불러오지 못했어요.',
      });
  }
}

export async function setFavorite(designerId: string, on: boolean) {
  const path = `/api/my/favorite-designers/${encodeURIComponent(designerId)}`;
  await directoryRequest(path, on ? 'PUT' : 'DELETE');
  const ids = new Set(state.ids);
  if (on) ids.add(designerId);
  else ids.delete(designerId);
  publish({ ...state, ids });
}

export function useFavorites() {
  const { state: auth } = useAuth();
  const memberId = auth.status === 'authenticated' ? auth.member.id : null;
  const current = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (!memberId) {
      if (state.memberId)
        publish({ memberId: null, ids: new Set(), ownId: null, loaded: false, error: '' });
      return;
    }
    if (state.memberId !== memberId) void load(memberId);
  }, [memberId]);
  return memberId && current.memberId === memberId ? current : null;
}
