import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createMemoryRepository, newCutDraft, newProgressDraft } from './memory-repository';
import type {
  RequestDraft,
  CutDraft,
  CutRecord,
  ProgressDraft,
  ProgressEntry,
  PrototypeRepository,
  PrototypeState,
} from './types';
import { materialUrl, requestTarget, requestUrl, hasDraftContent } from './request-flow';
import type { WorkspaceMode } from '../workspace';
import { PersonalStore } from './personal-store';
import type { Drafts } from './storage-model';

type PrototypeContextValue = {
  repository: PrototypeRepository;
  storage?: PersonalStore;
  ready: boolean;
  state: PrototypeState;
  cutDraft: CutDraft;
  setCutDraft: Dispatch<SetStateAction<CutDraft>>;
  progressDrafts: Record<string, ProgressDraft>;
  setProgressDrafts: Dispatch<SetStateAction<Record<string, ProgressDraft>>>;
  cutEdits: Record<string, CutDraft>;
  setCutEdits: Dispatch<SetStateAction<Record<string, CutDraft>>>;
  progressEdits: Record<string, ProgressDraft>;
  setProgressEdits: Dispatch<SetStateAction<Record<string, ProgressDraft>>>;
  requestDraft: RequestDraft | null;
  requestDrafts: Record<string, RequestDraft>;
  setRequestDraft: Dispatch<SetStateAction<RequestDraft | null>>;
  resumeRequestDraft: (initial: RequestDraft) => void;
  markRequestStep: (id: string, step: 'materials' | 'write') => void;
  resumeUrl: (draft: RequestDraft) => string;
  hasWork: boolean;
  reset: () => void;
};
const PrototypeContext = createContext<PrototypeContextValue | null>(null);
type RequestDraftState = {
  current: RequestDraft | null;
  saved: Record<string, RequestDraft>;
  targets: Record<string, string>;
};

function MemoryPrototypeProvider({
  children,
  seed = 'empty',
}: {
  children: ReactNode;
  seed?: WorkspaceMode;
}) {
  const [repository] = useState(() => createMemoryRepository(seed));
  const state = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
  const [cutDraft, setCutDraft] = useState(newCutDraft);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, ProgressDraft>>({});
  const [cutEdits, setCutEdits] = useState<Record<string, CutDraft>>({});
  const [progressEdits, setProgressEdits] = useState<Record<string, ProgressDraft>>({});
  const [requestDrafts, setRequestDrafts] = useState<RequestDraftState>({
    current: null,
    saved: {},
    targets: {},
  });
  const requestDraft = requestDrafts.current;
  const [requestSteps, setRequestSteps] = useState<Record<string, 'materials' | 'write'>>({});
  const markRequestStep = useCallback((id: string, step: 'materials' | 'write') => {
    setRequestSteps((previous) => (previous[id] === step ? previous : { ...previous, [id]: step }));
  }, []);
  const resumeUrl = (draft: RequestDraft) =>
    requestSteps[draft.id] === 'write' ? requestUrl(draft) : materialUrl(draft);
  const hasWork = Boolean(
    state.cuts.length ||
    state.previews.length ||
    cutDraft.areas.length ||
    cutDraft.goodNote ||
    cutDraft.salonName ||
    cutDraft.designerName ||
    cutDraft.price ||
    cutDraft.photos.length ||
    cutDraft.cutDate !== newCutDraft().cutDate ||
    cutDraft.service !== '커트' ||
    Object.keys(cutEdits).length ||
    Object.keys(progressEdits).length ||
    Object.values(progressDrafts).some(
      (draft) =>
        draft.areas.length ||
        draft.discomfort ||
        draft.styling ||
        draft.question ||
        draft.photos.length,
    ) ||
    Object.values(requestDrafts.saved).some(hasDraftContent),
  );
  const setRequestDraft = useCallback<Dispatch<SetStateAction<RequestDraft | null>>>(
    (action) =>
      setRequestDrafts((previous) => {
        const next = typeof action === 'function' ? action(previous.current) : action;
        if (next === previous.current) return previous;
        return {
          current: next,
          saved: next ? { ...previous.saved, [next.id]: next } : previous.saved,
          targets: next
            ? { ...previous.targets, [requestTarget(next)]: next.id }
            : previous.targets,
        };
      }),
    [],
  );
  const resumeRequestDraft = useCallback((initial: RequestDraft) => {
    setRequestDrafts((previous) => {
      const key = requestTarget(initial);
      const next = previous.saved[previous.targets[key]] ?? initial;
      if (previous.current === next) return previous;
      return {
        current: next,
        saved: { ...previous.saved, [next.id]: next },
        targets: { ...previous.targets, [key]: next.id },
      };
    });
  }, []);
  useEffect(() => {
    void repository.load();
    return () => repository.dispose();
  }, [repository]);
  const reset = () => {
    repository.reset();
    setCutDraft(newCutDraft());
    setProgressDrafts({});
    setCutEdits({});
    setProgressEdits({});
    setRequestDrafts({ current: null, saved: {}, targets: {} });
    setRequestSteps({});
  };
  return (
    <PrototypeContext.Provider
      value={{
        repository,
        ready: true,
        state,
        cutDraft,
        setCutDraft,
        progressDrafts,
        setProgressDrafts,
        cutEdits,
        setCutEdits,
        progressEdits,
        setProgressEdits,
        requestDraft,
        requestDrafts: requestDrafts.saved,
        setRequestDraft,
        resumeRequestDraft,
        markRequestStep,
        resumeUrl,
        hasWork,
        reset,
      }}
    >
      {children}
    </PrototypeContext.Provider>
  );
}

