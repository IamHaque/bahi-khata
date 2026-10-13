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
| S-06 Additive RLS policies, helper functions, RPCs, views | Done | (see below) | migration 0002 + SQL test written; not applied (no DB access) |
| S-07 Business-scoped data layer (transitional) | Done | (see below) | api fns take optional businessId; useDashboardSummary added |
| S-08 Theme, tokens, typography, dark mode | Done | (see below) | OKLCH tokens, ThemeContext+system, Geist removed |
| S-09 Display primitives | Done | (see below) | lib/format.ts + 8 shared components + tests |
| S-10 DataTable, SearchInput, FilterBar, Pagination | Done | (see below) | server-driven DataTable + RowActionsMenu + SearchInput + FilterBar |
| S-11 Form kit, EntityDialog, ConfirmDialog | Done | (see below) | rhf+zod form kit, EntityDialog (dialog/sheet), ConfirmDialog (typed), toast helper |
| S-12 App shell, navigation, path helpers | Done | (see below) | AppShell + navConfig + paths.ts; AppLayout deleted; pathsHygiene test |
| S-13 UI gallery and UI consistency contract | Done | (see below) | dev-only /__ui gallery + UI-CONTRACT checklist+glossary + rot test |
| S-14 Business resolution provider | Done | (see below) | BusinessContext + memberships api/hooks + boot skeleton; cache clear on sign-out |
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

## S-14 scenarios (checklist)

- [x] Memberships are loaded once — `getMemberships()` (features/business/api.ts) loads owned + member businesses with role and owner name plus the user's pending invitations in one react-query entry (`businessKeys.memberships()`, RLS does the user filtering); `useActiveBusiness()` returns the business, the role, `isOwner` and a status of loading/ready/none/forbidden (tested: two consumers, one api call)
- [x] No flash of wrong content — while a signed-in user's memberships load, `BusinessProvider` renders a full-screen `BusinessBootSkeleton` (sidebar rail + top bar + content placeholders, `role="status"`) and no page (and no data from a previous session) mounts first (tested)
- [x] Transitional behavior (until S-17) — the active business is the user's **own** business or none (member-only users get none until the S-24 invitation flow); pages keep calling hooks without businessId, so data runs unscoped; non-membership failures (e.g. migrations not yet applied at first deploy) degrade to status none so the app behaves exactly like v1, permission failures map to forbidden (tested)
- [x] Clean sign-out — `queryClient.clear()` runs whenever the session disappears, so nothing from the previous session survives (tested: seeded cache entry gone after the session flips to null)

**S-14 notes:** the query fetches `business_members` (+ embedded `businesses`), owner `profiles`, and `business_invitations` for the JWT email (lowercased to match the stored `check (email = lower(...))`). The invitation `businessName` embed is null-tolerant (invitees cannot read the business row until they accept — RLS), filled from the member businesses when available. `useActiveBusiness()` is the PRD-shaped hook; `useBusinessContext()` additionally exposes `error` for diagnostics. Wiring data calls to pass the active `businessId` lands with S-17/S-20 route changes (touch zone keeps pages untouched). The two new lint warnings on BusinessContext are the same react-refresh/only-export-components pattern as the pre-existing AuthContext and ThemeContext files.

## S-13 scenarios (checklist)

- [x] Gallery — dev-only `/__ui` route renders every shared component in its states (buttons incl. disabled/loading, Money, BalanceBadge, StatusBadge, Avatar, StatCard incl. loading/error/zero, Skeleton/SkeletonRows, EmptyState, ErrorState, PageHeader, SearchInput, FilterBar, DataTable all five states, form fields incl. inline errors, EntityDialog/ConfirmDialog/typed ConfirmDialog, toast buttons) with a theme toggle to check both themes (tested in jsdom via the rot test; dev-server smoke test hit `/__ui`)
- [x] Not in production — the route is registered in `App.tsx` behind `import.meta.env.DEV`; verified the built bundle contains no gallery strings (component tree-shaken out); the `"/__ui"` literal remains in `paths.ts` output but no `<Route>` references it
- [x] Contract — `docs/UI-CONTRACT.md` now contains the full §8 checklist (error-message example restored) plus the copy glossary table and a gallery section
- [x] Gallery cannot rot — `src/features/dev/__tests__/uiGallery.test.tsx` renders the gallery in light and dark themes and fails on any `console.error`/`console.warn` (tested)

