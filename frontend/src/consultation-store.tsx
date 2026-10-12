import { createContext, useContext, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { newId } from './prototype/ids';

export type ConsultationAttachment = {
  cutId: string;
  designerId: string;
  cutDate: string;
  service: string;
  summary: string;
  photo?: { id: string; url: string; caption: string };
};
export type ConsultationReply = { content: string; repliedAt: string };
export type ConsultationThread = {
  id: string;
  draftId: string;
  designer: { id: string; name: string; avatarUrl?: string };
  attachment: ConsultationAttachment;
  request: string;
  sentAt: string;
  status: 'REQUESTED' | 'ANSWERED';
  reply?: ConsultationReply;
};
export type ConsultationDraft = {
  id: string;
  designerId: string;
  cutId: string;
  request: string;
};
export type ConsultationSend = Pick<
  ConsultationThread,
  'draftId' | 'designer' | 'attachment' | 'request'
>;
type ConsultationSnapshot = {
  generation: number;
  threads: ConsultationThread[];
  drafts: Record<string, ConsultationDraft>;
};
export interface ConsultationRepository {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ConsultationSnapshot;
  send(input: ConsultationSend): Promise<ConsultationThread>;
  list(): ConsultationThread[];
  get(id: string): ConsultationThread | undefined;
  draft(
    designerId: string,
    recordId?: string,
    sourceId?: string,
    request?: string,
  ): ConsultationDraft;
  updateDraft(id: string, change: Partial<Pick<ConsultationDraft, 'cutId' | 'request'>>): void;
  reset(): void;
}
const empty: ConsultationSnapshot = { generation: 0, threads: [], drafts: {} };

export class MemoryConsultationRepository implements ConsultationRepository {
  private snapshot: ConsultationSnapshot = { generation: 0, threads: [], drafts: {} };
  private listeners = new Set<() => void>();
  private targets = new Map<string, string>();
  private drafts = new Map<string, ConsultationDraft>();
  private submissions = new Map<string, string>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  private publish(snapshot: ConsultationSnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  list = () => this.snapshot.threads;
  get = (id: string) => this.snapshot.threads.find((thread) => thread.id === id);
  draft(designerId: string, recordId = '', sourceId = '', request = '') {
    const key = JSON.stringify([designerId, recordId, sourceId]);
    const existingId = this.targets.get(key);
    const existing = existingId && this.drafts.get(existingId);
    if (existing) return existing;
    const draft: ConsultationDraft = { id: newId(), designerId, cutId: recordId, request };
    this.targets.set(key, draft.id);
    this.drafts.set(draft.id, draft);
    return draft;
  }
  updateDraft(id: string, change: Partial<Pick<ConsultationDraft, 'cutId' | 'request'>>) {
    const draft = this.drafts.get(id);
    if (!draft) throw new Error('작성 중인 상담을 찾을 수 없어요.');
    const updated = { ...draft, ...change };
    this.drafts.set(id, updated);
    this.publish({ ...this.snapshot, drafts: { ...this.snapshot.drafts, [id]: updated } });
  }
  async send(input: ConsultationSend) {
    const draft = this.drafts.get(input.draftId);
    if (
      !draft ||
      draft.designerId !== input.designer.id ||
      draft.cutId !== input.attachment.cutId ||
      input.attachment.designerId !== input.designer.id
    )
      throw new Error('상담할 디자이너와 커트 기록을 다시 확인해 주세요.');
    const request = input.request.trim();
    if (!request || request.length > 2000)
      throw new Error('이번 요청을 2,000자 이내로 적어 주세요.');
    const submitted = this.submissions.get(input.draftId);
    if (submitted) {
      const previous = this.get(submitted)!;
      if (
        previous.request !== request ||
        JSON.stringify(previous.attachment) !== JSON.stringify(input.attachment)
      )
        throw new Error('이미 보낸 요청이에요. 새로운 상담 요청을 작성해 주세요.');
      return previous;
    }
    const thread: ConsultationThread = structuredClone({
      ...input,
      request,
      id: newId(),
      sentAt: new Date().toISOString(),
      status: 'REQUESTED' as const,
    });
    this.submissions.set(input.draftId, thread.id);
    for (const [key, value] of this.targets) if (value === input.draftId) this.targets.delete(key);
    this.publish({ ...this.snapshot, threads: [...this.snapshot.threads, thread] });
    return thread;
  }
  receiveReply(id: string, reply: ConsultationReply) {
    if (!this.get(id) || !reply.content.trim() || !Number.isFinite(Date.parse(reply.repliedAt)))
      throw new Error('답변할 상담을 찾을 수 없어요.');
    this.publish({
      ...this.snapshot,
      threads: this.snapshot.threads.map((thread) =>
        thread.id === id
          ? { ...thread, status: 'ANSWERED', reply: structuredClone(reply) }
          : thread,
      ),
    });
  }
  reset() {
    this.targets.clear();
    this.drafts.clear();
    this.submissions.clear();
    this.publish({ generation: this.snapshot.generation + 1, threads: [], drafts: {} });
  }
}

const Context = createContext<ConsultationRepository | null>(null);
export function ConsultationProvider({ children }: { children: ReactNode }) {
  const [repository] = useState(() => new MemoryConsultationRepository());
  return <Context.Provider value={repository}>{children}</Context.Provider>;
}
const noSubscribe = () => () => {};
const emptySnapshot = () => empty;
export function useConsultations() {
  const repository = useContext(Context);
  const state = useSyncExternalStore(
    repository?.subscribe ?? noSubscribe,
    repository?.getSnapshot ?? emptySnapshot,
  );
  return { repository, state };
}
