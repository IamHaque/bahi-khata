-- ============================================================
-- BahiKhata — Initial Schema
-- Generated from live Supabase project (nhjjanrrismmrfeyiegp)
-- via SQL Editor queries on 2026-09-13.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Custom enum types
-- ------------------------------------------------------------

CREATE TYPE transaction_type AS ENUM ('charge', 'payment');
CREATE TYPE transaction_status AS ENUM ('active', 'edited', 'voided');
CREATE TYPE transaction_source AS ENUM ('manual', 'import');

-- ------------------------------------------------------------
-- 2. customers
-- ------------------------------------------------------------

CREATE TABLE customers (
  id          UUID NOT NULL DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  alternate_contact_name   TEXT,
  alternate_contact_phone  TEXT,
  tags        TEXT[],
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT customers_pkey PRIMARY KEY (id)
);

-- ------------------------------------------------------------
-- 3. transactions
-- ------------------------------------------------------------

CREATE TABLE transactions (
  id           UUID NOT NULL DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL,
  type         transaction_type   NOT NULL,
  amount       NUMERIC            NOT NULL,
  occurred_at  TIMESTAMPTZ        NOT NULL,
  note         TEXT,
  status       transaction_status NOT NULL DEFAULT 'active',
  source       transaction_source NOT NULL DEFAULT 'manual',
  created_by   UUID NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT transactions_pkey PRIMARY KEY (id),
  CONSTRAINT transactions_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT transactions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users (id)
);

-- ------------------------------------------------------------
-- 4. Row-Level Security
-- ------------------------------------------------------------

ALTER TABLE customers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policy: customers
-- Authenticated users have full read/write access to all rows.
CREATE POLICY "Authenticated users can manage customers"
  ON customers
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: transactions
-- Authenticated users have full read/write access to all rows.
CREATE POLICY "Authenticated users can manage transactions"
  ON transactions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