export function PrototypeProvider({
  children,
  seed = 'empty',
  scope = 'guest',
}: {
  children: ReactNode;
  seed?: WorkspaceMode;
  scope?: string;
}) {
  return seed === 'example' ? (
    <MemoryPrototypeProvider seed={seed}>{children}</MemoryPrototypeProvider>
  ) : (
    <PersonalPrototypeProvider key={scope} scope={scope}>
      {children}
    </PersonalPrototypeProvider>
  );
}
function PersonalPrototypeProvider({ children, scope }: { children: ReactNode; scope: string }) {
  const [storage] = useState(() => new PersonalStore(scope));
  const view = useSyncExternalStore(storage.subscribe, storage.getSnapshot);
  const { bundle, ready } = view;
  const drafts = bundle.drafts;
  const setter = useCallback(
    <K extends keyof Drafts>(key: K, action: SetStateAction<Drafts[K]>) =>
      storage.updateDrafts((previous) => ({
        ...previous,
        [key]:
          typeof action === 'function'
            ? (action as (v: Drafts[K]) => Drafts[K])(previous[key])
            : action,
      })),
    [storage],
  );
  const setRequestDraft = useCallback<Dispatch<SetStateAction<RequestDraft | null>>>(
    (action) =>
      storage.updateDrafts((previous) => {
        const current = previous.currentRequestId
          ? previous.requests[previous.currentRequestId]
          : null;
        const next = typeof action === 'function' ? action(current) : action;
        if (next === current) return previous;
        return {
          ...previous,
          currentRequestId: next?.id ?? null,
          requests: next ? { ...previous.requests, [next.id]: next } : previous.requests,
        };
      }),
    [storage],
  );
  const resumeRequestDraft = useCallback(
    (initial: RequestDraft) =>
      storage.updateDrafts((previous) => {
        const saved = Object.values(previous.requests)
          .reverse()
          .find((d) => requestTarget(d) === requestTarget(initial));
        const next = saved ?? initial;
        if (previous.currentRequestId === next.id) return previous;
        return {
          ...previous,
          currentRequestId: next.id,
          requests: { ...previous.requests, [next.id]: next },
        };
      }),
    [storage],
  );
  const markRequestStep = useCallback(
    (id: string, step: 'materials' | 'write') =>
      storage.updateDrafts((previous) =>
        previous.steps[id] === step
          ? previous
          : { ...previous, steps: { ...previous.steps, [id]: step } },
      ),
    [storage],
  );
  useEffect(() => {
    void storage.load();
    const save = () => {
      void storage.flush().catch(() => {});
    };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', save);
    return () => {
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', save);
      storage.dispose();
    };
  }, [storage]);
  const value = useMemo<PrototypeContextValue>(
    () => ({
      repository: storage.repository,
      storage,
      ready,
      state: bundle.state,
      cutDraft: drafts.cutDraft,
      setCutDraft: (v) => setter('cutDraft', v),
      progressDrafts: drafts.progressDrafts,
      setProgressDrafts: (v) => setter('progressDrafts', v),
      cutEdits: drafts.cutEdits,
      setCutEdits: (v) => setter('cutEdits', v),
      progressEdits: drafts.progressEdits,
      setProgressEdits: (v) => setter('progressEdits', v),
      requestDraft: drafts.currentRequestId ? drafts.requests[drafts.currentRequestId] : null,
      requestDrafts: drafts.requests,
      setRequestDraft,
      resumeRequestDraft,
      markRequestStep,
      resumeUrl: (d) => (drafts.steps[d.id] === 'write' ? requestUrl(d) : materialUrl(d)),
      hasWork: Boolean(
        bundle.state.cuts.length ||
        drafts.cutDraft.areas.length ||
        drafts.cutDraft.photos.length ||
        Object.values(drafts.requests).some(hasDraftContent),
      ),
      reset: () => storage.repository.reset(),
    }),
    [bundle, ready, storage, setter, setRequestDraft, resumeRequestDraft, markRequestStep],
  );
  return <PrototypeContext.Provider value={value}>{children}</PrototypeContext.Provider>;
}

