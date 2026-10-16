CREATE TABLE consultations (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  designer_id CHAR(36) NOT NULL,
  request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_hash BINARY(32) NOT NULL,
  customer_name VARCHAR(50) NOT NULL,
  designer_name VARCHAR(100) NOT NULL,
  salon_name VARCHAR(201) NULL,
  cut_date DATE NOT NULL,
  service VARCHAR(60) NOT NULL,
  summary VARCHAR(2000) NOT NULL,
  request_text VARCHAR(2000) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'REQUESTED',
  reply_text VARCHAR(2000) NULL,
  sent_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  replied_at TIMESTAMP(6) NULL,
  CONSTRAINT uk_consultation_request UNIQUE (customer_id, request_key),
  CONSTRAINT fk_consultation_customer FOREIGN KEY (customer_id) REFERENCES members(id),
  CONSTRAINT fk_consultation_designer FOREIGN KEY (designer_id) REFERENCES designer_profiles(id),
  CONSTRAINT ck_consultation_status CHECK (status IN ('REQUESTED','ANSWERED')),
  CONSTRAINT ck_consultation_reply CHECK (
    (status = 'REQUESTED' AND reply_text IS NULL AND replied_at IS NULL)
    OR (status = 'ANSWERED' AND reply_text IS NOT NULL AND replied_at IS NOT NULL)),
  CONSTRAINT ck_consultation_request CHECK (CHAR_LENGTH(TRIM(request_text)) > 0),
  KEY ix_consultation_customer (customer_id, sent_at),
  KEY ix_consultation_designer (designer_id, sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE consultation_photos (
  consultation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  content_type VARCHAR(32) NOT NULL,
  byte_size INT NOT NULL,
  key_id VARCHAR(50) NOT NULL,
  nonce VARBINARY(12) NOT NULL,
  ciphertext MEDIUMBLOB NOT NULL,
  CONSTRAINT fk_consultation_photo FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
