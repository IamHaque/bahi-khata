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

---

## S-33 — Edit transaction (no new migration)

**Status: code done; no migration to apply.** Editing goes through the
same sheet and the same RLS-scoped `updateTransaction` as before; the
only server-side difference is the `updated_by` stamp on the existing
column (migration 0001). Prerequisites: migrations 0001-0004 applied;
a customer with at least one transaction, ideally one imported row
(source "import") and two members so an edit can be done by the
second member.

1. Customer ledger > pencil on a row: the sheet opens titled **Edit
   transaction** with Type/Amount/Date/Note prefilled and the customer
   shown as text (no picker); change the amount → **Balance after**
   updates live (it removes the old entry's effect first) > **Save
   changes**: the row keeps its spot, the balance flashes the
   recalculated number, and the row now shows an **Edited** pill.
2. Hover and then keyboard-focus the Edited pill: the tooltip/sr text
   reads "Edited by <name> on <date>, <time>" of the moment of the
   save. If the editor has since left the business, it reads "Former
   member" instead of a name.
3. Validation: try an amount of 0 and tomorrow's date — same inline
   messages as adding, nothing saves; the customer never changes.
4. Imported row: edit its amount → it saves, still shows **Imported**
   as its source on the transaction detail page, and its `created_by`
   never changed.
5. Edit a note to empty and save → reopening shows the note empty (v1
   kept the old note).
6. As Viewer: no pencil on the ledger and no Edit button on the
   transaction detail page.
7. Void/restore still live in the v1 sheet opened from the
   **transaction detail page**'s Edit button — unchanged until S-34.

---

## S-34 — Void and restore transactions (migration 0005)

**Status: code done; migration 0005 and SQL test 0005 must be applied
here** (they are written but never executed by the build agent). Until
0005 is in, Void still works (it is a plain column update) but
**Restore fails** ("function restore_transaction does not exist") and
the detail page cannot show a void reason. Prerequisites: migrations
0001-0004 applied.

1. Apply `supabase/migrations/0005_void_reason_restore.sql` (SQL
   Editor or `supabase db push`). It: adds `transactions.void_reason`
   (nullable — voids without a reason are legal), adds the
   security-invoker `restore_transaction(transaction_id, business_id)`
   RPC — the restored status is the row's to decide ("edited" if
   `updated_by` is set, else "active") and the void's stamps are
   cleared — with its grants.
2. Run `supabase/tests/0005_void_restore.sql` — it must finish with
   no exception (any "TEST FAILED" is a regression). It proves:
   viewer's void attempt changes nothing; editor voids with a reason;
   the restore marker (`updated_by`) survives the void untouched; the
   balance view and dashboard totals stop counting the voided row;
   restore brings a never-edited row back **active** and an
   edited-before row back **edited**; restoring a non-voided row, a
   mismatched business id and an outsider's call all end in "Void
   transaction not found."; anon cannot execute the function.
3. UI pass as Owner (a customer with a payment and — ideally — a row
   that was edited before, plus a second member for step 5):
   - Ledger row > ban icon (**Void payment of ₹500**): the
     confirmation asks "Void this payment of ₹500?" with an optional
     Reason (capped at 200 characters) and a **Void transaction**
     button > confirm: the row *stays* with a **Voided** badge and a
     struck-through amount, the balance flashes without it, and the
     toast "Transaction voided." offers **Undo** for 8 s > click Undo:
     the row counts again.
   - Void a row that carries the **Edited** badge > **Restore**: it
     comes back **Edited**. Void a never-edited row > **Restore**: it
     comes back **Active**.
   - Transaction detail page: **Void** uses the same dialog; the
     voided view shows **Void reason** ("No reason given" when
     empty); **Restore** works from the page; **Edit** opens the
     shared edit sheet (the v1 sheet is gone for good).
   - Cancel the confirmation: nothing changes.
   - Balance + dashboard: after a void, the customer balance and the
     dashboard receivable stop counting the row (they excluded voided
     server-side all along — now the UI proves it).
