-- 후기는 답변 받은 상담 1건당 1개. 복합 FK로 상담의 디자이너·고객과 다른 값을 넣지 못하게 함
CREATE TABLE designer_reviews (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    consultation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    designer_id CHAR(36) NOT NULL,
    author_id BIGINT NOT NULL,
    author_name VARCHAR(50) NOT NULL,
    rating TINYINT NOT NULL,
    content VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_review_consultation UNIQUE (consultation_id),
    CONSTRAINT fk_review_consultation_designer FOREIGN KEY (consultation_id, designer_id) REFERENCES consultations(id, designer_id) ON DELETE CASCADE,
    CONSTRAINT fk_review_consultation_author FOREIGN KEY (consultation_id, author_id) REFERENCES consultations(id, customer_id) ON DELETE CASCADE,
    CONSTRAINT fk_review_designer FOREIGN KEY (designer_id) REFERENCES designer_profiles(id),
    CONSTRAINT ck_review_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT ck_review_content CHECK (CHAR_LENGTH(TRIM(content)) > 0),
    KEY ix_review_designer (designer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE designer_favorites (
    member_id BIGINT NOT NULL,
    designer_id CHAR(36) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (member_id, designer_id),
    CONSTRAINT fk_favorite_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT fk_favorite_designer FOREIGN KEY (designer_id) REFERENCES designer_profiles(id) ON DELETE CASCADE,
    KEY ix_favorite_designer (designer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 지금 소속은 designer_affiliations, 지난 소속까지는 이 표. 열린 기간은 디자이너마다 하나만 허용
CREATE TABLE designer_affiliation_history (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    designer_id CHAR(36) NOT NULL,
    salon_id CHAR(36) NOT NULL,
    started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ended_at TIMESTAMP(6) NULL,
    -- STORED 생성 열의 기준 열에는 CASCADE FK를 둘 수 없어 VIRTUAL로 둠
    open_designer_id CHAR(36) AS (CASE WHEN ended_at IS NULL THEN designer_id END) VIRTUAL,
    CONSTRAINT uk_affiliation_open UNIQUE (open_designer_id),
    CONSTRAINT fk_history_designer FOREIGN KEY (designer_id) REFERENCES designer_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_history_salon FOREIGN KEY (salon_id) REFERENCES salons(id),
    CONSTRAINT ck_history_period CHECK (ended_at IS NULL OR ended_at >= started_at),
    KEY ix_history_designer (designer_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO designer_affiliation_history(designer_id, salon_id, started_at)
SELECT a.designer_id, a.salon_id, p.updated_at
FROM designer_affiliations a JOIN designer_profiles p ON p.id = a.designer_id;
