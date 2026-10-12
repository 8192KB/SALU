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
  const uploads = useRef({ context: '', photos: new Set<string>() });
  const member = auth.status === 'authenticated' ? auth.member : null;
  useEffect(() => {
    if (!storage || !ready || !member || storage.scope !== `member-${member.id}`) return;
    if (uploads.current.context !== member.storageContext)
      uploads.current = { context: member.storageContext, photos: new Set() };
    const uploaded = uploads.current.photos;
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
    const sync = async () => {
      if (controller.signal.aborted) return;
      if (running) {
        rerun = true;
        return;
      }
      running = true;
      rerun = false;
      try {
        await storage.flush();
        storage.markSyncing();
        const list: { itemId: string; revision: number }[] = await (
          await call('/api/personal-backups')
        ).json();
        for (const row of list) {
          const current = storage.getItems()[row.itemId];
          if (!current || row.revision > current.revision) await remote(row.itemId);
        }
        for (const [id, item] of Object.entries(storage.getItems())) {
          if (!item.dirty || item.conflict || controller.signal.aborted) continue;
          storage.markSyncing();
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
          try {
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
            )
              await remote(id);
            else throw error;
          }
        }
        if (!controller.signal.aborted) storage.markSynced();
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
