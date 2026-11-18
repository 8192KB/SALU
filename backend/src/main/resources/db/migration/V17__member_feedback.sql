-- 써 보다 불편했던 점·문의. 커뮤니티와 따로 두고 관리자만 읽음. 로그인 전에 보내면 member_id가 비어 있음
CREATE TABLE member_feedback (
    id BIGINT NOT NULL AUTO_INCREMENT,
    member_id BIGINT NULL,
    request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_feedback_key UNIQUE (request_key),
    CONSTRAINT fk_feedback_member FOREIGN KEY (member_id) REFERENCES members(id),
    CONSTRAINT ck_feedback_content CHECK (CHAR_LENGTH(TRIM(content)) > 0),
    KEY ix_feedback_created (created_at)
);
