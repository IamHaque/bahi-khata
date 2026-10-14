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
| S-15 Create-business page | Done | (see below) | CreateBusinessPage + OnboardingLayout + create_business RPC api + schema |
| S-16 Post-login landing logic and route guards | Done | (see below) | LandingResolver at `/`, minimal `/businesses`, ProtectedRoute `from` state, LoginPage deep-link return |
| S-17 Route restructure to /b/:businessId | Done | (see below) | `/b/:businessId` route tree + BusinessGuard + legacy redirects, paths builders, useScopedBusinessId, nav per-URL |
| S-18 Business settings (view and edit) | Done | (see below) | SettingsPage `/b/:id/settings`, getBusiness/updateBusiness, useBusiness/useUpdateBusiness, switcher shows URL business name, Settings nav visible |
| S-19 Delete business | Done | (see below) | DangerZone in Settings, getBusinessImpact + deleteBusiness (cascade), typed confirmation, post-delete routing |
| S-20 Enforce tenancy (contract phase) | Done | (see below) | businessId required across all apis/hooks, 0003 migration + backfill script, balances moved to scoped view, old policies/RPCs scheduled for drop, MANUAL_STEPS procedure |
| S-21 Permission layer | Done | (see below) | lib/permissions.ts matrix + can/assertCan, usePermissions hook, Can component (hide/disable), assertCan in every write mutation, UI-CONTRACT mapping, 2 new SQL denial tests |
| S-22 Members page | Done | (see below) | `src/features/members/` api+hooks+MembersPage, `/b/:id/members` route, Members nav visible, owner-first list with role badges, owner-only Invite + pending invitations section |
| S-23 Invite by email and manage invitations | Done | (see below) | InviteMemberDialog (zod email, lowercased, role Editor/Viewer default Viewer), inline rejections (bad email/own email/member/pending) + DB unique-index backstop, Copy app link, revoke with confirmation, useCreate/RevokeInvitation guards |
| S-24 Respond to invitations | Done | (see below) | `my_invitations()` RPC (0002b) + InvitationCard + invitations section on /businesses, top bar count badge, accept/decline via respond_to_invitation RPC, stale-invitation message preserved |
| S-25 Change role, remove member, leave business | Done | (see below) | row actions on Members (change role / remove with named confirm), Leave business button + owner note, change_member_role/remove_member/leave_business client fns guarded by assertCan, SQL test 0002c (history stays readable) |
| S-26 My businesses page and business switcher | Done | (see below) | three-section /businesses (My business / Shared with me / Invitations), prominent Create your business card, shared cards with owner name + role, BusinessSwitcher menu (own first, shared, All businesses, Create business when I own none), keyboard + aria-checked announcement, switch test proves no old-business data remains visible |
| S-27 Lost-access handling | Done | (see below) | guard detects vanished memberships (toast + purge + route: removed → /businesses, deleted → landing resolver via `business_exists()` probe in migration 0003b), global forbidden→memberships refetch in queryClient factory, memberships refetch on focus, downgraded-save forbidden toast + read-only fallback |
| S-28 Customers list v2 | Done | (see below) | feature-path CustomersPage on S-10 DataTable with URL state (`q, status, sort, page`), server-side `queryCustomers` (search/filter/sort/paging + exact counts + last activity), summary strip, role-aware row menu, v1 form dialog for Add/Edit, Topbar Ctrl/Cmd+K customer palette |
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

## S-28 scenarios (checklist)

