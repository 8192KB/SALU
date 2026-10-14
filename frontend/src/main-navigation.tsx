import { newId } from './prototype/ids';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, resolvePath, useLocation, useNavigate, useNavigationType } from 'react-router';
import type { Location, NavigateOptions, To } from 'react-router';
import { useWorkspace } from './workspace';
import { PageNavigationContext } from './page-navigation';

export type MainSection = 'home' | 'records' | 'requests' | 'consultations';
const sectionRoots = {
  home: '/',
  records: '/records',
  requests: '/requests',
  consultations: '/consultations',
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
}
export function isTaskPath(pathname: string) {
  const path = pathname.replace(/^\/examples(?=\/|$)/, '') || '/';
  return (
    /^\/records\/(?:new|[^/]+\/edit|[^/]+\/progress\/(?:new|[^/]+\/edit))$/.test(path) ||
    /^\/(?:requests|consultations)\/(?:new|materials|write|request|review)$/.test(path)
  );
}
const isDesignerPath = (pathname: string) =>
  /^\/designers(\/|$)/.test(pathname.replace(/^\/examples(?=\/|$)/, '') || '/');
// 저장 완료 화면은 한 번 보는 화면이라 메뉴의 마지막 화면으로 남기지 않음
const isCompletionPath = (pathname: string) =>
  /^\/(?:records\/[^/]+(?:\/progress\/[^/]+)?\/complete|requests\/complete\/[^/]+|consultations\/[^/]+\/complete)$/.test(
    pathname.replace(/^\/examples(?=\/|$)/, '') || '/',
  );
function pageKey(pathname: string, section = sectionOf(pathname)) {
  return section ? `${section}${isTaskPath(pathname) ? '-task' : ''}` : undefined;
}
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
  const activePageKey = section ? pageKey(location.pathname, section) : undefined;
  const pages = activePageKey ? { ...visited, [activePageKey]: location } : visited;

  useEffect(() => {
    if (!isDesignerPath(location.pathname)) origin.current = sectionOf(location.pathname);
    else origin.current ??= candidate;
    if (activePageKey && !isCompletionPath(location.pathname))
      setVisited((previous) => ({ ...previous, [activePageKey]: location }));
  }, [activePageKey, location, candidate]);

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

  useLayoutEffect(() => {
    if (!ready) return;
    currentAddress.current = address(location);
    const y =
      returning.current || navigationType === 'POP' || isTaskPath(location.pathname)
        ? (positions.current.get(currentAddress.current) ?? 0)
        : 0;
    returning.current = false;
    // 페이지를 연결해 높이가 확정된 뒤 스크롤 복원
    let observer: MutationObserver | undefined;
    let stop: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, y);
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
      navigate(to);
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
                { transform: `translateX(${navigationType === 'POP' ? '-12px' : '12px'})` },
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
  }, [visible, slot, container, pageAddress, navigationType]);
  return createPortal(
    <PageNavigationContext.Provider value={handleNavigation}>
      <ActivePageContext.Provider value={visible}>{children}</ActivePageContext.Provider>
    </PageNavigationContext.Provider>,
    container,
  );
}
