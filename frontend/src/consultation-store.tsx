import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ApiFailure } from './auth/api';
import { fitPhoto } from './prototype/photo-fit';
import { newId } from './prototype/ids';
import {
  getConsultation,
  listSentConsultations,
  MAX_CONSULTATION_PHOTOS,
  sendConsultation,
} from './consultation-api';
import type { Consultation, ConsultationPayment, ConsultationStatus } from './consultation-api';
import type { SessionMember } from './auth/api';

// label은 디자이너가 어느 때 사진인지 알 수 있게 붙이는 이름(커트 당일·경과 D+12)
export type AttachmentPhoto = { id: string; url: string; caption: string; label: string };
export type ConsultationAttachment = {
  cutId: string;
  designerId: string;
  cutDate: string;
  service: string;
  summary: string;
  photos: AttachmentPhoto[];
  // 담당 디자이너에게 보내면 서버가 요금을 받지 않음(docs/payment-api.md)
  linkedDesigner?: boolean;
};
export type ConsultationReply = { content: string; repliedAt: string };
export type ConsultationThread = {
  id: string;
  draftId: string;
  designer: { id: string; name: string; avatarUrl?: string; salonName?: string | null };
  attachment: ConsultationAttachment;
  request: string;
  sentAt: string;
  status: ConsultationStatus;
  reply?: ConsultationReply;
  customer?: { displayName: string };
  canReply?: boolean;
  // 서버 상담만 있음. 목록 정렬과 안 읽은 메시지 표시에 사용
  lastMessageAt?: string;
  unreadCount?: number;
  reviewId?: string | null;
  canReview?: boolean;
  fee?: number;
  payment?: ConsultationPayment | null;
  canCancel?: boolean;
};
export type ConsultationDraft = {
  id: string;
  designerId: string;
  cutId: string;
  request: string;
  // 준비 내용에서 시작한 상담이면 그 준비 ID
  sourceId?: string;
  // 준비 내용으로 처음 채운 요청. 다시 들어올 때 준비를 고쳤는지 비교함
  base?: string;
};
export type ConsultationSend = Pick<
  ConsultationThread,
  'draftId' | 'designer' | 'attachment' | 'request'
