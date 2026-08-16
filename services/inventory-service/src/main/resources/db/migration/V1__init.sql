CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE stock_items (
    sku          VARCHAR(64) PRIMARY KEY,
    warehouse_id VARCHAR(32) NOT NULL DEFAULT 'DXB-1',
    on_hand      INTEGER     NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved     INTEGER     NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    version      BIGINT      NOT NULL DEFAULT 0,
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- لا يمكن حجز أكثر من الموجود فعليًا؛ قيد على مستوى قاعدة البيانات
    CONSTRAINT chk_reserved_le_onhand CHECK (reserved <= on_hand)
);

CREATE TABLE reservations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID        NOT NULL,
    sku        VARCHAR(64) NOT NULL REFERENCES stock_items (sku),
    quantity   INTEGER     NOT NULL CHECK (quantity > 0),
    status     VARCHAR(16) NOT NULL DEFAULT 'HELD',   -- HELD | COMMITTED | RELEASED
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- حجز واحد لكل (طلب، sku): يجعل إعادة معالجة نفس الحدث آمنة
    CONSTRAINT uq_reservation_order_sku UNIQUE (order_id, sku)
);

CREATE INDEX idx_reservations_order  ON reservations (order_id);
CREATE INDEX idx_reservations_sweep  ON reservations (expires_at) WHERE status = 'HELD';

-- منع المعالجة المزدوجة لأحداث Kafka (at-least-once delivery)
CREATE TABLE processed_events (
    event_id     UUID        NOT NULL,
    consumer     VARCHAR(64) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, consumer)
);

CREATE INDEX idx_processed_events_time ON processed_events (processed_at);
