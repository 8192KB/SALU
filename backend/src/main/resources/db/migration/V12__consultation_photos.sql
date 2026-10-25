-- 상담 첨부 사진을 여러 장(최대 6장) 저장함. 이미 있는 사진은 position 0이 됨
ALTER TABLE consultation_photos
    ADD COLUMN position TINYINT NOT NULL DEFAULT 0 AFTER consultation_id,
    ADD COLUMN label VARCHAR(30) NOT NULL DEFAULT '사진' AFTER position,
    DROP PRIMARY KEY,
    ADD PRIMARY KEY (consultation_id, position),
    ADD CONSTRAINT ck_consultation_photo_position CHECK (position BETWEEN 0 AND 5);
