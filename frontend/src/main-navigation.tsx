import { newId } from './prototype/ids';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, resolvePath, useLocation, useNavigate, useNavigationType } from 'react-router';
import type { Location, NavigateOptions, To } from 'react-router';
import { useWorkspace } from './workspace';
import { PageNavigationContext } from './page-navigation';
import { KEEP_TRAIL } from './back-trail';

export type MainSection = 'home' | 'records' | 'requests' | 'consultations' | 'more';
const sectionRoots = {
  home: '/',
  records: '/records',
  requests: '/requests',
  consultations: '/consultations',
  more: '/more',
};
const ActivePageContext = createContext(true);
export const useActivePage = () => useContext(ActivePageContext);

function sectionOf(pathname: string): MainSection | undefined {
  const path = pathname.replace(/^\/examples(?=\/|$)/, '') || '/';
  if (path === '/') return 'home';
  if (path === '/records' || path.startsWith('/records/')) return 'records';
  if (/^\/consultations(\/|$)/.test(path)) return 'consultations';
  if (/^\/designers(\/|$)/.test(path))
    return pathname.startsWith('/examples/') ? 'consultations' : 'requests';
  if (/^\/requests(\/|$)/.test(path)) return 'requests';
  // 커뮤니티와 관리자 화면은 하단 메뉴 맨 오른쪽 더보기에 속함
  if (/^\/(?:more|community|admin)(\/|$)/.test(path)) return 'more';
}
export function isTaskPath(pathname: string) {
  const path = pathname.replace(/^\/examples(?=\/|$)/, '') || '/';
  return (
    /^\/records\/(?:new|[^/]+\/edit|[^/]+\/progress\/(?:new|[^/]+\/edit))$/.test(path) ||
    /^\/(?:requests|consultations)\/(?:new|materials|write|request|review)$/.test(path) ||
    /^\/consultations\/[^/]+\/review$/.test(path) ||
    /^\/community\/(?:new|[^/]+\/edit)$/.test(path)
  );
}
// 받은 상담·내 디자이너 프로필처럼 디자이너로 활동하는 화면. 같은 회원이 고객으로도 쓰므로 계정이 아니라 주소로 정함
export const isDesignerAreaPath = (pathname: string) =>
  /^\/(?:consultations\/received|account\/designer)(\/|$)/.test(
    pathname.replace(/^\/examples(?=\/|$)/, '') || '/',
  );
const isDesignerPath = (pathname: string) =>
  /^\/designers(\/|$)/.test(pathname.replace(/^\/examples(?=\/|$)/, '') || '/');
// 저장 완료 화면은 한 번 보는 화면이라 메뉴의 마지막 화면으로 남기지 않음
const isCompletionPath = (pathname: string) =>
  /^\/(?:records\/[^/]+(?:\/progress\/[^/]+)?\/complete|requests\/complete\/[^/]+|consultations\/(?:received\/)?[^/]+(?:\/review)?\/complete|community\/[^/]+\/complete)$/.test(
    pathname.replace(/^\/examples(?=\/|$)/, '') || '/',
  );
// 다시 그린 화면에서 같은 버튼·칸을 알아보는 이름.
// 글자 입력 칸은 초점을 받은 뒤 값이 바뀌므로 값을 빼고, 값이 고정된 선택지(radio 등)만 값으로 구분함
function focusId(element: HTMLElement) {
  const typed =
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      !['radio', 'checkbox', 'button', 'submit', 'reset'].includes(element.type));
  return [
    element.tagName,
    element.getAttribute('name'),
    element.getAttribute('aria-label'),
    typed ? '' : element.getAttribute('value'),
    element.textContent?.trim(),
  ].join('|');
}
function pageKey(pathname: string, section = sectionOf(pathname)) {
  return section ? `${section}${isTaskPath(pathname) ? '-task' : ''}` : undefined;
}
const isReturn = (location: Location) =>
  (location.state as { trail?: string } | null)?.trail === KEEP_TRAIL.trail;
const address = (location: Location) => `${location.pathname}${location.search}${location.hash}`;

