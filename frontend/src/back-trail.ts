import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import type { Location } from 'react-router';
import { isTaskPath } from './main-navigation';
import { readTabDraft, writeTabDraft } from './tab-draft';
import { scopedTo, useNavigate, useWorkspace } from './workspace';

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

// 새로고침해도 돌아갈 곳을 잃지 않게 이 탭의 저장소에만 남김. 기록 ID가 든 주소라 탭을 닫거나 직접 로그아웃하면 사라짐
const STORE_KEY = 'salu-back-trail-draft-store';
const saved = readTabDraft<{ trails?: Record<string, Trail>; taskStart?: string | null }>(
  STORE_KEY,
);
let trails: Record<string, Trail> = saved?.trails ?? {};
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
let taskStart: string | null = saved?.taskStart ?? null;
const remember = () =>
  writeTabDraft(STORE_KEY, Object.keys(trails).length || taskStart ? { trails, taskStart } : null);
export const taskOrigin = () => taskStart;
// 이 탭 방문 기록의 위치별 주소. 돌아갈 곳이 바로 앞 기록이면 새로 쌓지 않고 뒤로 가서 뒤로 가기가 왕복하지 않게 함
const entries = new Map<number, string>();
const historyIndex = () => (window.history.state as { idx?: number } | null)?.idx;
// 돌아갈 곳이 앞 기록에 있으면 몇 칸 앞인지. 작성 단계만 건너뛰고, 없거나 모르면 0
export function stepsBackTo(to: string) {
  const index = historyIndex();
  if (index === undefined) return 0;
  for (let i = index - 1; i >= 0; i--) {
    const entry = entries.get(i);
    if (entry === undefined) return 0;
    if (entry === to) return index - i;
    if (!isTaskPath(pathOf(entry))) return 0;
  }
  return 0;
}
// 방문 기록에서 바로 앞 주소. 모르면 undefined
export function previousEntry() {
  const index = historyIndex();
  return index === undefined ? undefined : entries.get(index - 1);
}
export function useReturnTo() {
  const navigate = useNavigate();
  const mode = useWorkspace();
  return useCallback(
    (to: string) => {
      const steps = stepsBackTo(scopedTo(to, mode) as string);
      if (steps) navigate(-steps);
      else navigate(to);
    },
    [navigate, mode],
  );
}
const listeners = new Set<() => void>();
function write(next: Record<string, Trail>) {
  trails = Object.fromEntries(Object.entries(next).slice(-LIMIT));
  remember();
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
    const rememberTitle = () => {
      const title = document.querySelector('main h1')?.textContent?.trim();
      if (title) titles.set(address(window.location), title);
    };
    document.addEventListener('click', rememberTitle, true);
    document.addEventListener('submit', rememberTitle, true);
    return () => {
      document.removeEventListener('click', rememberTitle, true);
      document.removeEventListener('submit', rememberTitle, true);
    };
  }, []);
  useEffect(() => {
    const here = address(location);
    const before = previous.current;
    previous.current = here;
    const index = historyIndex();
    if (index !== undefined) {
      if (type === 'PUSH') for (const key of entries.keys()) if (key > index) entries.delete(key);
      entries.set(index, here);
    }
    if (!isTaskPath(pathOf(here))) taskStart = null;
    else if (before && !isTaskPath(pathOf(before)))
      taskStart = skipped(pathOf(before)) ? null : before;
    remember();
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
