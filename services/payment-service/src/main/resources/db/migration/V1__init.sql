CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE payments (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- دفعة واحدة لكل طلب: القيد الفريد يجعل إعادة الحدث بلا خصم مضاعف
    order_id     UUID        NOT NULL UNIQUE,
    user_id      UUID        NOT NULL,
    amount_minor BIGINT      NOT NULL CHECK (amount_minor > 0),
    currency     CHAR(3)     NOT NULL DEFAULT 'EGP',
    method       VARCHAR(24) NOT NULL,
    status       VARCHAR(24) NOT NULL DEFAULT 'REQUIRES_AUTH',
    provider     VARCHAR(24) NOT NULL DEFAULT 'mock',
    provider_ref VARCHAR(128),
    failure_code VARCHAR(64),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_user   ON payments (user_id, created_at DESC);
CREATE INDEX idx_payments_status ON payments (status)
    WHERE status IN ('REQUIRES_AUTH', 'AUTHORIZED');

CREATE TABLE refunds (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id   UUID        NOT NULL REFERENCES payments (id),
    amount_minor BIGINT      NOT NULL CHECK (amount_minor > 0),
    reason       VARCHAR(255),
    status       VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    provider_ref VARCHAR(128),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refunds_payment ON refunds (payment_id);

-- سجل تدقيق لا يُعدَّل ولا يُحذف — متطلب محاسبي
CREATE TABLE payment_audit (
    id          BIGSERIAL PRIMARY KEY,
    payment_id  UUID        NOT NULL,
    from_status VARCHAR(24),
    to_status   VARCHAR(24) NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_audit_payment ON payment_audit (payment_id, created_at);

CREATE TABLE processed_events (
    event_id     UUID        NOT NULL,
    consumer     VARCHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, consumer)
);
