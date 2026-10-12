import { createContext } from 'react';
import type { NavigateOptions, To } from 'react-router';

export const PageNavigationContext = createContext<
  ((to: To | number, options?: NavigateOptions, source?: string) => boolean) | null
>(null);
