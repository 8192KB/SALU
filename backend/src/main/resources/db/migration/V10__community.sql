-- 공개 글은 개인 기록 원본이 아니라 글을 올릴 때 고른 커트 정보의 복사본을 저장함
CREATE TABLE community_posts (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    author_id BIGINT NOT NULL,
    author_name VARCHAR(50) NOT NULL,
    request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    content_hash BINARY(32) NOT NULL,
    category VARCHAR(10) NOT NULL,
    title VARCHAR(100) NOT NULL,
    content VARCHAR(5000) NOT NULL,
    cut_date DATE NULL,
    service VARCHAR(60) NULL,
    summary VARCHAR(2000) NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'VISIBLE',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_post_request UNIQUE (author_id, request_key),
    CONSTRAINT fk_post_author FOREIGN KEY (author_id) REFERENCES members(id),
    CONSTRAINT ck_post_category CHECK (category IN ('CASE', 'QUESTION')),
    CONSTRAINT ck_post_status CHECK (status IN ('VISIBLE', 'HIDDEN', 'DELETED')),
    CONSTRAINT ck_post_title CHECK (CHAR_LENGTH(TRIM(title)) > 0),
    CONSTRAINT ck_post_content CHECK (CHAR_LENGTH(TRIM(content)) > 0),
    CONSTRAINT ck_post_cut CHECK ((cut_date IS NULL AND service IS NULL AND summary IS NULL)
        OR (cut_date IS NOT NULL AND service IS NOT NULL AND summary IS NOT NULL)),
    CONSTRAINT ck_post_case_cut CHECK (category <> 'CASE' OR cut_date IS NOT NULL),
    KEY ix_post_list (status, created_at),
    KEY ix_post_category (category, status, created_at),
    KEY ix_post_author (author_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 공개 사진이라 암호화하지 않음. 글마다 최대 3장
CREATE TABLE community_post_photos (
    post_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    position TINYINT NOT NULL,
    content_type VARCHAR(32) NOT NULL,
    byte_size INT NOT NULL,
    data MEDIUMBLOB NOT NULL,
    PRIMARY KEY (post_id, position),
    CONSTRAINT fk_post_photo FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
    CONSTRAINT ck_post_photo_position CHECK (position BETWEEN 0 AND 2),
    CONSTRAINT ck_post_photo_type CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE community_comments (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    post_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    author_id BIGINT NOT NULL,
    author_name VARCHAR(50) NOT NULL,
    client_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    content VARCHAR(1000) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'VISIBLE',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_comment_key UNIQUE (post_id, author_id, client_key),
    CONSTRAINT fk_comment_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_author FOREIGN KEY (author_id) REFERENCES members(id),
    CONSTRAINT ck_comment_status CHECK (status IN ('VISIBLE', 'HIDDEN', 'DELETED')),
    CONSTRAINT ck_comment_content CHECK (CHAR_LENGTH(TRIM(content)) > 0),
    KEY ix_comment_post (post_id, id),
    KEY ix_comment_author (author_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 반응은 '도움돼요' 하나. 수는 이 표에서 셈
CREATE TABLE community_reactions (
    post_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    member_id BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (post_id, member_id),
    CONSTRAINT fk_reaction_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_reaction_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    KEY ix_reaction_member (member_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE community_post_reports (
    post_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    reporter_id BIGINT NOT NULL,
    reason VARCHAR(10) NOT NULL,
    detail VARCHAR(200) NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    handled_at TIMESTAMP(6) NULL,
    handled_by BIGINT NULL,
    PRIMARY KEY (post_id, reporter_id),
    CONSTRAINT fk_post_report_post FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_post_report_reporter FOREIGN KEY (reporter_id) REFERENCES members(id),
    CONSTRAINT fk_post_report_handler FOREIGN KEY (handled_by) REFERENCES members(id),
    CONSTRAINT ck_post_report_reason CHECK (reason IN ('SPAM', 'ABUSE', 'PRIVACY', 'ILLEGAL', 'OTHER')),
    CONSTRAINT ck_post_report_detail CHECK (reason <> 'OTHER' OR detail IS NOT NULL),
    CONSTRAINT ck_post_report_status CHECK ((status = 'OPEN' AND handled_at IS NULL AND handled_by IS NULL)
        OR (status IN ('ACCEPTED', 'DISMISSED') AND handled_at IS NOT NULL AND handled_by IS NOT NULL)),
    KEY ix_post_report_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE community_comment_reports (
    comment_id BIGINT NOT NULL,
    reporter_id BIGINT NOT NULL,
    reason VARCHAR(10) NOT NULL,
    detail VARCHAR(200) NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    handled_at TIMESTAMP(6) NULL,
    handled_by BIGINT NULL,
    PRIMARY KEY (comment_id, reporter_id),
    CONSTRAINT fk_comment_report_comment FOREIGN KEY (comment_id) REFERENCES community_comments(id) ON DELETE CASCADE,
    CONSTRAINT fk_comment_report_reporter FOREIGN KEY (reporter_id) REFERENCES members(id),
    CONSTRAINT fk_comment_report_handler FOREIGN KEY (handled_by) REFERENCES members(id),
    CONSTRAINT ck_comment_report_reason CHECK (reason IN ('SPAM', 'ABUSE', 'PRIVACY', 'ILLEGAL', 'OTHER')),
    CONSTRAINT ck_comment_report_detail CHECK (reason <> 'OTHER' OR detail IS NOT NULL),
    CONSTRAINT ck_comment_report_status CHECK ((status = 'OPEN' AND handled_at IS NULL AND handled_by IS NULL)
        OR (status IN ('ACCEPTED', 'DISMISSED') AND handled_at IS NOT NULL AND handled_by IS NOT NULL)),
    KEY ix_comment_report_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 커뮤니티 제재. ends_at이 NULL이면 기간 없음. 해제해도 기록은 남김
CREATE TABLE member_sanctions (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT NOT NULL,
    reason VARCHAR(200) NOT NULL,
    ends_at TIMESTAMP(6) NULL,
    created_by BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    lifted_at TIMESTAMP(6) NULL,
    lifted_by BIGINT NULL,
    CONSTRAINT fk_sanction_member FOREIGN KEY (member_id) REFERENCES members(id),
    CONSTRAINT fk_sanction_creator FOREIGN KEY (created_by) REFERENCES members(id),
    CONSTRAINT fk_sanction_lifter FOREIGN KEY (lifted_by) REFERENCES members(id),
    CONSTRAINT ck_sanction_reason CHECK (CHAR_LENGTH(TRIM(reason)) > 0),
    CONSTRAINT ck_sanction_period CHECK (ends_at IS NULL OR ends_at > created_at),
    CONSTRAINT ck_sanction_lift CHECK ((lifted_at IS NULL AND lifted_by IS NULL) OR (lifted_at IS NOT NULL AND lifted_by IS NOT NULL)),
    KEY ix_sanction_member (member_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
