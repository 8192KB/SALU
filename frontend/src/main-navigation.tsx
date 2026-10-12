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
function pageKey(pathname: string) {
  const section = sectionOf(pathname);
  return section ? `${section}${isTaskPath(pathname) ? '-task' : ''}` : undefined;
}
const address = (location: Location) => `${location.pathname}${location.search}${location.hash}`;

export function useMainNavigation(ready: boolean) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const mode = useWorkspace();
  const candidate = sectionOf(location.pathname);
  const section = mode === 'example' && candidate === 'home' ? undefined : candidate;
  const [visited, setVisited] = useState<Record<string, Location>>({});
  const positions = useRef(new Map<string, number>());
  const currentAddress = useRef(address(location));
  const returning = useRef(false);
  const activePageKey = section ? pageKey(location.pathname) : undefined;
  const pages = activePageKey ? { ...visited, [activePageKey]: location } : visited;

  useEffect(() => {
    if (activePageKey) setVisited((previous) => ({ ...previous, [activePageKey]: location }));
  }, [activePageKey, location]);

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
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, y);
      document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [location, navigationType, ready]);

  const root = (target: MainSection) =>
    mode === 'example' && target !== 'home'
      ? `/examples${sectionRoots[target]}`
      : sectionRoots[target];
  const target = (item: MainSection) =>
    mode === 'example' && item === 'home'
      ? '/'
      : section === item
        ? root(item)
        : visited[item]
          ? address(visited[item])
          : root(item);
  const select = (item: MainSection, event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    positions.current.set(address(location), window.scrollY);
    const to = target(item);
    returning.current = section !== item && Boolean(visited[item]);
    if (section === item) positions.current.delete(to);
    if (to === address(location)) {
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
    background: (page: Location, to: To, options?: NavigateOptions) => {
      const path = resolvePath(to, page.pathname);
      const nextSection = sectionOf(path.pathname);
      if (!nextSection) return;
      setVisited((previous) => {
        const next = { ...previous };
        const originKey = pageKey(page.pathname);
        const nextKey = pageKey(path.pathname)!;
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