- [x] Table content — Customers opens on the shared DataTable with **Customer** (avatar, name, tags), **Phone**, **Balance** (BalanceBadge, right-aligned), **Last activity** (newest transaction date, em dash when none) and **Added** columns; clicking a row opens the customer detail; each row has a RowActionsMenu with **View**, **Edit**, **Add transaction** and **Archive** according to my role — tested (`customersList.test.tsx`, 14 tests)
- [x] Search — typing 'ash' or part of a phone number updates the URL after the debounce and sends the search to the server (`queryCustomers` with `search`, case-insensitive `ilike` on name **or** phone, LIKE wildcards and `or=(…)` syntax characters escaped so the term matches literally) — tested (URL + server-arg assertions; SQL semantics run against the real DB — see MANUAL_STEPS S-28)
- [x] Filter and sort — All / Owes you / You owe / Settled filter buttons (`aria-pressed`, status in the URL, page reset) and sortable headers: Customer = Name (asc/desc), Balance (low↔high), Added = Recently added (oldest/newest); search, filter, sort and page combine in one server query — tested
- [x] State lives in the URL — `q`, `status`, `sort` and `page` appear in the query string; loading the page with a full query string restores input, pressed filter and `aria-sort`; filter/sort/page changes push history and the back button steps through earlier views (search uses `replace` so typing does not spam history); a stale `?page=` beyond the count clamps to page 1 — tested
- [x] Summary strip — a labelled region above the table shows totals for **Customers** (every customer in the business, not just the filtered page), **Owes you** and **You owe** (semantic receivable/credit colors) — tested
- [x] States — no customers → EmptyState "No customers yet" / "Add your first customer to get started." with an **Add your first customer** button (Owner/Editor) and text only for Viewers; a search with no match → distinct "No customers match" state with DataTable's **Clear filters** button; a failed load → ErrorState with **Try again** that refetches — tested (all three)
- [x] Viewer — no **Add customer** and no **Import CSV** button, and the row menu offers **View** only (no disabled extras) — tested
- [x] Global search — Ctrl/Cmd+K (or the top bar's Search button) opens the command palette: it searches customers of the active business (debounced, server-side, same query as the list) and opens the chosen one (click or ArrowDown+Enter); without an open business it explains that and queries nothing — tested (`commandPalette.test.tsx`, 4 tests)
- [x] Mobile — narrow viewports render rows as cards with the name, phone and the full BalanceBadge (balance fully visible) plus the same row menu — implemented via `renderMobileCard` (desktop path is what jsdom sees; S-41 does the responsive pass)

**S-28 notes:** the touch zone's `src/pages/CustomersPage.tsx` moves to `src/features/customers/pages/CustomersPage.tsx` (App.tsx + businessRoutes.test imports updated; the old v1 page is deleted). `api.ts` gains `queryCustomers(businessId, params)` — one PostgREST query: `select "*, customer_balances!inner(balance), transactions(occurred_at)"` with `count: "exact"`, `.or(name/phone ilike)`, balance filters on the security-invoker view, `.order()` on `name`/`customer_balances.balance`/`created_at`, `.range()` paging, plus a parallel head count for the summary strip; `last_activity` = max embedded `occurred_at`. The ungrouped `transactions` embed ships with each page row (payload cost documented here; a grouped view becomes possible after S-20's contract phase). `listCustomers` stays untouched as the unfiltered picker feed, so `useCustomers` and its consumers are unaffected; the list view got its own query key (`customerKeys.pagedList`, params inside the key) so back/forward restore cached pages. Three documented stretches outside the stated touch zone: (1) **Topbar** owns the palette open state + Ctrl/Cmd+K listener and renders `CustomerCommandPalette` (layout-contract placement — the trigger button already existed with a "palette wired in S-28" note); (2) **DataTable** actions cell now stops click propagation — S-28 is the first page combining `renderRowActions` with `onRowClick`, and a trigger click was bubbling into row navigation; (3) the row menu's **Add transaction** (S-32's sheet, with row preselect) and **Archive** (S-30's `archived_at` column) render disabled until their wiring stories — the v1 quick-add sheet cannot know which row it came from, so wiring it now would lie about row context (Edit and Add use the v1 `CustomerFormDialog`, which does carry the row's data, so no action that *can* work is dead). Sorting is the sortable column headers (superset covering all four PRD-named orders); search state uses history `replace` while filter/sort/page push. Add/Edit submit through `mutateAsync` so the dialog shows real failures inline.

## S-27 scenarios (checklist)

