import { ApiFailure, memberRequest } from './auth/api';
import type { SessionMember } from './auth/api';

// 상담 API 계약(docs/consultation-api.md)의 응답 모양
export type ConsultationStatus = 'REQUESTED' | 'ANSWERED';
export type Consultation = {
  id: string;
  status: ConsultationStatus;
  designer: { id: string; name: string; salonName: string | null };
  customer: { displayName: string };
  attachment: {
    cutDate: string;
    service: string;
    summary: string;
    photoUrl: string | null;
  };
  request: string;
  sentAt: string;
  reply: { content: string; repliedAt: string } | null;
  canReply: boolean;
  lastMessageAt: string;
  unreadCount: number;
};
export type ConsultationMessage = {
  id: number;
  sender: 'CUSTOMER' | 'DESIGNER';
  content: string;
  sentAt: string;
  mine: boolean;
};
export type ConsultationInput = {
  requestKey: string;
  designerId: string;
  request: string;
  attachment: { cutDate: string; service: string; summary: string };
};

// 화면 문구는 서버 message가 아니라 code로 정함
const sendMessages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: '로그인 후 상담을 이용할 수 있어요.',
  INVALID_REQUEST: '요청 내용과 첨부한 기록을 다시 확인해 주세요.',
  RESOURCE_NOT_FOUND: '지금은 이 디자이너에게 상담을 보낼 수 없어요.',
  RESOURCE_CONFLICT: '이미 보낸 요청이에요. 새로운 상담 요청을 작성해 주세요.',
  STORAGE_CONTEXT_CHANGED: '로그인 계정이 바뀌었어요. 화면을 새로고침해 주세요.',
  UPLOAD_TOO_LARGE: '사진은 5MB 이하만 보낼 수 있어요.',
  UNSUPPORTED_MEDIA_TYPE: 'JPEG, PNG, WebP 사진만 보낼 수 있어요.',
};
const readMessages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: '로그인 후 상담을 이용할 수 있어요.',
  RESOURCE_NOT_FOUND: '상담을 찾을 수 없어요.',
  STORAGE_CONTEXT_CHANGED: '로그인 계정이 바뀌었어요. 화면을 새로고침해 주세요.',
};
const replyMessages: Record<string, string> = {
  ...readMessages,
  ACCESS_DENIED: '이 상담에 답변할 수 없어요.',
  INVALID_REQUEST: '답변을 2,000자 이내로 적어 주세요.',
};
const messageMessages: Record<string, string> = {
  ...readMessages,
  INVALID_REQUEST: '메시지를 2,000자 이내로 적어 주세요.',
  RESOURCE_CONFLICT: '보내던 메시지와 내용이 달라요. 다시 보내 주세요.',
};
function translate(error: unknown, table: Record<string, string>): never {
  if (error instanceof ApiFailure) {
    const message =
      table[error.code] ?? (error.status >= 500 ? '잠시 후 다시 시도해 주세요.' : error.message);
    throw new ApiFailure(error.status, error.code, message);
  }
  throw error;
}

function isConsultation(value: unknown): value is Consultation {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const attachment = item.attachment as Record<string, unknown> | null;
  const designer = item.designer as Record<string, unknown> | null;
  return (
    typeof item.id === 'string' &&
    (item.status === 'REQUESTED' || item.status === 'ANSWERED') &&
    typeof item.request === 'string' &&
    typeof item.sentAt === 'string' &&
    typeof item.canReply === 'boolean' &&
    typeof item.lastMessageAt === 'string' &&
    typeof item.unreadCount === 'number' &&
    Boolean(designer && typeof designer.id === 'string' && typeof designer.name === 'string') &&
    Boolean(attachment && typeof attachment.cutDate === 'string')
  );
}
async function readOne(response: Response): Promise<Consultation> {
  const body: unknown = await response.json().catch(() => null);
  if (!isConsultation(body))
    throw new ApiFailure(0, 'INVALID_RESPONSE', '상담 정보를 읽지 못했어요. 다시 시도해 주세요.');
  return body;
}
async function readList(response: Response): Promise<Consultation[]> {
  const body: unknown = await response.json().catch(() => null);
  if (!Array.isArray(body) || !body.every(isConsultation))
    throw new ApiFailure(0, 'INVALID_RESPONSE', '상담 목록을 읽지 못했어요. 다시 시도해 주세요.');
  return body;
}

