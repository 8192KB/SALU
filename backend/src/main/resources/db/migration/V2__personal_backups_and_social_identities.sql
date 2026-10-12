ALTER TABLE members MODIFY email VARCHAR(254) NULL, MODIFY password_hash VARCHAR(255) NULL;

CREATE TABLE social_identities (
  provider VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider_subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  member_id BIGINT NOT NULL,
  PRIMARY KEY (provider, provider_subject),
  UNIQUE KEY uq_member_provider (member_id, provider),
  CONSTRAINT fk_identity_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE personal_backup_items (
  member_id BIGINT NOT NULL,
  client_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision BIGINT NOT NULL,
  mutation_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  key_id VARCHAR(50) NOT NULL,
  nonce VARBINARY(12) NOT NULL,
  ciphertext MEDIUMBLOB NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (member_id, client_id),
  CONSTRAINT fk_backup_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
CREATE TABLE personal_backup_mutations (
  member_id BIGINT NOT NULL,
  client_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mutation_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision BIGINT NOT NULL,
  payload_hash BINARY(32) NOT NULL,
  PRIMARY KEY (member_id, client_id, mutation_id),
  CONSTRAINT fk_mutation_item FOREIGN KEY (member_id, client_id) REFERENCES personal_backup_items(member_id, client_id) ON DELETE CASCADE
);
CREATE TABLE personal_backup_photos (
  member_id BIGINT NOT NULL,
  client_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  content_type VARCHAR(32) NOT NULL,
  byte_size INT NOT NULL,
  key_id VARCHAR(50) NOT NULL,
  nonce VARBINARY(12) NOT NULL,
  ciphertext MEDIUMBLOB NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (member_id, client_id),
  CONSTRAINT fk_photo_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
