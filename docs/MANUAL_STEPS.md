# Manual steps a human must run

The build agent writes SQL but never runs it against a real database. This
file is the ordered, copy-paste procedure for everything that needs a human
with dashboard or CLI access. Each entry names the exact files, the order,
and how to verify success.

**Current state (2026-10-11, branch `feat/v2-multi-business`):** no manual
steps are required yet. The v1 baseline migrations are already applied to the
live project (they were exported from it). The first required step arrives
with **S-05** (migration `0001`).

---

## 0. How to apply migrations (reference)

Migrations live in `supabase/migrations/` and are numbered in the order they
must be applied:

| File | Story | Purpose |
| --- | --- | --- |
| `20260913152312_remote_schema.sql` | v1 (already applied) | customers, transactions, enums, wide-open RLS |
| `20260913170000_add_balance_rpc_functions.sql` | v1 (already applied) | balance RPC functions |
| `0001_multi_business_schema.sql` | S-05 | additive multi-business schema |
| `0002_*.sql` | S-06 | membership-based RLS, RPCs, secure views |
| `0003_*.sql` | S-20 | enforce tenancy (drops old policies, makes business_id mandatory) |
| `0004_*.sql` | S-30 | permanent customer delete RPC |
| `0005_*.sql` | S-34 | void_reason column |
| `0006_*.sql` | S-31 | customer_ledger RPC |
| `0007_*.sql` | S-37 | daily_activity RPC |
| `0008_*.sql` | S-38 | import RPC |

**To apply a migration:**

- *SQL Dashboard:* open the SQL Editor, paste the file contents, run.
- *CLI:* `supabase db push` (after `supabase link --project-ref <ref>`).

**Warning — do not run the baseline migrations against a database that
already has these tables without diffing first.** The v1 files are written
with `create if not exists` / duplicate-object guards, so they are safe to
re-run on the live project, but always run `supabase db diff` (or compare
the table list in the dashboard with `docs/ARCHITECTURE-BASELINE.md` §5)
before applying anything to an existing database. Never apply migrations to
production without a backup (see the backup step in each S-entry below).

---

## S-05 — Additive multi-business schema (file: `supabase/migrations/0001_multi_business_schema.sql`)

**Status: written, not yet applied.** The branch works without it (the app
does not use the new tables/columns yet), but every later story assumes it.

1. **Backup first (production only):** Dashboard → Database → Backups, or
   `pg_dump "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" -f backup_$(date +%F).sql`
2. Apply `supabase/migrations/0001_multi_business_schema.sql` (SQL Editor
   or `supabase db push`). It is idempotent — safe to re-run.
3. **Verify:**
   - `\dt` shows `profiles`, `businesses`, `business_members`,
     `business_invitations` in addition to `customers`/`transactions`.
   - `\d customers` shows `business_id`, `created_by`, `deleted_at`,
     `deleted_by` columns (all nullable); `\d transactions` shows
     `business_id`, `updated_by`, `voided_at`, `voided_by`.
   - Inserting a second business for the same `owner_id` fails with a unique
     violation on `businesses_one_per_owner`.
   - Creating a business inserts exactly one `business_members` row with
     role `owner` (trigger).
   - Inserting a transaction whose `business_id` differs from its
     customer's `business_id` is rejected by the match trigger.
   - The existing app still lists customers and adds transactions (both
     write null `business_id`, which the trigger allows).
4. **Rollback:** the migration is additive; dropping the new tables and
   columns restores v1 (script included as a comment at the end of the
   migration file).

## S-06 — Membership-based RLS, RPCs, secure views (pending)

1. Prerequisite: S-05 applied.
2. Apply `supabase/migrations/0002_*.sql` in order.
3. **Verify:** run the SQL tests in `supabase/tests/` (see
   `supabase/tests/README.md`) — all must pass. Spot-check that the old
   policies still exist (they are only dropped in S-20).
4. **Rollback:** drop the new policies/functions; the old policies and the
   S-05 schema remain, so the app keeps working.

## S-20 — Enforce tenancy (pending — READ BEFORE RUNNING)

**This is the only destructive migration (0003). Do not run it before the
backfill below, and do not deploy the branch before it has been run once.**

1. **Backup first** (as in S-05).
2. **Backfill legacy data:** the product owner supplies the Google email of
   the account that should own the existing customers/transactions. Run
   `supabase/manual/backfill_legacy_data.sql` with that email. It creates a
   business for the user if they own none and assigns every row with a null
   `business_id` to it. It prints row counts and is safe to re-run.
   **Verify:** `select count(*) from customers where business_id is null;`
   returns 0 (same for transactions).
3. Apply `supabase/migrations/0003_*.sql`. It aborts with a pointer to the
   backfill script if any null `business_id` remains.
4. **Verify:** `\d customers` and `\d transactions` show `business_id` as
   `NOT NULL`; the old `Authenticated users can manage …` policies are gone;
   the S-06 SQL tests pass without the rollback workaround.
5. **Rollback:** not automatic — restore from the backup taken in step 1.