export async function sendConsultation(
  member: SessionMember,
  input: ConsultationInput,
  photo?: Blob,
): Promise<Consultation> {
  const form = new FormData();
  // JSON 부분은 application/json Blob으로 넣어야 서버가 JSON으로 읽음
  form.append('consultation', new Blob([JSON.stringify(input)], { type: 'application/json' }));
  if (photo) form.append('photo', photo, 'cut');
  try {
    // 휴대폰에서 5MB 사진을 올리면 8초를 넘을 수 있어 길게 기다림
    const response = await memberRequest(
      '/api/consultations',
      member,
      { method: 'POST', body: form },
      60000,
    );
    return await readOne(response);
  } catch (error) {
    translate(error, sendMessages);
  }
}
export async function listSentConsultations(member: SessionMember) {
  try {
    return await readList(await memberRequest('/api/my/sent-consultations', member));
  } catch (error) {
    translate(error, readMessages);
  }
}
export async function listReceivedConsultations(member: SessionMember) {
  try {
    return await readList(await memberRequest('/api/my/received-consultations', member));
  } catch (error) {
    translate(error, readMessages);
  }
}
export async function getConsultation(member: SessionMember, id: string) {
  try {
    return await readOne(
      await memberRequest(`/api/consultations/${encodeURIComponent(id)}`, member),
    );
  } catch (error) {
    translate(error, readMessages);
  }
}
export async function replyConsultation(member: SessionMember, id: string, content: string) {
  try {
    return await readOne(
      await memberRequest(`/api/consultations/${encodeURIComponent(id)}/reply`, member, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }),
    );
  } catch (error) {
    translate(error, replyMessages);
  }
}

function isMessage(value: unknown): value is ConsultationMessage {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(item.id) &&
    (item.sender === 'CUSTOMER' || item.sender === 'DESIGNER') &&
    typeof item.content === 'string' &&
    typeof item.sentAt === 'string' &&
    typeof item.mine === 'boolean'
  );
}
// after가 있으면 그 메시지 뒤의 것만 받음. 실시간 신호를 받았을 때 새 메시지만 이어 받는 데 씀
export async function listMessages(member: SessionMember, id: string, after?: number) {
  try {
    const query = after ? `?after=${after}` : '';
    const response = await memberRequest(
      `/api/consultations/${encodeURIComponent(id)}/messages${query}`,
      member,
    );
    const body: unknown = await response.json().catch(() => null);
    if (!Array.isArray(body) || !body.every(isMessage))
      throw new ApiFailure(0, 'INVALID_RESPONSE', '메시지를 읽지 못했어요. 다시 시도해 주세요.');
    return body;
  } catch (error) {
    translate(error, readMessages);
  }
}
// 응답을 못 받아 다시 보낼 때는 같은 clientKey를 써야 메시지가 한 번만 저장됨
export async function sendMessage(
  member: SessionMember,
  id: string,
  clientKey: string,
  content: string,
) {
  try {
    const response = await memberRequest(
      `/api/consultations/${encodeURIComponent(id)}/messages`,
      member,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey, content }),
      },
    );
    const body: unknown = await response.json().catch(() => null);
    if (!isMessage(body))
      throw new ApiFailure(0, 'INVALID_RESPONSE', '보낸 메시지를 확인하지 못했어요.');
    return body;
  } catch (error) {
    translate(error, messageMessages);
  }
}
export async function markRead(member: SessionMember, id: string, messageId: number) {
  try {
    await memberRequest(`/api/consultations/${encodeURIComponent(id)}/read`, member, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId }),
    });
  } catch (error) {
    translate(error, readMessages);
  }
}