4. As Editor: void and restore work. As Viewer: no Void, no Restore
   anywhere; the ledger rows stay readable.

## S-31 — Customer detail v2 (migration 0006)

**Status: code done; migration 0006 and SQL test 0006 must be applied
here** (written, never executed by the build agent). Until 0006 is in,
the customer detail page's ledger **cannot load** ("function
customer_ledger does not exist" — the page shows the ledger ErrorState
with **Try again**; the header, balance hero and Details tab still
work). Prerequisites: migrations 0001-0005 applied.

1. Apply `supabase/migrations/0006_customer_ledger.sql` (SQL Editor or
   `supabase db push`). It adds the security-INVOKER, `stable`
   `customer_ledger(p_customer_id, p_business_id)` RPC: the customer's
   transactions newest-first, each carrying `balance_after` — the
   windowed `sum(charge ? amount : -amount) filter (where status in
   ('active','edited'))` in date order, i.e. the running balance with
   voided rows contributing nothing, computed as NUMERIC in the
   database. Grants: `authenticated` only (revoked from `public`,
   `anon`); RLS still scopes the read because the function is a
   security invoker.
2. Run `supabase/tests/0006_customer_ledger.sql` — it must finish with
   no exception (any "TEST FAILED" is a regression). It proves: the
   running balance advances correctly in `occurred_at, id` order
   (charge 5000 → payment 500 → voided charge 300 yields 5000, 4500,
   4500 with the voided row's own `balance_after` equal to the live
   balance), rows come back newest-first with the full column set, a
   member of another business gets zero rows, and anon is refused.
3. UI pass as Owner (a customer with charges, a payment, ideally a
   voided row and one edited row):
   - Header: avatar initials, name, tags, `tel:` phone and `mailto:`
     email links (tap on mobile), address; **Edit** opens the feature
     form dialog; the ⋯ menu (**Customer actions**) offers **Archive**
     (its confirmation names the transaction count).
   - Hero: the balance is the biggest thing on the page with its
     BalanceBadge; **Total charged** / **Total paid** / **Last
     activity** match a manual sum of the entries below (voided rows
     excluded); **Add charge** opens the shared sheet with Charge
     preselected, **Add payment** with Payment preselected.
   - Ledger: columns Date, Type, Note, Amount, Balance after — the
     balance after each row must match a hand-computed running total
     (voided rows neither muted-and-skipped nor counted); newest row
     first; an edited row shows its **Edited** badge, a voided row is
     muted/struck with **Voided**.
   - Filters: All / Charges / Payments segment correctly; **Show
     voided** starts ON — switching it off hides only the voided row.
   - Details tab: every profile field and notes are present and
     correct.
   - Narrow the window (≤767 px): the ledger becomes cards, each with
     its date, badges, amount, "Balance after …" and the row actions.
   - Empty: a customer with no transactions shows the EmptyState whose
     **Add charge / Add payment** buttons open the sheet; stat cards
     read ₹0.00 / "No activity yet". Error: stop the network and load
     the page → ErrorState, **Try again** re-reads.
4. As Editor: everything above works. As Viewer: all information
   readable, zero write actions (no Add charge/Add payment, no Edit,
   no ⋯ menu, no row actions).
5. As Owner with an archived customer (Customers > row menu >
   Archive): the banner "This customer is archived." appears with
   **Restore**; Add charge/Add payment/Edit/⋯/row actions are all
   hidden while the history stays visible; **Restore** brings the
   writes back.

## S-35 — Transactions page v2 (migration 0006b)

