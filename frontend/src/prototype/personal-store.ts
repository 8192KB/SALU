import { newId } from './ids';
import { openDB } from 'idb';
import { createMemoryRepository, InputError, isBlankCutDraft } from './memory-repository';
import type { PrototypeRepository } from './types';
import {
  appendBundle,
  copyBundle,
  emptyBundle,
  emptyDrafts,
  mapPhotos,
  photoIds,
  repairBundle,
  serialize,
  validateBundle,
} from './storage-model';
import type { Asset, Bundle, Drafts } from './storage-model';
import { exportZip, importZip, checkImage, MAX_PIXELS } from './zip-backup';

export type SyncItem = {
  revision: number;
  mutationId: string;
  payload: Bundle;
  dirty: boolean;
  conflict?: Bundle;
};
type Document = {
  scope: string;
  generation: number;
  bundle: Bundle;
  items: Record<string, SyncItem>;
  // 로그인 뒤 로그인 전 기록을 옮길지 이 기기에서 이미 물었음. 서버로 보내지 않음
  guestMoveAsked?: boolean;
};
export type StoreView = {
  bundle: Bundle;
  ready: boolean;
  status: 'saving' | 'local' | 'syncing' | 'synced' | 'conflict' | 'error';
  error: string;
  errorSource: 'local' | 'cloud' | null;
  conflicts: number;
};
let connection: ReturnType<typeof openDB> | undefined;
const database = () =>
  (connection ??= openDB('salu-personal-v1', 1, {
    upgrade(db) {
      db.createObjectStore('workspaces', { keyPath: 'scope' });
      db.createObjectStore('assets');
    },
    // 새 버전 탭이 스키마를 올릴 때 이 탭의 연결이 막지 않도록 닫고 다음 요청에서 다시 엶
    blocking() {
      const current = connection;
      connection = undefined;
      void current?.then((db) => db.close());
    },
    terminated() {
      connection = undefined;
    },
  }).catch((error: unknown) => {
    // 열기 실패를 남겨 두지 않아야 ‘다시 시도’에서 새로 열 수 있음
    connection = undefined;
    throw error;
  }));
let persistenceRequested = false;
// 로그인 전 기록은 기기에만 있어 브라우저 저장 공간 정리(Safari 7일 정책 등)로 지워지지 않게 한 번 요청함
function requestPersistentStorage() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  void navigator.storage?.persist?.().catch(() => false);
}
const stores = new Set<PersonalStore>();
export const flushPersonalStores = () => Promise.all([...stores].map((store) => store.flush()));

// 이 기기의 로그인 전 공간에 남은 기록. ids는 로그인 전 주소에 들어 있던 기록 ID를 가려낼 때 씀
export type GuestRecords = { cuts: number; ids: Set<string> };
export async function readGuestRecords(): Promise<GuestRecords | null> {
  const guest: Document | undefined = await (await database()).get('workspaces', 'guest');
  if (!guest) return null;
  const { cuts } = guest.bundle.state;
  if (!cuts.length && isBlankCutDraft(guest.bundle.drafts.cutDraft)) return null;
  return { cuts: cuts.length, ids: new Set(copyBundle(guest.bundle).ids.keys()) };
}

function groupByCut<T>(values: T[], cutId: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const key = cutId(value);
    const group = groups.get(key);
    if (group) group.push(value);
    else groups.set(key, [value]);
  }
  return groups;
}

