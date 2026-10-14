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

---

## S-25 — Change role, remove member, leave business (no new migration)

**Status: code done; no migration to apply.** The three RPCs
(`change_member_role`, `remove_member`, `leave_business`) already ship in
migration 0002; this story is the client-side management UI on top of them.
The only human steps are the SQL regression test and a two-account UI pass.

1. Prerequisite: migrations 0001 and 0002 applied (S-05/S-06 sections
   above).
2. Run `supabase/tests/0002c_membership_management.sql` (SQL editor or
   `psql -f`) — it passes: owner changes a role, owner row protected
   (no promote-to-owner, no remove, no leave), removed member loses all
   access while their history stays, a member can leave, creator name
   degrades to NULL → "Former member" once the profile is gone.
3. **UI check (two accounts):** as the owner, open Members — the owner
   row has no actions menu; on the other member's row, change their role
   and confirm the toast and badge update; choose Remove, confirm
   `Remove <name>`, and the member disappears and (as them) can no longer
   open the business. As an editor/viewer, Members shows a **Leave
   business** button — confirm it and you land on `/businesses`; as the
   owner, the button is replaced by the note "Owners cannot leave. Delete
   the business instead."

---

## S-27 — Lost-access handling (file: `supabase/migrations/0003b_business_exists.sql`)

**Status: written, not yet applied.** When a member is removed or a
business is deleted while someone is viewing it, both look identical on
the client — the business simply vanishes from the RLS-filtered
membership list — yet the S-27 scenarios require two different
messages. `business_exists(uuid)` is a tiny security-definer probe that
answers one bit (does the row exist) so the client can tell them apart.
It exposes nothing else: business ids are random UUIDs, and only the
existence boolean crosses the boundary. Without it the app still works
— the client falls back to the "You no longer have access" message.

1. Backup (same habit as S-05/S-06).
2. Apply `supabase/migrations/0003b_business_exists.sql` (`supabase db
   push` or paste into the SQL editor).
3. **Verify:** `select proname from pg_proc where proname =
   'business_exists';` returns 1 row; run
   `supabase/tests/0003b_business_exists.sql` — it passes (owner, member
   and outsider all see an existing business, a missing id is false
   rather than an error, removal keeps it true while deletion flips it
   to false, and `anon` cannot execute it).
4. **UI check (two accounts):** as a member viewing `/b/<id>/…`, have
   the owner remove you, then switch to another tab and back (the
   memberships refetch on focus) — you see "You no longer have access to
   <name>" and land on `/businesses`. Repeat with the business deleted
   instead of the membership: "This business no longer exists" and the
   landing resolver. As an owner-demotion check: as an editor with the
   settings form open, have the owner make you a Viewer and press Save —
   the save fails with a forbidden toast and the page turns read-only.

---

## S-28 — Customers list server-side query (no new migration)

**Status: code done; no migration to apply.** Every scenario is covered
by mocked-API tests, but the actual PostgREST query (`queryCustomers`:
name/phone `ilike` search, balance filters and sort through the
`customer_balances` view, exact counts, embedded last activity) only
runs against the real database here. Prerequisite: migrations 0001 and
0002 applied, and a business with customers (ideally a few hundred, a
mix of owed/owing/settled, some without transactions).

1. Open Customers — the table shows avatar/name/tags, phone, balance
   badge, last activity (em dash when there are no transactions) and the
   added date; the footer reads "Showing 1–Y of Z" with the pager
   enabled only where it should be; the summary strip shows totals for
   **all** customers even while a filter narrows the table.
2. Search: type part of a name (`ash` — case-insensitive) and part of a
   phone; results change after the debounce and `?q=` appears in the
   URL. Also try a phone typed with punctuation (`(0171)`) — it still
   matches (the query escapes LIKE wildcards and the `or=(…)` syntax
   characters instead of erroring).
3. Combine: set a balance filter (aria-pressed chip + `?status=`), click
   the Customer/Balance/Added headers (`?sort=` changes, `aria-sort`
   updates, ordering switches server-side), go to page 2 (`?page=`).
   Reload the full URL — same view restored; the back button steps back
   through filter/sort/page changes; changing any filter returns to
   page 1.