**Status: code done; migration 0006b and SQL test 0006b must be
applied here** (written, never executed by the build agent). Until
0006b is in, the transactions page **cannot summarize or total**:
the detailed list still works (it is plain PostgREST), but the
summarized view shows the ErrorState with **Try again** and the
totals footer stays at "—" ("function transaction_rollup does not
exist"). Prerequisites: migrations 0001-0006 applied.

1. Apply `supabase/migrations/0006b_transaction_rollup.sql` (SQL
   Editor or `supabase db push`). It adds the security-INVOKER,
   `stable` `transaction_rollup(...)` RPC: the same filter set as the
   detailed list (half-open date window, type, customer, search over
   customer name/phone/note, voided excluded unless asked, **archived
   customers always excluded**), grouped by day/week/month **in the
   caller's own timezone** when `p_granularity` is set, or returned
   as one ungrouped totals row when it is NULL (that row is the
   footer's "everything matching, not only the visible page").
   Grants: `authenticated` only (revoked from `public`, `anon`); the
   read is still RLS-scoped because the function is a security
   invoker. Numbered 0006b because C-5 pins 0007/0008 to S-37/S-38
   (the 0002b/0003b letter convention).
2. Run `supabase/tests/0006b_transaction_rollup.sql` — it must finish
   with no exception (any "TEST FAILED" is a regression). It proves:
   the ungrouped row equals the manual sum of the four matching
   detail rows (entries/charges/payments/net); day, week (Monday
   start) and month bucketing each equal their period's manual sum,
   newest period first; `p_include_voided` pulls the voided row back
   in; the archived customer's 999 never appears in any figure; every
   filter narrows (range, type, customer, name/phone/note search);
   `p_timezone 'Asia/Dhaka'` moves a 19:30-UTC entry to the next
   day's bucket; a member of another business gets zero rows; anon is
   refused.
3. UI pass as Owner (business with rows in several months, one voided
   row, one edited row, one imported row, one archived customer with
   history):
   - Detailed: columns Date, Customer (avatar, **linked**), Type,
     Note, Amount, Recorded by (avatar + name — a departed member
     reads "Former member"), Status (Edited / Voided / Import
     badges), newest first; sortable Date and Amount headers;
     clicking a row opens the entry; the customer link goes to that
     customer's page instead.
   - Filters: Range presets Today / This week / This month / Last 30
     days / Custom (two date inputs); default is **This month**; type
     pills; the Customer popover searches and selects; the search
     box matches customer name, phone and note (debounced); **Include
     voided** adds the muted voided rows. Each active filter shows a
     removable chip and lands in the URL (copy the address bar and
     reload — the view reproduces exactly). `?range=today` (the
     dashboard's Today link) opens with Today's chip and bounds.
   - Summarized: switch to **Summarized** — rows per day by default;
     Group by Week / Month re-cuts server-side; period labels match
     the dates; each row's Entries/Charges/Payments/Net equal a
     manual sum of the detailed rows for that period.
   - Footer: "Totals for this filter · N entries" with Charges,
     Payments, Net — flip to page 2 (or widen/narrow any filter) and
     confirm the footer follows the *filter*, not the page, and that
     it equals the manual sum over all matching rows.
   - States: reload → skeleton; filter to nothing → "No transactions
     match these filters" with the chips + **Clear filters**; a true
     empty business → "No transactions yet" with **Add Transaction**
     (opens the shared sheet); stop the network → error state, **Try
     again** re-reads.
   - Narrow the window (≤767 px): cards, full amounts (never
     truncated), row actions on the right.
4. As Editor: everything above works. As Viewer: all rows, filters
   and totals readable; no Add Transaction, no Edit/Void/Restore
   buttons anywhere.
5. Archived customer check: archive a customer with transactions
   (Customers > row menu > Archive) → their rows leave this page
   (search their name: no results), while their detail page still
   shows the history; **Restore** brings the rows back here.

## S-36 — Dashboard v2 (no new migration)

**No migration** — every figure reads the existing
`dashboard_summary(business_id)` RPC (added 0002, archived exclusion
0004). Prerequisites: migrations 0001-0004 applied (0005/0006/0006b
only affect other pages). The whole pass below is a UI check.

1. As Owner, open the dashboard of a business with data (several
   customers, some owing, some owed, one voided entry, one archived
   customer, entries recorded today):
   - Four KPI cards: **Total owes you** (the largest card, in the
     receivable colour), **Total you owe**, **Open accounts** and
     **Today's activity** (count + net). Compare each against the
     customers page / transactions page filtered to today — they must
     agree; a voided entry and the archived customer's balance appear
     in **none** of them.
   - **Top outstanding balances**: the 8 highest-owing customers with
     avatar, name and balance, biggest first; each row opens that
     customer's detail page. When nothing is owed the card reads
     "All settled — no outstanding balances."
   - **Today card → click it**: lands on Transactions with the
     "Range: Today" chip; the totals footer shows the **same** count
     and net the dashboard card showed. *Caveat (DEV-14): this holds
     except for entries recorded between local midnight and ~06:00
     (the dashboard's today is cut at DB-UTC midnight, the page's at
     the browser's midnight) — verify the click-through outside that
     window, or accept a possible off-by-the-early-hours difference.*
   - Quick actions **Add customer** (opens the dialog in place) and
     **Add Transaction** (opens the shared sheet) in the header.
   - States: reload → skeleton, stop the network → error card with
     **Try again** re-reading.
2. First run: open the dashboard of a brand-new business (no
   customers) → a **Getting started** card lists Add your first
   customer, Record your first transaction and Invite a teammate;
   each numbered step's action works (the first opens the customer
   dialog, the second the sheet, the third the Members page).
3. As Editor: same KPIs and list; quick actions and first-run steps
   1-2 present, **no** Invite step. As Viewer: every figure and the
   guidance readable, **no** Add customer / Add Transaction buttons
   anywhere.

## S-37 — Dashboard trends and activity feed (migration 0007)

**Status: code done; migration 0007 and SQL test 0007 must be applied
here** (written, never executed by the build agent). Until 0007 is in,
the dashboard's two new sections show their own error cards with
**Try again** ("function daily_activity does not exist" / the feed's
read still works — it is plain PostgREST, so only the chart fails);
the KPIs, top balances and Today link (S-36) are unaffected.
Prerequisites: migrations 0001-0006b applied.

1. Apply `supabase/migrations/0007_daily_activity.sql` (SQL Editor or
   `supabase db push`). It adds the security-INVOKER, `stable`
   `daily_activity(p_business_id, p_days, p_timezone)` RPC: one
   **zero-filled** row per day for the last `p_days` days (7/30/90),
   charges and payments summed per day **in the caller's own
   timezone**, voided rows out, edited rows in, archived customers
   out. Grants: `authenticated` only.
2. Run `supabase/tests/0007_daily_activity.sql` — it must finish with
   no exception (any "TEST FAILED" is a regression). It proves: exactly
   `p_days` zero-filled rows oldest-first; per-day figures equal the
   manual sum of that day's rows (voided 300 and archived 999 never
   appear, the edited payment does); a quiet day is `0`, never null;
   window totals equal the manual sum; 7/30/90 select the window
   length; a 19:30-UTC entry buckets **tomorrow** under
   `Asia/Dhaka`; a complete outsider gets seven all-zero days; anon
   cannot execute.
3. UI pass as Owner (business with entries on several days, one
   voided entry, one archived customer with history):
   - Dashboard → **Daily activity** card: paired bars per day
     (charges `--chart-1`, payments `--chart-2`), the visible text
     summary ("Last 7 days: charged …, paid …") matching a manual sum
     of the transactions page filtered to the same window, and the
     **7 days / 30 days / 90 days** selector re-reading each window.
   - Keyboard/screen-reader: the selector buttons carry
     `aria-pressed`; the chart's equivalent data table is in the
     accessibility tree ("Daily charges and payments, last N days")
     with one row per day including the zero days.
   - **Recent activity**: the last entries as sentences — "<who>
     recorded a charge/payment of ₹… from <customer>, <when>" — the
     customer's name opens that customer's page; a voided entry never
     appears here; archive a customer and their entries leave too. A
     departed member's entries read "Former member".
   - States: new business → "No charges or payments in the last 7
     days yet." and "No activity yet — the entries you record will
     appear here."; stop the network → each section shows its own
     error card, and **Try again** re-reads only that section.
4. As Editor and Viewer: both sections readable, nothing to write
   (the sections have no actions).

## S-38 — Business-scoped CSV import (migration 0008)

**Status: code done; migration 0008 and SQL test 0008 must be applied
here** (written, never executed by the build agent). Until 0008 is in,
the four-step flow works up to the Import click and then fails there
with "function import_history does not exist" — the page says nothing
was imported and offers **Try again** (nothing is written, by design);
preview, template and limits are unaffected (they never touch the RPC).
Prerequisites: migrations 0001-0006b applied.

1. Apply `supabase/migrations/0008_import_history.sql` (SQL Editor or
   `supabase db push`). It adds the security-INVOKER
   `import_history(p_business_id, p_customers, p_transactions)` RPC:
   creates the new customers, **re-matches every transaction by name +
   phone inside this business** (existing ∪ just-created), refuses a
   match on an archived customer with "Customer is archived. Restore
   them first.", tags every row `source = 'import'` with its historical
   date, and runs as ONE transaction — any error rolls the whole
   import back. Grants: `authenticated` only; tenancy is the caller's
   RLS on the inserts.
2. Run `supabase/tests/0008_import_history.sql` — it must finish with
   no exception (any "TEST FAILED" is a regression). It proves: the
   happy path creates customers + transactions with counts and
   historical dates; phone distinguishes same-name customers; another
   business's same-named customer never matches; archived match raises
   the pinned reason **and** rolls back the new customer created in the
   same call; an outsider's import persists nothing; anon cannot
   execute.
3. UI pass as Owner (business with existing customers, one archived):
   - Sidebar: an **Import** link sits between Customers and
     Transactions. Import → four steps (Upload · Review · Import ·
     Done). **Download template** produces a CSV whose headers are
     `customer_name,customer_phone,type,amount,date,note`.
   - Upload a mixed file (a few valid rows, one row with a bad type,
     one with no name, one row matching the archived customer): the
     review shows the per-customer summary (transactions count,
     resulting balance = current balance + the file's effect,
     New/Existing), the error table with row numbers and reasons
     (including "Customer is archived. Restore them first."), and the
     only forward button is **Import N valid transactions**. The
     over-limit rejections: a file over 5 MB or 10,001 rows is refused
     before any preview.
   - Import → Done: counts come from the database ("Imported N
     transactions / Created M new customers"); with skipped rows the
     headline reads **Partial import complete**. The new customers and
     transactions appear on the Customers and Transactions pages with
     their historical dates (a void test on one imported row is
     sensible).
   - Failure drill: pull the network mid-import → "… nothing was
     imported; the whole file was rolled back" + **Try again**; verify
     the new customers from that attempt are NOT in the Customers
     page.
4. As Editor: the same Import link, page and flow. As Viewer: the
   Import link is absent from the sidebar, and opening the URL shows
   only "Import needs Editor or Owner access" — no upload UI anywhere.

## S-39 - Exports, printable statement and backup (no migration)

**Status: code done; no database changes** (frontend only, zero new
dependencies). Prerequisites: any state where the lists load.

1. Customers page: set a filter (e.g. search plus Status: Owes you),
   click **Export CSV** - the button shows Exporting... done/total
   while it pages the server, then downloads **customers.csv**.
   Open it: the rows must match the filter (not just the visible
   page - a business with 600+ customers exports all of them), the
   header is 
ame,phone,balance,last_activity,created, and any
   customer whose name begins with =, +, - or @ appears with a
   leading apostrophe (create one called "=test" to verify).
2. Transactions page: same with its filters (range, type, customer,
   search, Include voided) - **transactions.csv** carries
   date,type,customer,amount,note,status for every matching entry,
   voided ones included when the filter says so.
3. Customer statement: open any customer, click **Statement** -
   the page at /b/:businessId/customers/:customerId/statement shows
   the business name, the customer with phone, the From/To period
   selector, every entry with its running balance, and the closing
   balance. Narrow the period: the rows filter and the closing
   balance recomputes. Click **Print** (or Save as PDF): the print
   preview must show ONLY the statement - no sidebar, no topbar,
   white background, and the chosen period printed at the top. An
   empty period says "No entries in this period." and still shows
   the closing balance.
4. Settings: the **Backup** section (below the form or the read-only
   details) offers **Download backup** - it downloads customers.csv
   then transactions.csv for the WHOLE business with progress in the
   button label.
5. Delete dialog (owner): open Settings > Danger zone > **Delete
   business** - the dialog offers "Keep a copy of this data first."
   with **Download backup**; it downloads and LEAVES THE DIALOG
   OPEN (a backup is not a delete).
6. Role pass: as **Viewer** - Export CSV is visible on both lists,
   the Backup section is in Settings, the statement opens and prints,
   while Add customer / Add Transaction / Import CSV / Save changes /
   Delete business stay absent. As Editor and Owner: everything
   above plus the gated actions.
7. Failure drill: start an export and stop the network - a toast
   explains the failure and the button returns to "Export CSV"
   (nothing half-downloaded).

## S-40 - Accessibility and keyboard pass (no migration)

**Status: code done; no database changes** (frontend only).
Prerequisites: any signed-in state with at least one business.

1. Automated axe: with the dev server running, open each page
   (Dashboard, Customers, a customer's detail, Import, Statement,
   Transactions, Members, Settings, My businesses, /__ui gallery)
   with axe DevTools enabled in the browser - zero serious or
   critical violations on every page (the same checks run in CI
   via src/features/__tests__/axePages.test.tsx).
2. Keyboard only, no mouse at all: tab order reaches - and Enter
   activates - every journey: sign in, create business, invite a
   member, add customer, add transaction, void a transaction,
   archive AND restore a customer, switch business via the topbar
   switcher. Focus must always be visible (ring) on the focused
   control.
3. Skip link: on any app page, press Tab once from the top - a
   "Skip to content" link appears; Enter jumps focus past the
   sidebar to the main content.
4. Dialogs and sheets: open the Add customer dialog (or the
   transaction sheet) with Enter - focus moves inside; Tab cycles
   WITHIN the overlay (not to the page behind it); Escape closes
   it and focus returns to the button that opened it.
5. Screen reader pass (VoiceOver/NVDA spot check): toasts announce
   on appear; a table announces "Showing N of M" and, when sorted,
   "sorted by <column>, ascending/descending"; after voiding a
   transaction the customer's balance change is announced (the
   balance element is a live region), not just flashed.
6. Touch (real device or devtools device mode with touch): every
   button, input, select, menu item and sidebar link is at least
   44x44 px (the pointer-coarse: rules inflate them only on touch
   devices - desktop sizes are unchanged).
7. Contrast: both themes (toggle light/dark) - body text, muted
   text, balance colours (receivable/credit/settled), badges and
   primary buttons all pass WCAG AA; automated evidence in
   scripts/contrast-audit.cjs (run: node scripts/contrast-audit.cjs).
   Meaning is never colour alone: balance badges carry words
   ("Owes you"/"You owe"), voided rows say "(voided)".
8. Reduced motion: enable "reduce motion" in the OS - page
   transitions and the balance flash collapse to near-instant.
