import { ApiFailure, directoryRequest, memberRequest } from './auth/api';
import type { SessionMember } from './auth/api';

// 커뮤니티 API 계약(docs/community-api.md)의 응답 모양
export type PostCategory = 'CASE' | 'QUESTION';
export type PostStatus = 'VISIBLE' | 'HIDDEN' | 'DELETED';
export type Cut = { cutDate: string; service: string; summary: string };
export type CommunityPost = {
  id: string;
  category: PostCategory;
  title: string;
  content: string;
  author: { displayName: string };
  cut: Cut | null;
  photoUrls: string[];
  commentCount: number;
  reactionCount: number;
  reacted: boolean;
  mine: boolean;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
};
export type CommunityPostSummary = {
  id: string;
  category: PostCategory;
  title: string;
  excerpt: string;
  author: { displayName: string };
  cut: Cut | null;
  photoUrl: string | null;
  photoCount: number;
  commentCount: number;
  reactionCount: number;
  status: PostStatus;
  createdAt: string;
};
export type CommunityComment = {
  id: number;
  author: { displayName: string };
  content: string;
  mine: boolean;
  createdAt: string;
};
export type ReportReason = 'SPAM' | 'ABUSE' | 'PRIVACY' | 'ILLEGAL' | 'OTHER';
export type PostInput = {
  requestKey: string;
  category: PostCategory;
  title: string;
  content: string;
  cut: Cut | null;
};

export const CATEGORY_LABELS: Record<PostCategory, string> = {
  CASE: '커트 사례',
  QUESTION: '고민 질문',
};
export const REPORT_REASONS: Record<ReportReason, string> = {
  SPAM: '광고·도배',
  ABUSE: '욕설·비하',
  PRIVACY: '개인정보 노출',
  ILLEGAL: '불법 정보',
  OTHER: '기타',
};

// 화면 문구는 서버 message가 아니라 code로 정함
const messages: Record<string, string> = {
  AUTHENTICATION_REQUIRED: '로그인 후 이용할 수 있어요.',
  COMMUNITY_SUSPENDED: '이용이 제한된 계정이라 지금은 글과 댓글을 쓸 수 없어요.',
  ACCESS_DENIED: '내가 쓴 글이나 댓글만 고치거나 지울 수 있어요.',
  RESOURCE_NOT_FOUND: '글을 찾을 수 없어요. 지워졌거나 숨겨진 글일 수 있어요.',
  RESOURCE_CONFLICT: '이미 처리한 요청이에요. 화면을 새로고침해 주세요.',
  STORAGE_CONTEXT_CHANGED: '로그인 계정이 바뀌었어요. 화면을 새로고침해 주세요.',
  UPLOAD_TOO_LARGE: '사진은 5MB 이하만 올릴 수 있어요.',
  UNSUPPORTED_MEDIA_TYPE: 'JPEG, PNG, WebP 사진만 올릴 수 있어요.',
};
export function translate(error: unknown, overrides: Record<string, string> = {}): never {
  if (error instanceof ApiFailure) {
    const message =
      overrides[error.code] ??
      messages[error.code] ??
      (error.status >= 500 ? '잠시 후 다시 시도해 주세요.' : error.message);
    throw new ApiFailure(error.status, error.code, message);
  }
  throw error;
}
const postPath = (id: string) => `/api/community/posts/${encodeURIComponent(id)}`;
async function json<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (body === null) throw new ApiFailure(0, 'INVALID_RESPONSE', '응답을 읽지 못했어요.');
  return body as T;
}

export async function listPosts(params: {
  category?: PostCategory;
  service?: string;
  q?: string;
  before?: string;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  try {
    return (await directoryRequest<CommunityPostSummary[]>(`/api/community/posts?${query}`)) ?? [];
  } catch (error) {
    translate(error, { INVALID_REQUEST: '검색어는 50자 이내로 적어 주세요.' });
  }
}
export async function getPost(id: string) {
  try {
    const post = await directoryRequest<CommunityPost>(postPath(id));
    if (!post) throw new ApiFailure(404, 'RESOURCE_NOT_FOUND', messages.RESOURCE_NOT_FOUND!);
    return post;
  } catch (error) {
    translate(error);
  }
}
export async function listComments(id: string) {
  try {
    return (await directoryRequest<CommunityComment[]>(`${postPath(id)}/comments`)) ?? [];
  } catch (error) {
    translate(error);
  }
}
export async function listMyPosts(member: SessionMember) {
  try {
    return await json<CommunityPostSummary[]>(
      await memberRequest('/api/my/community-posts', member),
    );
  } catch (error) {
    translate(error);
  }
}
// 글과 사진을 한 번에 보내 한 transaction으로 저장함. 같은 requestKey로 다시 보내면 글은 하나만 생김
export async function createPost(member: SessionMember, input: PostInput, photos: Blob[]) {
  const form = new FormData();
  form.append('post', new Blob([JSON.stringify(input)], { type: 'application/json' }));
  photos.forEach((photo, index) => form.append('photos', photo, `photo-${index}`));
  try {
    return await json<CommunityPost>(
      await memberRequest('/api/community/posts', member, { method: 'POST', body: form }, 60000),
    );
  } catch (error) {
    translate(error, {
      INVALID_REQUEST: '제목·내용과 커트 정보를 다시 확인해 주세요.',
      RESOURCE_CONFLICT: '보내던 글과 내용이 달라요. 다시 올려 주세요.',
    });
  }
}
export async function updatePost(
  member: SessionMember,
  id: string,
  input: { title: string; content: string },
) {
  try {
    return await json<CommunityPost>(
      await memberRequest(postPath(id), member, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    );
  } catch (error) {
    translate(error, { INVALID_REQUEST: '제목은 100자, 내용은 5,000자 이내로 적어 주세요.' });
  }
}
export async function deletePost(member: SessionMember, id: string) {
  try {
    await memberRequest(postPath(id), member, { method: 'DELETE' });
  } catch (error) {
    translate(error);
  }
}
export async function addComment(
  member: SessionMember,
  postId: string,
  clientKey: string,
  content: string,
) {
  try {
    return await json<CommunityComment>(
      await memberRequest(`${postPath(postId)}/comments`, member, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey, content }),
      }),
    );
  } catch (error) {
    translate(error, {
      INVALID_REQUEST: '댓글을 1,000자 이내로 적어 주세요.',
      RESOURCE_CONFLICT: '보내던 댓글과 내용이 달라요. 다시 보내 주세요.',
    });
  }
}
export async function deleteComment(member: SessionMember, id: number) {
  try {
    await memberRequest(`/api/community/comments/${id}`, member, { method: 'DELETE' });
  } catch (error) {
    translate(error, { ACCESS_DENIED: '내가 쓴 댓글만 지울 수 있어요.' });
  }
}
export async function setReaction(postId: string, on: boolean) {
  try {
    await directoryRequest(`${postPath(postId)}/reaction`, on ? 'PUT' : 'DELETE');
  } catch (error) {
    translate(error);
  }
}
export async function report(
  member: SessionMember,
  target: { post: string } | { comment: number },
  reason: ReportReason,
  detail: string,
) {
  const path =
    'post' in target
      ? `${postPath(target.post)}/reports`
      : `/api/community/comments/${target.comment}/reports`;
  try {
    await memberRequest(path, member, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, detail: detail || null }),
    });
  } catch (error) {
    translate(error, {
      INVALID_REQUEST: '내 글은 신고할 수 없어요. 기타를 골랐다면 이유를 적어 주세요.',
      RESOURCE_CONFLICT: '이미 신고했어요. 관리자가 확인할 거예요.',
    });
  }
}
