-- 상담 하나를 대화방으로 씀. 디자이너의 첫 메시지가 기존 답변이 되고 그때 ANSWERED로 바뀜
CREATE TABLE consultation_messages (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    consultation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    sender_id BIGINT NOT NULL,
    sender_role VARCHAR(10) NOT NULL,
    client_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    content VARCHAR(2000) NOT NULL,
    sent_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_consultation_message_key UNIQUE (consultation_id, sender_id, client_key),
    CONSTRAINT fk_consultation_message FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
    CONSTRAINT fk_consultation_message_sender FOREIGN KEY (sender_id) REFERENCES members(id),
    CONSTRAINT ck_consultation_message_role CHECK (sender_role IN ('CUSTOMER', 'DESIGNER')),
    CONSTRAINT ck_consultation_message_content CHECK (CHAR_LENGTH(TRIM(content)) > 0),
    KEY ix_consultation_message (consultation_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 기존 답변은 첫 디자이너 메시지로 옮김. 상담 ID를 중복 방지 키로 씀
INSERT INTO consultation_messages(consultation_id, sender_id, sender_role, client_key, content, sent_at)
SELECT c.id, p.member_id, 'DESIGNER', c.id, c.reply_text, c.replied_at
FROM consultations c JOIN designer_profiles p ON p.id = c.designer_id
WHERE c.status = 'ANSWERED';

ALTER TABLE consultations DROP CHECK ck_consultation_reply;
ALTER TABLE consultations DROP COLUMN reply_text;
-- 읽음 위치는 각 참여자가 마지막으로 읽은 메시지 ID. 후기의 복합 FK가 쓰는 UNIQUE를 함께 둠
ALTER TABLE consultations
    ADD COLUMN customer_read_message_id BIGINT NULL,
    ADD COLUMN designer_read_message_id BIGINT NULL,
    ADD CONSTRAINT ck_consultation_answered CHECK (
        (status = 'REQUESTED' AND replied_at IS NULL) OR (status = 'ANSWERED' AND replied_at IS NOT NULL)),
    ADD CONSTRAINT uk_consultation_designer UNIQUE (id, designer_id),
    ADD CONSTRAINT uk_consultation_customer UNIQUE (id, customer_id);
