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
  ConsultationDraft,
  CutDraft,
  ProgressDraft,
  PrototypeRepository,
  PrototypeState,
} from './types';

type PrototypeContextValue = {
  repository: PrototypeRepository;
  state: PrototypeState;
  cutDraft: CutDraft;
  setCutDraft: Dispatch<SetStateAction<CutDraft>>;
  progressDrafts: Record<string, ProgressDraft>;
  setProgressDrafts: Dispatch<SetStateAction<Record<string, ProgressDraft>>>;
  consultationDraft: ConsultationDraft | null;
  setConsultationDraft: Dispatch<SetStateAction<ConsultationDraft | null>>;
  resumeConsultationDraft: (initial: ConsultationDraft) => void;
  reset: () => void;
};
const PrototypeContext = createContext<PrototypeContextValue | null>(null);
type ConsultationDraftState = {
  current: ConsultationDraft | null;
  saved: Record<string, ConsultationDraft>;
};
const draftKey = (draft: ConsultationDraft) => JSON.stringify([draft.designerId, draft.cutId]);

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(createMemoryRepository);
  const state = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
  const [cutDraft, setCutDraft] = useState(newCutDraft);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, ProgressDraft>>({});
  const [consultationDrafts, setConsultationDrafts] = useState<ConsultationDraftState>({
    current: null,
    saved: {},
  });
  const consultationDraft = consultationDrafts.current;
  const setConsultationDraft = useCallback<Dispatch<SetStateAction<ConsultationDraft | null>>>(
    (action) =>
      setConsultationDrafts((previous) => {
        const next = typeof action === 'function' ? action(previous.current) : action;
        if (next === previous.current) return previous;
        return {
          current: next,
          saved: next ? { ...previous.saved, [draftKey(next)]: next } : previous.saved,
        };
      }),
    [],
  );
  const resumeConsultationDraft = useCallback((initial: ConsultationDraft) => {
    setConsultationDrafts((previous) => {
      const key = draftKey(initial);
      const next = previous.saved[key] ?? initial;
      if (previous.current === next) return previous;
      return { current: next, saved: { ...previous.saved, [key]: next } };
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
    setConsultationDrafts({ current: null, saved: {} });
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
        consultationDraft,
        setConsultationDraft,
        resumeConsultationDraft,
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
