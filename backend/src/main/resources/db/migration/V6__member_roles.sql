-- 관리자 지정은 화면 없이 DB에서만 함. 역할이 바뀌면 다음 요청에서 다시 로그인하게 됨
ALTER TABLE members
    ADD COLUMN role VARCHAR(10) NOT NULL DEFAULT 'USER' AFTER status,
    ADD CONSTRAINT ck_members_role CHECK (role IN ('USER', 'ADMIN'));
