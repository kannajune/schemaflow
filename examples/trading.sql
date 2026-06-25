-- Sample trading schema (Auto-Trade-style) to exercise SchemaFlow.
-- Mix of DECLARED foreign keys (solid edges) and IMPLICIT *_id columns
-- with no constraint (dashed/inferred edges) — exactly the real-world case.

CREATE TABLE users (
  id          BIGINT PRIMARY KEY,
  email       VARCHAR(255) NOT NULL,
  created_at  TIMESTAMP NOT NULL
);

CREATE TABLE accounts (
  id        BIGINT PRIMARY KEY,
  user_id   BIGINT NOT NULL REFERENCES users(id),   -- declared FK
  broker    VARCHAR(50) NOT NULL,
  balance   NUMERIC(18,2) NOT NULL
);

CREATE TABLE instruments (
  id         BIGINT PRIMARY KEY,
  symbol     VARCHAR(32) NOT NULL,
  exchange   VARCHAR(16) NOT NULL,
  tick_size  NUMERIC(10,4)
);

CREATE TABLE orders (
  id             BIGINT PRIMARY KEY,
  account_id     BIGINT NOT NULL,        -- implicit FK (no constraint)
  instrument_id  BIGINT NOT NULL,        -- implicit FK
  side           VARCHAR(4) NOT NULL,
  qty            INTEGER NOT NULL,
  price          NUMERIC(18,4),
  status         VARCHAR(16) NOT NULL,
  created_at     TIMESTAMP NOT NULL
);

CREATE TABLE trades (
  id             BIGINT PRIMARY KEY,
  order_id       BIGINT NOT NULL,
  instrument_id  BIGINT NOT NULL,        -- implicit FK
  fill_price     NUMERIC(18,4) NOT NULL,
  fill_qty       INTEGER NOT NULL,
  executed_at    TIMESTAMP NOT NULL,
  CONSTRAINT fk_trade_order FOREIGN KEY (order_id) REFERENCES orders(id)  -- declared FK
);

CREATE TABLE positions (
  id             BIGINT PRIMARY KEY,
  account_id     BIGINT NOT NULL,        -- implicit FK
  instrument_id  BIGINT NOT NULL,        -- implicit FK
  net_qty        INTEGER NOT NULL,
  avg_price      NUMERIC(18,4) NOT NULL,
  pnl            NUMERIC(18,2)
);
