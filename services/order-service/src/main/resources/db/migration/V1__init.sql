CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE orders (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number     VARCHAR(32) NOT NULL UNIQUE,
    user_id          UUID        NOT NULL,
    status           VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    currency         CHAR(3)     NOT NULL DEFAULT 'AED',
    -- كل المبالغ بالوحدة الصغرى (فلس) كأعداد صحيحة — لا floating point في المال
    subtotal_minor   BIGINT      NOT NULL DEFAULT 0,
    shipping_minor   BIGINT      NOT NULL DEFAULT 0,
    discount_minor   BIGINT      NOT NULL DEFAULT 0,
    tax_minor        BIGINT      NOT NULL DEFAULT 0,
    total_minor      BIGINT      NOT NULL DEFAULT 0,
    shipping_address JSONB       NOT NULL,
    payment_method   VARCHAR(24) NOT NULL DEFAULT 'CARD',
    payment_id       UUID,
    failure_reason   VARCHAR(64),
    version          BIGINT      NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_totals_non_negative CHECK (
        subtotal_minor >= 0 AND shipping_minor >= 0 AND
        discount_minor >= 0 AND tax_minor >= 0 AND total_minor >= 0)
);

CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX idx_orders_status       ON orders (status) WHERE status IN ('PENDING', 'AWAITING_PAYMENT');

CREATE TABLE order_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id         UUID         NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    sku              VARCHAR(64)  NOT NULL,
    title            VARCHAR(255) NOT NULL,   -- لقطة وقت الشراء: لا تتأثر بتغيير الكتالوج لاحقًا
    image_url        TEXT,
    unit_price_minor BIGINT       NOT NULL CHECK (unit_price_minor >= 0),
    quantity         INTEGER      NOT NULL CHECK (quantity > 0),
    seller_id        VARCHAR(64)
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

-- Transactional Outbox: يُكتب داخل نفس معاملة الطلب ⇒ لا يضيع حدث أبدًا
CREATE TABLE outbox (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(32)  NOT NULL,
    aggregate_id   VARCHAR(64)  NOT NULL,
    event_type     VARCHAR(64)  NOT NULL,
    topic          VARCHAR(128) NOT NULL,
    payload        JSONB        NOT NULL,
    trace_id       VARCHAR(64),
    attempts       INTEGER      NOT NULL DEFAULT 0,
    last_error     TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    published_at   TIMESTAMPTZ
);

-- فهرس جزئي: الـ relay يمسح غير المنشور فقط، فيبقى صغيرًا مهما كبر الجدول
CREATE INDEX idx_outbox_unpublished ON outbox (created_at)
    WHERE published_at IS NULL;

CREATE TABLE processed_events (
    event_id     UUID        NOT NULL,
    consumer     VARCHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, consumer)
);

-- منع إنشاء طلب مكرر عند إعادة إرسال العميل لنفس الطلب
CREATE TABLE idempotency_keys (
    key        VARCHAR(128) PRIMARY KEY,
    user_id    UUID        NOT NULL,
    order_id   UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idempotency_created ON idempotency_keys (created_at);

-- مولّد أرقام الطلبات: تسلسل مقروء للمستخدم بدل عرض UUID
CREATE SEQUENCE order_number_seq START WITH 100000 INCREMENT BY 1;