**S-13 note:** the rot test caught a real bug — `StatCard`'s value slot was a `<p>`, which is invalid HTML when the value is a `<div>` (e.g. a loading `Skeleton`); the slot is now a `<div>`. Form fields intentionally have no `disabled` prop yet (no story needs it; added when one does).

## S-12 scenarios (checklist)

- [x] Layout — `AppShell` renders desktop sidebar + sticky top bar + content; sidebar collapses to a 16px icon rail on toggle, and on mobile a hamburger opens the sidebar in a Sheet drawer (tested)
- [x] Navigation is configuration — one array in `src/components/layout/navConfig.ts` with a `visible` predicate; Members (S-22) and Settings (S-18) entries exist but are hidden (tested)
- [x] Paths are centralized — `src/lib/paths.ts` (`paths` builders + `routePatterns` for `<Route path>` + `transactionsPath` query helper); every link, navigate() and redirect now imports it; enforced by new `src/test/pathsHygiene.test.ts` which scans pages/, components/ and App.tsx for literal path strings (tested)
- [x] Top bar — page title derived from the current route, ⌘K search trigger (wired in S-28), theme toggle, Popover user menu with email + Sign out (tested)
- [x] Business slot — `BusinessSwitcher` at the sidebar top shows the app name until S-26 (tested)
- [x] No URL change — `routePatterns` asserted equal to the v1 literals `/login`, `/`, `/customers`, `/customers/:id`, `/customers/import`, `/transactions`, `/transactions/:id` (tested); full sign-in click-through is a manual check (no DB access)

**S-12 notes:** old `AppLayout.tsx` deleted (top-bar layout replaced by the shell). The mobile drawer's nav is the same `Sidebar` component; while the modal drawer is open, Base UI marks the desktop sidebar `aria-hidden`, so a11y queries see exactly one nav. Dev-server smoke test: `/` and deep links redirect to `/login` when signed out.

## S-11 scenarios (checklist)

- [x] Typed fields — TextField, TextAreaField, MoneyField, DateField, TagsField, SelectField, SegmentedField all built on react-hook-form + zod with persistent labels and inline errors (tested)
- [x] Create and edit share a container — EntityDialog renders as a centered dialog on desktop and a bottom sheet on mobile (useMediaQuery); Base UI dialog traps focus, closes on Escape and returns focus
- [x] No lost input — on save failure the dialog stays open with values intact; errors map to fields (`fieldErrors`) or to a form-level message (tested)
- [x] Unsaved changes guard — closing a dirty form shows a "Discard changes?" ConfirmDialog; discarding closes, cancelling keeps it open (tested). Note: required reading `formState.isDirty` during render — RHF only re-renders on formState properties the component accessed
- [x] Confirmations — ConfirmDialog takes a specific verb label ('Archive customer'); typed variant keeps the button disabled until the exact text is entered (tested)
- [x] Feedback — `lib/toast.ts` standardizes success (past tense, optional Undo action) and error ('Could not X. Try again.') toasts via sonner (tested with a sonner mock)

**S-11 fix commit:** `2b35456` — zod v4.6's `ZodTypeAny` has `unknown` input which `zodResolver`/RHF reject; EntityDialog now types the schema as `z.ZodTypeAny` and casts at the resolver boundary (`zodResolver(schema as z.ZodType<FieldValues, FieldValues>) as Resolver<FieldValues>`). The first S-11 commit (`f4d01a7`) briefly left the build red; the fix commit restores it (history preserved, no rewrite).

## S-10 scenarios (checklist)

