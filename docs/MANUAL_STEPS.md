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
| `0002_membership_rls.sql` | S-06 | membership-based RLS, RPCs, secure views |
| `0002b_my_invitations.sql` | S-24 | `my_invitations()` — invitee's pending invitations with display names |
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

## S-06 — Membership-based RLS, RPCs, secure views (file: `supabase/migrations/0002_membership_rls.sql`)

**Status: written, not yet applied.**

1. Prerequisite: S-05 applied.
2. Apply `supabase/migrations/0002_membership_rls.sql` (idempotent).
3. **Verify:**
   - Run `supabase/tests/0002_rls_membership.sql` (see
     `supabase/tests/README.md`) — it must complete without a
     `TEST FAILED` exception.
   - Spot-check that the old policies still exist (they are only dropped in
     S-020): `\dp customers` still lists
     `Authenticated users can manage customers`.
4. **Rollback:** drop the new policies/functions/view (script in a comment
   at the end of the migration file); the old policies and the S-05 schema
   remain, so the app keeps working.

## S-19 — Verify the delete cascade leaves no orphans (human check)

**Status: code done; this DB check is pending the S-05/S-06 migrations.**
The story's "Done when" requires deletion to be verified against a real
business that has members and invitations. Run this after 0001/0002 are
applied (and re-run any time the cascade is in doubt). Never run it against
a business you want to keep.

1. Prerequisite: S-05 and S-06 applied; you are signed in as the owner of a
   test business (create one in the app if needed).
2. Note the business id: `select id, name from businesses;`
3. Delete it the way the app does (Settings → Danger zone) — or, to test the
   database directly: `delete from businesses where id = '<id>';`
4. **Verify — none of these may return rows:**
   - `select count(*) from customers where business_id = '<id>';`
   - `select count(*) from transactions where business_id = '<id>';`
   - `select count(*) from business_members where business_id = '<id>';`
   - `select count(*) from business_invitations where business_id = '<id>';`
5. **Negative check:** as a non-owner (viewer/editor account), the same
   delete must affect zero rows —
   `delete from businesses where id = '<id of a business you do not own>';`
   reports `DELETE 0` (RLS filters it).

## S-20 — Enforce tenancy (pending — READ BEFORE RUNNING)

**This is the only destructive migration (`0003_enforce_tenancy.sql`). Do
not run it before the backfill below, and DO NOT DEPLOY the
`feat/v2-multi-business` branch before it has been applied — from S-20 on,
the client code requires a businessId everywhere, so pre-v2 database
policies and NULL-business rows must be gone first.**

1. **Backup first** (as in S-05): Supabase Dashboard → Database →
   Backups, or `pg_dump` of the project.
2. **Backfill legacy data:** the product owner supplies the Google email
   of the account that should own the existing customers/transactions
   (the only step that needs it). Open
   `supabase/manual/backfill_legacy_data.sql`, set that email in
   section 1, then run the file as postgres in one go. It creates a
   business for the user if they own none, assigns every NULL
   `business_id` row to it (customers first — the 0001 match trigger
   requires it), prints the counts and is safe to re-run.
   **Verify:** `select count(*) from customers where business_id is null;`
   returns 0 (same for transactions), and the notices report
   `created=false` on a second run.
3. Apply `supabase/migrations/0003_enforce_tenancy.sql` (`supabase db
   push` or the dashboard). It aborts with a pointer to the backfill
   script if any NULL `business_id` remains, then makes `business_id`
   NOT NULL, drops the two v1 broad policies and drops the unscoped
   balance RPCs.
4. **Verify:** `\d customers` and `\d transactions` show `business_id` as
   `NOT NULL`; `select policyname from pg_policies where tablename in
   ('customers','transactions');` lists only the membership policies from
   0002; `select proname from pg_proc where proname in
   ('get_customer_balance','get_all_customer_balances');` returns 0 rows;
   the S-06 SQL tests (`supabase/tests/0002_rls_membership.sql`) pass —
   after 0003 their expand-phase workaround drops are `if exists`
   no-ops.
5. **Rollback:** not automatic — restore from the backup taken in step 1.
6. **Fresh-database smoke (S-20):** on a clean project (no legacy data),
   sign up, create a business, add a customer and add a charge — all four
   must work with the new NOT NULL columns and membership-only policies.
7. **Isolation proof (S-20):** with two accounts, each owning a business
   with one customer: as user A, note the customer id. As user B,
   `select * from customers where id = '<A''s customer id>';` returns 0
   rows, and `update customers set name = 'x' where id = '<...>';` reports
   `UPDATE 0`. Repeat in the other direction.

---

## S-24 — `my_invitations()` for the invitee flow (file: `supabase/migrations/0002b_my_invitations.sql`)

**Status: written, not yet applied.** An invitee is not a member, so
row-level security correctly hides `businesses` and `profiles` from them —
but the S-24 scenario requires the invitation list to show the business
name and inviter. `my_invitations()` is a small security-definer function
that joins exactly those display fields for the caller's own pending
invitations (matched on the JWT email, case-insensitively; the caller
passes no arguments). It sorts between 0002 and 0003, so `db push`
applies it right after the membership schema; it has no dependency on
0003. Without it the app still works; the invitation list is simply
empty.

1. Backup (same as S-06: the dashboard's "Download backup" or
   `pg_dump`). The function is additive, but the habit stands.
2. Apply `supabase/migrations/0002b_my_invitations.sql` (`supabase db
   push` or paste into the SQL editor).
3. **Verify:** `select proname from pg_proc where proname =
   'my_invitations';` returns 1 row; run
   `supabase/tests/0002b_my_invitations.sql` — it passes (invitee sees
   their invitation with names, outsider sees nothing, answered
   invitations leave the list, re-accepting an existing member succeeds
   without a duplicate row).
4. **UI check:** with two accounts — as the owner, invite the second
   account; sign in as the invitee: the top bar shows the count badge,
   `/businesses` lists the invitation with business name, inviter and
   role; Accept shows "You joined …" with an Open business action;
   Decline removes the card.
