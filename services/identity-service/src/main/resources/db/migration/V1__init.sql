CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          CITEXT      NOT NULL UNIQUE,
    phone          VARCHAR(32) UNIQUE,
    password_hash  TEXT        NOT NULL,
    full_name      VARCHAR(160) NOT NULL,
    locale         VARCHAR(8)  NOT NULL DEFAULT 'ar',
    email_verified BOOLEAN     NOT NULL DEFAULT FALSE,
    status         VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
    user_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role    VARCHAR(24) NOT NULL,
    PRIMARY KEY (user_id, role)
);

CREATE TABLE addresses (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    label      VARCHAR(48)  NOT NULL DEFAULT 'home',
    full_name  VARCHAR(160) NOT NULL,
    phone      VARCHAR(32)  NOT NULL,
    line1      VARCHAR(255) NOT NULL,
    line2      VARCHAR(255),
    area       VARCHAR(120),
    city       VARCHAR(120) NOT NULL,
    country    CHAR(2)      NOT NULL DEFAULT 'AE',
    lat        NUMERIC(9, 6),
    lng        NUMERIC(9, 6),
    is_default BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_addresses_user ON addresses (user_id);

-- فهرس جزئي: عنوان افتراضي واحد فقط لكل مستخدم
CREATE UNIQUE INDEX uq_addresses_one_default
    ON addresses (user_id) WHERE is_default;

CREATE TABLE refresh_tokens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 hex — لا نخزّن التوكن نفسه
    family_id  UUID        NOT NULL,          -- لكشف إعادة استخدام توكن مسحوب
    user_agent VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_user   ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_family ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_expiry ON refresh_tokens (expires_at) WHERE revoked_at IS NULL;