- [x] Column-driven table — `Column<T>` (header/render/align/sortable/sortValue), semantic table, sticky header (`sticky top-0` on every th)
- [x] Server-driven sorting and paging — clicking a sortable header emits `onSortChange(key, dir)` (toggles asc→desc, new column starts asc); page size select (10/25/50) emits `onPageSizeChange`; prev/next emit `onPageChange`; headers announce `aria-sort` ascending/descending/none. The table never sorts locally in server mode
- [x] Built-in states — loading → skeleton rows; empty → `emptyState` slot; no-results → distinct `noResultsState` slot + Clear filters button (when `onClearFilters` given); error → `ErrorState` with retry
- [x] Row interaction — one primary click target (`onRowClick`) + three-dot `RowActionsMenu` fully keyboard operable (click/arrow-down opens, arrow up/down moves, Enter selects, Escape closes); tested
- [x] Narrow screens — under 768px rows render as cards via `renderMobileCard` (tested with the matchMedia mock); table cells are `whitespace-nowrap` so amounts are never truncated
- [x] Result count announced — `role="status"` live region announces "Showing 2 of 340"; visible footer shows "Showing 11–20 of 340"
- [x] Search and filters — `SearchInput` debounced 300ms (internal), labelled (sr-only Label + aria-label), clearable; `FilterBar` renders removable chips + Clear all

**Tests:** `dataTable.test.tsx` (15), `filters.test.tsx` (6). **Note:** the old `src/components/DataTable.tsx` stays until the pages migrate (S-28/S-35); the new table lives in `src/components/app/DataTable.tsx`. Test setup gained `__setMatchMedia` (controllable matchMedia mock) for the mobile test.

## S-09 scenarios (checklist)

- [x] Money is formatted in one way — `formatMoney(1234567.5)` → `₹12,34,567.50` (en-IN currency, two decimals); `Money` renders right-aligned with `tabular-nums` (tested)
- [x] Balance meaning is never color-only — `BalanceBadge` shows 'Owes you' / 'You owe' / 'Settled' with token color AND text label AND amount (tested for 500 / -200 / 0); `getBalanceStatus` exported for reuse
- [x] State components — `PageHeader`, `StatCard`, `Money`, `BalanceBadge`, `StatusBadge`, `EmptyState`, `ErrorState` (with retry), `Skeleton`/`SkeletonRows`, `Avatar` (deterministic initials color from a name hash) all created in `src/components/app/`; each covered by `src/components/app/__tests__/primitives.test.tsx` (26 tests)
- [x] Dates — `lib/format.ts` is the only date module: `formatMoney`, `formatDate`, `formatTime`, `formatDayMonth`, `formatMonthYear`, `formatRelative`; `src/test/dateHygiene.test.ts` fails if any file in `pages/` or `components/` calls `toLocaleDateString`/`toLocaleTimeString` directly. Pages migrated (CustomerDetail, Transactions, TransactionDetail + summarized-view labels)

**Note:** pages keep their existing inline `₹{…toLocaleString("en-IN")}` displays for now — S-09's touch zone is `components/app/` + `lib/format.ts`; the page rebuilds (E5–E7) will use `Money`/`BalanceBadge` everywhere.

## S-08 scenarios (checklist)

- [x] Preset adopted — no external preset copied; OKLCH token values derived from PRD 4.5 semantics (indigo primary, green receivable, red-orange credit, neutral settled) and machine-verified for WCAG AA. Choice + rationale + verification method recorded in `docs/UI-CONTRACT.md` (created in this story with the theme decision; the §8 checklist copy lands in S-13)
- [x] Financial tokens exist — `--receivable`, `--credit`, `--settled` (plus `--success`, `--warning`, `--chart-1..5`) defined for light and dark; contrast verified with a WCAG relative-luminance script: all 36 token/background pairs pass AA (≥4.5:1 text on card and page, ≥3:1 border)
- [x] Dark mode — `ThemeContext` extended with `system | light | dark` (DEV-3: existing context extended instead of adopting next-themes); existing screens verified readable in both themes via the dev server (CSS served with new tokens; screens unchanged in structure)
- [x] One font — Public Sans Variable is the only loaded family; unused `@fontsource-variable/geist` package removed; `.tabular-nums` enabled globally for money

**Tests:** `src/test/theme.test.ts` (8 tests: token presence in both themes, chart tokens, radius scale, dark variant, reduced motion, single font, tabular numerals). `src/test/globals.d.ts` adds minimal `node:fs`/`node:path`/`__dirname` declarations so tests can read `index.css` without adding `@types/node`.