// Each cut and its immutable previews form one revision unit. The unfinished new-cut form is separate.
export function splitItems(
  bundle: Bundle,
  previousBundle?: Bundle,
  previousItems?: Record<string, SyncItem>,
): Record<string, Bundle> {
  const result: Record<string, Bundle> = {};
  const index = () => ({
    progress: groupByCut(bundle.state.progress, (entry) => entry.cutId),
    photos: groupByCut(bundle.state.photos, (photo) => photo.cutId),
    previews: groupByCut(bundle.state.previews, (preview) => preview.cut.id),
    requests: groupByCut(Object.entries(bundle.drafts.requests), ([, draft]) => draft.cutId),
  });
  let grouped: ReturnType<typeof index> | undefined;
  for (const cut of bundle.state.cuts) {
    const previous = previousItems?.[`cut-${cut.id}`];
    if (
      previous &&
      previousBundle?.state === bundle.state &&
      previousBundle.drafts.progressDrafts[cut.id] === bundle.drafts.progressDrafts[cut.id] &&
      previousBundle.drafts.cutEdits[cut.id] === bundle.drafts.cutEdits[cut.id] &&
      previousBundle.drafts.progressEdits === bundle.drafts.progressEdits &&
      previousBundle.drafts.requests === bundle.drafts.requests &&
      previousBundle.drafts.currentRequestId === bundle.drafts.currentRequestId &&
      previousBundle.drafts.steps === bundle.drafts.steps
    ) {
      result[`cut-${cut.id}`] = previous.payload;
      continue;
    }
    const indexed = (grouped ??= index());
    const entries = indexed.progress.get(cut.id) ?? [];
    const requests = Object.fromEntries(indexed.requests.get(cut.id) ?? []);
    result[`cut-${cut.id}`] = {
      version: 1,
      state: {
        cuts: [cut],
        progress: entries,
        photos: indexed.photos.get(cut.id) ?? [],
        designers: [],
        previews: indexed.previews.get(cut.id) ?? [],
      },
      drafts: {
        ...emptyDrafts(),
        progressDrafts: bundle.drafts.progressDrafts[cut.id]
          ? { [cut.id]: bundle.drafts.progressDrafts[cut.id] }
          : {},
        cutEdits: bundle.drafts.cutEdits[cut.id]
          ? { [cut.id]: bundle.drafts.cutEdits[cut.id] }
          : {},
        progressEdits: Object.fromEntries(
          entries
            .filter((p) => bundle.drafts.progressEdits[p.id])
            .map((p) => [p.id, bundle.drafts.progressEdits[p.id]]),
        ),
        requests,
        currentRequestId:
          bundle.drafts.currentRequestId && requests[bundle.drafts.currentRequestId]
            ? bundle.drafts.currentRequestId
            : null,
        steps: Object.fromEntries(
          Object.keys(requests)
            .filter((id) => bundle.drafts.steps[id])
            .map((id) => [id, bundle.drafts.steps[id]]),
        ),
      },
    };
  }
  result['new-cut-draft'] = {
    ...emptyBundle(),
    drafts: {
      ...emptyDrafts(),
      cutDraft: bundle.drafts.cutDraft,
      recoveredCuts: bundle.drafts.recoveredCuts,
    },
  };
  return Object.fromEntries(
    Object.entries(result).map(([id, value]) => [
      id,
      value === previousItems?.[id]?.payload ? value : serialize(value),
    ]),
  );
}
function combine(items: Record<string, SyncItem>): Bundle {
  let bundle = emptyBundle();
  for (const [id, item] of Object.entries(items))
    if (id !== 'new-cut-draft')
      bundle = appendBundle(bundle, {
        ...item.payload,
        drafts: { ...item.payload.drafts, cutDraft: bundle.drafts.cutDraft },
      });
  const newDraft = items['new-cut-draft']?.payload.drafts;
  if (newDraft)
    bundle.drafts = {
      ...bundle.drafts,
      cutDraft: newDraft.cutDraft,
      recoveredCuts: newDraft.recoveredCuts,
    };
  return bundle;
}
const storageError = () =>
  '기기에 저장하지 못했어요. 입력은 그대로 있어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.';

