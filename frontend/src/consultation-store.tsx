import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { newId } from './prototype/ids';
import { getConsultation, listSentConsultations, sendConsultation } from './consultation-api';
import type { Consultation } from './consultation-api';
import type { SessionMember } from './auth/api';

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
  designer: { id: string; name: string; avatarUrl?: string; salonName?: string | null };
  attachment: ConsultationAttachment;
  request: string;
  sentAt: string;
  status: 'REQUESTED' | 'ANSWERED';
  reply?: ConsultationReply;
  customer?: { displayName: string };
  canReply?: boolean;
  // 서버 상담만 있음. 목록 정렬과 안 읽은 메시지 표시에 사용
  lastMessageAt?: string;
  unreadCount?: number;
  reviewId?: string | null;
  canReview?: boolean;
};
export type ConsultationDraft = {
  id: string;
  designerId: string;
  cutId: string;
  request: string;
  // 준비 내용에서 시작한 상담이면 그 준비 ID
  sourceId?: string;
};
export type ConsultationSend = Pick<
  ConsultationThread,
  'draftId' | 'designer' | 'attachment' | 'request'
>;
type ConsultationSnapshot = {
  generation: number;
  threads: ConsultationThread[];
  drafts: Record<string, ConsultationDraft>;
  // 준비 내용 ID → 그 준비로 보낸 상담 ID. 이 탭에서 보낸 상담만 기억함
  sentFrom?: Record<string, string[]>;
  // 서버 상담만 사용. 예시 상담은 메모리에 있어 항상 불러온 상태
  loading?: boolean;
  loaded?: boolean;
  error?: string;
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
  // 서버 상담: 화면에 들어올 때·창으로 돌아올 때·새로고침 버튼으로 다시 조회
  readonly server?: boolean;
  refresh?(): Promise<void>;
  load?(id: string): Promise<void>;
}
const empty: ConsultationSnapshot = { generation: 0, threads: [], drafts: {} };

