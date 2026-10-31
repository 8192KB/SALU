-- 비밀번호 찾기 메일의 일회용 토큰. 원문은 메일에만 있고 DB에는 SHA-256 해시만 둠
CREATE TABLE password_reset_tokens (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    expires_at TIMESTAMP(6) NOT NULL,
    used_at TIMESTAMP(6) NULL,
    CONSTRAINT uk_password_reset_token UNIQUE (token_hash),
    CONSTRAINT fk_password_reset_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    INDEX ix_password_reset_member (member_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
