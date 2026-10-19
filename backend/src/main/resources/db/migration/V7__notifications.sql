-- 알림 문구와 이동 화면은 화면이 type으로 정하므로 종류와 대상 ID만 저장함
CREATE TABLE notifications (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT NOT NULL,
    type VARCHAR(30) NOT NULL,
    target_id VARCHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    actor_name VARCHAR(100) NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    read_at TIMESTAMP(6) NULL,
    CONSTRAINT fk_notification_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT ck_notification_type CHECK (type IN ('CONSULTATION_REQUESTED', 'CONSULTATION_MESSAGE', 'REVIEW_RECEIVED', 'COMMUNITY_COMMENT')),
    KEY ix_notification_member (member_id, id),
    KEY ix_notification_unread (member_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
