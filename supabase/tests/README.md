# Supabase SQL tests (RLS and integrity)

This directory holds SQL tests that prove the database enforces the rules the
UI also enforces. They are plain SQL on purpose: they run anywhere a
Postgres connection is available and need no extra tooling.

## How a test is written

Every test file follows the same pattern:

1. **One transaction, rolled back.** The whole file runs inside
   `begin; … rollback;`. Nothing is ever committed, so tests are repeatable
   and can run against a scratch database without cleanup.
2. **Fixture setup.** Insert `auth.users` rows (the test runner uses a
   service-role connection, which bypasses RLS), then insert the rows under
   test (businesses, members, customers, transactions).
3. **Act as a specific user.** Switch role and fake the JWT:
   ```sql
   set local role authenticated;
   set local request.jwt.claims = '{"sub": "<uuid-of-user>"}';
   ```
   `auth.uid()` reads `request.jwt.claims`, so this makes RLS see that user.
4. **Assert.** Use `select` with expected results, or `do $$ … raise exception
   when … $$` blocks for negative cases (e.g. an insert that must be denied
   with a specific SQLSTATE).
5. **Old policies dropped when testing new ones.** While the v1 broad
   policies still exist (until S-20), a test that verifies the *new*
   membership-based policies drops the old ones first inside the transaction:
   ```sql
   drop policy "Authenticated users can manage customers" on customers;
   drop policy "Authenticated users can manage transactions" on transactions;
   ```
   From S-20 onwards the old policies are gone for good and these lines are
   removed from the tests.

## How to run

The tests need a real Postgres with the schema applied (migrations
`20260913152312` and `20260913170000`, then `0001`+ in order). Two options:

**Option A — Supabase SQL Editor (no local tooling)**

1. Open the dashboard of a scratch project (never production).
2. Apply the migrations in order (see `docs/MANUAL_STEPS.md`).
3. Open the SQL Editor, paste one test file, run it.
4. A passing file returns the assertion selects and finishes without error;
   a failing file raises an exception with the assertion message.

The SQL Editor connects as `postgres` (service role), which can insert into
`auth.users` and drop/create policies — everything the tests need.

**Option B — psql against a local Supabase CLI stack**

```bash
supabase start
psql "postgresql://postgres:postgres@localhost:5432/postgres" -f supabase/tests/<file>.sql
```

`supabase start` requires Docker. The same file works in both options.

## Conventions

- File names: `NNNN_description.sql` matching the story that adds them
  (`0006_rls_membership.sql`, `0007_delete_customer.sql`, …).
- Each file must be safe to re-run (transaction + `if exists` guards).
- Never put secrets in test files; fixture users are fake UUIDs with
  `@example.com` emails.
- When a new migration changes a policy, update the affected test in the
  same story — the test suite is the regression net for RLS.

## What exists so far

- `0002_rls_membership.sql` (S-06) — proves members-read/outsiders-don't,
  viewer read-only, editor write/no-destroy, owner control, secure views,
  invitation visibility and `respond_to_invitation`, including the
  cross-business transaction rejection from the 0001 trigger. It drops the
  v1 broad policies inside its transaction, exactly as described above.
- `0002b_my_invitations.sql` (S-24) — proves `my_invitations()` returns the
  invitee's own pending invitations joined with business and inviter names
  (case-insensitive JWT email match), returns nothing for outsiders,
  drops answered invitations from the list, and that accepting while
  already a member succeeds without a duplicate membership row.
- `0002c_membership_management.sql` (S-25) — proves the membership-management
  scenarios against the 0002 RPCs: the owner changes a role, promotion to
  owner and touching/removing the owner row are refused, an owner cannot
  leave, a removed member loses all access while their customers and
  transactions stay put, a member can leave themselves, and the history
  contract (creator name resolves while the profile row is readable, degrades
  to NULL → "Former member" once it is not, transaction never moves).
