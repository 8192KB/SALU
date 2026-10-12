CREATE TABLE personal_backup_item_photos (
  member_id BIGINT NOT NULL,
  item_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  photo_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (member_id, item_id, photo_id),
  KEY ix_photo_reference (member_id, photo_id),
  CONSTRAINT fk_reference_item FOREIGN KEY (member_id, item_id) REFERENCES personal_backup_items(member_id, client_id) ON DELETE CASCADE,
  CONSTRAINT fk_reference_photo FOREIGN KEY (member_id, photo_id) REFERENCES personal_backup_photos(member_id, client_id) ON DELETE CASCADE
);
