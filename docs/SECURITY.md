# BahiKhata security notes (S-42)

What this document is: the threats considered while building v2, the
controls that answer each one, where each control is proved, and how to
re-run the proofs. It covers the shipped code only — nothing here is a
claim about a penetration test.

## Threats considered and the controls that answer them

| # | Threat | Control | Proof (SQL unless marked) |
| --- | --- | --- | --- |
| 1 | A non-member reads or writes another business's rows (customers, transactions, invitations, members) | RLS on every table, membership resolved from the caller's JWT via `is_member_of` / `is_owner_of`; reads by outsiders return zero rows, writes are refused | `supabase/tests/0002_rls_membership.sql` (section 4: outsider reads zero everywhere), `0004`, `0005` |
| 2 | A Viewer writes (create/update/delete) | Read-only policies for the viewer role; archive/void updates match zero rows | `0002` lines 202–228 (insert/update/delete refused), `0004` (viewer cannot archive/delete), `0005` (viewer cannot void) |
| 3 | An Editor escalates: permanently deleting a customer, changing roles, removing members, deleting the business | Owner-only RPCs/policies; `delete_customer_permanently` and role management refuse anyone below owner with `42501` | `0002` lines 267–285 (editor refused delete/role-change/member-removal/business-delete), `0004` section 8 (permanent delete: editor, viewer, outsider all `42501`) |
| 4 | An outsider accepts an invitation addressed to someone else (or responds twice) | `respond_to_invitation` matches the invitation's email against the caller's JWT email and enforces one response | `0002_rls_membership.sql` line 402 (Zed cannot accept Vic's invitation), line 386 (cannot respond twice) |
| 5 | The Owner calls `leave_business` (would leave the business ownerless) | RPC refuses the owner with `42501`; owner removal from their own membership row is refused at policy level too | `0002` line 338, `0002c_membership_management.sql` line 172 |
| 6 | RPCs abused across tenants: `dashboard_summary`, `customer_ledger`, balance/rollup reads for a business the caller does not belong to | Membership check inside each function; outsider gets refused (summary) or zero rows (ledger, security-invoker); departed members lose access immediately; `anon` cannot execute | `0002` lines 407–411, `0002c` line 252, `0006_customer_ledger.sql` (outsider zero rows, anon refused), `0007_daily_activity.sql` |
| 7 | The service-role key leaks into the repo or the client bundle | The app only ever holds the URL + a client-safe key; `.env` is gitignored; `.env.example` carries placeholders only | Automated: `src/lib/__tests__/clientHygiene.test.tsx` (repo scan, built-bundle scan, `.env.example` shape, local `.env` shape) |
| 8 | Supabase access happens outside the API layer where policies could be bypassed or secrets drift | The client module `src/lib/supabase.ts` is imported only by `*/api.ts` files | Automated: same test file, import-confinement test |
| 9 | User text (names, notes, tags, business names) interpreted as HTML/JS (XSS) | React's automatic escaping everywhere; no `dangerouslySetInnerHTML`, no `innerHTML` assignment, no `insertAdjacentHTML`/`document.write` in `src/` | Automated: same test file — source scan + a rendered business name full of markup asserting it stays text |
| 10 | Exported CSV opened in a spreadsheet executes injected formulas (`=`, `+`, `-`, `@` cells) | Export escaping prefixes dangerous cells (S-39) | App tests: `src/features/import-export/__tests__/csv.test.ts` |
| 11 | Unauthenticated browsing of app routes | `ProtectedRoute` bounces signed-out visitors to `/login` and remembers the deep link | App tests: `src/features/business/__tests__/landingResolver.test.tsx` (ProtectedRoute redirect + deep-link restore) |

UI-level role gating (viewers never see write affordances) is defence in
depth only — every claim above is enforced in the database, not in the
browser.

## How to re-run the proofs

**SQL tests** (the RLS/integrity suite): see `supabase/tests/README.md`
— plain SQL, one transaction rolled back per file, runnable against any
scratch Postgres/Supabase project with a service-role connection (it is
the fixtures, not the assertions, that need it). Nothing else is
required; no test framework, no npm tooling.

**Client hygiene and content safety** (automated):

```
npx vitest run src/lib/__tests__/clientHygiene.test.tsx
```

They also run in every full `npm test`. The bundle scan activates when
`dist/` exists (run `npm run build` first to include it).

## Honest caveat

The SQL suite is **committed but not executed in this build
environment** — no database is reachable here, and a real Google
sign-in cannot be automated either. Running the suite (and the
migration chain `0001`–`0008` it depends on) is documented as ordered
manual steps in `docs/MANUAL_STEPS.md` ("S-42"). Until a human runs
them, the SQL proofs are reviewed evidence, not executed evidence — the
client-hygiene/content-safety proofs above *are* executed on every
commit.

*(v3.1 update: the consolidated 19-section suite WAS executed against a
scratch Postgres during S-50 — all sections pass; see
`docs/PROGRESS.md` S-50 and the post-deploy checklist in
`docs/MANUAL_STEPS.md`. The Google sign-in flow remains unautomatable.)*

## v3.1 control statements (S-67)

### Audit fields are written by the database

`created_by`, `updated_by` and `voided_by` are never trusted from the
client: before-insert/before-update triggers on `transactions` and
`customers` stamp the authenticated caller's id (decision D-21, closes
F-04). An Editor can no longer attribute an entry to the Owner. Trusted
paths are unaffected — admin/service sessions (no `auth.uid()`) keep
what they supply, and `restore_deleted()` marks its own transaction so
restored rows keep their **original** authors (D-18). Proven by the SQL
suite's stamp sections.

### Deletion is recoverable and logged

Nothing a user deletes just disappears. Every delete writes a full row
snapshot to `deletion_log` **before** the delete (D-13); only SECURITY
DEFINER functions can write that table, and only the business Owner can
read it (no client write policies; INSERT/UPDATE/DELETE revoked from
`authenticated`, everything from `anon`). The UI offers an Undo toast
for 10 seconds (`restore_deleted`) and the **Recently deleted** page
for everything else, with no time limit. Restores are exact: same ids,
authors, timestamps and archive state; a transaction cannot come back
before its customer.

### No function is executable by signed-out users

Every RPC has `EXECUTE` revoked from `anon` **and** `PUBLIC` (v3.1
privileges section). A signed-out caller cannot call
`dashboard_summary`, `restore_deleted`, `delete_transaction` or any
other function; the suite asserts
`has_function_privilege('anon', …)` is false.

### Production dependencies are audited in CI

`npm audit --omit=dev` runs in CI and fails the build on any finding in
the production tree. The five dev-only packages moved to
`devDependencies` in S-45 (jsdom, `@testing-library/*`, `shadcn`) are
therefore out of scope for the production audit; the count is 0.
`npm audit` without `--omit=dev` still reports dev-tooling findings —
that is expected and not a production risk.
