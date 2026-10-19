import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import type { Location } from 'react-router';
import { isTaskPath } from './main-navigation';

// 화면마다 직전에 보던 화면을 기억해 위쪽 뒤로 링크가 그 화면으로 돌아가게 함.
// 브라우저 뒤로 가기·메뉴 이동·뒤로 링크로 돌아온 화면은 원래 기억을 유지함
export type Trail = { to: string; label: string };
export const KEEP_TRAIL = { trail: 'keep' } as const;
const LIMIT = 100;
const address = (location: Pick<Location, 'pathname' | 'search' | 'hash'>) =>
  `${location.pathname}${location.search}${location.hash}`;
const pathOf = (value: string) => value.split(/[?#]/)[0]!;
const plain = (path: string) => path.replace(/^\/examples(?=\/|$)/, '') || '/';
// 한 번 보는 완료 화면과 로그인 과정은 돌아갈 곳으로 기억하지 않음
const skipped = (path: string) =>
  /^\/(?:login|signup|auth\/complete)$/.test(plain(path)) ||
  /\/complete(?:\/[^/]+)?$/.test(plain(path));

// 기록 ID가 든 주소라 브라우저 저장소에 남기지 않고 이 탭의 메모리에만 둠. 새로고침하면 기본 뒤로 링크를 씀
let trails: Record<string, Trail> = {};
// 메뉴 첫 화면은 제목이 안내 문장이라 메뉴 이름으로 표시함
const ROOT_LABELS: Record<string, string> = {
  '/': '홈',
  '/records': '내 기록',
  '/requests': '커트 준비',
  '/consultations': '상담 내역',
  '/more': '더보기',
};
const titles = new Map<string, string>();
// 작성 단계에 들어오기 직전 화면. 여러 단계 뒤에서 나가기를 눌러도 작업을 시작한 곳으로 돌아감
let taskStart: string | null = null;
export const taskOrigin = () => taskStart;
const listeners = new Set<() => void>();
function write(next: Record<string, Trail>) {
  trails = Object.fromEntries(Object.entries(next).slice(-LIMIT));
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useBackTrail(location: Pick<Location, 'pathname' | 'search' | 'hash'>) {
  const here = address(location);
  const trail = useSyncExternalStore(subscribe, () => trails[here]);
  return trail && pathOf(trail.to) !== pathOf(here) ? trail : undefined;
}

// 실제 주소 변화를 보고 새 화면의 돌아갈 곳을 정함. Layout에서 한 번만 사용
export function useBackTrailTracker() {
  const location = useLocation();
  const type = useNavigationType();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    // 화면을 떠나는 순간의 제목을 돌아갈 링크 이름으로 씀
    const remember = () => {
      const title = document.querySelector('main h1')?.textContent?.trim();
      if (title) titles.set(address(window.location), title);
    };
    document.addEventListener('click', remember, true);
    document.addEventListener('submit', remember, true);
    return () => {
      document.removeEventListener('click', remember, true);
      document.removeEventListener('submit', remember, true);
    };
  }, []);
  useEffect(() => {
    const here = address(location);
    const before = previous.current;
    previous.current = here;
    if (!isTaskPath(pathOf(here))) taskStart = null;
    else if (before && !isTaskPath(pathOf(before)))
      taskStart = skipped(pathOf(before)) ? null : before;
    if (!before || before === here || type === 'POP') return;
    if ((location.state as { trail?: string } | null)?.trail === KEEP_TRAIL.trail) return;
    if (type === 'REPLACE') {
      // 주소만 바뀐 같은 화면(새 ID 등)은 원래 돌아갈 곳을 이어받음.
      // 작성·완료 화면을 대신한 화면은 작업이 끝났으므로 기본 뒤로 링크를 씀
      const next = { ...trails };
      const carried = trails[before];
      delete next[here];
      if (carried && !skipped(pathOf(before)) && !isTaskPath(pathOf(before))) next[here] = carried;
      write(next);
      return;
    }
    // 같은 화면의 주소만 바뀌었거나 작성 단계 사이를 오가면 원래 돌아갈 곳을 유지함
    if (pathOf(before) === pathOf(here) || isTaskPath(pathOf(before))) return;
    const next = { ...trails };
    delete next[here];
    if (!skipped(pathOf(before)))
      next[here] = {
        to: before,
        label: ROOT_LABELS[plain(pathOf(before))] ?? titles.get(before) ?? '이전 화면',
      };
    write(next);
  }, [location, type]);
}