>;
type ConsultationSnapshot = {
  generation: number;
  threads: ConsultationThread[];
  drafts: Record<string, ConsultationDraft>;
  // 준비 내용 ID → 그 준비로 보낸 상담 ID. 서버 상담은 계정별로 이 기기에도 남겨 새로고침 뒤에도 보임
  sentFrom?: Record<string, string[]>;
  // 서버 상담만 사용. 예시 상담은 메모리에 있어 항상 불러온 상태
  loading?: boolean;
  loaded?: boolean;
  error?: string;
  // 보낸 상담 주소로 열었지만 내가 받은 디자이너인 상담. 받은 상담 화면으로 바꿔 엶
  received?: Record<string, true>;
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
  // 결제 승인·취소처럼 상담 응답을 직접 받은 뒤 저장소를 바꿈
  accept?(value: Consultation): ConsultationThread;
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
  // 서버 상담은 고쳐 쓴 요청을 이 탭에 남겨 새로고침해도 이어 씀. 예시 상담은 남기지 않음
  protected draftStoreKey(): string | null {
    return null;
  }
  private readStored(): Record<string, ConsultationDraft> {
    const storeKey = this.draftStoreKey();
    if (!storeKey) return {};
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(storeKey) ?? '{}');
      return value && typeof value === 'object' ? (value as Record<string, ConsultationDraft>) : {};
    } catch {
      return {};
    }
  }
  private writeStored(key: string, draft: ConsultationDraft | null) {
    const storeKey = this.draftStoreKey();
    if (!storeKey) return;
    try {
      const stored = this.readStored();
      if (draft) stored[key] = draft;
      else delete stored[key];
      sessionStorage.setItem(storeKey, JSON.stringify(stored));
    } catch {
      // 저장소가 막혀 있으면 이 화면에서만 기억함
    }
  }
  draft(designerId: string, recordId = '', sourceId = '', request = '') {
    const key = JSON.stringify([designerId, recordId, sourceId]);
    if (!this.targets.has(key)) {
      const stored = this.readStored()[key];
      if (
        stored &&
        typeof stored.id === 'string' &&
        typeof stored.request === 'string' &&
        stored.designerId === designerId
      ) {
        this.targets.set(key, stored.id);
        this.drafts.set(stored.id, stored);
      }
    }
    const existingId = this.targets.get(key);
    const existing = existingId && this.drafts.get(existingId);
    // 준비 내용이 그대로면 고쳐 쓴 요청을 이어 씀. 준비를 고쳤거나 요청 칸을 비운 채 다시 들어오면 준비 내용으로 새로 시작함
    if (existing && (existing.base ?? '') === request && (existing.request.trim() || !request))
      return existing;
    const draft: ConsultationDraft = {
      id: newId(),
      designerId,
      cutId: recordId,
      request,
      ...(request ? { base: request } : {}),
      ...(sourceId ? { sourceId } : {}),
    };
    if (existing) {
      this.drafts.delete(existing.id);
      this.writeStored(key, null);
    }
    this.targets.set(key, draft.id);
    this.drafts.set(draft.id, draft);
    return draft;
  }
  updateDraft(id: string, change: Partial<Pick<ConsultationDraft, 'cutId' | 'request'>>) {
    const draft = this.drafts.get(id);
    if (!draft) throw new Error('작성 중인 상담을 찾을 수 없어요.');
    const updated = { ...draft, ...change };
    this.drafts.set(id, updated);
    for (const [key, value] of this.targets) if (value === id) this.writeStored(key, updated);
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
    for (const [key, value] of this.targets)
      if (value === draftId) {
        this.targets.delete(key);
        this.writeStored(key, null);
      }
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
  const photos =
    value.attachment.photos ??
    (value.attachment.photoUrl ? [{ url: value.attachment.photoUrl, label: '사진' }] : []);
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
      photos: photos.map((photo, index) => ({
        id: `${value.id}-photo-${index}`,
        url: photo.url,
        caption: photo.label,
        label: photo.label,
      })),
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
    fee: value.fee,
    payment: value.payment,
    canCancel: value.canCancel,
  };
}