4. Ctrl/Cmd+K (or the top bar Search button): the palette finds
   customers as you type and ArrowDown/Enter or a click opens the detail
   page; on `/businesses` it explains no business is open and issues no
   query.
5. Viewer account: no Add customer / Import CSV buttons, row menu shows
   only View; an empty business shows the "Add your first customer"
   invitation (text only for the viewer); a nonsense search shows the
   distinct no-results state and **Clear filters** resets it.

---

## S-30 - Archive, restore and permanent delete (migration 0004)

**Status: code done; migration 0004 and SQL test 0004 must be applied
here** (they are written but never executed by the build agent). The
code queries `customers.archived_at`, so the customers list stops
working until 0004 is in. Prerequisites: migrations 0001-0003b applied.

1. Apply `supabase/migrations/0004_customer_archive_delete.sql`
   (SQL Editor or `supabase db push`). It: adds `customers.archived_at`
   + index, recreates the `customer_balances` view (now exposes
   `archived_at`, still includes archived rows), recreates
   `dashboard_summary` (finally excludes archived - its C-6 comment
   promised it), adds the owner-only `delete_customer_permanently`
   RPC with its grants.
2. Run `supabase/tests/0004_archive_delete_customers.sql` - it must
   finish with no exception (any "TEST FAILED" is a regression). It
   proves: viewer's archive attempt changes nothing, editor archives,
   history and balances survive, dashboard totals drop the archived
   customer, restore brings everything back, Editor/Viewer/outsider
   get 42501 from the RPC, a wrong business id is "Customer not found",
   the Owner's call removes customer + all transactions atomically
   (bystander untouched), and anon cannot execute the function.
3. UI pass as Owner (business with an active customer that has
   transactions and a non-zero balance):
   - Row menu > Archive: the dialog states the exact transaction count
     and (balance != 0) the "left out of lists and dashboard totals"
     warning > **Archive customer**: row vanishes, toast "Customer
     archived" shows **Undo** for 8 s > click Undo: row returns with
     balance intact.
   - Re-archive > the **Archived** chip: the row appears with its
     balance and the Archived marker; "Customers" strip count excludes
     it; Ctrl/Cmd+K palette no longer finds her; clear the filter >
     **Restore** from the menu: she is back in the active list.
   - Archived row > **Delete permanently**: confirm stays disabled
     until the exact name is typed > confirm: row and her transactions
     are gone (detail URL 404s/empty, transactions list has no rows
     for her).
4. As Editor: Archive and Restore work; the archived row's menu has
   **no** Delete permanently. As Viewer: both active and archived row
   menus show only View.

---

## S-32 — Add transaction sheet (no new migration)

**Status: code done; no migration to apply.** The sheet writes through
the same `createTransaction` the v1 sheets used (`source: "manual"`,
`created_by` and `business_id` set client-side, RLS enforced
server-side), and the live preview reads the `customer_balances` view —
so nothing here needs schema work. Prerequisites: migrations 0001-0004
applied; a business with a customer that has a non-zero balance and at
least one older transaction.

1. Top bar > **Add transaction**: the sheet opens with the searchable
   customer picker first and **Amount focused**; pick a customer → the
   **Current balance** strip appears; type an amount → **Balance
   after** updates live; Enter saves; Escape closes and focus returns
   to the top-bar button.
2. Customer row menu > **Add transaction** (preselected — the picker
   already shows her name): switch Type to **Payment**, enter an amount
   larger than the balance → the preview flips to "You owe …" while
   typing > **Add payment**: the list row's badge now reads **You owe
   ₹…**; open her ledger → the new row is at the top and the balance
   flashed when it recalculated.
3. Validation pass: submit an empty amount, `0` and `1.234` (three
   inline messages in turn, nothing saves); tomorrow's date is refused,
   yesterday's saves; a 501-character note is refused.
4. Failure: DevTools offline > save → the sheet stays open with the
   error and every value intact > back online > save again succeeds.
5. "Customer added" toast: add a customer, click the toast's **Add
   transaction** → the sheet opens with that new customer preselected.
6. As Viewer: no **Add transaction** in the top bar, no **Add
   Transaction** on the ledger, no Add buttons on Dashboard or
   Transactions; row menus show only View. As Editor: everything above
   works (transaction rights are Owner+Editor).