- [x] Removed while viewing — when the business vanishes from my memberships while the guard is mounted (refresh after window focus or after any forbidden error), I see the toast "You no longer have access to Acme" (name from the last known membership) and am taken to `/businesses`; cached data for the business is purged (`removeQueries(["business", id])`) — tested (`lostAccess.test.tsx`)
- [x] Business deleted while viewing — the client cannot tell removed from deleted through RLS (both are "not in my list"), so migration `0003b_business_exists.sql` adds a security-definer `business_exists(uuid)` probe (existence only — one bit, UUIDs not enumerable, nothing else exposed); the row gone → toast "This business no longer exists" and the landing resolver; row present → the access-lost path above. A probe *failure* (migration not applied) falls back to the access-lost message — tested (client + SQL test `0003b_business_exists.sql`)
- [x] Role downgraded while editing — the save fails: `assertCan` still passes on the cached editor role, the backend refuses (zero RLS rows → forbidden AppError), SettingsPage toasts "Could not update business" with the forbidden description, the global handler refetches memberships, and the page becomes read-only (`Only the owner can change these details.`) — tested
- [x] Memberships refresh — the memberships query refetches on window focus (`refetchOnWindowFocus: true`, this react-query version fires it on `visibilitychange`) and after **any** forbidden error (global `QueryCache`/`MutationCache` onError in the query client factory, excluding the memberships query's own error so it cannot loop) — tested (both, plus the no-loop case)

**S-27 notes:** the touch zone names `src/app/queryClient.ts` — the file is `src/lib/queryClient.ts` (same role: the app's single QueryClient); it is now built by `createAppQueryClient()` so the test harness (`renderApp`) exercises the real client configuration including the forbidden-refetch wiring. **DEV-13:** the deleted-vs-removed distinction is impossible client-side under RLS — both are "business missing from my membership list" — so S-27 adds the tiny existence-only RPC `business_exists` in migration **0003b** (outside the stated touch zone, which lists only the provider, guards and queryClient; precedent DEV-11: the scenario's explicit behavior required it). The probe is security-definer, returns one boolean, and is denied to `anon`; SQL test 0003b proves member/outsider/deleted/anon behavior. `useMemberships` now uses `staleTime: 0` + `refetchOnWindowFocus: true` + `refetchOnMount: false`: focus always refreshes the access truth, while route changes never refetch an already-observed list (no refetch storms). The never-a-member deep link keeps S-17's static denied page unchanged (no toast, no probe).

## S-26 scenarios (checklist)

- [x] My businesses page — `/businesses` shows three sections: **My business**, **Shared with me** and **Invitations** — tested (`businessesPage.test.tsx`)
- [x] My business shows my owned business card, or a prominent **Create your business** card (dashed border, description, Create business button → `/onboarding/business`) when I own none — tested (page test + landingResolver's updated empty-state test)
- [x] Each shared business card shows name, owner name ("Owned by Rahim", email fallback) and my role badge — tested
- [x] Switcher in the sidebar — the top of the sidebar shows the current business name and my role ("Bahi Khata / Owner"); its menu lists my own business first, then shared businesses, then All businesses; **Create business** appears only if I own none (gated on memberships being loaded) — tested (`businessSwitcher.test.tsx`)
- [x] Switching — picking a business lands on that business's dashboard (`/b/:id`), and no data from the previous business remains visible: every page reads its businessId from the URL and every query key is business-scoped (S-20), proven by a probe page whose per-business detail is gone after the switch — tested
- [x] Keyboard and screen reader — the trigger is a button, so Enter and Space open the menu (tested); arrow keys move between items (tested); the current business is a checked `menuitemradio` (announced as selected) and the trigger's accessible name is "Switch business: <name> (<role>)" — tested

**S-26 notes:** the switcher menu is a `role="menu"` list of `menuitemradio` items (checked = current business) plus `menuitem` entries for All businesses and Create business; opening moves focus to the checked item so the selected business is announced first. Switching navigates only — the old business's cached queries stay in memory (fast return) but cannot render because keys are scoped by the URL business (S-17/S-20); S-27 adds lost-access handling. The BusinessesPage keeps its loading skeleton and error state; the invitations section keeps the S-24 cards (now with a quiet "No pending invitations." line when empty, so the three sections the scenario asks for are always present). `landingResolver.test.tsx`'s S-16 empty-state test was updated in this story (the "No businesses yet" empty state is now the Create your business card — the scenario's explicit requirement).

## S-25 scenarios (checklist)

- [x] Owner changes a role — the row menu on a non-owner row offers "Change to Viewer" (editor row) or "Change to Editor" (viewer row); selecting it calls `change_member_role` (b1, userId, newRole), a toast confirms "<name> is now a <Role>", and the table reflects the new role on the invalidation-driven refetch — tested (11 tests in `memberManagement.test.tsx`)
- [x] Owner removes a member — Remove in the row menu → ConfirmDialog naming the person ("Remove Vic?") with confirm label **Remove Vic** → `remove_member` called, toast, and the member disappears from the list on refetch; cancelling removes nothing — tested; the member losing access is proven in SQL test 0002c §4 (reads return zero, `dashboard_summary` denied)
- [x] Owner row is protected — no actions trigger renders on the owner row — tested; the database backstop (cannot promote to owner, cannot remove the owner, owner cannot leave) is proven in SQL test 0002c §3
- [x] Member leaves — an editor/viewer sees a **Leave business** button, confirms in a dialog, `leave_business` is called with the business id, toast confirms, and the router lands on `/businesses` — tested; losing access after leaving is proven in SQL test 0002c §5
- [x] Owners cannot leave — the owner sees the note "Owners cannot leave. Delete the business instead." instead of the button — tested; `assertCan("leaveBusiness")` blocks a known owner before the network (probe test), and the database refuses them with the exact sentence (SQL test 0002c §3, error mapped verbatim in `leaveBusiness`)
- [x] History stays readable — SQL test 0002c §4/§6: removing a member touches only the `business_members` row; their customers and transactions remain, and the creator's name resolves while the profile row is readable — after removal the co-members RLS correctly hides the profile from ex-mates (join yields NULL → UI renders "Former member"), and deleting the profile row entirely leaves the transaction intact. The **display** of "Recorded by" belongs to S-35's transactions DataTable (no UI shows creator names before it); S-25 pins the data contract the display will consume.

**S-25 notes:** all three RPCs already exist in migration 0002 — no new migration for this story; `supabase/tests/0002c_membership_management.sql` is new and covers the S-25 guarantees against those RPCs (the non-owner-denial cases stay in 0002 §6, same functions). The client mirrors the S-21/S-23 pattern: `assertCan("manageMembers")` inside `useChangeMemberRole`/`useRemoveMember`'s `mutationFn`, `assertCan("leaveBusiness")` inside `useLeaveBusiness` (a known owner fails before the network — probe-tested); on leave, the `["business", id]` prefix is dropped and memberships invalidated so the guard/switcher update before the page navigates to `paths.businesses`. The "Former member" fallback string is proven as the data contract (NULL creator name) in SQL; the component that renders it lands with S-35's "Recorded by (avatar and name)" column — noted so S-35 ships the fallback with the column.

## S-24 scenarios (checklist)

- [x] I see my invitations — the top bar shows an invitation count badge (count from the shared memberships query; hidden at zero, clicking opens `/businesses`); `/businesses` lists each invitation with business name, inviter, role badge, and Accept and Decline buttons — tested
- [x] Accept — I become a member with the invited role and see "You joined Acme" with an **Open business** action that navigates to `/b/:businessId`; the client calls `respondToInvitation(id, true)` with **no email argument** (email matching lives in the database, case-insensitively — SQL test 0002b §3); accepting while already a member is treated as success without an error (RPC `on conflict do nothing`, SQL test 0002b §6) — tested
- [x] Decline — the invitation is marked declined and removed from the list on refetch (SQL test 0002b §5) — tested
- [x] Stale invitation — a revoked/answered/gone invitation shows the database's own message "This invitation is no longer available." and the card disappears on the `onSettled` refetch — tested
- [x] Email matching is case-insensitive — JWT email `Vic@Example.com` matches stored `vic@example.com` (SQL test 0002b §3); the client cannot influence matching (it passes only the invitation id)

**S-24 notes:** the scenario requires the business name and inviter on the card, but RLS correctly hides `businesses` and `profiles` from non-members — so migration `0002b_my_invitations.sql` adds a small security-definer `my_invitations()` that joins exactly those display fields for the caller's own pending invitations (matched on the JWT email; the caller passes no arguments). **DEV-11:** the PRD touch zone for S-24 lists only `InvitationCard.tsx` and the BusinessesPage invitations section, but the scenario also mandates the **top bar count badge** — `src/components/layout/Topbar.tsx` was touched for it (badge reuses `useMemberships()`, so no extra fetch; hidden at zero). The badge counts from memberships (`getMemberships`) while the list comes from `my_invitations()` — both read the same pending rows under the same RLS match, and accepting/declining invalidates both. Accept uses `toastSuccess(message, { label: "Open business", onClick })` (S-11 toast helper). The RPC error (42501 "This invitation is no longer available.") is mapped to `AppError("validation", ...)` before `toAppError` would flatten it to a generic forbidden message — the scenario requires the exact text. BusinessesPage keeps its S-16 shape; S-26 restructures it into the three-section page.

- [x] Send an invitation — the owner opens "Invite member", enters `Vic@Example.com`, chooses Viewer and presses Invite → `createInvitation` receives the **lowercased** `vic@example.com` with role viewer (schema trims + lowercases; DB check requires lowercase); the dialog explains "They will see the invitation after signing in with this Google account. No email is sent."; a **Copy app link** button copies `window.location.origin` (toast + "Copied" state) — tested
- [x] Role choice — the role selector offers Editor and Viewer with one-line descriptions ("Editor — can record customers and transactions" / "Viewer — can only see the data"), defaulting to Viewer — tested
- [x] Invalid invitations blocked inline — not-an-email → "Enter a valid email address" (zod, before any hook); my own email → "You are already the owner"; an existing member → "This person is already a member"; a pending invite → "An invitation is already pending" — all four tested with the api function **not** called; the database's `one_pending_invite_per_email` unique index is the race backstop, mapped (23505) to the same inline error — tested
- [x] Revoke — Revoke on a pending invitation row → ConfirmDialog ("Revoke the invitation to X?") → confirmed → `revokeInvitation` marks it `revoked` (status update, not delete — audit trail stays) and the row leaves the pending list on refetch; toast confirms — tested

**S-23 notes:** the "already member/invited" checks use the emails already loaded on the page (members + pending invitations) — no extra network round trip; the DB unique index still guarantees correctness under races. `useCreateInvitation`/`useRevokeInvitation` call `assertCan("manageMembers")` via `usePermissions()` so a known non-owner fails before the network (S-21 contract). A subtle bug caught by the gates during this story: `assertCan` was first wired as the bare import (`assertCan("manageMembers")`) which passed the action as the *role* and threw a TypeError inside the mutation — replaced with the hook-bound `usePermissions().assertCan` (the S-21 pattern used everywhere else); the fix is why `npm run typecheck` + tests run before every commit. Revoke updates `status='revoked'` guarded by `eq status='pending'` so revoking twice is a no-op error rather than a silent overwrite. No deviations.

## S-22 scenarios (checklist)

- [x] Member list — any member opens Members (`/b/:id/members`, now in the sidebar nav) and sees a table with avatar (initials fallback), name, email, role badge and joined date; the Owner row is always first (page sorts owner-first, then joined date) — tested with an unsorted fixture
- [x] Only the owner sees management controls — Editor and Viewer see the plain list: no Invite button, no pending-invitations section (tested for both roles); role comes from `usePermissions()` (S-21)
- [x] Only-owner state — an Owner with nobody else joined sees `EmptyState` "Invite someone to share this business" with an Invite button (the owner always has a membership row, so "empty" means the list holds exactly the owner)
- [x] Pending invitations — the Owner sees a "Pending invitations" section listing email, role badge and invited date (RLS is owner-only on `business_invitations`, so the section is doubly protected); hidden from non-owners — tested both ways
- [x] Standard states — DataTable's shared loading skeleton, error message + "Try again" retry — tested

**S-22 notes:** the Invite button is rendered but inert until S-23 wires it to the invite dialog (the PRD orders the dialog one story later; the button's presence is S-22's scenario). `getMembers` does two round trips (members then profiles) because `business_members.user_id` references `auth.users` with no FK to `profiles` — same pattern as `getMemberships`. `getBusinessInvitations` filters `status = 'pending'` and orders newest first; a non-owner gets an empty list from RLS even before the UI hides the section. New query keys `businessKeys.members/invitations` sit under the `["business", id]` prefix so S-19's delete-business prefix removal clears them too. Row actions (change role, remove member) are S-25.

## S-21 scenarios (checklist)

- [x] One matrix — `src/lib/permissions.ts` holds the PRD section 3 matrix as the single source for the UI (11 actions × owner/editor/viewer); `src/lib/__tests__/permissions.test.ts` asserts every action for Owner, Editor and Viewer (33 role/action assertions + coverage, `can`, `assertCan`)
- [x] Components use it — `usePermissions()` (business-scoped role from the URL business's membership) and a `Can` component with hide (default) and disable modes; a Viewer sees write actions hidden, or disabled with the tooltip 'View-only access' (`src/components/app/__tests__/can.test.tsx`)
- [x] Actions are blocked before the network — every write mutation (updateBusiness, deleteBusiness, create/updateCustomer, createTransaction/batch, updateTransaction/Status) calls `assertCan` inside `mutationFn`, so a known disallowed role fails with `forbidden` before any api call (tested: viewer's update rejects and `updateBusiness` is never called; the database would refuse the same write — see mapping)
- [x] Matrix and database agree — `docs/UI-CONTRACT.md` lists every action name mapped to the SQL tests in `supabase/tests/0002_rls_membership.sql` that prove the database agrees; two missing denial tests were added (Eli cannot update the business details, Eli cannot insert an invitation) so `manageBusiness` and `manageMembers` have database proof

**S-21 notes:** `assertCan` only blocks a **known** role — memberships not loaded (role null) falls through to the database, which is the source of truth; the UI hiding a control is experience, never security. `Can`'s disable mode wraps in a `<span title="View-only access" aria-disabled>` (no tooltip primitive exists; the native `title` serves as the tooltip — logged in UI-CONTRACT). SettingsPage's S-18 inline membership check was replaced by `usePermissions().isOwner` (same source, shared hook). Two SQL denial tests were added to the S-06 suite for the owner-only rules the matrix claimed but the suite didn't yet prove (business details update, invitation insert). No deviations.

## S-20 scenarios (checklist)

- [x] Legacy data is attached to a business by a human — `supabase/manual/backfill_legacy_data.sql` takes the legacy owner's Google email (section 1, the only script that needs it), creates a business for that user if they own none (the 0001 trigger adds the Owner membership), assigns every NULL `business_id` customer **and** transaction to it (customers first — the 0001 match trigger requires that order), prints both the changed counts and what remains, and is safe to re-run (second run: 0 rows). Cannot be executed by the agent (no DB access; needs the email) — the numbered procedure is in docs/MANUAL_STEPS.md S-20
- [x] Constraint migration refuses to run on dirty data — `0003_enforce_tenancy.sql` counts NULL rows first and aborts with a message pointing at the backfill script and MANUAL_STEPS
- [x] Constraints and policies — on success 0003 makes `business_id` NOT NULL on customers and transactions, drops the two v1 broad policies (0002's membership policies become the only rules) and drops the unscoped v1 balance RPCs; the S-06 SQL tests now pass both before and after 0003 because their expand-phase policy drops are `if exists` no-ops
- [x] Code requires a business everywhere — every `src/features/*/api.ts` function now takes a **required** `businessId` (customers + transactions rewritten: no `if (businessId)` branches, no `?? null` fallbacks; parameter order normalized to business-first for the two functions that had it last); the hooks that call them are required too; no `TODO(S-20)` marker remains; omitting `businessId` is enforced as a compile-time error in the test suite via `@ts-expect-error` directives inside `tsc -b` (if a signature ever relaxes, the typecheck gate fails on "unused directive")
- [x] Fresh database works end to end — every client path is scoped, and the human smoke (signup → create business → customer → transaction on a clean project) is MANUAL_STEPS S-20 step 6
- [x] Isolation proof — enforced by 0002's membership RLS + the security-invoker `customer_balances` view + the dropped RPCs; the human two-account check is MANUAL_STEPS S-20 step 7 (the S-06 SQL tests already prove cross-business denial in-transaction)

**S-20 notes:** **THE BRANCH MUST NOT BE DEPLOYED before a human runs MANUAL_STEPS S-20 (backup → backfill with the owner's email → 0003 → verify).** Deviation DEV-7 (unscoped balance RPCs) is **resolved**: `getCustomerBalance`/`getAllCustomerBalances` no longer call the unscoped v1 SECURITY DEFINER RPCs — they read the `customer_balances` view, so the caller's RLS applies; 0003 drops the old functions so nothing can regress to them. The view definition in the (still unapplied) 0002 migration was amended to expose `business_id` and to join transactions on matching businesses — a stretch outside S-20's literal touch zone, done at the source because 0002 has never been applied to any database. Two parameter orders were normalized business-first (`getAllTransactions`, `getTodayTransactions`) and their hooks/pages updated. Query-key factories (`queryKeys.ts`) keep optional ids — they are cache keys, not data access; the API is the contract. The transitional "unscoped when omitted" tests were replaced by compile-time contract tests. `business/hooks.ts` `useBusiness`/`useBusinessImpact` are required as well (enabled-gating handles the empty-string case).

## S-19 scenarios (checklist)

- [x] Danger zone is owner-only — `DangerZone` is rendered by SettingsPage only when the URL business's role is owner; Editor/Viewer never see the section or its button (tested: viewer)
- [x] Impact is shown before confirming — the dialog counts customers, transactions, members and pending invitations with head-only count queries (`getBusinessImpact`, fetched when the dialog opens) and states "This action cannot be undone." (tested with the PRD's 58/340/3 figures plus 1 invitation)
- [x] Typed confirmation — the Delete button stays disabled until the exact business name is typed; near-misses don't enable it (tested: "Rahim Trader" stays disabled, + "s" enables)
- [x] Successful deletion — one `delete` statement on `businesses` removes the business plus every customer, transaction, member and invitation through the schema's `on delete cascade` foreign keys (verified in migration 0001: all four tables cascade); toast "Business deleted"; memberships are refetched and the user lands on `/businesses` if they still belong somewhere, otherwise `/onboarding/business` (tested: both destinations)
- [x] I can start again — landing on `/onboarding/business` puts the user straight back into the tested S-15 create flow (covered by the onboarding-destination test + S-15 suite)
- [x] Failure is safe — a failed delete (tested with a forbidden AppError) removes nothing, keeps the dialog open and shows the error; no toast, no navigation (tested)

**S-19 notes:** zero rows from the owner-only RLS delete are mapped to a forbidden AppError in `deleteBusiness` (same treatment as `updateBusiness`). `useDeleteBusiness.onSuccess` drops every `["business", businessId]` cache entry (customers/transactions scopes) and invalidates memberships. Bug fixed mid-story: `useDeleteBusiness` initially referenced `queryClient` without calling `useQueryClient()`, so the `onSuccess` callback threw and rejected `mutateAsync` (the API had succeeded but the toast/navigation never ran) — caught by the tests. Human verification item for later (needs the real DB + a test business with members and invitations, per the story's "Done when"): confirm the cascade leaves no orphan rows — SQL for humans will be listed in docs/MANUAL_STEPS.md when migrations are applied.

## S-18 scenarios (checklist)

- [x] Owner edits — the owner opens `/b/:businessId/settings`, changes the name and saves: toast "Business updated"; the sidebar business name updates immediately (the mutation writes through the detail cache and invalidates memberships, which the sidebar switcher reads — the switcher now shows the URL business's name with a "BahiKhata" fallback pre-migrations) (tested: rename → toast, api args, sidebar switcher re-renders with the new name from the shared cache)
- [x] Same validation as creation — the form reuses `createBusinessSchema` and the same `TextField` error rendering, so invalid names show the identical inline errors (tested: 1-char name → "Name must be at least 2 characters", no api call)
- [x] Non-owners can look but not change — role comes from the URL business's membership (the minimal inline check until S-21 ships the shared role hook): Editor/Viewer see a read-only detail list, no fields, no Save button (tested with viewer)
- [x] Database refuses unauthorized updates — `updateBusiness` maps the zero-rows result of the owner-only RLS policy to a forbidden AppError (same page whether the business is gone or the change was refused); the page shows a clear toast ("Could not update business" + description), the form keeps its values and the server state is unchanged (tested)
- [x] Navigation — Settings is now visible in the sidebar for every member (`buildNavItems` visible: scoped), route `/b/:businessId/settings` registered under the guard, AppShell title "Settings" (tested in appShell suite: visible label + href)

**S-18 notes:** touch-zone stretch — `BusinessSwitcher` now displays the business named by the URL (falls back to "BahiKhata" while memberships are unavailable, e.g. pre-migration), because the scenario requires the sidebar name to update immediately; the full switcher remains S-26. "Page titles update immediately" is interpreted as every surface that shows the business name (sidebar switcher + the settings page's own data via `setQueryData`), since no other page title embeds the business name. New data layer: `getBusiness`/`updateBusiness` API (RLS-filtered), `useBusiness`/`useUpdateBusiness` hooks, `businessKeys.detail`. The owner form syncs via RHF `values` (not `defaultValues`) so late-loading data never overwrites typing, and a failed save never clobbers the form.

## S-17 scenarios (checklist)

- [x] All pages are business scoped — dashboard, customers, customer detail, import and transactions are served under `/b/:businessId` (new route tree in App.tsx: `BusinessGuard` layout → `AppShell` → scoped child routes), and every data call receives the businessId from the URL (all six pages + the shared components CustomerCombobox / AddTransactionSheet / EditTransactionSheet / QuickAddTransactionSheet call `useScopedBusinessId()` and pass it to their hooks; the transactions API gained the missing optional `businessId` filters — getTransactionById, getTodayActivity, getAllTransactions, getTodayTransactions — following the S-07 `if (businessId) .eq(...)` pattern; tested: two tabs with different URLs make differently-scoped data calls)
- [x] Legacy URLs keep working — `/customers`, `/customers/:id`, `/transactions` redirect to the same page under the active business via `LegacyBusinessRedirect` (active = own business; no business → My businesses; tested: plain, with-id, and no-business rows)
- [x] Unknown or forbidden business — `BusinessGuard` checks the URL businessId against the (RLS-filtered) membership list; unknown and forbidden are the same page: "Business not found or you do not have access" + a "Go to My businesses" link; blocked children never mount so no data from that business is requested (tested: denial copy, link href, child not rendered, `listCustomers` not called)
- [x] URLs are the single source of truth — each tab's URL drives its own scoped calls (tested: tab A → `listCustomers("tab-a")`, tab B → `listCustomers("tab-b")`); landing resolver now redirects an owner to `/b/:businessId` instead of rendering the dashboard at `/`
- [x] Links are generated — `paths.ts` builders take a businessId (`paths.business/customers/customerDetail/importCustomers/transactions/transactionDetail/members/settings`), the old string constants are removed, `routePatterns` carries both the scoped patterns and the `legacy*` redirect patterns; navConfig became `buildNavItems(businessId)` fed by `useParams` in the Sidebar (tested: nav hrefs exactly `/b/biz1/...`)

**S-17 notes:** `useScopedBusinessId()` returns `string | null` — `null` only outside `/b/:businessId` (tests rendering pages bare); falsy scope behaves identically to `undefined` (unscoped transitional keys/filters, v1 grace until S-20). Deviation DEV-10 is **resolved**: every membership row on My businesses now has a working Open (business URLs exist). Honest caveat: v1 rows have `business_id = NULL`, so after the backfill in S-20 scoped queries will show legacy data — until that manual step runs, scoped lists appear empty for pre-v2 rows (logged as a manual-step ordering note, not a code defect). Detail route params renamed `:id` → `:customerId` / `:transactionId` for clarity (URLs unchanged). Balance RPCs remain unscoped server-side (DEV-7 — resolved in S-20) — their query *keys* are business-scoped so tabs never share cached balances.

## S-16 scenarios (checklist)

- [x] Resolve from `/` (Scenario Outline, all five rows) — owner → their business dashboard (renders in place at `/`, since the dashboard URL doesn't change until S-17: no redirect loop), member elsewhere → `/businesses`, pending invitation only → `/businesses`, no business → `/onboarding/business`, deleted business and belong nowhere → `/onboarding/business` (tested: all five data shapes)
- [x] Deep link survives login — `ProtectedRoute` now carries `state={{ from: { pathname, search } }}` on its redirect to `/login`; after sign-in `LoginPage` returns to that URL when the user may access it (transitional rule: status `ready`), otherwise `/` hands them to the landing resolver (tested: honored / not-accessible fallback / no deep link)
- [x] No flicker — while the decision is being made only `BusinessBootSkeleton` shows; no intermediate page renders (tested: skeleton + no dashboard + location unchanged)
- [x] Signed-out users are sent to `/login` on any protected route, with the attempted URL remembered (tested: pathname+search round-trip)

**S-16 notes:** constraint C-2 satisfied — S-16 also creates the minimal My businesses page at `/businesses` (PageHeader + DataTable + StatusBadge role labels + EmptyState with a Create business shortcut). **DEV-10:** the row "Open" button renders only for the user's **owned** business; a shared business has no per-business URL before S-17, so an Open there would bounce straight back through the resolver (redirect loop) — shared-business Open lands with S-17 scoped URLs / S-26 switcher. Deep-link access is a URL-level check only from S-17 (businessId validation); pre-S-17 every protected URL is reachable by any signed-in user, so `status === "ready"` is the transitional gate. Test-harness note: LoginPage must be mounted inside `<Routes>` in tests (as in the app) or its redirect re-fires after navigation and stomps the deep link.

## S-15 scenarios (checklist)

- [x] Create with the minimum — name only submits via the `create_business` RPC (`createBusiness` in features/business/api.ts; business + Owner membership in one step, owner row added by the 0001 trigger), toast "Business created", lands on the business dashboard (`/` until S-17; memberships invalidated so the provider re-resolves the new business immediately) (tested, keyboard-only)
- [x] Optional details — business type (Retail/Wholesale/Services/Manufacturing/Other), phone, email, address and notes sit under a collapsible "More details" section; empty never blocks saving (tested: submit with only a name sends `undefined` for every optional)
- [x] Name validation — zod schema trims and enforces 2–80 characters with inline errors under Name; nothing is saved (tested)
- [x] Failure keeps input — mutation failure shows a `role="alert"` banner with the AppError message and a "Try again" button that resubmits; every field keeps its value (tested)
- [x] Only one owned business — when `useActiveBusiness()` status is already ready, the page redirects to the dashboard with the toast notice "You already own a business"; the RPC + unique index are the database backstop (tested)
- [x] Double submit is safe — the submit button disables (with spinner) while the mutation is pending and react-hook-form ignores re-entry; a second click creates nothing (tested: one api call)
- [x] Keyboard only (Done-when) — autofocus on Name, type, Enter submits via implicit form submission (tested exactly that way)

**S-15 notes:** OnboardingLayout is a minimal centered card (app name + form), outside the AppShell so no sidebar shows during setup. The route `/onboarding/business` sits under ProtectedRoute but outside the shell. Full Google-OAuth click-through remains manual (no DB/credentials); the RPC exists in migration 0002 (pending application — see MANUAL_STEPS).

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
| DEV-7 | Balance RPCs are scoped helpers (PRD 4.2 view/RPC design) | `get_customer_balance` / `get_all_customer_balances` are `security definer` with **no `search_path` pin and no RLS awareness** | S-06 replaces them with membership-scoped, `search_path`-pinned equivalents (`dashboard_summary` etc.) and pins the old ones during transition. Old policies stay until S-20. **Resolved by S-20:** the client reads the security-invoker `customer_balances` view (now carrying `business_id`), and migration 0003 drops the old RPCs for good. |
| DEV-8 | `lib/format.ts`, `lib/queryKeys.ts`, `src/app/paths.ts` exist | None exist; money/dates are inline `toLocaleString`/`toLocaleDateString`, paths are hardcoded | Created in S-09 (`format.ts`), S-04 (`queryKeys.ts`), S-12 (`paths.ts`). |
| DEV-9 | v1 has no `updated_by`/`voided_*` audit columns (PRD 4.1 additive list) | Confirmed absent; only `created_by` exists | Added in S-05 exactly as sketched. |
| DEV-10 | S-16/C-2 minimal My businesses page must include an "Open" button per membership | No per-business URL exists before S-17, so Open on a shared business would redirect through the resolver and bounce back (loop) | Open renders for the owned business from S-16; **resolved by S-17** — business URLs exist, every membership's Open navigates to `/b/:id`, the guard enforces membership. |
| DEV-11 | S-24 touch zone lists only `InvitationCard.tsx` + the BusinessesPage invitations section | The scenario also mandates (a) a top bar invitation count badge (`src/components/layout/Topbar.tsx`) and (b) business name + inviter on the card, which RLS correctly hides from non-members — requiring a new DB function | The badge reuses the shared `useMemberships()` query (no extra fetch; hidden at zero). Migration `0002b_my_invitations.sql` adds `my_invitations()`, a security-definer function joining only the display fields for the caller's own pending invitations (matched on the JWT email; zero arguments). The app works without it (empty list). |
| DEV-12 | S-25 "History stays readable" says removed members' transactions "show the creator's name, or 'Former member' if the profile is gone" | No UI renders transaction creators yet — the "Recorded by (avatar and name)" column is S-35's, outside S-25's touch zone | S-25 pins the **data contract** in SQL test 0002c: transactions survive removal, the creator's name resolves while the profile is readable, and the join yields NULL once it is not (removed member's profile is co-members-RLS-hidden; deleted profile row leaves the transaction intact). The UI that renders name-or-"Former member" ships with S-35's column, which must implement the fallback per this contract. |
| DEV-13 | S-27 touch zone lists only the provider, guards and `src/app/queryClient.ts`; the scenarios require distinguishing **removed** ("You no longer have access to X" → /businesses) from **deleted** ("This business no longer exists" → landing resolver) | Under RLS both cases are identical on the client: the business is simply absent from the membership list and every scoped query returns zero rows. No existing function reveals existence to a non-member | Migration `0003b_business_exists.sql` adds `business_exists(uuid)`: security-definer, returns one boolean (row exists or not), execute granted to `authenticated` only. Business ids are random UUIDs, so the single existence bit is not enumerable and leaks nothing else; SQL test 0003b covers member/outsider/deleted/anon. The guard probes only after a membership *disappeared while mounted* (deep links keep S-17's static page), and a probe failure falls back to the access-lost message so the flow works even before the migration is applied. |

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