export function useMainNavigation(ready: boolean) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const mode = useWorkspace();
  // 디자이너 화면은 들어온 메뉴(내 기록·커트 준비 등)에 속함
  const origin = useRef<MainSection | undefined>(undefined);
  const sectionFor = (pathname: string) => {
    const value = sectionOf(pathname);
    return isDesignerPath(pathname) && origin.current && origin.current !== 'home'
      ? origin.current
      : value;
  };
  const candidate = sectionFor(location.pathname);
  const section = mode === 'example' && candidate === 'home' ? undefined : candidate;
  const [visited, setVisited] = useState<Record<string, Location>>({});
  const positions = useRef(new Map<string, number>());
  const currentAddress = useRef(address(location));
  const returning = useRef(false);
  const shownPath = useRef<string | null>(null);
  // 본문에서 마지막으로 초점을 받은 요소. 분류·필터를 바꾸면 화면을 새로 그리므로 같은 버튼을 찾아 초점을 되돌림
  const lastFocus = useRef<string | null>(null);
  const activePageKey = section ? pageKey(location.pathname, section) : undefined;
  const pages = activePageKey ? { ...visited, [activePageKey]: location } : visited;

  useEffect(() => {
    if (!isDesignerPath(location.pathname)) origin.current = sectionOf(location.pathname);
    else origin.current ??= candidate;
    if (!activePageKey) return;
    // 완료 화면에 오면 그 메뉴의 작성 화면은 끝난 것이라 숨겨 둔 입력을 버림. 다시 열면 빈 화면
    if (isCompletionPath(location.pathname)) {
      const task = `${activePageKey}-task`;
      setVisited((previous) => {
        if (!previous[task]) return previous;
        const next = { ...previous };
        delete next[task];
        return next;
      });
    } else setVisited((previous) => ({ ...previous, [activePageKey]: location }));
  }, [activePageKey, location, candidate]);

  useEffect(() => {
    const remember = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('main'))
        lastFocus.current = focusId(event.target);
    };
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);

  useEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const savePosition = () => positions.current.set(currentAddress.current, window.scrollY);
    window.addEventListener('scroll', savePosition, { passive: true });
    return () => {
      window.removeEventListener('scroll', savePosition);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  // 탭 제목을 화면 제목(main h1)에 맞춤. 방문 기록·탭에서 화면을 구분하고 화면 읽기 도구가 이동을 알림
  useEffect(() => {
    const base = document.title;
    const sync = () => {
      const h1 = document.querySelector('main h1');
      // 줄바꿈(<br>)으로 나눈 제목도 띄어 씀
      const copy = h1?.cloneNode(true) as HTMLElement | undefined;
      copy?.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
      const heading = copy?.textContent?.replace(/\s+/g, ' ').trim();
      const next = heading ? `${heading} | SALU` : base;
      if (document.title !== next) document.title = next;
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      document.title = base;
    };
  }, []);

  useLayoutEffect(() => {
    if (!ready) return;
    // 같은 화면에서 분류·필터처럼 주소 뒤 조건만 바꾸면 화면 이동이 아니므로 제목 대신 누른 버튼에 초점을 둠
    const samePage = shownPath.current === location.pathname && navigationType !== 'POP';
    shownPath.current = location.pathname;
    currentAddress.current = address(location);
    if (samePage) {
      returning.current = false;
      const frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active !== document.body) return;
        const same = [
          ...document.querySelectorAll<HTMLElement>('main :is(button, a, input, select, textarea)'),
        ].find(
          (element) =>
            element.getClientRects().length > 0 && focusId(element) === lastFocus.current,
        );
        (same ?? document.querySelector<HTMLElement>('main h1'))?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
    // 뒤로 가기·메뉴 복귀·뒤로 링크·나가기로 돌아온 화면은 보던 위치로 되돌림
    const y =
      returning.current ||
      navigationType === 'POP' ||
      isReturn(location) ||
      isTaskPath(location.pathname)
        ? (positions.current.get(currentAddress.current) ?? 0)
        : 0;
    returning.current = false;
    // 페이지를 연결해 높이가 확정된 뒤 스크롤 복원
    let observer: MutationObserver | undefined;
    let stop: ReturnType<typeof setTimeout> | undefined;
    // 돌아온 뒤 목록을 서버에서 다시 받는 화면은 높이가 늦게 늘어 처음 복원이 위쪽에서 잘림.
    // 높이가 늘 때마다 다시 맞추고, 닿았거나 사용자가 먼저 움직이거나 3초가 지나면 멈춤
    let resize: ResizeObserver | undefined;
    const userMoves = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    const stopRestore = () => {
      resize?.disconnect();
      resize = undefined;
      userMoves.forEach((type) => window.removeEventListener(type, stopRestore));
    };
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, y);
      if (y > 0 && Math.abs(window.scrollY - y) > 1) {
        resize = new ResizeObserver(() => {
          window.scrollTo(0, y);
          if (Math.abs(window.scrollY - y) <= 1) stopRestore();
        });
        resize.observe(document.body);
        userMoves.forEach((type) => window.addEventListener(type, stopRestore, { passive: true }));
        setTimeout(stopRestore, 3000);
      }
      const heading = document.querySelector<HTMLElement>('main h1');
      if (heading) {
        heading.focus({ preventScroll: true });
        return;
      }
      // 지연 로딩 화면은 제목이 늦게 그려지므로 나타날 때 초점을 옮김
      const main = document.querySelector('main');
      if (!main) return;
      observer = new MutationObserver(() => {
        const late = main.querySelector<HTMLElement>('h1');
        if (!late) return;
        observer?.disconnect();
        // 그사이 사용자가 본문 안으로 옮긴 초점은 건드리지 않음
        const active = document.activeElement;
        if (!active || active === document.body || active.closest('header, nav'))
          late.focus({ preventScroll: true });
      });
      observer.observe(main, { childList: true, subtree: true });
      stop = setTimeout(() => observer?.disconnect(), 3000);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      clearTimeout(stop);
      stopRestore();
    };
  }, [location, navigationType, ready]);

  const root = (target: MainSection) =>
    mode === 'example' && target !== 'home'
      ? `/examples${sectionRoots[target]}`
      : sectionRoots[target];
  const target = (item: MainSection, current = section) =>
    mode === 'example' && item === 'home'
      ? '/'
      : current === item
        ? root(item)
        : visited[item]
          ? address(visited[item])
          : root(item);
  const select = (item: MainSection, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    // 바로 앞 메뉴 이동이 아직 그려지지 않았을 수 있어 실제 주소로 판단함
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const current = sectionFor(window.location.pathname);
    positions.current.set(here, window.scrollY);
    const to = target(item, current);
    returning.current = current !== item && Boolean(visited[item]);
    // 메뉴로 다시 연 디자이너 화면은 누른 메뉴에 속함
    origin.current = item;
    if (current === item) positions.current.delete(to);
    if (to === here) {
      window.scrollTo(0, 0);
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    } else {
      // 메뉴로 돌아간 화면은 원래 돌아갈 곳을 유지함
      navigate(to, { state: KEEP_TRAIL });
    }
  };

  return {
    section,
    activePageKey,
    pages,
    location,
    // 예시 초기화로 자료가 사라진 뒤 메뉴가 지워진 화면으로 돌아가지 않게 보관 화면도 비움
    forget: () => {
      positions.current.clear();
      setVisited({});
    },
    background: (page: Location, to: To, options?: NavigateOptions) => {
      const path = resolvePath(to, page.pathname);
      if (!sectionOf(path.pathname)) return;
      setVisited((previous) => {
        const next = { ...previous };
        const originKey =
          Object.keys(previous).find((key) => previous[key].key === page.key) ??
          pageKey(page.pathname);
        const originSection = originKey?.replace(/-task$/, '') as MainSection | undefined;
        const nextKey = pageKey(
          path.pathname,
          isDesignerPath(path.pathname) && originSection ? originSection : sectionOf(path.pathname),
        )!;
        if (originKey !== nextKey && originKey) delete next[originKey];
        next[nextKey] = {
          ...page,
          ...path,
          key: newId(),
          state: options?.state ?? null,
        };
        return next;
      });
    },
    menu: (item: MainSection, children: ReactNode) => (
      <Link
        to={target(item)}
        onClick={(event) => select(item, event)}
        className={section === item ? 'active' : undefined}
        aria-current={section === item ? 'page' : undefined}
      >
        {children}
      </Link>
    ),
  };
}

