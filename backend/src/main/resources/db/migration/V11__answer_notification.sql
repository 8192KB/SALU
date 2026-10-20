-- 디자이너의 첫 메시지(답변) 알림을 이후 메시지 알림과 나눔. 이미 쌓인 알림은 그대로 둠
ALTER TABLE notifications DROP CHECK ck_notification_type;
ALTER TABLE notifications ADD CONSTRAINT ck_notification_type
    CHECK (type IN ('CONSULTATION_REQUESTED', 'CONSULTATION_ANSWERED', 'CONSULTATION_MESSAGE', 'REVIEW_RECEIVED', 'COMMUNITY_COMMENT'));
