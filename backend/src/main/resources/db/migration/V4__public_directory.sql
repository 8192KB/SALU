CREATE TABLE salons (
    id CHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    region VARCHAR(100) NOT NULL,
    branch VARCHAR(100) NOT NULL DEFAULT '',
    created_by BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_salon_location UNIQUE (name, region, branch),
    CONSTRAINT fk_salon_creator FOREIGN KEY (created_by) REFERENCES members(id),
    CONSTRAINT ck_salon_name CHECK (CHAR_LENGTH(TRIM(name)) > 0),
    CONSTRAINT ck_salon_region CHECK (CHAR_LENGTH(TRIM(region)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE designer_profiles (
    id CHAR(36) NOT NULL PRIMARY KEY,
    member_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    introduction VARCHAR(2000) NOT NULL,
    specialties VARCHAR(500) NOT NULL DEFAULT '',
    visibility VARCHAR(10) NOT NULL DEFAULT 'PRIVATE',
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_designer_member UNIQUE (member_id),
    CONSTRAINT fk_designer_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT ck_designer_visibility CHECK (visibility IN ('PUBLIC','PRIVATE')),
    CONSTRAINT ck_designer_name CHECK (CHAR_LENGTH(TRIM(name)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE designer_affiliations (
    designer_id CHAR(36) NOT NULL PRIMARY KEY,
    salon_id CHAR(36) NOT NULL,
    CONSTRAINT fk_affiliation_designer FOREIGN KEY (designer_id) REFERENCES designer_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_affiliation_salon FOREIGN KEY (salon_id) REFERENCES salons(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
