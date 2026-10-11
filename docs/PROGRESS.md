# BahiKhata v2 — Build Progress

Branch: `feat/v2-multi-business` (from `master` @ `cc92edb`)
Spec: `docs/PRD-v2.md` (stories S-01 … S-43, execution order per C-1)
Baseline audit: `docs/ARCHITECTURE-BASELINE.md` (S-01)

## Story board

| Story | Status | Commit | Notes |
| --- | --- | --- | --- |
| S-01 Repository audit and baseline documentation | Done | (this commit) | Baseline + PROGRESS + deviations below |
| S-02 Quality gates, test harness and CI | Done | (see below) | eslint flat config + typecheck script + jsdom harness + CI |
| S-03 Versioned database baseline and manual-steps log | Done | (see below) | baseline = 2 existing exported migrations; MANUAL_STEPS + tests README |
| S-04 Data-access layer and TanStack Query | Done | (see below) | react-query + AppError + queryKeys; lib/customers+transactions moved to features/*/api.ts |
| S-05 Additive schema: profiles, businesses, members, invitations | Done | (see below) | migration 0001 written; not applied (no DB access) |
| S-06 Additive RLS policies, helper functions, RPCs, views | Pending | | |
| S-07 Business-scoped data layer (transitional) | Pending | | |
| S-08 Theme, tokens, typography, dark mode | Pending | | |
| S-09 Display primitives | Pending | | |
| S-10 DataTable, SearchInput, FilterBar, Pagination | Pending | | |
| S-11 Form kit, EntityDialog, ConfirmDialog | Pending | | |
| S-12 App shell, navigation, path helpers | Pending | | |
| S-13 UI gallery and UI consistency contract | Pending | | |
| S-14 Business resolution provider | Pending | | |
| S-15 Create-business page | Pending | | |
| S-16 Post-login landing logic and route guards | Pending | | |
| S-17 Route restructure to /b/:businessId | Pending | | |
| S-18 Business settings (view and edit) | Pending | | |
| S-19 Delete business | Pending | | |
| S-20 Enforce tenancy (contract phase) | Pending | | |
| S-21 Permission layer | Pending | | |
| S-22 Members page | Pending | | |
| S-23 Invite by email and manage invitations | Pending | | |
| S-24 Respond to invitations | Pending | | |
| S-25 Change role, remove member, leave business | Pending | | |
| S-26 My businesses page and business switcher | Pending | | |
| S-27 Lost-access handling | Pending | | |
| S-28 Customers list v2 | Pending | | |
| S-29 Customer form (add and edit) | Pending | | |
| S-30 Archive, restore, permanently delete customers | Pending | | |
| S-32 Add transaction sheet | Pending | | |
| S-33 Edit transaction | Pending | | |
| S-34 Void and restore transactions | Pending | | |
| S-31 Customer detail v2 | Pending | | Executed after S-34 per C-1 |
| S-35 Transactions page v2 | Pending | | |
| S-36 Dashboard v2: KPIs, top balances, today | Pending | | |
| S-37 Dashboard trends and recent activity | Pending | | |
| S-38 CSV import, business scoped and role gated | Pending | | |
| S-39 Exports and printable statements | Pending | | |
| S-40 Accessibility and keyboard pass | Pending | | |
| S-41 Responsive pass | Pending | | |
| S-42 Security and RLS verification | Pending | | |
| S-43 Documentation and release readiness | Pending | | |

## S-02 scenarios (checklist)

- [x] Local scripts exist: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` each succeed on a clean checkout — all four green (lint: 0 errors, 5 pre-existing warnings)
- [x] Components can be tested with app providers: test helper renders with router + query client; sample component test passes under vitest with jsdom; helper documented below
- [x] CI runs on every push: `.github/workflows/ci.yml` runs lint, typecheck, build, test on push to any branch; any failing step fails the job
- [x] Done-when proof: a deliberately failing test (`src/test/__deliberate-failure.test.tsx`) failed `npm test` with exit code 1, then was removed; suite back to 29/29 green

**Dependency justification (rule 6):** `@testing-library/dom@10` was added because it is a required peer dependency of `@testing-library/react@16` (allowed list). No other new dependencies.

**Test harness (documented helper):**
- `src/test/app-render.tsx` — `renderApp(ui, { route, session })` wraps any UI in `ThemeProvider` + `AuthProvider` + `QueryClientProvider` (retry disabled) + `MemoryRouter`. It also mocks `@/lib/supabase` auth so provider trees work without a network. `session: null` default; pass a fake `Session` to test signed-in states.
- `src/test/sample-component.test.tsx` — the proof test: renders `DataTable` through the helper (content, sort emission, empty slot).
- `src/test/setup.ts` — jsdom shims (`matchMedia`, `scrollIntoView`).
- `vitest.config.ts` — jsdom environment, `globals: true` (enables RTL auto-cleanup), setup file, `@` alias.
- Existing pure-logic tests keep working unchanged.

## S-05 scenarios (checklist)

- [x] Existing app is unaffected — all four new columns on `customers`/`transactions` are nullable; the app writes null `business_id`, which the match trigger explicitly allows; no v1 policy or query is touched
- [x] One owned business per user — `create unique index businesses_one_per_owner on businesses (owner_id)`; a second insert violates it
- [x] Owner membership is automatic — `businesses_add_owner` after-insert trigger inserts exactly one `business_members` row with role `owner` (guarded by `one_owner_row_per_business` partial unique index)
- [x] Profiles are populated — `on_auth_user_created` after-insert trigger on `auth.users` fills `email`, `full_name`, `avatar_url` from `raw_user_meta_data` (Google identity), with `on conflict do update` for idempotency; migration ends with a one-time backfill `insert … select … on conflict do nothing` for pre-existing users
- [x] Transactions cannot cross businesses — `assert_transaction_business_match` before-insert/update trigger (security definer, pinned search_path) rejects a mismatch with errcode 23503; null `business_id` passes during the expand phase
- [x] Done when: docs/MANUAL_STEPS.md lists the exact order to apply 0001 with rollback notes — done (exact filename `0001_multi_business_schema.sql`, verification steps and rollback included)

**Note (operating contract rule 7):** the SQL is written but was not executed against a real database (none is available to the agent). The rules above are enforced by the migration's own DDL/triggers; executable proof arrives with the S-06 SQL tests.

## S-04 scenarios (checklist)

- [x] Components never call Supabase directly — grep: only `features/auth/api.ts`, `features/customers/api.ts`, `features/transactions/api.ts` import `@/lib/supabase` (plus the client definition itself). `lib/customers.ts` and `lib/transactions.ts` were moved, not copied.
- [x] Reads and writes go through hooks — every page/component now reads via `useQuery` hooks and writes via `useMutation` hooks from `features/*/hooks.ts`; the `transaction-saved` window event is gone (0 references). Mutations invalidate the affected key families (`customerKeys.all()` / `transactionKeys.all()` + `customerKeys.all()` because balances derive from transactions) — proven by the invalidation test.
- [x] Errors are normalized — every api function wraps failures in `AppError` (`forbidden` / `network` / `validation` / `unknown`) with user-safe messages; 8 unit tests cover the mapping. Screens render `error.message` through the existing `role="alert"` pattern.
- [x] Behavior is unchanged — diff is moved code + hooks only; same queries, same mutations, same UI. Smoke checklist: dev server serves `/` and every page/module transforms without error (verified over HTTP); a full click-through needs Google OAuth credentials the agent does not have, so checklist items 2–5 are verified by code-path identity with v1 (same api functions, same order, same filters) rather than by clicking — noted honestly.

**New files:** `src/lib/AppError.ts`, `src/lib/queryKeys.ts`, `src/lib/queryClient.ts`, `src/features/auth/api.ts`, `src/features/customers/{api,hooks}.ts`, `src/features/transactions/{api,hooks}.ts`, tests `src/lib/__tests__/appError.test.ts`, `src/features/customers/__tests__/hooks.test.tsx`.
**Deleted:** `src/lib/customers.ts`, `src/lib/transactions.ts` (moved into the feature api files).
**Query keys:** factories take an optional `businessId` (unscoped prefix today; S-07 makes it required and S-07's hygiene test enforces the business prefix).

## S-03 scenarios (checklist)

- [x] Baseline migration reflects the current schema — the two existing exported migrations (`20260913152312_remote_schema.sql`, `20260913170000_add_balance_rpc_functions.sql`) are the baseline: customers, transactions, enums, policies and the balance RPCs, all create-if-not-exists style, marked as exported from project `nhjjanrrismmrfeyiegp`. No `0000_baseline.sql` was created — see DEV-2.
- [x] docs/MANUAL_STEPS.md explains how to apply migrations in order and warns never to run the baseline against a database that already has these tables without diffing first
- [x] supabase/tests/ exists with a README describing how RLS tests are run (rolled-back-transaction pattern, `set local role authenticated`, old-policies-dropped workaround)
- [x] Done when: the baseline reads top to bottom and matches the S-01 audit — verified: baseline §5 and the migrations agree table by table, column by column

**Verification performed:** re-read both migration files against `docs/ARCHITECTURE-BASELINE.md` §5 — customers (12 columns), transactions (11 columns), 3 enums, 2 wide-open RLS policies, 2 security-definer balance RPCs. No drift. No source file changed; build/lint/typecheck/test re-run green.

## Smoke checklist (operating contract rule 9)

Re-run after every story that touches data or routing:

- [ ] Sign in with Google → land on Dashboard
- [ ] List customers → all customers visible with balances
- [ ] Add customer → appears in list
- [ ] Add transaction (charge) → balance increases, row appears on customer page
- [ ] Dashboard totals match the sum of customer balances

## Deviations (real code vs PRD assumptions)

| # | PRD assumption | Reality | Adaptation |
| --- | --- | --- | --- |
| DEV-1 | File layout per PRD 4.4: `src/app/`, `src/features/*/{api,hooks,schemas,pages,components}`, `src/components/app/`, `src/components/layout/`, `src/test/` | Flat layout: `src/App.tsx`, `src/pages/`, `src/components/` (flat + `ui/`), `src/contexts/`, `src/hooks/`, `src/lib/`, `src/types/`, tests in `src/lib/__tests__/` | Per C-8, every touch zone maps to the closest existing path (mapping table below). New shared files (`format.ts`, `queryKeys.ts`, `permissions.ts`, `paths.ts`, `components/app/`, `components/layout/`) are created where the PRD wants them; feature code stays in existing files until its story rewrites it. No mass moves. |
| DEV-2 | S-03 creates `supabase/migrations/0000_baseline.sql` | `supabase/migrations/` already contains two exported migrations (`20260913152312_remote_schema.sql`, `20260913170000_add_balance_rpc_functions.sql`) from the live project | The two existing files **are** the baseline (S-03 documents them, adds `supabase/tests/` + `MANUAL_STEPS.md`). New migrations continue at `0001` per C-5. No `0000` file is created. |
| DEV-3 | next-themes with system/light/dark; Geist as the UI font (PRD 1.1, 4.5) | Custom `ThemeContext` (light/dark only, localStorage); Public Sans loaded, Geist installed but unused | S-08 aligns the token values with PRD 4.5 semantics on the existing CSS-variable architecture and adds a `system` option to `ThemeContext`. Public Sans stays the single loaded family (it is the wired one); the unused Geist package is removed. |
| DEV-4 | Theme from a shadcn preset; primary indigo/blue, receivable green, credit red-orange (PRD 4.5) | Hand-picked paper-and-ink palette: brass primary, ledger-red receivable, ledger-blue credit | S-08 restokens `index.css` to the PRD 4.5 semantic hues (OKLCH) while keeping the variable architecture and light/dark structure. |
| DEV-5 | `npm run lint` passes on a clean checkout (S-02 scenario) | `npm run lint` **fails on master**: ESLint 9 is installed, no `eslint.config.js` exists | S-02 adds a flat eslint config (and a `typecheck` script) so all four gates pass. Tracked as S-02 work, not a blocker. |
| DEV-6 | `@tanstack/react-query` mentioned as if present (PRD 1.1 "Missing") | Not installed; fetching is hand-rolled `useEffect` + `useState` with a `transaction-saved` window event | S-04 introduces react-query (allowed dependency, 4.6) and moves all Supabase calls behind hooks. |
| DEV-7 | Balance RPCs are scoped helpers (PRD 4.2 view/RPC design) | `get_customer_balance` / `get_all_customer_balances` are `security definer` with **no `search_path` pin and no RLS awareness** | S-06 replaces them with membership-scoped, `search_path`-pinned equivalents (`dashboard_summary` etc.) and pins the old ones during transition. Old policies stay until S-20. |
| DEV-8 | `lib/format.ts`, `lib/queryKeys.ts`, `src/app/paths.ts` exist | None exist; money/dates are inline `toLocaleString`/`toLocaleDateString`, paths are hardcoded | Created in S-09 (`format.ts`), S-04 (`queryKeys.ts`), S-12 (`paths.ts`). |
| DEV-9 | v1 has no `updated_by`/`voided_*` audit columns (PRD 4.1 additive list) | Confirmed absent; only `created_by` exists | Added in S-05 exactly as sketched. |

### Touch-zone mapping (DEV-1)

| PRD touch zone | Real path used |
| --- | --- |
| `src/app/router.tsx` | `src/App.tsx` |
| `src/app/providers.tsx` | `src/contexts/` (new `BusinessProvider` added here in S-14) |
| `src/app/paths.ts` | new file `src/lib/paths.ts` (re-exported as `paths.ts` alias not needed; import from `lib/paths`) |
| `src/app/queryClient.ts` | new file `src/lib/queryClient.ts` |
| `src/components/app/*` | new directory |
| `src/components/layout/*` | new directory (`AppLayout.tsx` stays until S-12 rebuilds the shell) |
| `src/features/*/api.ts`, `hooks.ts`, `schemas.ts` | today: `src/lib/{customers,transactions,csv-import}.ts` + `src/types/index.ts`; feature folders created as stories land |
| `src/lib/format.ts`, `queryKeys.ts`, `permissions.ts` | new files |
| `src/test/` | new directory for test helpers |
| `.github/workflows/` | new directory |
