import { createContext, useCallback, useContext } from 'react';
import type { ComponentProps } from 'react';
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  useLocation,
  useNavigate as useRouterNavigate,
} from 'react-router';
import type { NavigateFunction, NavigateOptions, To } from 'react-router';
import { PageNavigationContext } from './page-navigation';

export type WorkspaceMode = 'empty' | 'example';
export const WorkspaceContext = createContext<WorkspaceMode>('empty');
export const useWorkspace = () => useContext(WorkspaceContext);

export function scopedTo(to: To, mode: WorkspaceMode): To {
  const prefix = (path: string) =>
    mode === 'example' && path.startsWith('/') && !path.startsWith('/examples') && path !== '/login'
      ? `/examples${path}`
      : path;
  return typeof to === 'string'
    ? prefix(to)
    : { ...to, pathname: to.pathname ? prefix(to.pathname) : to.pathname };
}

export function Link(props: ComponentProps<typeof RouterLink>) {
  const mode = useWorkspace();
  return <RouterLink {...props} to={scopedTo(props.to, mode)} />;
}

export function NavLink(props: ComponentProps<typeof RouterNavLink>) {
  const mode = useWorkspace();
  return <RouterNavLink {...props} to={scopedTo(props.to, mode)} />;
}

export function useNavigate(): NavigateFunction {
  const navigate = useRouterNavigate();
  const mode = useWorkspace();
  const pageNavigation = useContext(PageNavigationContext);
  const location = useLocation();
  const source = `${location.pathname}${location.search}${location.hash}`;
  return useCallback<NavigateFunction>(
    (to: To | number, options?: NavigateOptions) => {
      const destination = typeof to === 'number' ? to : scopedTo(to, mode);
      if (pageNavigation?.(destination, options, source)) return;
      return typeof destination === 'number'
        ? navigate(destination)
        : navigate(destination, options);
    },
    [navigate, mode, pageNavigation, source],
  );
}
