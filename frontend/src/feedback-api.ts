import { directoryRequest } from './auth/api';

// 이용 의견 API 계약(docs/feedback-api.md). 보내기는 CSRF만 넣고, 목록은 관리자만 받음
export type FeedbackItem = {
  id: number;
  memberId: number | null;
  authorName: string | null;
  content: string;
  createdAt: string;
};

export const sendFeedback = (requestKey: string, content: string) =>
  directoryRequest<{ id: number; createdAt: string }>('/api/feedback', 'POST', {
    requestKey,
    content,
  });
export const fetchFeedback = async () =>
  (await directoryRequest<FeedbackItem[]>('/api/admin/feedback')) ?? [];