export function RetainedPage({
  visible,
  slot,
  children,
  onBackgroundNavigate,
  pageAddress,
}: {
  visible: boolean;
  slot: HTMLDivElement | null;
  children: ReactNode;
  onBackgroundNavigate?: (to: To, options?: NavigateOptions) => void;
  pageAddress?: string;
}) {
  const current = useRef({ visible, onBackgroundNavigate, pageAddress });
  const [handleNavigation] = useState(
    () => (to: To | number, options?: NavigateOptions, source?: string) => {
      if (current.current.pageAddress && current.current.pageAddress !== source) return true;
      const browserAddress = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (
        current.current.visible &&
        (!current.current.pageAddress || current.current.pageAddress === browserAddress)
      )
        return false;
      if (typeof to !== 'number') current.current.onBackgroundNavigate?.(to, options);
      return true;
    },
  );
  useLayoutEffect(() => {
    current.current = { visible, onBackgroundNavigate, pageAddress };
    return () => {
      current.current = { visible: false, onBackgroundNavigate: undefined, pageAddress };
    };
  });
  const [container] = useState(() => {
    const element = document.createElement('div');
    element.className = 'route-content';
    return element;
  });
  const navigationType = useNavigationType();
  const shown = useLocation();
  const backward = navigationType === 'POP' || isReturn(shown);
  useLayoutEffect(() => {
    // 비활성 페이지는 DOM에서 분리하고 폼·사진 처리 상태는 유지
    if (visible && slot) {
      slot.appendChild(container);
    }
    return () => container.remove();
  }, [visible, slot, container]);
  useLayoutEffect(() => {
    if (!visible || !slot) return;
    const animations: Animation[] = [];
    const frame = requestAnimationFrame(() => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      animations.push(
        container.animate([{ opacity: reduced ? 0.85 : 0.55 }, { opacity: 1 }], {
          duration: reduced ? 80 : 220,
          easing: 'ease-out',
        }),
      );
      // 고정 버튼의 위치 기준이 바뀌지 않도록 본문 영역에만 이동 효과 적용
      if (!reduced) {
        const sections = container.querySelectorAll(
          '.page-heading, .form-body, .material-picker, .request-row, .preparation-summary, .profile-intro',
        );
        sections.forEach((element) =>
          animations.push(
            element.animate(
              [
                { transform: `translateX(${backward ? '-12px' : '12px'})` },
                { transform: 'translateX(0)' },
              ],
              { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
            ),
          ),
        );
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
    };
  }, [visible, slot, container, pageAddress, backward]);
  return createPortal(
    <PageNavigationContext.Provider value={handleNavigation}>
      <ActivePageContext.Provider value={visible}>{children}</ActivePageContext.Provider>
    </PageNavigationContext.Provider>,
    container,
  );
}
