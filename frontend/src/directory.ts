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
  useEffect(() => {
    if (example || !cache.error) return;
    // 연결이 끊겨 실패했으면 연결이 돌아왔을 때 다시 불러옴
    const retry = () => void refreshDirectory();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [example, cache.error]);
  return example
    ? { ...cache, designers: state.designers, salons: [], error: '', loading: false }
    : cache;
}