export class PersonalStore {
  private view: StoreView = {
    bundle: emptyBundle(),
    ready: false,
    status: 'local',
    error: '',
    errorSource: null,
    conflicts: 0,
  };
  private listeners = new Set<() => void>();
  private document: Document;
  private persistedRuntime?: Bundle;
  private assets = new Map<string, Blob>();
  private urls = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private pendingDrafts = false;
  private draftVersion = 0;
  private closed = false;
  private channel: BroadcastChannel | null = null;
  private disposalTimer?: ReturnType<typeof setTimeout>;
  private engine;
  private committingDrafts?: (drafts: Drafts) => Drafts;
  repository: PrototypeRepository;
  onChange?: () => void;
  constructor(public scope: string) {
    this.document = { scope, generation: 0, bundle: emptyBundle(), items: {} };
    this.engine = createMemoryRepository('empty', {
      beforeCommit: async (state) => {
        await this.commit({
          ...this.view.bundle,
          state: { ...state, designers: [] },
          drafts: this.committingDrafts?.(this.view.bundle.drafts) ?? this.view.bundle.drafts,
        });
      },
    });
    const operation = <T>(task: () => Promise<T>, drafts?: (previous: Drafts) => Drafts) =>
      this.enqueue(async () => {
        this.committingDrafts = drafts;
        try {
          return await task();
        } finally {
          this.committingDrafts = undefined;
        }
      });
    this.repository = {
      ...this.engine,
      load: () => this.load(),
      subscribe: (listener) => this.subscribe(listener),
      getSnapshot: () => this.view.bundle.state,
      createCut: (v) =>
        operation(
          () => this.engine.createCut(v),
          (d) => ({ ...d, cutDraft: emptyDrafts().cutDraft }),
        ),
      updateCut: (id, v) =>
        operation(
          () => this.engine.updateCut(id, v),
          (d) => ({
            ...d,
            cutEdits: Object.fromEntries(Object.entries(d.cutEdits).filter(([key]) => key !== id)),
          }),
        ),
      addProgress: (id, v) =>
        operation(
          () => this.engine.addProgress(id, v),
          (d) => ({
            ...d,
            progressDrafts: Object.fromEntries(
              Object.entries(d.progressDrafts).filter(([key]) => key !== id),
            ),
          }),
        ),
      updateProgress: (id, p, v) =>
        operation(
          () => this.engine.updateProgress(id, p, v),
          (d) => ({
            ...d,
            progressEdits: Object.fromEntries(
              Object.entries(d.progressEdits).filter(([key]) => key !== p),
            ),
          }),
        ),
      createPreview: (v) => operation(() => this.engine.createPreview(v)),
      createPreviewForDesigner: (id, d) =>
        operation(() => this.engine.createPreviewForDesigner(id, d)),
      preparePhotos: async (files, count) => {
        for (const file of files)
          await checkImage(file, MAX_PIXELS).catch(() => {
            throw new InputError({
              photos: '5 MiB·4천만 화소 이하의 올바른 JPEG·PNG·WebP 사진을 선택해 주세요.',
            });
          });
        const photos = await this.engine.preparePhotos(files, count);
        photos.forEach((p, i) => {
          this.assets.set(p.id, files[i]);
          this.urls.set(p.id, p.url);
        });
        return photos;
      },
      releasePhoto: () => {
        /* Retain bytes until the next committed graph or workspace disposal. */
      },
      reset: () => {
        void this.enqueue(() => this.commit(emptyBundle()));
      },
      dispose: () => this.dispose(),
    };
  }
  private activate() {
    clearTimeout(this.disposalTimer);
    this.closed = false;
    stores.add(this);
    if (this.channel) return;
    this.channel =
      typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('salu-personal') : null;
    this.channel &&
      (this.channel.onmessage = (event) => {
        if (event.data === this.scope && !this.closed)
          void this.enqueue(async () => {
            if (this.pendingDrafts) {
              this.setView({
                error: '다른 탭에서 기록이 바뀌었어요. 파일로 백업한 뒤 이 탭을 다시 열어 주세요.',
                errorSource: 'local',
                status: 'error',
              });
              return;
            }
            await this.read();
          });
      });
  }
  getSnapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private setView(next: Partial<StoreView>) {
    this.view = { ...this.view, ...next };
    this.listeners.forEach((f) => f());
  }
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task);
    this.queue = next.catch(() => {});
    return next;
  }
  private hydrate(bundle: Bundle, latestDrafts?: Drafts) {
    const runtime = mapPhotos(bundle, (id) => {
      if (!this.urls.has(id)) {
        const blob = this.assets.get(id);
        if (!blob) throw new Error('missing asset');
        this.urls.set(id, URL.createObjectURL(blob));
      }
      return this.urls.get(id)!;
    });
    this.engine.hydrate(runtime.state, [...this.urls.values()]);
    const displayed = latestDrafts ? { ...runtime, drafts: latestDrafts } : runtime;
    this.setView({
      bundle:
        displayed.state === this.view.bundle.state && displayed.drafts === this.view.bundle.drafts
          ? this.view.bundle
          : displayed,
      ready: true,
      conflicts: Object.values(this.document.items).filter((i) => i.conflict).length,
    });
    return runtime;
  }
  async load() {
    this.activate();
    return this.enqueue(async () => {
      if (this.view.ready) return;
      try {
        await this.read();
      } catch {
        this.setView({
          ready: false,
          status: 'error',
          error: storageError(),
          errorSource: 'local',
        });
      }
    });
  }
  // 사용자가 옮기기를 고른 때만 이 기기의 게스트 기록을 계정 공간으로 옮김. 옮긴 것이 없으면 false
  async adoptGuest() {
    if (this.scope === 'guest') return false;
    return this.enqueue(async () => {
      if (!this.view.ready) return false;
      if (this.pendingDrafts) await this.commit(this.view.bundle);
      const moved = await this.migrateGuest();
      if (moved) await this.read();
      return moved;
    });
  }
  get guestMoveAsked() {
    return this.document.guestMoveAsked === true;
  }
  async markGuestMoveAsked() {
    await this.enqueue(async () => {
      if (this.document.guestMoveAsked) return;
      this.document = { ...this.document, guestMoveAsked: true };
      await this.commit(this.view.bundle);
    });
  }
  // 옮긴 게스트 기록의 이전 ID → 새 ID. 로그인 전에 보던 주소를 새 주소로 바꿀 때 씀
  migratedIds = new Map<string, string>();
  private async migrateGuest() {
    let migrated: Map<string, string> | undefined;
    await flushPersonalStoresExcept(this);
    const db = await database();
    const tx = db.transaction(['workspaces', 'assets'], 'readwrite');
    const guest: Document | undefined = await tx.objectStore('workspaces').get('guest');
    if (guest && JSON.stringify(guest.bundle) !== JSON.stringify(emptyBundle())) {
      const target: Document =
        (await tx.objectStore('workspaces').get(this.scope)) ?? this.document;
      const copied = copyBundle(guest.bundle);
      migrated = copied.ids;
      const unfinished = copied.bundle.drafts.cutDraft;
      const adopt = isBlankCutDraft(target.bundle.drafts.cutDraft);
      target.bundle = appendBundle(target.bundle, copied.bundle);
      if (adopt) {
        target.bundle.drafts.cutDraft = unfinished;
        target.bundle.drafts.recoveredCuts = target.bundle.drafts.recoveredCuts.filter(
          (d) => JSON.stringify(d) !== JSON.stringify(unfinished),
        );
      }
      for (const id of photoIds(guest.bundle)) {
        const blob = await tx.objectStore('assets').get(['guest', id]);
        if (!blob) {
          tx.abort();
          throw new Error('missing photo');
        }
        await tx.objectStore('assets').put(blob, [this.scope, copied.ids.get(id)!]);
      }
      let guestAsset = await tx
        .objectStore('assets')
        .openCursor(IDBKeyRange.bound(['guest', ''], ['guest', '\uffff']));
      while (guestAsset) {
        await guestAsset.delete();
        guestAsset = await guestAsset.continue();
      }
      target.generation++;
      target.items = this.changedItems(target.bundle, target.items);
      await tx.objectStore('workspaces').put(target);
      await tx.objectStore('workspaces').put({
        scope: 'guest',
        generation: guest.generation + 1,
        bundle: emptyBundle(),
        items: {},
      });
    }
    await tx.done;
    if (migrated) this.migratedIds = migrated;
    return Boolean(migrated);
  }
  private async read() {
    const db = await database();
    const tx = db.transaction(['workspaces', 'assets'], 'readonly');
    const document: Document =
      (await tx.objectStore('workspaces').get(this.scope)) ?? this.document;
    for (const id of new Set([
      ...photoIds(document.bundle),
      ...Object.values(document.items).flatMap((i) => (i.conflict ? photoIds(i.conflict) : [])),
    ])) {
      const blob = await tx.objectStore('assets').get([this.scope, id]);
      if (!blob) throw new Error('missing image');
      this.assets.set(id, blob);
    }
    await tx.done;

    const repaired = repairBundle(document.bundle) as Bundle;
    const items = Object.fromEntries(
      Object.entries(document.items).map(([id, item]) => [
        id,
        item.conflict ? { ...item, conflict: repairBundle(item.conflict) as Bundle } : item,
      ]),
    );
    this.document = { ...document, items };
    this.hydrate(repaired);
    this.persistedRuntime = this.view.bundle;
    if (repaired !== document.bundle)
      await this.commit(this.view.bundle, this.changedItems(this.view.bundle, { ...items }));
    this.setView({
      status:
        Object.values(this.document.items).some((i) => i.dirty) && this.scope !== 'guest'
          ? 'syncing'
          : 'local',
      error: '',
      errorSource: null,
    });
  }
  private changedItems(bundle: Bundle, previous = this.document.items): Record<string, SyncItem> {
    return Object.fromEntries(
      Object.entries(
        splitItems(
          bundle,
          previous === this.document.items ? this.persistedRuntime : undefined,
          previous,
        ),
      ).map(([id, payload]) => {
        const old = previous[id];
        return [
          id,
          old &&
          (old.payload === payload || JSON.stringify(old.payload) === JSON.stringify(payload))
            ? old
            : {
                ...old,
                payload,
                revision: old?.revision ?? 0,
                mutationId: newId(),
                dirty: true,
              },
        ];
      }),
    );
  }
  private async commit(bundle: Bundle, items = this.changedItems(bundle)) {
    const serial = serialize(bundle);
    const draftVersion = this.draftVersion;
    const next: Document = {
      scope: this.scope,
      generation: this.document.generation + 1,
      bundle: serial,
      items,
      guestMoveAsked: this.document.guestMoveAsked,
    };
    try {
      const db = await database();
      const tx = db.transaction(['workspaces', 'assets'], 'readwrite');
      const saved: Document | undefined = await tx.objectStore('workspaces').get(this.scope);
      if (saved && saved.generation !== this.document.generation) {
        tx.abort();
        throw new Error('concurrent tab');
      }
      const retained = new Set([
        ...photoIds(serial),
        ...Object.values(items).flatMap((i) => (i.conflict ? photoIds(i.conflict) : [])),
      ]);
      for (const id of retained) {
        const blob = this.assets.get(id);
        if (!blob) {
          tx.abort();
          throw new Error('missing image');
        }
        if ((await tx.objectStore('assets').getKey([this.scope, id])) === undefined)
          await tx.objectStore('assets').put(blob, [this.scope, id]);
      }
      let cursor = await tx
        .objectStore('assets')
        .openCursor(IDBKeyRange.bound([this.scope, ''], [this.scope, '\uffff']));
      while (cursor) {
        if (!retained.has((cursor.key as string[])[1])) await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.objectStore('workspaces').put(next);
      await tx.done;

      this.document = next;
      requestPersistentStorage();
      this.pendingDrafts = draftVersion !== this.draftVersion;
      const latestDrafts = this.view.bundle.drafts;
      this.persistedRuntime = this.hydrate(bundle, this.pendingDrafts ? latestDrafts : undefined);
      this.setView({
        status:
          this.view.errorSource === 'cloud'
            ? 'error'
            : this.pendingDrafts
              ? 'saving'
              : this.scope === 'guest'
                ? 'local'
                : Object.values(items).some((i) => i.dirty)
                  ? 'syncing'
                  : 'synced',
        error: this.view.errorSource === 'cloud' ? this.view.error : '',
        errorSource: this.view.errorSource === 'cloud' ? 'cloud' : null,
      });
      this.channel?.postMessage(this.scope);
      this.onChange?.();
    } catch {
      this.setView({ status: 'error', error: storageError(), errorSource: 'local' });
      throw new InputError({ form: storageError() });
    }
  }
  updateDrafts(action: (previous: Drafts) => Drafts) {
    const drafts = action(this.view.bundle.drafts);
    if (
      drafts === this.view.bundle.drafts ||
      JSON.stringify(drafts) === JSON.stringify(this.view.bundle.drafts)
    )
      return;
    this.pendingDrafts = true;
    this.draftVersion++;
    this.setView({ bundle: { ...this.view.bundle, drafts }, status: 'saving' });
    clearTimeout(this.timer);
    void this.flush().catch(() => {});
  }
  async flush() {
    clearTimeout(this.timer);
    await this.enqueue(async () => {
      if (this.pendingDrafts) await this.commit(this.view.bundle);
    });
  }
  async exportBackup() {
    await this.flush().catch(() => {});
    return exportZip(this.view.bundle, this.assets);
  }
  async readBackup(file: File) {
    return importZip(file);
  }
  async importBackup(file: File | Awaited<ReturnType<typeof importZip>>) {
    const imported = file instanceof File ? await importZip(file) : file;
    return this.enqueue(async () => {
      const copied = copyBundle(imported.bundle);
      imported.assets.forEach((a) => this.assets.set(copied.ids.get(a.id)!, a.blob));
      await this.commit(appendBundle(this.view.bundle, copied.bundle));
    });
  }
  // 화면에서 바로 다시 보내기. CloudSync가 연결돼 있을 때만 동작함
  requestSync() {
    this.onChange?.();
  }
  getItems() {
    return this.document.items;
  }
  getAsset(id: string) {
    return this.assets.get(id);
  }
  markSyncing() {
    if (this.view.errorSource !== 'local')
      this.setView({
        status:
          Object.values(this.document.items).some((item) => item.conflict) &&
          !Object.values(this.document.items).some((item) => item.dirty && !item.conflict)
            ? 'conflict'
            : 'syncing',
        error: '',
        errorSource: null,
      });
  }
  markSynced() {
    if (this.view.errorSource === 'local') return;
    this.setView({
      status: this.pendingDrafts
        ? 'saving'
        : Object.values(this.document.items).some((item) => item.conflict)
          ? 'conflict'
          : Object.values(this.document.items).some((item) => item.dirty)
            ? 'syncing'
            : 'synced',
      error: '',
      errorSource: null,
    });
  }
  markSyncError(
    error = '서버 저장을 확인하지 못했어요. 기기 기록은 그대로 두고 자동으로 다시 시도할게요.',
  ) {
    if (this.view.errorSource === 'local') return;
    this.setView({ status: 'error', error, errorSource: 'cloud' });
  }
  async acknowledge(id: string, mutationId: string, revision: number) {
    await this.enqueue(async () => {
      if (this.pendingDrafts) await this.commit(this.view.bundle);
      const item = this.document.items[id];
      if (!item) return;
      const next = { ...item, revision, dirty: item.mutationId !== mutationId };
      await this.commit(this.view.bundle, { ...this.document.items, [id]: next });
    });
  }
  async acceptRemote(id: string, revision: number, payload: unknown, assets: Asset[]) {
    const validated = validateBundle(payload);
    await this.enqueue(async () => {
      if (this.pendingDrafts) await this.commit(this.view.bundle);
      assets.forEach((a) => {
        this.assets.set(a.id, a.blob);
      });
      const current = this.document.items[id];
      const item: SyncItem = current?.dirty
        ? { ...current, conflict: validated }
        : { revision, payload: validated, dirty: false, mutationId: newId() };
      if (current?.dirty) item.revision = revision;
      const items = { ...this.document.items, [id]: item };
      await this.commit(current?.dirty ? this.view.bundle : combine(items), items);
    });
  }
  async resolveConflicts() {
    await this.enqueue(async () => {
      const items = { ...this.document.items };
      let recovered = emptyBundle();
      for (const [id, item] of Object.entries(items)) {
        if (!item.conflict) continue;
        const copied = copyBundle(item.payload);
        for (const photo of photoIds(item.payload))
          this.assets.set(copied.ids.get(photo)!, this.assets.get(photo)!);
        recovered = appendBundle(recovered, copied.bundle);
        items[id] = {
          revision: item.revision,
          mutationId: newId(),
          payload: item.conflict,
          dirty: false,
        };
      }
      const bundle = appendBundle(combine(items), recovered);
      await this.commit(bundle, this.changedItems(bundle, items));
    });
  }
  dispose() {
    this.disposalTimer = setTimeout(() => {
      this.closed = true;
      this.channel?.close();
      this.channel = null;
      void this.flush()
        .catch(() => {})
        .finally(() => {
          stores.delete(this);
          this.engine.dispose();
          this.urls.forEach((url) => URL.revokeObjectURL(url));
        });
    }, 0);
  }
}
const flushPersonalStoresExcept = (current: PersonalStore) =>
  Promise.all([...stores].filter((s) => s !== current).map((s) => s.flush()));
