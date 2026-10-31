-- 미용실 지도 위치. 기존 미용실은 위치 없이 둠. NULL 비교가 CHECK를 통과하지 않도록 IS NOT NULL을 명시
ALTER TABLE salons
    ADD COLUMN address VARCHAR(200) NULL,
    ADD COLUMN latitude DECIMAL(9,6) NULL,
    ADD COLUMN longitude DECIMAL(9,6) NULL,
    ADD CONSTRAINT ck_salon_location CHECK (
        (address IS NULL AND latitude IS NULL AND longitude IS NULL)
        OR (address IS NOT NULL AND latitude IS NOT NULL AND longitude IS NOT NULL
            AND CHAR_LENGTH(TRIM(address)) > 0 AND latitude BETWEEN 33 AND 39 AND longitude BETWEEN 124 AND 132)
    );
