import { ApiFailure, directoryRequest, memberRequest } from './auth/api';
import type { SessionMember } from './auth/api';

// 디자이너 API 계약(docs/designer-api.md)의 응답 모양
export type DesignerReview = {
  id: string;
  consultationId: string;
  designerId: string;
  author: { displayName: string };
  rating: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
};
export type DesignerReviews = {
  count: number;
  averageRating: number | null;
  items: DesignerReview[];
};
export type Affiliation = {
  salonId: string;
  salonName: string;
  region: string;
  branch: string;
  startedAt: string;
  endedAt: string | null;
};
export type ReviewInput = { rating: number; content: string };

const reviewMessages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: '로그인 후 후기를 남길 수 있어요.',
  INVALID_REQUEST: '별점을 고르고 후기를 1,000자 이내로 적어 주세요.',
  ACCESS_DENIED: '후기는 상담을 보낸 고객만 남기거나 지울 수 있어요.',
  RESOURCE_NOT_FOUND: '후기를 찾을 수 없어요.',
  RESOURCE_CONFLICT: '이미 후기를 남겼거나 아직 답변을 받지 않은 상담이에요.',
  STORAGE_CONTEXT_CHANGED: '로그인 계정이 바뀌었어요. 화면을 새로고침해 주세요.',
};
function translate(error: unknown): never {
  if (error instanceof ApiFailure) {
    const message =
      reviewMessages[error.code] ??
      (error.status >= 500 ? '잠시 후 다시 시도해 주세요.' : error.message);
    throw new ApiFailure(error.status, error.code, message);
  }
  throw error;
}
function isReview(value: unknown): value is DesignerReview {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const author = item.author as Record<string, unknown> | null;
  return (
    typeof item.id === 'string' &&
    typeof item.consultationId === 'string' &&
    Number.isInteger(item.rating) &&
    typeof item.content === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.mine === 'boolean' &&
    Boolean(author && typeof author.displayName === 'string')
  );
}
const reviewPath = (id: string) => `/api/consultations/${encodeURIComponent(id)}/review`;

export async function fetchDesignerReviews(designerId: string): Promise<DesignerReviews> {
  const body = await directoryRequest<DesignerReviews>(
    `/api/designers/${encodeURIComponent(designerId)}/reviews`,
  );
  if (!body || !Number.isInteger(body.count) || !Array.isArray(body.items))
    throw new Error('후기를 읽지 못했어요. 다시 시도해 주세요.');
  return { ...body, items: body.items.filter(isReview) };
}
export async function fetchConsultationReview(member: SessionMember, consultationId: string) {
  try {
    const body: unknown = await (await memberRequest(reviewPath(consultationId), member)).json();
    if (!isReview(body)) throw new ApiFailure(0, 'INVALID_RESPONSE', '후기를 읽지 못했어요.');
    return body;
  } catch (error) {
    translate(error);
  }
}
// 처음 쓰면 POST, 이미 쓴 후기를 고치면 PUT
export async function saveReview(
  member: SessionMember,
  consultationId: string,
  input: ReviewInput,
  existing: boolean,
) {
  try {
    const response = await memberRequest(reviewPath(consultationId), member, {
      method: existing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const body: unknown = await response.json().catch(() => null);
    if (!isReview(body))
      throw new ApiFailure(0, 'INVALID_RESPONSE', '저장한 후기를 확인하지 못했어요.');
    return body;
  } catch (error) {
    translate(error);
  }
}
export async function deleteReview(member: SessionMember, consultationId: string) {
  try {
    await memberRequest(reviewPath(consultationId), member, { method: 'DELETE' });
  } catch (error) {
    translate(error);
  }
}
export async function fetchAffiliations(designerId: string): Promise<Affiliation[]> {
  const body = await directoryRequest<Affiliation[]>(
    `/api/designers/${encodeURIComponent(designerId)}/affiliations`,
  );
  return Array.isArray(body) ? body : [];
}
