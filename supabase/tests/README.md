# Supabase SQL tests (RLS, integrity and RPC behaviour)

One consolidated suite proves the database enforces the rules the UI also
enforces: row-level security per role, referential integrity, RPC
behaviour, audit stamping and the v3 deletion/restore flow. It is plain
SQL on purpose: it runs anywhere a Postgres connection is available and
needs no extra tooling.

## How to run

```sh
npm run test:sql          # = bash scripts/run-sql-tests.sh
```

`DATABASE_URL` must point at a **scratch** database with all three
migrations applied in filename order — never a real Supabase project: the
runner installs a stub `auth` schema and the `anon`/`authenticated` roles
first (see `ci/supabase_stub.sql`). CI runs exactly this in the `sql` job
against a throwaway `postgres:16` service.

The runner stops at the first failure; success prints one NOTICE per
section and ends with `==> SQL tests passed`.

## Structure

- **One transaction, rolled back at the end** — nothing is ever committed,
  so runs are repeatable and leave no data behind.
- **Shared helpers live at the top** (in `pg_temp`): fixture creators and
  assertion helpers used by every section.
- **Each section runs inside its own savepoint** and ends with
  `rollback to savepoint`, so every section starts from an empty database
  and can reuse the same fixture UUIDs without colliding.
- Any failure raises `TEST FAILED: <what> — expected X, got Y` and stops.

## Sections (19)

| # | Section | Origin |
| --- | --- | --- |
| 01 | Schema contract | new |
| 02 | Foundation triggers, constraints, `create_business()` | new (0001) |
| 03 | Membership RLS | was `0002_rls_membership` |
| 04 | `my_invitations()` | was `0002b_my_invitations` |
| 05 | Membership management | was `0002c_membership_management` |
| 06 | `business_exists()` | was `0003b_business_exists` |
| 07 | Archive / restore / permanent delete of customers | was `0004_archive_delete_customers` |
| 08 | Void with reason / `restore_transaction()` | was `0005_void_restore` |
| 09 | `customer_ledger()` running balance | was `0006_customer_ledger` |
| 10 | `transaction_rollup()` | was `0006b_transaction_rollup` (+ new) |
| 11 | `daily_activity()` | was `0007_daily_activity` |
| 12 | `import_history()` | was `0008_import_history` |
| 13 | `customer_balances` view + embed relationship | new (0009, 0010) |
| 14 | Hardening: function privileges, `business_id` immutability | new |
| 15 | `delete_transaction()` + deletion log | new (v3) |
| 16 | Delete a customer + restore deleted items | new (v3) |
| 17 | Actor stamping (audit integrity) | new (v3) |
| 18 | `last_activity_at` + timezone-aware dashboard | new (v3) |
| 19 | `last_payment_at` (Who to chase) | new (v3.1) |

The ten per-migration files these replaced are archived in
`supabase/tests_archive/` (the migrations themselves live in
`supabase/migrations_archive/`).

## Adding tests

**Add a new section for every new migration.** Same pattern: a savepoint,
fixtures via the shared helpers, assertions, `rollback to savepoint`, and
a `NOTICE '--- NN <name>'` header so the run output stays readable. When a
migration changes behaviour, update its section in the same change.

Fixtures are fake UUIDs with `@example.com` emails — no secrets, ever.
