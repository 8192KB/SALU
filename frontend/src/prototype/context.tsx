import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createMemoryRepository, newCutDraft, newProgressDraft } from './memory-repository';
import type {
  RequestDraft,
  CutDraft,
  ProgressDraft,
  PrototypeRepository,
  PrototypeState,
} from './types';
import { requestTarget } from './request-flow';

type PrototypeContextValue = {
  repository: PrototypeRepository;
  state: PrototypeState;
  cutDraft: CutDraft;
  setCutDraft: Dispatch<SetStateAction<CutDraft>>;
  progressDrafts: Record<string, ProgressDraft>;
  setProgressDrafts: Dispatch<SetStateAction<Record<string, ProgressDraft>>>;
  requestDraft: RequestDraft | null;
  requestDrafts: Record<string, RequestDraft>;
  setRequestDraft: Dispatch<SetStateAction<RequestDraft | null>>;
  resumeRequestDraft: (initial: RequestDraft) => void;
  reset: () => void;
};
const PrototypeContext = createContext<PrototypeContextValue | null>(null);
type RequestDraftState = {
  current: RequestDraft | null;
  saved: Record<string, RequestDraft>;
  targets: Record<string, string>;
};

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(createMemoryRepository);
  const state = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
  const [cutDraft, setCutDraft] = useState(newCutDraft);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, ProgressDraft>>({});
  const [requestDrafts, setRequestDrafts] = useState<RequestDraftState>({
    current: null,
    saved: {},
    targets: {},
  });
  const requestDraft = requestDrafts.current;
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
    setRequestDrafts({ current: null, saved: {}, targets: {} });
  };
  return (
    <PrototypeContext.Provider
      value={{
        repository,
        state,
        cutDraft,
        setCutDraft,
        progressDrafts,
        setProgressDrafts,
        requestDraft,
        requestDrafts: requestDrafts.saved,
        setRequestDraft,
        resumeRequestDraft,
        reset,
      }}
    >
      {children}
    </PrototypeContext.Provider>
  );
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
