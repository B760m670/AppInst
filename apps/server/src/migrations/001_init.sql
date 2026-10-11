CREATE TABLE users (
  id                BIGINT PRIMARY KEY,               -- Telegram user id
  username          TEXT,
  first_name        TEXT,
  referrer_id       BIGINT REFERENCES users(id),
  ref_balance_minor INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE apps (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  category            TEXT NOT NULL DEFAULT 'Сервисы',
  icon_url            TEXT,
  version             TEXT,
  description         TEXT,
  min_ios             TEXT,
  -- https URL of the OTA manifest.plist, used in itms-services://?action=download-manifest
  manifest_url        TEXT,
  extra_instructions  JSONB NOT NULL DEFAULT '[]',
  popular             BOOLEAN NOT NULL DEFAULT false,
  active              BOOLEAN NOT NULL DEFAULT true,
  sort                INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id                  SERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id),
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  amount_minor        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'RUB',
  promotion_id        TEXT,
  provider            TEXT NOT NULL DEFAULT 'freekassa',
  provider_payment_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at             TIMESTAMPTZ
);
CREATE INDEX orders_user_idx ON orders(user_id);

CREATE TABLE order_items (
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  app_id       TEXT NOT NULL REFERENCES apps(id),
  price_minor  INTEGER NOT NULL,
  PRIMARY KEY (order_id, app_id)
);

CREATE TABLE purchases (
  id                  SERIAL PRIMARY KEY,
  order_id            INTEGER NOT NULL REFERENCES orders(id),
  user_id             BIGINT NOT NULL REFERENCES users(id),
  app_id              TEXT NOT NULL REFERENCES apps(id),
  app_version         TEXT,
  amount_minor        INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'available'
                      CHECK (status IN ('available', 'installing', 'installed', 'expired', 'refunded')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  install_started_at  TIMESTAMPTZ,
  install_expires_at  TIMESTAMPTZ,
  installed_at        TIMESTAMPTZ,
  UNIQUE (order_id, app_id)
);
CREATE INDEX purchases_user_idx ON purchases(user_id);

CREATE TABLE referral_transactions (
  id            SERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id),
  kind          TEXT NOT NULL CHECK (kind IN ('accrual', 'payout')),
  amount_minor  INTEGER NOT NULL,
  order_id      INTEGER REFERENCES orders(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, kind)
);

CREATE TABLE payouts (
  id            SERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id),
  amount_minor  INTEGER NOT NULL,
  details       TEXT,
  status        TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'completed', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  JSONB NOT NULL
);
