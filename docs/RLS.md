# Row-Level Security and database permissions (v3.1)

This is the current picture for the **multi-business schema** (the v3.1
migration chain: consolidated baseline, then the two v3 migrations). It
supersedes the v1 single-business notes that used to live in
`supabase/RLS.md`; those policies were dropped by S-20's contract phase.

Prose here is a map, not the proof. Every claim below is asserted by the
SQL suite (`supabase/tests/bahikhata_consolidated_tests.sql`, 19 sections;
plus the ten archived v2 files), which runs via `npm run test:sql`
against a scratch Postgres. The database is the source of truth; the UI
permission matrix (`src/lib/permissions.ts`) only shapes what is shown.

## Tables and what each role can do

Membership is resolved from the caller's JWT via the `is_member_of` /
`is_owner_of` helpers (SECURITY DEFINER, `search_path` pinned). Roles are
Owner, Editor, Viewer; a fourth party is an outsider (signed in, not a
member).

| Table / object | Viewer | Editor | Owner | Outsider |
| --- | --- | --- | --- | --- |
| `businesses` | read | read | read, update, delete (typed confirm) | zero rows |
| `business_members` | read | read | read, change role, remove (Owner row protected) | zero rows |
| `business_invitations` | — | — | create, revoke; invitee responds to own email | zero rows (cannot accept someone else's) |
| `customers` | read | read, create, update, archive | all of Editor + permanent delete | zero rows |
| `transactions` | read | read, create, update, void | all of Editor + hard delete | zero rows |
| `customer_balances` (view, security invoker) | read (own business) | same | same | zero rows |
| `deletion_log` | — | — | **read only** (see below) | zero rows |
| `daily_activity` / rollups (RPCs) | read (own business) | same | same | refused / zero rows |

## v3.1 additions (S-50…S-56)

### `deletion_log`

One row per deleted customer or transaction; `snapshot` holds the full
rows so restore can put them back exactly (same ids, authors,
timestamps).

- **Read:** Owner only ("Owners can read the deletion log" policy).
- **Write:** **no client write policies at all** — the table is
  append-only for clients. Only the SECURITY DEFINER functions below can
  insert into it. Defence in depth additionally revokes INSERT/UPDATE/
  DELETE/TRUNCATE from `authenticated` and everything from `anon`.
- Deleting a business cascades and removes its log.

### Functions

| Function | Who executes | What it does |
| --- | --- | --- |
| `delete_transaction(uuid, uuid)` | Owner only (`has_role` check, `42501` otherwise) | Hard-deletes one transaction after snapshotting it to `deletion_log`; returns the log id so the UI can offer Undo. Editors keep Void. |
| `restore_deleted(uuid)` | Owner only | Restores a customer (with its transactions) or a transaction from its log row, exactly as deleted. Idempotent-ish guards: already-restored and missing rows return the specific errors the UI shows ("This item was already restored.", "That item is no longer in the log."). A transaction whose customer is deleted must have the customer restored first ("Restore the customer first."). |
| `delete_customer_permanently(uuid, uuid)` | Owner only (unchanged gate) | **Changed in v3:** now snapshots the customer + its transactions into `deletion_log` *before* deleting and returns the log id (was: returns nothing). The remote-schema FK has no cascade, so both deletes stay inside one plpgsql body — atomic. |
| `dashboard_summary(uuid, text)` | any member; refused for non-members (`42501`) | **Changed in v3:** the uuid-only overload is dropped, but `p_timezone` has a `default 'UTC'`, so a one-argument call still resolves (the migration says so — the old client keeps working with the old UTC behaviour). The new client always sends the browser's IANA zone, fixing "today" for non-UTC users (B-09 / DEV-14). |

All of these revoke EXECUTE from `anon` **and** `PUBLIC` (v3.1
privileges section): a signed-out caller cannot execute any function;
`has_function_privilege('anon', …)` returns false (asserted by the suite).

### Actor-stamping triggers

`created_by` / `updated_by` / `voided_by` are **written by the
database**, not trusted from the client (D-21): before insert/update on
`transactions` and `customers`, the trigger stamps the *authenticated
caller's* id. Trusted paths are unaffected:

- admin / service sessions (`auth.uid()` is null) keep whatever they
  supply — the migration chain and the SQL suite rely on this;
- `restore_deleted()` sets `bahikhata.restoring = 'on'` for its own
  transaction, so restored rows keep their **original** authors (D-18).

### `customer_balances` view columns

The security-invoker view gained two computed relationship columns:

- `last_activity_at` — latest non-voided transaction date (S-53: the
  customers list reads it instead of embedding transaction rows);
- `last_payment_at` — latest payment date, counting only non-voided
  payments of any type (v3.1 migration; feeds "Who to chase" when gate
  G-A1 is approved).

## Permission matrix ↔ SQL agreement

The three v3 actions are Owner-only and each has a suite section:

| UI action (`permissionMatrix` key) | Owner | Editor | Viewer | Proof (consolidated suite) |
| --- | --- | --- | --- | --- |
| `deleteTransaction` | ✅ | ❌ | ❌ | §15 (delete_transaction: editor/viewer/outsider refused `42501`) |
| `viewDeletedItems` | ✅ | ❌ | ❌ | §15/§16 (deletion_log reads: Owner rows only; editor/outsider zero rows) |
| `restoreDeleted` | ✅ | ❌ | ❌ | §16 (restore_deleted: editor/viewer/outsider refused) |
| `deleteCustomer` (entry points widened, D-15) | ✅ | ❌ | ❌ | §15/§16 + archived v2 `0004` §8 |

The v2 rows (`view`, `export`, `manageCustomers`, `archiveCustomers`,
`manageTransactions`, `importTransactions`, `manageBusiness`,
`manageMembers`, `deleteBusiness`, `leaveBusiness`) are unchanged and
still asserted in the same suite (formerly `0002`/`0002c`, now
consolidated sections 1–14).

## How to re-run the proofs

```bash
DATABASE_URL=postgresql://…/scratch npm run test:sql
```

The runner installs a Supabase stub (auth schema + roles), applies the
three migrations in filename order, then runs the 19-section suite. It
**must never** be pointed at a real Supabase project (the stub replaces
roles and the `auth` schema). See `supabase/tests/README.md`.
