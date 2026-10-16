import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/context';
import { ApiFailure, backupRequest } from '../auth/api';
import { usePrototype } from './context';
import { photoIds, validateBundle } from './storage-model';
import { checkImage } from './zip-backup';
import type { Asset } from './storage-model';

export function CloudSync() {
  const { state: auth, refresh } = useAuth();
  const { storage, ready } = usePrototype();
  const uploads = useRef({
    context: '',
    photos: new Set<string>(),
    rejected: new Map<string, string>(),
  });
  const member = auth.status === 'authenticated' ? auth.member : null;
  useEffect(() => {
    if (!storage || !ready || !member || storage.scope !== `member-${member.id}`) return;
    if (uploads.current.context !== member.storageContext)
      uploads.current = { context: member.storageContext, photos: new Set(), rejected: new Map() };
    const uploaded = uploads.current.photos;
    const rejected = uploads.current.rejected;
    const controller = new AbortController();
    let running = false;
    let rerun = false;
    let timer: ReturnType<typeof setTimeout>;
    const call = (path: string, options?: RequestInit) =>
      backupRequest(path, member, options, controller.signal);
    const remote = async (id: string) => {
      const response = await call(`/api/personal-backups/${encodeURIComponent(id)}`);
      const value = await response.json();
      const payload = validateBundle(value.payload);
      const existing = storage.getItems()[id];
      if (existing?.dirty && existing.mutationId === value.mutationId) {
        await storage.acknowledge(id, existing.mutationId, value.revision);
        return;
      }
      const assets: Asset[] = [];
      for (const photoId of photoIds(payload)) {
        const response = await call(`/api/personal-backup-photos/${encodeURIComponent(photoId)}`);
        const blob = await response.blob();
        await checkImage(blob);
        assets.push({ id: photoId, blob });
        uploaded.add(photoId);
      }
      if (!controller.signal.aborted)
        await storage.acceptRemote(id, value.revision, payload, assets);
    };
    // 연결·로그인·서버 장애는 전체를 멈추고 다시 시도함. 항목 하나의 문제는 그 항목만 건너뜀
    const fatal = (error: unknown) =>
      controller.signal.aborted ||
      (error instanceof ApiFailure &&
        (error.status === 0 ||
          error.status === 401 ||
          error.status >= 500 ||
          error.code === 'STORAGE_CONTEXT_CHANGED' ||
          error.code === 'CSRF_INVALID')) ||
      (error instanceof DOMException && ['AbortError', 'TimeoutError'].includes(error.name)) ||
      error instanceof TypeError;
    const sync = async () => {
      if (controller.signal.aborted) return;
      if (running) {
        rerun = true;
        return;
      }
      running = true;
      rerun = false;
      let unreadable = 0;
      let refused = 0;
      try {
        await storage.flush();
        storage.markSyncing();
        const list: { itemId: string; revision: number }[] = await (
          await call('/api/personal-backups')
        ).json();
        for (const row of list) {
          const current = storage.getItems()[row.itemId];
          if (current && row.revision <= current.revision) continue;
          try {
            await remote(row.itemId);
          } catch (error) {
            if (fatal(error)) throw error;
            unreadable++;
          }
        }
        for (const [id, item] of Object.entries(storage.getItems())) {
          if (!item.dirty || item.conflict || controller.signal.aborted) continue;
          // 서버가 거절한 같은 내용은 바뀌기 전까지 다시 보내지 않음
          if (rejected.get(id) === item.mutationId) {
            refused++;
            continue;
          }
          storage.markSyncing();
          try {
            for (const photoId of photoIds(item.payload)) {
              if (uploaded.has(photoId)) continue;
              const blob = storage.getAsset(photoId);
              if (!blob) throw new Error('missing photo');
              await call(`/api/personal-backup-photos/${encodeURIComponent(photoId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': blob.type },
                body: blob,
              });
              uploaded.add(photoId);
            }
            const value = await (
              await call(`/api/personal-backups/${encodeURIComponent(id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  expectedRevision: item.revision,
                  mutationId: item.mutationId,
                  payload: item.payload,
                  photoIds: photoIds(item.payload),
                }),
              })
            ).json();
            if (!controller.signal.aborted)
              await storage.acknowledge(id, item.mutationId, value.revision);
          } catch (error) {
            if (error instanceof ApiFailure && error.status === 400) uploaded.clear();
            if (
              error instanceof ApiFailure &&
              error.status === 409 &&
              error.code !== 'STORAGE_CONTEXT_CHANGED'
            ) {
              try {
                await remote(id);
              } catch (remoteError) {
                if (fatal(remoteError)) throw remoteError;
                unreadable++;
              }
              continue;
            }
            if (fatal(error)) throw error;
            rejected.set(id, item.mutationId);
            refused++;
          }
        }
        if (controller.signal.aborted) return;
        if (refused)
          storage.markSyncError(
            `서버가 기록 ${refused}건을 받지 않았어요. 계정 사진 용량(128 MiB)이나 사진 크기를 확인해 주세요. 기기 기록은 그대로 있고 다른 기록은 계속 저장해요.`,
          );
        else if (unreadable)
          storage.markSyncError(
            `서버의 기록 ${unreadable}건을 이 기기에서 열지 못했어요. 다른 기록은 계속 저장해요.`,
          );
        else storage.markSynced();
      } catch (error) {
        if (!controller.signal.aborted) {
          storage.markSyncError();
          if (
            error instanceof ApiFailure &&
            (error.status === 401 || error.code === 'STORAGE_CONTEXT_CHANGED')
          )
            void refresh();
        }
      } finally {
        running = false;
        if (!controller.signal.aborted) timer = setTimeout(() => void sync(), rerun ? 400 : 15000);
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void sync(), 400);
    };
    storage.onChange = schedule;
    window.addEventListener('online', schedule);
    window.addEventListener('focus', schedule);
    void sync();
    return () => {
      controller.abort();
      clearTimeout(timer);
      storage.onChange = undefined;
      window.removeEventListener('online', schedule);
      window.removeEventListener('focus', schedule);
    };
  }, [storage, ready, member, refresh]);
  return null;
}