export function usePrototype() {
  const value = useContext(PrototypeContext);
  if (!value) throw new Error('PrototypeProvider missing');
  return value;
}
export function useProgressDraft(cutId: string) {
  const { progressDrafts, setProgressDrafts } = usePrototype();
  const draft = progressDrafts[cutId] ?? newProgressDraft();
  const update = (input: Partial<ProgressDraft>) =>
    setProgressDrafts((previous) => ({
      ...previous,
      [cutId]: { ...(previous[cutId] ?? newProgressDraft()), ...input },
    }));
  const clear = () =>
    setProgressDrafts((previous) => {
      const next = { ...previous };
      delete next[cutId];
      return next;
    });
  return { draft, update, clear };
}

export function useCutEditDraft(cut?: CutRecord) {
  const { cutEdits, setCutEdits } = usePrototype();
  const key = cut?.id ?? '';
  const initial: CutDraft = cut
    ? { ...cut, areas: [...cut.areas], price: cut.price?.toString() ?? '', photos: [] }
    : newCutDraft();
  const draft = cutEdits[key] ?? initial;
  const update = (input: Partial<CutDraft>) =>
    setCutEdits((previous) => ({
      ...previous,
      [key]: { ...(previous[key] ?? initial), ...input },
    }));
  const clear = () =>
    setCutEdits((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  return { draft, update, clear };
}

export function useProgressEditDraft(entry?: ProgressEntry) {
  const { progressEdits, setProgressEdits } = usePrototype();
  const key = entry?.id ?? '';
  const initial: ProgressDraft = entry
    ? { ...entry, areas: [...entry.areas], photos: [] }
    : newProgressDraft();
  const draft = progressEdits[key] ?? initial;
  const update = (input: Partial<ProgressDraft>) =>
    setProgressEdits((previous) => ({
      ...previous,
      [key]: { ...(previous[key] ?? initial), ...input },
    }));
  const clear = () =>
    setProgressEdits((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  return { draft, update, clear };
}
