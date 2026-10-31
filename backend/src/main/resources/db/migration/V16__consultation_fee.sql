-- 상담 요금 결제(docs/payment-api.md). 결제 전 상담은 디자이너에게 보이지 않고, 첫 답변 전에는 취소할 수 있음
ALTER TABLE designer_profiles
    ADD COLUMN consultation_fee INT NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_designer_consultation_fee CHECK (consultation_fee BETWEEN 0 AND 100000 AND consultation_fee % 1000 = 0);

ALTER TABLE consultations DROP CHECK ck_consultation_status;
ALTER TABLE consultations DROP CHECK ck_consultation_answered;
ALTER TABLE consultations
    MODIFY status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    ADD COLUMN fee INT NOT NULL DEFAULT 0,
    ADD COLUMN canceled_at TIMESTAMP(6) NULL,
    ADD CONSTRAINT ck_consultation_status CHECK (status IN ('PAYMENT_PENDING', 'REQUESTED', 'ANSWERED', 'CANCELED')),
    ADD CONSTRAINT ck_consultation_answered CHECK (
        (status IN ('PAYMENT_PENDING', 'REQUESTED') AND replied_at IS NULL AND canceled_at IS NULL)
        OR (status = 'ANSWERED' AND replied_at IS NOT NULL AND canceled_at IS NULL)
        OR (status = 'CANCELED' AND replied_at IS NULL AND canceled_at IS NOT NULL)),
    ADD CONSTRAINT ck_consultation_fee CHECK (fee BETWEEN 0 AND 100000);

-- 상담 하나에 결제 하나. 시크릿 키·카드 정보는 저장하지 않고 토스 paymentKey만 둠
CREATE TABLE consultation_payments (
    consultation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    order_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    amount INT NOT NULL,
    payment_key VARCHAR(200) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'READY',
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    paid_at TIMESTAMP(6) NULL,
    canceled_at TIMESTAMP(6) NULL,
    refund_attempts INT NOT NULL DEFAULT 0,
    CONSTRAINT uk_payment_order UNIQUE (order_id),
    CONSTRAINT fk_payment_consultation FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
    CONSTRAINT ck_payment_amount CHECK (amount BETWEEN 1000 AND 100000),
    CONSTRAINT ck_payment_status CHECK (status IN ('READY', 'PAID', 'REFUND_PENDING', 'CANCELED', 'EXPIRED')),
    -- 결제 전에 취소하면 CANCELED여도 paymentKey가 없음
    CONSTRAINT ck_payment_key CHECK ((status IN ('READY', 'EXPIRED') AND payment_key IS NULL) OR (status IN ('PAID', 'REFUND_PENDING') AND payment_key IS NOT NULL) OR status = 'CANCELED'),
    INDEX ix_payment_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