// 로그인한 회원의 실제 상담. 작성 중인 초안은 메모리에 두고 보낸 상담은 서버에서 읽음
export class ServerConsultationRepository extends MemoryConsultationRepository {
  readonly server = true;
  // 응답을 못 받아 다시 보낼 때 같은 파일을 보내야 서버가 같은 요청으로 알아봄
  private prepared = new Map<string, Blob[]>();
  constructor(private member: SessionMember | null) {
    super();
    this.snapshot = {
      ...this.snapshot,
      loaded: false,
      loading: false,
      error: '',
      sentFrom: readSentFrom(member),
    };
  }
  // 계정이 바뀌면 이전 계정의 상담과 작성 중인 상담을 비움. 같은 계정의 새 세션은 그대로 둠
  setMember(member: SessionMember | null) {
    const changed = member?.id !== this.member?.id;
    this.member = member;
    if (changed) {
      this.prepared.clear();
      this.reset();
      this.publish({
        ...this.snapshot,
        loaded: false,
        loading: false,
        error: '',
        sentFrom: readSentFrom(member),
      });
    }
  }
  protected draftStoreKey() {
    return this.member ? `salu-consult-drafts-${this.member.id}` : null;
  }
  // 다른 탭에서 준비로 상담을 보내면 이 탭의 `이 준비로 보냈어요`도 맞춤. 모르는 상담이면 목록을 다시 받음
  syncSentFrom(key: string | null) {
    if (!this.member || key !== sentFromKey(this.member)) return;
    const sentFrom = readSentFrom(this.member);
    this.publish({ ...this.snapshot, sentFrom });
    const known = new Set(this.snapshot.threads.map((thread) => thread.id));
    if (
      this.snapshot.loaded &&
      Object.values(sentFrom ?? {}).some((ids) => ids.some((id) => !known.has(id)))
    )
      void this.refresh();
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
    const value = await getConsultation(this.account(), id);
    if (value.viewerRole === 'DESIGNER') {
      this.publish({
        ...this.snapshot,
        threads: this.snapshot.threads.filter((thread) => thread.id !== id),
        received: { ...this.snapshot.received, [id]: true },
      });
      return;
    }
    this.upsert(threadFrom(value));
  };
  accept = (value: Consultation) => {
    const thread = threadFrom(value);
    this.upsert(thread);
    return thread;
  };
  private async photosFor(input: ConsultationSend) {
    const saved = this.prepared.get(input.draftId);
    if (saved) return saved;
    let photos: Blob[];
    try {
      photos = await Promise.all(
        input.attachment.photos.map(async (photo) =>
          fitPhoto(await (await fetch(photo.url)).blob()),
        ),
      );
    } catch {
      throw new Error('첨부할 사진을 읽지 못했어요. 기록 화면을 새로고침한 뒤 다시 보내 주세요.');
    }
    this.prepared.set(input.draftId, photos);
    return photos;
  }
  async send(input: ConsultationSend) {
    const member = this.account();
    const request = this.checked(input);
    if (input.attachment.photos.length > MAX_CONSULTATION_PHOTOS)
      throw new Error(`사진은 ${MAX_CONSULTATION_PHOTOS}장까지 보낼 수 있어요.`);
    const photos = await this.photosFor(input);
    const sent = await this.sendOnce(member, input, request, photos);
    this.prepared.delete(input.draftId);
    this.requestKeys.delete(input.draftId);
    const thread = threadFrom(sent, input.draftId);
    this.forgetDraft(input.draftId);
    this.upsert(thread);
    const sentFrom = this.sentFrom(input.draftId, thread.id);
    this.publish({ ...this.snapshot, sentFrom });
    writeSentFrom(member, sentFrom);
    return thread;
  }
  // 같은 키에 다른 내용이면 서버가 409로 거절함(복제한 탭에서 먼저 보낸 경우 등). 안내 뒤 다시 누르면 새 요청으로 보냄
  private readonly requestKeys = new Map<string, string>();
  private async sendOnce(
    member: SessionMember,
    input: ConsultationSend,
    request: string,
    photos: Blob[],
  ) {
    try {
      return await this.post(member, input, request, photos);
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.code === 'RESOURCE_CONFLICT') {
        this.requestKeys.set(input.draftId, newId());
        throw new ApiFailure(
          failure.status,
          failure.code,
          '이 작성 내용으로 이미 보낸 상담이 있어요. 상담 내역을 확인하고, 지금 내용도 보내려면 다시 눌러 주세요.',
        );
      }
      throw failure;
    }
  }
  private post(member: SessionMember, input: ConsultationSend, request: string, photos: Blob[]) {
    return sendConsultation(
      member,
      {
        requestKey: this.requestKeys.get(input.draftId) ?? input.draftId,
        designerId: input.designer.id,
        request,
        attachment: {
          cutDate: input.attachment.cutDate,
          service: input.attachment.service,
          summary: input.attachment.summary,
          photoLabels: input.attachment.photos.map((photo) => photo.label),
          linkedDesigner: Boolean(input.attachment.linkedDesigner),
        },
      },
      photos,
    );
  }
}

// 새로고침하면 준비로 보낸 상담 표시가 사라져 같은 준비를 다시 보내(결제하)게 되므로 기기에 남김.
// 저장소를 쓸 수 없으면 이 탭에서만 기억함
const sentFromKey = (member: SessionMember) => `salu-sent-from-${member.id}`;
function readSentFrom(member: SessionMember | null): Record<string, string[]> | undefined {
  if (!member) return undefined;
  try {
    const value: unknown = JSON.parse(localStorage.getItem(sentFromKey(member)) ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every((id) => typeof id === 'string'),
      ),
    );
  } catch {
    return undefined;
  }
}
function writeSentFrom(member: SessionMember, value: Record<string, string[]> | undefined) {
  try {
    if (value) localStorage.setItem(sentFromKey(member), JSON.stringify(value));
  } catch {
    // 저장소가 막혀 있으면 이 탭에서만 기억함
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
  useEffect(() => {
    if (!(repository instanceof ServerConsultationRepository)) return;
    const changed = (event: StorageEvent) => repository.syncSentFrom(event.key);
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [repository]);
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
