import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { createMemoryRepository, newCutDraft, newProgressDraft } from './memory-repository';
import type { ConsultationDraft, CutDraft, ProgressDraft, PrototypeRepository, PrototypeState } from './types';

type PrototypeContextValue = {
  repository: PrototypeRepository; state: PrototypeState;
  cutDraft: CutDraft; setCutDraft: Dispatch<SetStateAction<CutDraft>>;
  progressDrafts: Record<string, ProgressDraft>;
  setProgressDrafts: Dispatch<SetStateAction<Record<string, ProgressDraft>>>;
  consultationDraft: ConsultationDraft | null;
  setConsultationDraft: Dispatch<SetStateAction<ConsultationDraft | null>>;
  reset: () => void;
};
const PrototypeContext = createContext<PrototypeContextValue | null>(null);

export function PrototypeProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(createMemoryRepository);
  const state = useSyncExternalStore(repository.subscribe, repository.getSnapshot);
  const [cutDraft, setCutDraft] = useState(newCutDraft);
  const [progressDrafts, setProgressDrafts] = useState<Record<string, ProgressDraft>>({});
  const [consultationDraft, setConsultationDraft] = useState<ConsultationDraft | null>(null);
  useEffect(() => { void repository.load(); return () => repository.dispose(); }, [repository]);
  const reset = () => { repository.reset(); setCutDraft(newCutDraft()); setProgressDrafts({}); setConsultationDraft(null); };
  return <PrototypeContext.Provider value={{ repository, state, cutDraft, setCutDraft, progressDrafts, setProgressDrafts, consultationDraft, setConsultationDraft, reset }}>{children}</PrototypeContext.Provider>;
}

export function usePrototype() {
  const value = useContext(PrototypeContext);
  if (!value) throw new Error('PrototypeProvider missing');
  return value;
}
export function useProgressDraft(cutId: string) {
  const { progressDrafts, setProgressDrafts } = usePrototype();
  const draft = progressDrafts[cutId] ?? newProgressDraft();
  const update = (input: Partial<ProgressDraft>) => setProgressDrafts(previous => ({ ...previous, [cutId]: { ...(previous[cutId] ?? newProgressDraft()), ...input } }));
  const clear = () => setProgressDrafts(previous => { const next = { ...previous }; delete next[cutId]; return next; });
  return { draft, update, clear };
}