export class MemoryConsultationRepository implements ConsultationRepository {
  protected snapshot: ConsultationSnapshot = { generation: 0, threads: [], drafts: {} };
  private listeners = new Set<() => void>();
  protected targets = new Map<string, string>();
  private drafts = new Map<string, ConsultationDraft>();
  private submissions = new Map<string, string>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.snapshot;
  protected publish(snapshot: ConsultationSnapshot) {
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
    const draft: ConsultationDraft = {
      id: newId(),
      designerId,
      cutId: recordId,
      request,
      ...(sourceId ? { sourceId } : {}),
    };
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
  protected checked(input: ConsultationSend) {
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
    return request;
  }
  protected forgetDraft(draftId: string) {
    for (const [key, value] of this.targets) if (value === draftId) this.targets.delete(key);
  }
  protected sentFrom(draftId: string, threadId: string) {
    const source = this.drafts.get(draftId)?.sourceId;
    if (!source) return this.snapshot.sentFrom;
    const previous = this.snapshot.sentFrom?.[source] ?? [];
    return {
      ...this.snapshot.sentFrom,
      [source]: previous.includes(threadId) ? previous : [...previous, threadId],
    };
  }
  async send(input: ConsultationSend) {
    const request = this.checked(input);
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
    this.forgetDraft(input.draftId);
    this.publish({
      ...this.snapshot,
      threads: [...this.snapshot.threads, thread],
      sentFrom: this.sentFrom(input.draftId, thread.id),
    });
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

export function threadFrom(value: Consultation, draftId = ''): ConsultationThread {
  return {
    id: value.id,
    draftId,
    designer: {
      id: value.designer.id,
      name: value.designer.name,
      salonName: value.designer.salonName,
    },
    attachment: {
      cutId: '',
      designerId: value.designer.id,
      cutDate: value.attachment.cutDate,
      service: value.attachment.service,
      summary: value.attachment.summary,
      photo: value.attachment.photoUrl
        ? { id: `${value.id}-photo`, url: value.attachment.photoUrl, caption: '첨부한 사진' }
        : undefined,
    },
    request: value.request,
    sentAt: value.sentAt,
    status: value.status,
    reply: value.reply ?? undefined,
    customer: value.customer,
    canReply: value.canReply,
    lastMessageAt: value.lastMessageAt,
    unreadCount: value.unreadCount,
    reviewId: value.reviewId,
    canReview: value.canReview,
  };
}

// 로그인한 회원의 실제 상담. 작성 중인 초안은 메모리에 두고 보낸 상담은 서버에서 읽음
export class ServerConsultationRepository extends MemoryConsultationRepository {
  readonly server = true;
  constructor(private member: SessionMember | null) {
    super();
    this.snapshot = { ...this.snapshot, loaded: false, loading: false, error: '' };
  }
  // 계정이 바뀌면 이전 계정의 상담과 작성 중인 상담을 비움. 같은 계정의 새 세션은 그대로 둠
  setMember(member: SessionMember | null) {
    const changed = member?.id !== this.member?.id;
    this.member = member;
    if (changed) {
      this.reset();
      this.publish({ ...this.snapshot, loaded: false, loading: false, error: '' });
    }
  }
  private account() {
    if (!this.member?.storageContext) throw new Error('로그인 후 상담을 이용할 수 있어요.');
    return this.member;
  }
  private upsert(thread: ConsultationThread) {
    const exists = this.snapshot.threads.some((value) => value.id === thread.id);
    this.publish({
      ...this.snapshot,
      threads: exists
        ? this.snapshot.threads.map((value) =>
            value.id === thread.id
              ? { ...thread, draftId: value.draftId || thread.draftId }
              : value,
          )
        : [...this.snapshot.threads, thread],
    });
  }
  refresh = async () => {
    if (this.snapshot.loading || !this.member?.storageContext) return;
    this.publish({ ...this.snapshot, loading: true, error: '' });
    try {
      const list = await listSentConsultations(this.member);
      // 서버는 최신순, 화면 저장소는 보낸 순서로 보관함
      this.publish({
        ...this.snapshot,
        threads: list.map((value) => threadFrom(value)).reverse(),
        loading: false,
        loaded: true,
      });
    } catch (error) {
      this.publish({
        ...this.snapshot,
        loading: false,
        loaded: true,
        error: error instanceof Error ? error.message : '상담 내역을 불러오지 못했어요.',
      });
    }
  };
  load = async (id: string) => {
    this.upsert(threadFrom(await getConsultation(this.account(), id)));
  };
  async send(input: ConsultationSend) {
    const member = this.account();
    const request = this.checked(input);
    let photo: Blob | undefined;
    if (input.attachment.photo) {
      try {
        photo = await (await fetch(input.attachment.photo.url)).blob();
      } catch {
        throw new Error('첨부할 사진을 읽지 못했어요. 기록 화면을 새로고침한 뒤 다시 보내 주세요.');
      }
    }
    const sent = await sendConsultation(
      member,
      {
        requestKey: input.draftId,
        designerId: input.designer.id,
        request,
        attachment: {
          cutDate: input.attachment.cutDate,
          service: input.attachment.service,
          summary: input.attachment.summary,
        },
      },
      photo,
    );
    const thread = threadFrom(sent, input.draftId);
    this.forgetDraft(input.draftId);
    this.upsert(thread);
    this.publish({ ...this.snapshot, sentFrom: this.sentFrom(input.draftId, thread.id) });
    return thread;
  }
}

const Context = createContext<ConsultationRepository | null>(null);
export function ConsultationProvider({
  children,
  member,
}: {
  children: ReactNode;
  // 지정하면 서버 상담을 사용함. 예시 체험은 지정하지 않아 메모리에서만 동작
  member?: SessionMember | null;
}) {
  const [repository] = useState<MemoryConsultationRepository>(() =>
    member === undefined
      ? new MemoryConsultationRepository()
      : new ServerConsultationRepository(member),
  );
  useEffect(() => {
    if (repository instanceof ServerConsultationRepository) repository.setMember(member ?? null);
  }, [repository, member]);
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
