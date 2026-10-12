import { useEffect, useSyncExternalStore } from 'react';
import { directorySnapshot, refreshDirectory, subscribeDirectory } from './directory-cache';
import { useWorkspace } from './workspace';
import type { PrototypeState } from './prototype/types';
export function useDirectory(state: PrototypeState) {
  const example = useWorkspace() === 'example';
  const cache = useSyncExternalStore(subscribeDirectory, directorySnapshot);
  useEffect(() => {
    if (
      !example &&
      !cache.loaded &&
      !cache.loading &&
      import.meta.env.VITE_SALU_AUTH_MODE !== 'prototype'
    )
      void refreshDirectory();
  }, [example, cache.loaded, cache.loading]);
  return example
    ? { ...cache, designers: state.designers, salons: [], error: '', loading: false }
    : cache;
}
