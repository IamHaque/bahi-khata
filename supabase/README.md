# Supabase — BahiKhata

This directory contains the version-controlled database schema and security policies for BahiKhata.

## Structure

```
supabase/
  migrations/                  # SQL migration files (run in order)
  tests/                       # SQL tests for RLS and integrity
  manual/                      # one-off scripts a human runs (backfill)
  RLS.md                       # Row-Level Security policy documentation
  README.md                    # This file
```

## Baseline (v1) — already exported and applied

The v1 schema was exported from the live Supabase project
(`nhjjanrrismmrfeyiegp`) via SQL Editor queries on 2026-09-13 and is stored
as two migrations:

- `migrations/20260913152312_remote_schema.sql` — enums, `customers`,
  `transactions`, wide-open RLS policies (create-if-not-exists style)
- `migrations/20260913170000_add_balance_rpc_functions.sql` —
  `get_customer_balance`, `get_all_customer_balances` RPCs

These two files **are** the versioned baseline (S-03). They match the S-01
audit in `docs/ARCHITECTURE-BASELINE.md` §5. New v2 migrations continue the
numbering at `0001` (see `docs/MANUAL_STEPS.md` for the full order).

## Applying Migrations

See **`docs/MANUAL_STEPS.md`** for the ordered, copy-paste procedure
(including backups, verification and rollback notes). Short version:

1. Create a new Supabase project at https://supabase.com/dashboard
2. Go to the **SQL Editor** in the dashboard
3. Run each migration file in `migrations/` in filename order
4. The latest migration is: `20260913170000_add_balance_rpc_functions.sql` (v1 baseline)

Alternatively, with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push    # applies pending migrations to the remote database
```

## Applying Migrations Locally (with Supabase CLI)

```bash
supabase start        # starts local Supabase instance via Docker
supabase db reset     # resets local DB and applies all migrations
```

## What the Schema Contains

- **`customers`** — Customer records (name, phone, email, address, tags, notes)
- **`transactions`** — Ledger entries linked to customers (charge/payment, amount, date, status)
- **Enums** — `transaction_type`, `transaction_status`, `transaction_source`
- **RLS** — Row-Level Security enabled on both tables; v1 grants all
  authenticated users full access (replaced by membership-based policies in
  S-06, enforced in S-20)

See `RLS.md` for v1 security policy details and `tests/README.md` for how
the SQL tests are run.
