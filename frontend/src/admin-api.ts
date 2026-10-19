import { directoryRequest } from './auth/api';
import type { CommunityPost, ReportReason } from './community-api';

// 커뮤니티 API 계약(docs/community-api.md) 4장 관리자 응답 모양. 관리자 요청에는 CSRF만 넣음
export type ReportedPost = {
  id: string;
  title: string;
  authorId: number;
  authorName: string;
  status: string;
  openCount: number;
  reasons: ReportReason[];
  latestAt: string;
};
export type ReportedComment = {
  id: number;
  postId: string;
  content: string;
  authorId: number;
  authorName: string;
  status: string;
  openCount: number;
  reasons: ReportReason[];
  latestAt: string;
};
export type Report = {
  reason: ReportReason;
  detail: string | null;
  status: string;
  createdAt: string;
};
export type PostReview = { post: CommunityPost; authorId: number; reports: Report[] };
export type Sanction = {
  id: number;
  memberId: number;
  reason: string;
  endsAt: string | null;
  createdAt: string;
  liftedAt: string | null;
  active: boolean;
};
export type Decision = 'HIDE' | 'KEEP';

export const POST_STATUS: Record<string, string> = {
  VISIBLE: '공개',
  HIDDEN: '숨김',
  DELETED: '작성자가 지움',
};
export const REPORT_STATUS: Record<string, string> = {
  OPEN: '처리 전',
  ACCEPTED: '받아들임',
  DISMISSED: '기각',
};

export const fetchReports = async () =>
  (await directoryRequest<{ posts: ReportedPost[]; comments: ReportedComment[] }>(
    '/api/admin/community/reports',
  )) ?? { posts: [], comments: [] };
export const fetchPostReview = (id: string) =>
  directoryRequest<PostReview>(`/api/admin/community/posts/${encodeURIComponent(id)}`);
export const fetchCommentReports = async (id: number) =>
  (await directoryRequest<Report[]>(`/api/admin/community/comments/${id}/reports`)) ?? [];
export const decide = (target: { post: string } | { comment: number }, action: Decision) =>
  directoryRequest(
    'post' in target
      ? `/api/admin/community/posts/${encodeURIComponent(target.post)}/decision`
      : `/api/admin/community/comments/${target.comment}/decision`,
    'POST',
    { action },
  );
export const fetchSanctions = async (memberId: number) =>
  (await directoryRequest<Sanction[]>(`/api/admin/members/${memberId}/sanctions`)) ?? [];
export const sanction = (memberId: number, days: number | null, reason: string) =>
  directoryRequest<Sanction>(`/api/admin/members/${memberId}/sanctions`, 'POST', { days, reason });
export const liftSanction = (id: number) =>
  directoryRequest(`/api/admin/sanctions/${id}/lift`, 'POST');