## S-07 scenarios (checklist)

- [x] Scoped reads — every read api function takes optional `businessId` and adds `.eq("business_id", …)` when given; hooks pass it into the key factory, so scoped keys start with `['business', 'b1']` (proven by `src/lib/__tests__/queryKeys.test.ts` and the mocked-supabase tests)
- [x] Scoped writes — `createCustomer`/`createTransaction`/`createTransactionsBatch` store `business_id` from the argument; `created_by` set from `auth.uid()` (customers now record `created_by` too — new column from S-05). Proven by mocked-supabase tests asserting the insert payload
- [x] Transitional compatibility — `businessId` omitted → no extra `.eq()`, `business_id: null` on insert (the 0001 trigger allows null); every optional param carries a `// TODO(S-20): businessId becomes required` marker. Pages call hooks with no businessId, so behavior is unchanged
- [x] Key hygiene — `queryKeys.test.ts` fails if any factory output called with a businessId lacks the `['business', id]` prefix; unscoped keys still tested for the transition
- [x] Summaries are scoped — `getDashboardSummary(businessId)` calls `supabase.rpc('dashboard_summary', { p_business_id })`; `useDashboardSummary(businessId)` hook added with `transactionKeys.summary(businessId)`. The Dashboard page still uses the old unscoped RPCs (it has no businessId yet — S-14/S-36 will switch it)

**Tests added:** `src/lib/__tests__/queryKeys.test.ts` (7 tests), `src/features/__tests__/businessScoping.test.ts` (7 tests).

## S-06 scenarios (checklist)

- [x] Members read, outsiders do not — policies: `Members can read customers/transactions/businesses/business_members`; SQL test asserts Olivia/Eli/Vic read Acme, Zed reads 0 rows on every table
- [x] Viewer is read-only — `Editors can insert/update customers/transactions` policies; test asserts Vic's insert/update/delete on customers and insert/update on transactions are denied
- [x] Editor can write but not destroy — test asserts Eli inserts/updates customers and transactions, and that customer delete, business delete, change_member_role and remove_member are denied (no delete policies for Editor)
- [x] Owner controls the business — `Owners can update/delete businesses` policies + `change_member_role`/`remove_member`/`leave_business` RPCs validating `has_role(…, 'owner')`; test asserts Olivia updates the business, changes and removes Eli's role, and that the owner row is protected (owner role change denied, owner leave denied)
- [x] Views respect RLS — `customer_balances` view created `with (security_invoker = true)`; `dashboard_summary` raises for non-members; test asserts Zed gets 0 view rows and a denied RPC
- [x] Invitation by email — `Owners can read invitations` + `Invitees can read their invitations` (JWT email, case-insensitive via `lower()`); `respond_to_invitation` RPC adds the `business_members` row with the invited role on accept, treats already-a-member as success, and rejects stale/double responses; test covers visibility, accept, case-insensitive email, double-respond and outsider-respond
- [x] Done when: all SQL tests pass and run instructions are in supabase/tests/README.md — `supabase/tests/0002_rls_membership.sql` written (rolled-back transaction, old policies dropped, `TEST FAILED` assertion pattern); run instructions already in the README. **Caveat (rule 7): the agent has no database, so the tests are written but not executed here; they are designed to run in the SQL Editor or via psql in one paste.**

**Also in 0002:** helpers `is_member`/`has_role` (security definer, pinned search_path), RPCs `create_business`, `respond_to_invitation`, `leave_business`, `change_member_role`, `remove_member`, `dashboard_summary` (all security definer, all caller-validating). RLS enabled on all four new tables. Old v1 policies untouched (dropped only in 0003/S-20).

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
| `src/components/layout/*` | new directory (`AppLayout.tsx` deleted in S-12 when the shell was rebuilt) |
| `src/features/*/api.ts`, `hooks.ts`, `schemas.ts` | today: `src/lib/{customers,transactions,csv-import}.ts` + `src/types/index.ts`; feature folders created as stories land |
| `src/lib/format.ts`, `queryKeys.ts`, `permissions.ts` | new files |
| `src/test/` | new directory for test helpers |
| `.github/workflows/` | new directory |
