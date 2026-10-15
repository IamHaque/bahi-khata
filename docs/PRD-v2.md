# BahiKhata v2: Multi-Business, Sharing and UI Modernization

**Type:** Product Requirements Document in BDD (Gherkin) form, written to be executed by an autonomous build agent **Status:** Ready for build **Date:** 11 October 2026 **Repo:** github.com/IamHaque/bahi-khata (branch `master`) **Relationship to v1:** extends `BahiKhata-PRD.md`. Section 2.2 lists exactly which v1 constraints this document overrides. Everything not overridden stays in force.

---

## 1. Context

### 1.1 What the repository contains today

Confirmed from the repo root, `package.json` and the v1 PRD:

- **Stack:** Vite 7, React 19, TypeScript 5.8, Tailwind CSS 4, shadcn/ui on Base UI (`@base-ui/react`, so composition uses the `render` prop rather than Radix `asChild`; verify in `components.json`), react-router-dom 7, Supabase JS (Google sign-in and Postgres), sonner, next-themes, lucide-react, vitest. Geist and Public Sans fonts are installed.
- **v1 product:** Google sign-in; customers (name, phone, email, address, alternate contact, tags, notes); transactions of type `charge` or `payment` with status `active | edited | voided` and source `manual | import`; balance always derived from transactions and never stored; a dashboard; a filterable Transactions page with detailed and summarized views; CSV history import.
- **Missing:** no README, no `supabase/` folder (so the schema and RLS policies may not be version controlled), and `@tanstack/react-query` is not installed although v1 mentions React Query.
- **Not verified when this PRD was written:** the contents of `src/` (GitHub blocked folder browsing). Story S-01 audits the code first. Where the code differs from the v1 data model assumed here, the agent adapts minimally and records the deviation in `docs/PROGRESS.md`.

### 1.2 Problems this release solves

1. Every signed-in user reads and writes the same data. There is no business concept, no isolation, no sharing.
2. There is no way to delete a customer or a business, and no settings.
3. Screens were built one at a time, so tables, forms, dialogs and empty states behave differently from page to page.
4. The look is functional but plain. It should feel like a modern fintech or ledger product.

### 1.3 Goals

- **G1** Each business is an isolated workspace. Users only ever see data of businesses they belong to.
- **G2** A user owns at most one business and manages its whole lifecycle: create, edit, delete.
- **G3** A business can be shared with other Google accounts with a role (Owner, Editor, Viewer).
- **G4** Complete, consistent create / read / update / delete for business, customers and transactions.
- **G5** One design system: same tables, forms, dialogs, filters, empty/loading/error states and interactions everywhere, with a modern, polished look.
- **G6** Delivery in small stories. Every story ends in a green build and a git commit, and no story breaks another.

### 1.4 Non-goals

Email delivery of invitations, notifications or reminders (SMS/WhatsApp), multiple owned businesses per user, ownership transfer, billing or subscriptions, multi-currency, offline mode, native mobile apps, double-entry accounting.

---

## 2. Locked product decisions

Items marked **Confirm** are my interpretation of the request. The agent implements them as written; the product owner can change them before or during the build, and any change affects only the stories named.

### 2.1 Decisions

| ID   | Decision                                                                                                                                                                                                                                                                                                                                    | Rationale                                                                                                                           | Status  | Stories affected   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------ |
| D-01 | A user can **own at most one** business (enforced by a unique index in the database, not just the UI) and can be a **member of any number** of other businesses.                                                                                                                                                                            | Matches the request: one business per user, plus businesses shared with them.                                                       | Locked  | S-05, S-15, S-26   |
| D-02 | Three roles per business: **Owner**, **Editor**, **Viewer**.                                                                                                                                                                                                                                                                                | Needed so a shared person can be view-only. Replaces v1 single-role rule.                                                           | Confirm | S-21 to S-25       |
| D-03 | After login: (a) user owns a business, go straight to that business dashboard; (b) no owned business but has memberships or pending invitations, show the **My businesses** page with Create your business as the primary card; (c) nothing at all, show the Create business page. A user who deleted their business falls into (b) or (c). | (a) and (c) are as requested. (b) is the minimal extension that satisfies: I can choose my own business or the ones shared with me. | Confirm | S-16, S-26         |
| D-04 | Sharing is by **Google account email**. The invited person sees the invitation after signing in and must **accept or decline**. No email is sent in v2.                                                                                                                                                                                     | No email infrastructure exists. Explicit accept avoids silently joining someone's books.                                            | Confirm | S-23, S-24         |
| D-05 | **Delete semantics.** Customers: soft delete (Archive) with Restore; permanent delete only by Owner from the archive, with typed confirmation. Transactions: Void and Restore (the v1 audit-trail rule FR-9a stays). Business: permanent delete with cascade, Owner only, typed-name confirmation.                                          | Protects financial history from accidental loss while still giving real delete.                                                     | Confirm | S-19, S-30, S-34   |
| D-06 | All business data lives under `/b/:businessId/...` URLs.                                                                                                                                                                                                                                                                                    | Deep links, multi-tab use, simple switching, simple access checks.                                                                  | Locked  | S-17               |
| D-07 | **Existing data** (customers and transactions created before v2) is attached to one business owned by a human-designated account, via a manual SQL script the human runs. The agent writes the script but never runs it against a real database.                                                                                            | The author of this PRD cannot know which account should own existing data.                                                          | Confirm | S-20               |
| D-08 | **Expand then contract** delivery: additive schema and optional `businessId` first, enforcement last (S-20).                                                                                                                                                                                                                                | Keeps every commit shippable.                                                                                                       | Locked  | S-05 to S-07, S-20 |
| D-09 | Currency stays INR (₹) with Indian digit grouping (lakh, crore). One `formatMoney()` helper is the only formatter.                                                                                                                                                                                                                          | v1 assumption retained.                                                                                                             | Locked  | S-09               |
| D-10 | UI vocabulary: customer owes the business = **Owes you** (receivable); business owes the customer = **You owe** (credit); zero = **Settled**. Use the word **Business** in the UI, not tenant or workspace.                                                                                                                                 | Consistent copy across all screens.                                                                                                 | Locked  | All UI stories     |
| D-11 | Theme comes from a shadcn-compatible preset (tweakcn.com or ui.shadcn.com/themes) adapted to the semantic tokens in 4.5, not from hand-picked hex values scattered in components.                                                                                                                                                           | Polished look with one place to change it.                                                                                          | Locked  | S-08               |

### 2.2 v1 constraints overridden by this document

| v1 statement                                | v2 replacement                                     |
| ------------------------------------------- | -------------------------------------------------- |
| Non-goal: single business only              | Multi-business with isolation (G1, D-01)           |
| Section 7 and FR-10: one role, equal access | Three roles (D-02, Section 3)                      |
| Section 12: no settings page                | Business settings and Members pages exist          |
| EPIC-002 out of scope: customer deletion    | Customer archive, restore, permanent delete (S-30) |
| Section 12 route list                       | Routes in Section 4.3                              |

Retained from v1: derived balances, void/edit audit trail (FR-9a), no future-dated transactions, import semantics, accessibility requirements (Section 17), reduced-motion rule, data-integrity and performance requirements (server-side filtering, pagination and aggregation).

---

## 3. Roles and permissions

| Capability                                              | Owner                    | Editor | Viewer |
| ------------------------------------------------------- | ------------------------ | ------ | ------ |
| View business, customers, transactions, dashboard       | Yes                      | Yes    | Yes    |
| Export CSV and print statements                         | Yes                      | Yes    | Yes    |
| Create and edit customers                               | Yes                      | Yes    | No     |
| Archive and restore customers                           | Yes                      | Yes    | No     |
| Permanently delete a customer                           | Yes                      | No     | No     |
| Add, edit, void, restore transactions                   | Yes                      | Yes    | No     |
| Import CSV history                                      | Yes                      | Yes    | No     |
| Edit business details                                   | Yes                      | No     | No     |
| Invite, change role, remove members, revoke invitations | Yes                      | No     | No     |
| Delete business                                         | Yes                      | No     | No     |
| Leave business                                          | No (must delete instead) | Yes    | Yes    |

Permissions are enforced in two places: **row-level security in the database (the source of truth)** and the UI (hides or disables actions for a better experience). UI checks never replace database checks.

---

## 4. Target architecture

### 4.1 Data model (additive to v1)

The SQL below is a sketch. The agent writes real migrations (S-05, S-06) after reading the actual schema in S-01 and S-03.

```sql
create type business_role as enum ('owner','editor','viewer');
create type invitation_status as enum ('pending','accepted','declined','revoked');

-- Mirror of auth users so co-members can see names and avatars (member lists, audit trail)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  business_type text, phone text, email text, address text, notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index businesses_one_per_owner on businesses (owner_id);

create table business_members (
  business_id uuid not null references businesses on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role business_role not null,
  joined_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create unique index one_owner_row_per_business on business_members (business_id) where role = 'owner';

create table business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses on delete cascade,
  email text not null check (email = lower(email)),
  role business_role not null check (role in ('editor','viewer')),
  status invitation_status not null default 'pending',
  invited_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  responded_at timestamptz
);
create unique index one_pending_invite_per_email on business_invitations (business_id, email) where status = 'pending';

-- Existing tables: additive columns, nullable until S-20
alter table customers
  add column business_id uuid references businesses on delete cascade,
  add column created_by uuid references auth.users,
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users;
alter table transactions
  add column business_id uuid references businesses on delete cascade,
  add column updated_by uuid references auth.users,
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users;
create index on customers (business_id, deleted_at);
create index on transactions (business_id, occurred_at desc);
create index on transactions (business_id, customer_id);
```

Integrity rules the migrations must add: a trigger that rejects a transaction whose `business_id` differs from its customer's `business_id`; a trigger that inserts the Owner row into `business_members` when a business is created; a trigger that fills `profiles` from `auth.users` on sign-up (plus a one-time backfill).

### 4.2 Security rules (row-level security)

1. RLS is enabled on every table. Policies target the `authenticated` role only. No policy for `anon`.
2. Two `security definer` helper functions with a fixed `search_path`: `is_member(business_id)` and `has_role(business_id, minimum_role)`. Policies call them using `(select auth.uid())` style subqueries for performance. This also avoids recursive-policy errors on `business_members`.
3. `customers` and `transactions`: select needs membership; insert and update need Editor or above; permanent delete of a customer needs Owner.
4. `businesses`: select needs membership; update and delete need Owner; insert only with `owner_id = auth.uid()`.
5. `business_members`: select for co-members; writes only through RPCs or Owner-only policies. An Owner row can never be changed or removed except by deleting the business.
6. `business_invitations`: Owner of the business can select, insert, update; the invited person can select rows where `email` equals their JWT email, and can change only `status` to accepted or declined through the `respond_to_invitation` RPC.
7. Every **view** used for balances or summaries is created `with (security_invoker = true)` so it respects the caller's RLS. Aggregates are RPCs or views that always take a `business_id`.
8. RPCs (all `security definer`, all validating the caller): `create_business`, `respond_to_invitation`, `leave_business`, `change_member_role`, `remove_member`, `dashboard_summary(business_id)`.

### 4.3 Routes

| Path                                   | Purpose                                               | Layout     |
| -------------------------------------- | ----------------------------------------------------- | ---------- |
| `/login`                               | Google sign-in                                        | Auth       |
| `/`                                    | Resolves where to send the user (D-03)                | None       |
| `/onboarding/business`                 | Create business                                       | Onboarding |
| `/businesses`                          | My businesses and Shared with me, pending invitations | Onboarding |
| `/b/:businessId`                       | Dashboard                                             | AppShell   |
| `/b/:businessId/customers`             | Customer list                                         | AppShell   |
| `/b/:businessId/customers/:customerId` | Customer detail                                       | AppShell   |
| `/b/:businessId/customers/import`      | CSV import                                            | AppShell   |
| `/b/:businessId/transactions`          | All transactions                                      | AppShell   |
| `/b/:businessId/members`               | Members and invitations                               | AppShell   |
| `/b/:businessId/settings`              | Business settings, danger zone                        | AppShell   |
| `/__ui`                                | Component gallery, development builds only            | AppShell   |

Legacy paths (`/customers`, `/customers/:id`, `/transactions`) redirect to the active business equivalent (S-17). Every link is built through `src/app/paths.ts`; no component hardcodes a path string.

### 4.4 Code organisation

Adapt to the existing structure. Do not mass-move files unless a story says so.

```
src/
  app/          router, providers, paths.ts, queryClient
  components/
    ui/         generated shadcn primitives (change only for tokens)
    app/        shared composed components: Money, DataTable, FilterBar, PageHeader, ...
    layout/     AppShell, Sidebar, Topbar, OnboardingLayout
  features/
    auth, business, members, customers, transactions, dashboard, import-export
      api.ts  hooks.ts  schemas.ts  components/  pages/
  lib/          supabase client, format.ts, queryKeys.ts, permissions.ts
supabase/
  migrations/   numbered, append-only
  manual/       one-off scripts a human runs (backfill)
  tests/        SQL tests for RLS
docs/
  PROGRESS.md  MANUAL_STEPS.md  BACKLOG.md  ARCHITECTURE-BASELINE.md  UI-CONTRACT.md
```

Rules that keep stories from colliding:

- Only `features/*/api.ts` talks to Supabase. Components call hooks, hooks call api.
- Query keys come only from `lib/queryKeys.ts` and always start with the business id.
- Paths come only from `paths.ts`. Money and dates only from `lib/format.ts`.
- Colors only from semantic tokens. No raw hex or Tailwind palette colors (such as `text-green-600`) in feature code.

### 4.5 UI foundation and design direction

**Reference products** for patterns, not for copying: Khatabook, OkCredit and Vyapar for the ledger domain and vocabulary; Mercury, Stripe Dashboard, Linear and Vercel for polish, density and navigation.

- **Layout:** left sidebar (collapsible to icons on desktop, drawer on mobile) with the business switcher at the top; slim top bar with page title, global search (command palette, Ctrl/Cmd+K), theme toggle and user menu. Content has a max width and consistent page padding.
- **Surfaces:** soft borders instead of heavy shadows, `rounded-lg` for inputs and buttons, `rounded-xl` for cards, generous but not wasteful spacing. One shape language everywhere.
- **Typography:** one UI family (Geist, already installed, unless the chosen preset specifies another; remove the unused font). All money uses tabular numerals, right-aligned in tables, and is the visual anchor of its row.
- **Semantic tokens** (defined once, light and dark): `primary` (blue or indigo hue, around 255 to 265 in OKLCH), `receivable` (green, around 150), `credit` (red-orange, around 25), `settled` (neutral), plus standard `success`, `warning`, `destructive`, `muted`. Balance meaning is always shown by token color **and** a text label. All text and balance colors meet WCAG AA in both themes.
- **Components every screen must reuse:** `PageHeader`, `StatCard`, `Money`, `BalanceBadge`, `StatusBadge`, `EmptyState`, `ErrorState`, `Skeleton*`, `DataTable`, `SearchInput`, `FilterBar`, `EntityDialog` (create and edit forms), `ConfirmDialog` (plain and typed-confirmation variants), `RowActionsMenu`, `Avatar` with deterministic initials color.
- **Interaction rules:** create and edit happen in the same dialog or sheet component; destructive actions always go through `ConfirmDialog` with a specific verb label (never OK); every mutation shows a toast; every list has loading, empty, no-results and error states; every table row action lives in a three-dot `RowActionsMenu` plus a primary click target; buttons show a spinner while saving; forms never lose input on error.
- **Motion:** feedback only (dialog and sheet transitions, balance change flash), respects `prefers-reduced-motion`.

### 4.6 Allowed dependencies

Add only these without asking: `@tanstack/react-query`, `@tanstack/react-table`, `react-hook-form`, `zod`, `@hookform/resolvers`, `date-fns`, `recharts` (through the shadcn chart component), `@testing-library/react`, `@testing-library/user-event`, `jsdom`. A CSV parser is allowed only if the current import does not already use one. Anything else needs a one-line justification in `docs/PROGRESS.md`.

---

## 5. Agent operating contract

These rules apply to every story. They exist so the work is saved continuously and one story cannot break another.

1. **Read first.** Read this whole document, then start with S-01. Do not start coding before S-01 is committed.
2. **Branch.** Create `feat/v2-multi-business` from `master`. Never commit to `master`, never force-push, never rewrite history.
3. **One story at a time, in the order of Section 6.** Do not start the next story until the current one is committed. If a story is blocked after two honest attempts, record the blocker in `docs/PROGRESS.md` and continue with the next story that does not depend on it.
4. **Per-story loop.**
   1. Copy the story's scenarios into `docs/PROGRESS.md` as a checklist.
   2. Write tests for the scenarios that can be automated (vitest, plus SQL tests for RLS) before or with the implementation.
   3. Implement only what the story says.
   4. Run `npm run lint`, `npm run typecheck` (added in S-02), `npm run build` and `npm test`. All must pass.
   5. Manually exercise each scenario in the running app where UI is involved, and note what was checked.
   6. Update `docs/PROGRESS.md` (status, commit hash, deviations) in the same commit.
   7. **Commit** with the message format below, then push if a remote is configured.
5. **Commit format.** `type(S-NN): short imperative summary`, where type is `feat`, `fix`, `refactor`, `test`, `docs` or `chore`. Body lists the scenarios verified and any manual steps. One commit per story at minimum; large stories may use several commits, each green and each naming the story. No commit may leave the build broken. Never commit `.env` files or secrets.
6. **Isolation rules.**
   - Each story has a **touch zone**. Edit outside it only with additive changes (new exports, new files). If a shared function must change shape, update every caller in the same commit.
   - Schema changes are new numbered migration files. Never edit an applied migration.
   - Follow the expand then contract order: nothing becomes required, and no old policy is dropped, before S-20.
7. **Database access.** The agent writes SQL but does not assume access to the production database. Anything a human must run goes into `docs/MANUAL_STEPS.md` with the exact order, the exact SQL file and how to verify it. Until it is run, the app must degrade gracefully and the PROGRESS entry must say so. Never fake a database response.
8. **Scope discipline.** Discovered extra work goes to `docs/BACKLOG.md`, not into the current story. If the real code contradicts an assumption in this PRD, make the smallest adaptation and log it under Deviations.
9. **No regressions.** Everything that worked before a story still works after it. Keep a short smoke checklist in `docs/PROGRESS.md` (login, list customers, add customer, add transaction, dashboard totals) and re-run it after every story that touches data or routing.
10. **Quality bar.** TypeScript strict, no `any` without a comment, no unused code, accessible labels on every control, no raw colors, no hardcoded paths.

---

## 6. Delivery plan and isolation

### 6.1 Order

| Epic                                       | Stories      | Purpose                                                                     | Can run in parallel with |
| ------------------------------------------ | ------------ | --------------------------------------------------------------------------- | ------------------------ |
| E0 Baseline and safety net                 | S-01 to S-04 | Understand the code, add checks, version the schema, centralize data access | None (do first)          |
| E1 Multi-business data foundation (expand) | S-05 to S-07 | Invisible backend and data-layer groundwork                                 | E2                       |
| E2 Design system and app shell             | S-08 to S-13 | Theme, shared components, new shell                                         | E1                       |
| E3 Business lifecycle                      | S-14 to S-20 | Create, route, edit, delete, then enforce tenancy                           | None                     |
| E4 Sharing and business switching          | S-21 to S-27 | Roles, members, invitations, switcher                                       | None                     |
| E5 Customers                               | S-28 to S-31 | Full customer CRUD on the new UI                                            | E6                       |
| E6 Transactions                            | S-32 to S-35 | Full transaction operations on the new UI                                   | E5                       |
| E7 Dashboard                               | S-36, S-37   | KPI and trends                                                              | E8                       |
| E8 Import and export                       | S-38, S-39   | Business-scoped import, exports                                             | E7                       |
| E9 Hardening and release                   | S-40 to S-43 | Accessibility, responsive, security, docs                                   | None                     |

Why this order avoids rework: the data layer is refactored once (S-04) and scoped once (S-07); the shared UI kit exists (E2) before any new page is built, so no page is restyled later; the route change (S-17) touches only `paths.ts` and the router; enforcement (S-20) comes only after every code path already passes a business id.

### 6.2 Story card legend

Each story shows: **Size** (S, M or L), **Depends on**, **Touch zone**, **Commit**, a Gherkin feature with scenarios, and **Done when**. Scenarios use single quotes for example values. Where a scenario says a role (for example Viewer), it applies to the signed-in user on the business named.

---

## 7. Epics and stories

### EPIC E0: Baseline and safety net

**Objective:** know the real code, add checks, version the schema, and centralize data access, all without changing behavior. Every later story depends on this.

#### S-01 Repository audit and baseline documentation

**Size** S | **Depends on** none | **Touch zone** `docs/` only | **Commit** `docs(S-01): add architecture baseline and progress log`

```gherkin
Feature: Understand the existing application before changing it
  As the build agent
  I want a written baseline of the current code, schema and behavior
  So that later stories adapt to reality instead of assumptions

  Scenario: Baseline document is produced
    Given the repository at master
    When I audit src, config files, package.json and every place Supabase is used
    Then docs/ARCHITECTURE-BASELINE.md lists routes, pages, auth flow and shared components
    And it lists every file that calls supabase directly
    And it lists table and column names as inferred from code and types

  Scenario: Differences from this PRD are recorded
    Given the code differs from the data model in section 4.1
    When the audit is finished
    Then docs/PROGRESS.md has a Deviations section naming each difference and the chosen adaptation

  Scenario: Progress log exists
    When S-01 is committed
    Then docs/PROGRESS.md contains a table of S-01 to S-43 with status, commit and notes columns
    And it contains the smoke checklist from section 5 rule 9
```

**Done when:** no source file changed and the app still builds.

#### S-02 Quality gates, test harness and CI

**Size** S | **Depends on** S-01 | **Touch zone** config files, `src/test/`, `.github/workflows/` | **Commit** `chore(S-02): add typecheck, test harness and CI`

```gherkin
Feature: Automated checks protect every later story
  Scenario: Local scripts exist
    When I run npm run typecheck, npm run lint, npm run build and npm test
    Then each succeeds on a clean checkout

  Scenario: Components can be tested with app providers
    Given a test helper that renders with router and query client
    When a sample component test runs under vitest with jsdom
    Then it passes and the helper is documented in docs/PROGRESS.md

  Scenario: CI runs on every push
    Given a GitHub Actions workflow
    When code is pushed to any branch
    Then lint, typecheck, build and test run, and any failure marks the run failed
```

**Done when:** a deliberately failing test (removed afterwards) is shown to fail the local check.

#### S-03 Versioned database baseline and manual-steps log

**Size** M | **Depends on** S-01 | **Touch zone** `supabase/`, `docs/MANUAL_STEPS.md` | **Commit** `chore(S-03): version database baseline`

```gherkin
Feature: The database schema lives in the repository
  Scenario: Baseline migration reflects the current schema
    Given the actual schema is available through the Supabase CLI or a dashboard export
    When I create supabase/migrations/0000_baseline.sql
    Then it creates customers, transactions and their views, functions and policies using create-if-not-exists patterns
    And it is marked as exported, or marked as reconstructed from code and the v1 PRD when no export was possible

  Scenario: Humans know how to apply changes
    When S-03 is committed
    Then docs/MANUAL_STEPS.md explains how to apply migrations in order
    And it warns never to run 0000 against a database that already has these tables without diffing first

  Scenario: SQL tests have a home
    Then supabase/tests/ exists with a README describing how RLS tests are run
```

**Done when:** the baseline reads top to bottom and matches the S-01 audit.

#### S-04 Data-access layer and TanStack Query, no behavior change

**Size** L | **Depends on** S-02 | **Touch zone** `src/features/*/api.ts`, `hooks.ts`, `src/lib/queryKeys.ts`, `src/app/providers.tsx`, and current call sites of supabase | **Commit** `refactor(S-04): centralize data access with react-query`

```gherkin
Feature: One data-access layer
  As a developer
  I want all database calls in one place
  So that business scoping can be added once

  Scenario: Components never call Supabase directly
    When I search src outside features/*/api.ts and lib/supabase
    Then no file imports the supabase client

  Scenario: Reads and writes go through hooks
    Given a screen that lists customers
    Then it reads through a useQuery hook and writes through useMutation hooks
    And successful mutations invalidate the affected query keys

  Scenario: Errors are normalized
    Given a database call fails with a permission, network or validation error
    Then the api layer throws an AppError with a code (forbidden, network, validation, unknown) and a user-safe message
    And screens show that message through the shared error pattern

  Scenario: Behavior is unchanged
    When I run the smoke checklist
    Then every item behaves exactly as before the refactor
```

**Done when:** the diff shows moved code and added hooks only, with no visual change.

---

### EPIC E1: Multi-business data foundation (expand phase)

**Objective:** add everything multi-tenancy needs in the database and data layer **without** making anything required, so the running app keeps working after every commit.

#### S-05 Additive schema: profiles, businesses, members, invitations, scoped columns

**Size** M | **Depends on** S-03 | **Touch zone** `supabase/migrations/0001_*.sql` | **Commit** `feat(S-05): add multi-business schema (additive)`

```gherkin
Feature: Database can represent businesses, members and invitations
  Scenario: Existing app is unaffected
    Given the migration is applied
    When the current app lists customers and adds a transaction
    Then both work because the new columns are nullable

  Scenario: One owned business per user
    Given user A already owns a business
    When user A inserts a second business
    Then the database rejects it with a unique violation

  Scenario: Owner membership is automatic
    When user A creates a business
    Then business_members contains exactly one row for A with role owner

  Scenario: Profiles are populated
    When a user signs in for the first time
    Then a profiles row exists with email, full_name and avatar_url from the Google identity
    And existing users are backfilled by the migration

  Scenario: Transactions cannot cross businesses
    Given a customer in business X
    When a transaction for that customer is inserted with the business_id of business Y
    Then the database rejects it
```

**Done when:** `docs/MANUAL_STEPS.md` lists the exact order to apply 0001 and includes rollback notes.

#### S-06 Additive RLS policies, helper functions, RPCs and secure views

**Size** L | **Depends on** S-05 | **Touch zone** `supabase/migrations/0002_*.sql`, `supabase/tests/` | **Commit** `feat(S-06): add membership-based RLS, RPCs and tests`

Postgres combines permissive policies with OR. The old broad policies stay until S-20, so the new ones are verified by SQL tests that run inside a rolled-back transaction with the old policies dropped.

```gherkin
Feature: Access rules are enforced by the database
  Background:
    Given business 'Acme' owned by Olivia, with Eli as Editor and Vic as Viewer
    And user Zed who is not a member

  Scenario: Members read, outsiders do not
    Then Olivia, Eli and Vic can read Acme customers and transactions
    And Zed reads zero rows

  Scenario: Viewer is read-only
    When Vic tries to insert, update or delete a customer or transaction in Acme
    Then every attempt is denied

  Scenario: Editor can write but not destroy
    When Eli inserts and updates customers and transactions
    Then it succeeds
    But Eli cannot permanently delete a customer or delete the business

  Scenario: Owner controls the business
    Then Olivia can update and delete Acme and manage members and invitations

  Scenario: Views respect RLS
    When Zed queries the balance view or calls dashboard_summary for Acme
    Then zero rows or an authorization error is returned, never Acme totals

  Scenario: Invitation by email
    Given an invitation for vic@example.com
    Then only Olivia and the person whose JWT email is vic@example.com can read it
    And respond_to_invitation adds a business_members row with the invited role on accept
```

**Done when:** all SQL tests pass and run instructions are in `supabase/tests/README.md`.

#### S-07 Business-scoped data layer (transitional)

**Size** M | **Depends on** S-04, S-05 | **Touch zone** `src/features/*/api.ts`, `src/lib/queryKeys.ts` | **Commit** `feat(S-07): scope data layer by optional businessId`

```gherkin
Feature: Every query and mutation can be scoped to a business
  Scenario: Scoped reads
    Given an api function is called with businessId 'b1'
    Then it filters by business_id 'b1'
    And its query key starts with ['business', 'b1']

  Scenario: Scoped writes
    When a customer or transaction is created with businessId 'b1'
    Then the row stores business_id 'b1' and created_by as the current user

  Scenario: Transitional compatibility
    Given businessId is omitted
    Then the function behaves exactly as before and is marked TODO(S-20) to become required

  Scenario: Key hygiene
    Then a unit test fails if any query key factory output lacks the business prefix

  Scenario: Summaries are scoped
    When businessId is given
    Then dashboard totals come from dashboard_summary(business_id)
```

**Done when:** the unscoped smoke checklist still passes and unit tests cover scoped and unscoped paths.

---

### EPIC E2: Design system and app shell

**Objective:** build the shared look and shared components first so every later screen is built once, consistently. This epic adds components and a new shell only; it does not rebuild feature pages (E5 to E7 do that on top of it).

#### S-08 Theme, tokens, typography and dark mode

**Size** M | **Depends on** S-02 | **Touch zone** global CSS, `components.json`, `src/components/ui/` (tokens only) | **Commit** `feat(S-08): modern theme and semantic tokens`

```gherkin
Feature: One theme drives the whole look
  Scenario: Preset adopted
    Given a shadcn-compatible preset chosen from tweakcn.com or ui.shadcn.com/themes
    When I apply it to the Tailwind 4 theme variables
    Then background, foreground, card, border, ring, radius and chart colors come from CSS variables
    And the choice and its source URL are recorded in docs/UI-CONTRACT.md

  Scenario: Financial tokens exist
    Then tokens receivable, credit and settled exist for light and dark themes
    And each meets WCAG AA contrast on both card and page backgrounds

  Scenario: Dark mode
    Given next-themes with system, light and dark options
    Then all existing screens remain readable in both themes

  Scenario: One font
    Then a single UI font loads with tabular numerals enabled for money
    And the unused font package is removed
```

**Done when:** existing pages look coherent (not redesigned) in both themes.

#### S-09 Display primitives

**Size** M | **Depends on** S-08 | **Touch zone** `src/components/app/` (new files), `src/lib/format.ts` | **Commit** `feat(S-09): shared display components`

```gherkin
Feature: Shared display components
  Scenario: Money is formatted in one way
    Given formatMoney(1234567.5)
    Then it returns the rupee symbol with Indian grouping and two decimals
    And the Money component renders it right-aligned with tabular numerals

  Scenario: Balance meaning is never color-only
    Given BalanceBadge with balance 500, -200 and 0
    Then it shows 'Owes you', 'You owe' and 'Settled' with the matching token color and the amount

  Scenario: State components
    Then EmptyState, ErrorState (with retry), Skeleton variants, StatCard, PageHeader, StatusBadge and Avatar (deterministic initials color) exist
    And each has a unit or snapshot test

  Scenario: Dates
    Then formatDate and formatRelative in lib/format.ts are the only date formatters used by components
```

#### S-10 DataTable, SearchInput, FilterBar and Pagination

**Size** L | **Depends on** S-09 | **Touch zone** `src/components/app/` (new files) | **Commit** `feat(S-10): shared data table and filter components`

```gherkin
Feature: One table pattern for every list
  Scenario: Column-driven table
    Given column definitions with header, cell renderer, alignment and a sortable flag
    Then DataTable renders a semantic table with a sticky header

  Scenario: Server-driven sorting and paging
    Given the table is in server mode
    When the user clicks a sortable header or changes page size (10, 25, 50)
    Then it emits sort and page changes instead of sorting locally
    And the header announces ascending, descending or unsorted

  Scenario: Built-in states
    Then loading shows skeleton rows
    And empty shows an EmptyState slot
    And no-results shows a distinct slot with a Clear filters action
    And error shows ErrorState with retry

  Scenario: Row interaction
    Then a row has one primary click target and a three-dot RowActionsMenu that is fully keyboard operable

  Scenario: Narrow screens
    Given a viewport under 768px
    Then rows render as cards using a supplied mobileCard renderer and amounts are never truncated

  Scenario: Result count is announced
    When filters change
    Then a polite live region announces 'Showing 12 of 340'

  Scenario: Search and filters
    Then SearchInput is debounced (300ms), labelled and clearable
    And FilterBar shows active filter chips with a Clear all action
```

#### S-11 Form kit, EntityDialog and ConfirmDialog

**Size** L | **Depends on** S-09 | **Touch zone** `src/components/app/` (new files) | **Commit** `feat(S-11): shared form kit and dialogs`

```gherkin
Feature: One way to create, edit and confirm
  Scenario: Typed fields
    Then TextField, TextAreaField, MoneyField, DateField, TagsField, SelectField and SegmentedField exist
    And all use react-hook-form and zod, show persistent labels and inline errors

  Scenario: Create and edit share a container
    Given EntityDialog
    Then it renders as a centered dialog on desktop and a bottom sheet on mobile
    And it traps focus, closes on Escape and returns focus to the trigger

  Scenario: No lost input
    When a save fails
    Then the dialog stays open and values are kept
    And the error maps to the field or to a form-level message

  Scenario: Unsaved changes guard
    Given the form is dirty
    When the user tries to close it
    Then a Discard changes confirmation appears

  Scenario: Confirmations
    Then ConfirmDialog takes a specific action label such as 'Archive customer'
    And its typed variant enables the confirm button only when the exact required text is entered

  Scenario: Feedback
    Then a helper standardizes success and error toasts (sonner) with accessible announcements
```

#### S-12 App shell, navigation and path helpers

**Size** L | **Depends on** S-09, S-11 | **Touch zone** `src/components/layout/`, `src/app/router.tsx`, `src/app/paths.ts` | **Commit** `feat(S-12): new app shell and path helpers`

```gherkin
Feature: Consistent application shell
  Scenario: Layout
    Given a signed-in user on any existing page
    Then a sidebar, top bar and content area wrap the page
    And the sidebar collapses to icons on desktop and becomes a drawer on mobile

  Scenario: Navigation is configuration
    Then nav items come from one array (Dashboard, Customers, Transactions, Members, Settings) with a visible predicate
    And Members and Settings stay hidden until their stories ship

  Scenario: Paths are centralized
    Then every link and redirect uses paths.ts and no component contains a path string

  Scenario: Top bar
    Then it shows the page title, a global search trigger (Ctrl/Cmd+K, wired in S-28), the theme toggle and a user menu with Sign out

  Scenario: Business slot
    Then the top of the sidebar has a business switcher slot that shows the app name until S-26

  Scenario: No URL change
    Then all existing URLs still work exactly as before
```

#### S-13 UI gallery and UI consistency contract

**Size** S | **Depends on** S-10, S-11, S-12 | **Touch zone** `src/features/dev/`, `docs/UI-CONTRACT.md` | **Commit** `docs(S-13): ui gallery and consistency contract`

```gherkin
Feature: Consistency is checkable
  Scenario: Gallery
    Given a development build
    When I open /__ui
    Then every shared component appears in default, loading, empty, error and disabled states in both themes
    And the route does not exist in production builds

  Scenario: Contract
    Then docs/UI-CONTRACT.md contains the checklist from section 8 of this PRD

  Scenario: Gallery cannot rot
    Then a vitest test renders the gallery and fails on console errors
```

---

### EPIC E3: Business lifecycle

**Objective:** every user creates or chooses a business before seeing any data; the owner can edit and delete it; tenancy becomes enforced at the end of the epic.

#### S-14 Business resolution provider

**Size** M | **Depends on** S-07, S-12 | **Touch zone** `src/features/business/`, `src/app/providers.tsx` | **Commit** `feat(S-14): business resolution provider`

```gherkin
Feature: The app always knows which business it is working in
  Scenario: Memberships are loaded once
    Given a signed-in user
    Then one query loads the businesses the user owns or belongs to, with role and owner name, plus pending invitations
    And useActiveBusiness() returns the business, the role, isOwner and a status of loading, ready, none or forbidden

  Scenario: No flash of wrong content
    While memberships are loading
    Then the shell shows skeletons and no business data from a previous session

  Scenario: Transitional behavior before routes change (until S-17)
    Given business routes do not exist yet
    Then the active business is the user's own business, or none
    And all data calls receive that businessId, or run unscoped when there is none

  Scenario: Clean sign-out
    When the user signs out
    Then the query cache is cleared
```

#### S-15 Create-business page

**Size** M | **Depends on** S-11, S-14 | **Touch zone** `src/features/business/pages/CreateBusinessPage.tsx`, `src/components/layout/OnboardingLayout.tsx` | **Commit** `feat(S-15): create business onboarding page`

```gherkin
Feature: A user creates their business
  As a newly signed-in user without a business
  I want to create my business with minimal information
  So that I can start recording customers and transactions

  Background:
    Given I am signed in and own no business
    And I open /onboarding/business

  Scenario: Create with the minimum
    When I enter the name 'Rahim Traders' and press Create business
    Then the create_business RPC makes the business and my owner membership in one step
    And I see the toast 'Business created'
    And I land on that business dashboard

  Scenario: Optional details
    Then business type (Retail, Wholesale, Services, Manufacturing, Other), phone, email, address and notes sit under a collapsible 'More details' section
    And leaving them empty never blocks saving

  Scenario: Name validation
    When the name is empty or shorter than 2 or longer than 80 characters
    Then an inline error appears under Name and nothing is saved

  Scenario: Failure keeps my input
    Given the save fails
    Then the form stays filled and an error message with retry is shown

  Scenario: Only one owned business
    Given I already own a business
    When I open /onboarding/business
    Then I am redirected to my business dashboard with the notice 'You already own a business'

  Scenario: Double submit is safe
    When I click Create business twice quickly
    Then only one business is created and the button shows a spinner while saving
```

**Done when:** a user with no business can complete onboarding using the keyboard only.

#### S-16 Post-login landing logic and route guards

**Size** M | **Depends on** S-14, S-15 | **Touch zone** `src/app/router.tsx`, `src/features/business/pages/LandingResolver.tsx` | **Commit** `feat(S-16): landing resolver and guards`

```gherkin
Feature: Users land in the right place after login
  Scenario Outline: Resolve from the root path
    Given I am signed in and my situation is <situation>
    When I open /
    Then I am sent to <destination>

    Examples:
      | situation                                              | destination                    |
      | I own a business                                       | my business dashboard          |
      | I own none, but I am a member elsewhere                | /businesses                    |
      | I own none, but I have a pending invitation            | /businesses                    |
      | I own none, belong nowhere, no invitations             | /onboarding/business           |
      | I deleted my business and belong nowhere               | /onboarding/business           |

  Scenario: Deep link survives login
    Given I am signed out and open a protected URL
    When I sign in
    Then I am returned to that URL if I may access it, otherwise to the resolver result

  Scenario: No flicker
    While the decision is being made
    Then a loading state is shown and no intermediate page renders

  Scenario: Signed-out users
    When I open any protected route
    Then I am redirected to /login
```

#### S-17 Route restructure to /b/:businessId

**Size** L | **Depends on** S-16 | **Touch zone** `src/app/router.tsx`, `src/app/paths.ts`, `src/features/business/useScopedBusinessId.ts` | **Commit** `feat(S-17): business-scoped routes with legacy redirects`

```gherkin
Feature: Business data lives under business URLs
  Scenario: All pages are business scoped
    Then dashboard, customers, customer detail, import and transactions are served under /b/:businessId
    And every data call receives the businessId from the URL

  Scenario: Legacy URLs keep working
    When I open /customers, /customers/:id or /transactions
    Then I am redirected to the same page under my active business

  Scenario: Unknown or forbidden business
    When the businessId in the URL does not exist or I am not a member
    Then I see the same page for both cases: 'Business not found or you do not have access', with a link to My businesses
    And no data from that business is requested or shown

  Scenario: URLs are the single source of truth
    When I open two different businesses in two browser tabs
    Then each tab shows only its own business data

  Scenario: Links are generated
    Then paths.ts builds every link from businessId and the old path constants are removed
```

**Done when:** smoke checklist passes entirely through new URLs and old URLs redirect.

#### S-18 Business settings (view and edit)

**Size** M | **Depends on** S-17, S-21 (for role checks; use a minimal inline check if S-21 is not done yet, then refactor in S-21) | **Touch zone** `src/features/business/pages/SettingsPage.tsx` | **Commit** `feat(S-18): business settings page`

```gherkin
Feature: The owner edits business details
  Scenario: Owner edits
    Given I am the Owner
    When I change the name to 'Rahim and Sons' and save
    Then the toast 'Business updated' appears
    And the sidebar business name and page titles update immediately

  Scenario: Same validation as creation
    When the name is invalid
    Then the same inline errors as in S-15 appear

  Scenario: Non-owners can look but not change
    Given I am an Editor or Viewer
    Then I see the details as read-only text with no Save button

  Scenario: Database refuses unauthorized updates
    Given a non-owner somehow submits an update
    Then the request fails with forbidden and a clear toast, and nothing changes

  Scenario: Navigation
    Then Settings appears in the sidebar for every member
```

#### S-19 Delete business

**Size** M | **Depends on** S-18, S-11 | **Touch zone** `src/features/business/components/DangerZone.tsx` | **Commit** `feat(S-19): delete business with typed confirmation`

```gherkin
Feature: The owner can permanently delete the business
  Scenario: Danger zone is owner-only
    Given I am an Editor or Viewer
    Then the Danger zone section does not render

  Scenario: Impact is shown before confirming
    Given I am the Owner of 'Rahim Traders' with 58 customers, 340 transactions and 3 members
    When I choose Delete business
    Then the dialog states those counts and that deletion cannot be undone

  Scenario: Typed confirmation
    Then the Delete button stays disabled until I type the exact business name

  Scenario: Successful deletion
    When I confirm
    Then the business and all its customers, transactions, members and invitations are removed in one operation
    And I see the toast 'Business deleted'
    And I am sent to /businesses if I still belong to other businesses, otherwise to /onboarding/business

  Scenario: I can start again
    Given I deleted my business
    Then I can create a new business

  Scenario: Failure is safe
    Given deletion fails
    Then nothing is removed, the dialog stays open and shows the error
```

**Done when:** deletion is verified against a test business with members and invitations; cascade leaves no orphan rows.

#### S-20 Enforce tenancy (contract phase)

**Size** L | **Depends on** S-17, S-19 | **Touch zone** `supabase/migrations/0003_*.sql`, `supabase/manual/`, `src/features/*/api.ts` (types only) | **Commit** `feat(S-20): enforce business scoping everywhere`

This is the only story that removes the old open policies and makes `business_id` mandatory. It must not be deployed before a human runs the steps in `docs/MANUAL_STEPS.md`.

```gherkin
Feature: Tenancy is mandatory
  Scenario: Legacy data is attached to a business by a human
    Given customers and transactions that exist without a business_id
    When the human runs supabase/manual/backfill_legacy_data.sql with the legacy owner email
    Then a business is created for that user if they own none
    And every row with a null business_id is assigned to it
    And the script prints the counts and can be re-run safely

  Scenario: Constraint migration refuses to run on dirty data
    Given any row still has a null business_id
    When migration 0003 is applied
    Then it aborts with a message pointing to the backfill script

  Scenario: Constraints and policies
    When 0003 succeeds
    Then business_id is NOT NULL on customers and transactions
    And the old broad policies are dropped
    And the SQL tests from S-06 pass without any rollback workaround

  Scenario: Code requires a business everywhere
    Then businessId is a required argument of every api function
    And omitting it is a TypeScript error
    And no TODO(S-20) marker remains

  Scenario: Fresh database works end to end
    Given a database with no legacy data
    Then signup, create business, add customer and add transaction all work

  Scenario: Isolation proof
    Given two users each with their own business
    Then neither can read or write the other's rows through the API or the UI
```

**Done when:** MANUAL_STEPS has a numbered, copy-paste procedure (backup, backfill, 0003, verify) and the agent states that the branch must not be deployed before it is run.

---

### EPIC E4: Sharing and business switching

**Objective:** an owner shares the business with other Google accounts using roles; shared users can switch between their own and shared businesses.

#### S-21 Permission layer

**Size** M | **Depends on** S-14 | **Touch zone** `src/lib/permissions.ts`, `src/components/app/Can.tsx` | **Commit** `feat(S-21): role permission layer`

```gherkin
Feature: The UI knows what each role may do
  Scenario: One matrix
    Then lib/permissions.ts holds the matrix from section 3 as the single source for the UI
    And a unit test asserts every action for Owner, Editor and Viewer

  Scenario: Components use it
    Given usePermissions() and a Can component with hide and disable modes
    Then a Viewer sees write actions hidden, or disabled with the tooltip 'View-only access'

  Scenario: Actions are blocked before the network
    When code attempts a mutation the role does not allow
    Then it fails fast with forbidden, and the database would refuse it anyway

  Scenario: Matrix and database agree
    Then docs/UI-CONTRACT.md lists the action names mapped to the SQL tests that prove them
```

#### S-22 Members page

**Size** M | **Depends on** S-17, S-10, S-21 | **Touch zone** `src/features/members/` | **Commit** `feat(S-22): members page`

```gherkin
Feature: See who belongs to the business
  Scenario: Member list
    Given I am any member of 'Acme'
    When I open Members
    Then I see a table with avatar, name, email, role badge and joined date
    And the Owner is listed first with an Owner badge

  Scenario: Only the owner sees management controls
    Given I am an Editor or Viewer
    Then there are no row action menus and no Invite button

  Scenario: Only-owner state
    Given I am the Owner and nobody else has joined
    Then an EmptyState says 'Invite someone to share this business' with an Invite button

  Scenario: Pending invitations
    Given I am the Owner
    Then a Pending invitations section lists email, role and date, hidden from non-owners

  Scenario: Standard states
    Then loading, error and retry follow the shared patterns
```

#### S-23 Invite by email and manage invitations

**Size** M | **Depends on** S-22, S-11 | **Touch zone** `src/features/members/` | **Commit** `feat(S-23): invite members by email`

```gherkin
Feature: The owner invites people
  Background:
    Given I am the Owner of 'Acme'

  Scenario: Send an invitation
    When I open Invite member, enter 'Vic@Example.com', choose Viewer and press Invite
    Then a pending invitation is created for 'vic@example.com' with role viewer
    And the dialog explains 'They will see the invitation after signing in with this Google account. No email is sent.'
    And a Copy app link button is offered

  Scenario: Role choice
    Then the role selector offers Editor and Viewer, defaulting to Viewer, with one-line descriptions of each

  Scenario Outline: Invalid invitations are blocked inline
    When I invite <email>
    Then I see <message>

    Examples:
      | email                     | message                                   |
      | not-an-email              | Enter a valid email address               |
      | my own email              | You are already the owner                 |
      | an existing member        | This person is already a member           |
      | someone already invited   | An invitation is already pending          |

  Scenario: Revoke
    When I choose Revoke on a pending invitation and confirm
    Then it is marked revoked and disappears from the pending list
```

#### S-24 Respond to invitations

**Size** M | **Depends on** S-23, S-26 shares the page (build the Invitations card here, S-26 adds the rest) | **Touch zone** `src/features/members/components/InvitationCard.tsx`, `src/features/business/pages/BusinessesPage.tsx` (invitations section only) | **Commit** `feat(S-24): accept and decline invitations`

```gherkin
Feature: Invited people join deliberately
  Scenario: I see my invitations
    Given an invitation exists for my Google email
    When I sign in
    Then the top bar shows an invitation count badge
    And /businesses lists each invitation with business name, inviter, role, and Accept and Decline buttons

  Scenario: Accept
    When I press Accept
    Then I become a member with the invited role
    And I see 'You joined Acme' with an Open business action

  Scenario: Decline
    When I press Decline
    Then the invitation is marked declined and removed from my list

  Scenario: Email matching is case-insensitive
    Given the invitation was created for 'vic@example.com'
    And my Google email is 'Vic@Example.com'
    Then I see the invitation

  Scenario: Stale invitation
    Given the owner revoked it or deleted the business
    When I press Accept
    Then I see 'This invitation is no longer available' and the card disappears

  Scenario: Already a member
    Given I became a member by another route
    When I press Accept
    Then it is treated as success without an error
```

#### S-25 Change role, remove member, leave business

**Size** M | **Depends on** S-22, S-23 | **Touch zone** `src/features/members/` | **Commit** `feat(S-25): manage members and leave business`

```gherkin
Feature: Membership can change
  Scenario: Owner changes a role
    Given I am the Owner
    When I change Eli from Editor to Viewer in the row menu
    Then the role updates, a toast confirms it, and the table reflects it

  Scenario: Owner removes a member
    When I choose Remove on Vic and confirm 'Remove Vic'
    Then Vic loses access and disappears from the list

  Scenario: Owner row is protected
    Then the Owner row has no role change or remove actions

  Scenario: Member leaves
    Given I am an Editor or Viewer
    When I choose Leave business and confirm
    Then I am removed and sent to /businesses (or the landing resolver)

  Scenario: Owners cannot leave
    Given I am the Owner
    Then Leave is replaced by the note 'Owners cannot leave. Delete the business instead.'

  Scenario: History stays readable
    Given a removed member created transactions
    Then those transactions remain and show the creator's name, or 'Former member' if the profile is gone
```

#### S-26 My businesses page and business switcher

**Size** M | **Depends on** S-14, S-12, S-24 | **Touch zone** `src/features/business/pages/BusinessesPage.tsx`, `src/components/layout/BusinessSwitcher.tsx` | **Commit** `feat(S-26): businesses page and switcher`

```gherkin
Feature: Choose between my business and shared businesses
  Scenario: My businesses page
    When I open /businesses
    Then I see three sections: My business, Shared with me, Invitations
    And My business shows my owned business card, or a prominent Create your business card if I own none
    And each shared business card shows name, owner name and my role

  Scenario: Switcher in the sidebar
    Then the top of the sidebar shows the current business name and my role
    And its menu lists my own business first, then shared businesses, then All businesses
    And Create business appears only if I own none

  Scenario: Switching
    When I pick another business
    Then I land on that business dashboard and no data from the previous business remains visible

  Scenario: Keyboard and screen reader
    Then the switcher opens with Enter or Space, uses arrow keys, and announces the selected business
```

#### S-27 Lost-access handling

**Size** M | **Depends on** S-26 | **Touch zone** `src/features/business/` (provider and guards), `src/app/queryClient.ts` | **Commit** `feat(S-27): handle revoked access and deleted businesses`

```gherkin
Feature: The app copes when access changes while someone is working
  Scenario: Removed while viewing
    Given I am viewing 'Acme' and the owner removes me
    When my next request is refused or memberships refresh
    Then I see 'You no longer have access to Acme' and am taken to /businesses
    And cached data for Acme is purged

  Scenario: Business deleted while viewing
    Then I see 'This business no longer exists' and am taken to the landing resolver

  Scenario: Role downgraded while editing
    Given I am an Editor with a form open
    When the owner makes me a Viewer and I press Save
    Then the save fails with a forbidden toast, my role refetches, and the UI becomes read-only

  Scenario: Memberships refresh
    Then they refetch on window focus and after any forbidden error
```

---

### EPIC E5: Customers

**Objective:** complete, consistent customer create, read, update and delete on the new UI. Note: S-31 (Customer detail) belongs to this epic but is executed after S-32 to S-34 because it needs the transaction operations; it appears at that position below.

#### S-28 Customers list v2

**Size** L | **Depends on** S-10, S-12, S-17, S-21 | **Touch zone** `src/features/customers/pages/CustomersPage.tsx`, `src/features/customers/api.ts` (list function) | **Commit** `feat(S-28): customers list on shared data table`

```gherkin
Feature: Find and browse customers quickly
  Background:
    Given I am a member of 'Acme' with 340 customers

  Scenario: Table content
    When I open Customers
    Then I see a DataTable with Customer (avatar, name, tags), Phone, Balance (BalanceBadge, right-aligned), Last activity and Added columns
    And clicking a row opens the customer detail
    And each row has a RowActionsMenu with View, Edit, Add transaction and Archive according to my role

  Scenario: Search
    When I type 'ash' or part of a phone number
    Then matching customers appear after the debounce, case-insensitively, using a server-side query

  Scenario: Filter and sort
    Then I can filter by All, Owes you, You owe, Settled and sort by Name, Balance high to low, Balance low to high, Recently added
    And search, filter, sort and page combine

  Scenario: State lives in the URL
    Then q, status, sort and page appear in the query string
    And reloading or sharing the link restores the same view and the back button works

  Scenario: Summary strip
    Then totals for customers, Owes you and You owe appear above the table

  Scenario: States
    Given a business with no customers
    Then an EmptyState with Add your first customer appears (text only for Viewers)
    And a search with no match shows a distinct no-results state with Clear filters
    And a failed load shows ErrorState with retry

  Scenario: Viewer
    Given I am a Viewer
    Then there is no Add customer button and the row menu offers View only

  Scenario: Global search
    When I press Ctrl or Cmd plus K
    Then a command palette searches customers in the active business and opens the chosen one

  Scenario: Mobile
    Given a narrow viewport
    Then rows render as cards with the balance fully visible
```

#### S-29 Customer form (add and edit)

**Size** M | **Depends on** S-11, S-28 | **Touch zone** `src/features/customers/components/CustomerFormDialog.tsx`, `schemas.ts` | **Commit** `feat(S-29): customer form on shared form kit`

```gherkin
Feature: Add and edit customers in one consistent dialog
  Scenario: Fast add
    Given I am an Owner or Editor
    When I press Add customer, type the name 'Asha Verma' and press Enter
    Then the customer is created with a zero balance
    And a toast says 'Customer added' with an Add transaction action

  Scenario: Fields
    Then Name is required (1 to 100 characters)
    And Phone, Email, Address, Alternate contact (name and phone), Tags (up to 10, each up to 24 characters) and Notes sit under 'Additional details'

  Scenario: Validation
    When Name is empty, or Email or Phone has an implausible format
    Then inline errors appear and nothing is saved

  Scenario: Duplicate hint, not a block
    Given a customer with the same name and phone exists
    Then a non-blocking notice offers to open the existing customer, and I may still save

  Scenario: Edit uses the same dialog
    When I choose Edit on a customer
    Then the dialog opens pre-filled and a successful save updates the list and detail immediately

  Scenario: Safe failure
    Given saving fails
    Then the dialog stays open with my input intact

  Scenario: Viewer
    Then Viewers cannot open this dialog
```

#### S-30 Archive, restore and permanently delete customers

**Size** L | **Depends on** S-29, S-21 | **Touch zone** `src/features/customers/`, `supabase/migrations/0004_*.sql` | **Commit** `feat(S-30): archive, restore and delete customers`

```gherkin
Feature: Customers can be removed without losing history by accident
  Background:
    Given I am an Owner and customer 'Asha' has 12 transactions and owes me 4500 rupees

  Scenario: Archive with a clear warning
    When I choose Archive
    Then a ConfirmDialog says her 12 transactions are kept and can be restored
    And because the balance is not zero it warns that archived customers are left out of lists and dashboard totals

  Scenario: Archive effect and undo
    When I confirm 'Archive customer'
    Then she disappears from the list, search, pickers and dashboard totals
    And a toast 'Customer archived' offers Undo for 8 seconds

  Scenario: Find and restore archived customers
    When I choose the Archived status filter
    Then archived customers appear with their balances and a Restore action
    And restoring brings them back with all history

  Scenario: Permanent delete is owner-only and typed
    Given an archived customer
    Then only the Owner sees Delete permanently
    And the confirm button stays disabled until I type the customer's exact name
    And confirming removes the customer and all their transactions in one atomic operation

  Scenario: Editors can archive but not destroy
    Given I am an Editor
    Then Archive and Restore are available and Delete permanently is not

  Scenario: Viewers
    Then no archive, restore or delete actions appear
```

**Done when:** the new RPC for permanent delete is covered by an SQL test for Owner, Editor and outsider.

---

### EPIC E6: Transactions

**Objective:** every transaction operation (add, edit, void, restore, browse) works the same way everywhere. Rules from v1 stay: derived balances, edits and voids leave visible markers, dates cannot be in the future.

#### S-32 Add transaction sheet

**Size** L | **Depends on** S-11, S-29 | **Touch zone** `src/features/transactions/components/TransactionSheet.tsx`, `api.ts`, `schemas.ts` | **Commit** `feat(S-32): add transaction sheet with live balance preview`

```gherkin
Feature: Record a charge or payment in seconds
  Background:
    Given I am an Owner or Editor and customer 'Asha' owes 1000 rupees

  Scenario: Charge
    When I press Add charge, enter 500 and save
    Then her balance becomes 1500 owed, the row appears at the top of her ledger, and the balance briefly highlights

  Scenario: Payment that creates credit
    When I press Add payment, enter 1300 and save
    Then her balance shows 'You owe 300' with the You owe styling and label

  Scenario: Live preview
    While I type an amount
    Then the sheet shows the current balance and the resulting balance

  Scenario: Fields and validation
    Then Type is a Charge or Payment segmented control, Amount is required and above zero with at most 2 decimals, Date defaults to today and cannot be in the future but may be back-dated, and Note is optional up to 500 characters
    And invalid input shows inline errors and does not save

  Scenario: Quick add without a customer context
    When I use Add transaction from the top bar
    Then a searchable customer picker appears first, then the same fields

  Scenario: Keyboard flow
    Then Amount is focused on open, Enter saves, Escape closes, and focus returns to the trigger

  Scenario: Failure keeps input
    Given saving fails
    Then the sheet stays open with an error and my values intact

  Scenario: Provenance
    Then the row stores source manual, created_by as me and business_id

  Scenario: Viewer
    Then Viewers do not see any Add actions
```

#### S-33 Edit transaction

**Size** M | **Depends on** S-32 | **Touch zone** `src/features/transactions/` | **Commit** `feat(S-33): edit transactions with audit marker`

```gherkin
Feature: Correct a mistaken entry
  Scenario: Edit in the same sheet
    Given a payment of 500 for 'Asha'
    When I choose Edit, change the amount to 450 and save
    Then the balance recalculates and the row shows an Edited badge

  Scenario: Who and when
    When I hover or focus the Edited badge
    Then it shows 'Edited by Eli on 12 Oct 2026, 14:05'

  Scenario: What can change
    Then type, amount, date and note are editable and the customer is not
    And the same validation as adding applies

  Scenario: Imported rows
    Given a row with source import
    Then it can be edited and keeps source import

  Scenario: Viewer
    Then Viewers see no Edit action
```

**Done when:** S-33 notes in the PR description that full revision history is not included (see backlog).

#### S-34 Void and restore transactions

**Size** M | **Depends on** S-33 | **Touch zone** `src/features/transactions/`, `supabase/migrations/0005_*.sql` (adds void_reason) | **Commit** `feat(S-34): void and restore transactions`

```gherkin
Feature: Void instead of erase
  Scenario: Void with confirmation
    Given a payment of 500
    When I choose Void
    Then a ConfirmDialog says 'Void this payment of 500?' with an optional reason (up to 200 characters)
    And the confirm button is labelled 'Void transaction'

  Scenario: Effect
    When I confirm
    Then the row stays visible, muted, with a struck-through amount and a Voided badge
    And it no longer affects the balance, dashboard totals or period summaries
    And a toast offers Undo

  Scenario: Restore
    When I choose Restore on a voided row
    Then it counts again, with status edited if it had been edited before, otherwise active

  Scenario: Cancel is harmless
    When I cancel the confirmation
    Then nothing changes

  Scenario: Viewer
    Then Viewers see no Void or Restore actions
```

#### Customer detail v2 (S-31, executed after S-34)

#### S-31 Customer detail v2

**Size** L | **Depends on** S-28, S-32, S-33, S-34 | **Touch zone** `src/features/customers/pages/CustomerDetailPage.tsx`, `supabase/migrations/0006_*.sql` (customer_ledger RPC) | **Commit** `feat(S-31): customer detail with ledger and running balance`

```gherkin
Feature: Everything about one customer on one screen
  Scenario: Header
    Then I see an avatar, name, tags, tappable phone (tel link), email (mailto link) and address, plus Edit and a menu with Archive

  Scenario: Balance is the hero
    Then the current balance is the largest element with its BalanceBadge
    And smaller stat cards show Total charged, Total paid and Last activity
    And Add charge and Add payment are the primary actions

  Scenario: Ledger with running balance
    Then a DataTable lists Date, Type badge, Note, Amount and Balance after, newest first
    And voided rows are shown muted and are excluded from the running balance
    And the figures are computed by the customer_ledger RPC, not in the browser

  Scenario: Ledger filters
    Then I can filter All, Charges, Payments and toggle Show voided (on by default)

  Scenario: Details tab
    Then a Details tab shows every profile field and notes

  Scenario: Archived customer
    Given the customer is archived
    Then a banner offers Restore and write actions are hidden

  Scenario: Viewer and mobile
    Then Viewers see all information without any write action
    And on narrow screens the ledger renders as cards

  Scenario: Empty and error
    Given the customer has no transactions
    Then the ledger shows an EmptyState pointing at Add charge or Add payment
```

#### S-35 Transactions page v2

**Size** L | **Depends on** S-10, S-34 | **Touch zone** `src/features/transactions/pages/TransactionsPage.tsx`, `api.ts` (list and summary functions) | **Commit** `feat(S-35): transactions page with filters and summaries`

```gherkin
Feature: See all activity across customers
  Scenario: Detailed view
    Then a DataTable shows Date, Customer (linked, with avatar), Type, Note, Amount, Recorded by (avatar and name) and status or source badges, newest first
    And row actions Edit, Void and Restore follow my role

  Scenario: Filters
    Then I can filter by date presets (Today, This week, This month, Last 30 days, Custom), type, customer (searchable) and text search
    And the default range is This month
    And voided rows are excluded unless I enable Include voided

  Scenario: Summarized view
    When I switch to Summarized and choose Day, Week or Month
    Then each row shows period, count, total charges, total payments and net, computed server-side
    And each total equals the manual sum of the detailed rows

  Scenario: Totals for the current filter
    Then a footer shows charges, payments and net for everything matching, not only the visible page

  Scenario: State in the URL
    Then filters, view and page are in the query string
    And the dashboard Today link opens this page with the Today filter

  Scenario: States
    Then loading skeleton, true empty, no-results with the active filters visible, and error with retry all appear as in the UI contract

  Scenario: Archived customers
    Then transactions of archived customers are excluded from this page

  Scenario: Mobile
    Then rows render as cards and amounts are never truncated
```

---

### EPIC E7: Dashboard

**Objective:** an at-a-glance, modern business overview, scoped to the active business.

#### S-36 Dashboard v2: KPIs, top balances, today

**Size** M | **Depends on** S-09, S-17, S-35 (link target) | **Touch zone** `src/features/dashboard/` | **Commit** `feat(S-36): dashboard KPIs and top balances`

```gherkin
Feature: Know the state of the business at a glance
  Scenario: KPI cards
    Then StatCards show Total owes you (the largest), Total you owe, Open accounts and Today's activity (count and net)
    And all figures come from dashboard_summary(business_id) and exclude voided transactions and archived customers

  Scenario: Top outstanding balances
    Then a list of up to 8 customers with the highest balances shows avatar, name, balance and links to detail
    And when nobody owes anything a calm 'All settled' state appears

  Scenario: Today links through
    When I open Today's activity
    Then I land on Transactions filtered to today with identical count and net

  Scenario: Quick actions
    Then Add customer and Add transaction appear for Owners and Editors only

  Scenario: First-run guidance
    Given a business with no customers
    Then a checklist card offers Add your first customer, Record your first transaction and (Owner only) Invite a teammate

  Scenario: States
    Then skeletons while loading and an ErrorState with retry on failure

  Scenario: Correctness
    Then totals equal a manual sum of seed data in a test
```

#### S-37 Dashboard trends and recent activity

**Size** M | **Depends on** S-36 | **Touch zone** `src/features/dashboard/`, `supabase/migrations/0007_*.sql` (daily_activity RPC) | **Commit** `feat(S-37): dashboard chart and activity feed`

```gherkin
Feature: See trends and recent actions
  Scenario: Trend chart
    Then a chart shows charges and payments per day with a 7, 30 or 90 day selector, using chart tokens and server-side aggregation

  Scenario: Chart is accessible
    Then it has a text summary and an equivalent visually hidden data table

  Scenario: Recent activity feed
    Then the last 10 transactions appear as sentences such as 'Eli recorded a payment of 500 from Asha, 2 hours ago' with links

  Scenario: Empty and error
    Then an empty business shows friendly empty states and failures offer retry
```

---

### EPIC E8: Import and export

**Objective:** carry the v1 history import onto the business model and give every member ways to get data out.

#### S-38 CSV import, business scoped and role gated

**Size** L | **Depends on** S-29, S-32, S-21 | **Touch zone** `src/features/import-export/`, `supabase/migrations/0008_*.sql` (import RPC) | **Commit** `feat(S-38): business-scoped CSV import on new UI`

All v1 import rules (EPIC-005, STORY-011) remain: whole-file validation first, preview before commit, explicit choice for partial import, all-or-nothing commit, de-duplication by name plus phone, `source = import`.

```gherkin
Feature: Import notebook history into the active business
  Scenario: Guided steps
    Given I am an Owner or Editor
    Then the import page is a four-step flow: Upload, Review, Import, Done, using shared components
    And a template CSV with the expected headers can be downloaded

  Scenario: Validation and preview
    When I upload a CSV
    Then the whole file is validated before anything is written
    And I see a per-customer summary (transactions, resulting balance) and a list of invalid rows with row number and reason

  Scenario: Partial import is an explicit choice
    Given some rows are invalid
    Then I must choose between importing only valid rows and fixing the file
    And a partial import is reported as partial success

  Scenario: Matching stays inside the business
    Then customers are matched by name and phone only among this business's customers
    And rows matching an archived customer are reported as errors with the reason 'Customer is archived. Restore them first.'

  Scenario: Atomic commit
    When the import runs
    Then one RPC inserts all customers and transactions or none, tagged source import with their historical dates
    And a failure leaves no partial data

  Scenario: Limits
    Then files over 5 MB or 10,000 rows are rejected with a clear message before parsing rows

  Scenario: Viewers
    Given I am a Viewer
    Then the import page shows 'Import needs Editor or Owner access' and the sidebar link is hidden
```

#### S-39 Exports and printable statements

**Size** M | **Depends on** S-31, S-35, S-19 | **Touch zone** `src/features/import-export/`, small additive changes to the list, detail and danger-zone components | **Commit** `feat(S-39): CSV exports, printable statement and backup`

```gherkin
Feature: Get data out
  Scenario: Export lists
    Then Export CSV on Customers and on Transactions downloads exactly what the current filters match, not just the visible page

  Scenario: Printable statement
    When I open Statement from a customer
    Then a page at /b/:businessId/customers/:customerId/statement shows business name, customer, a period selector, the ledger with running balance and the closing balance
    And Print or Save as PDF uses a clean print stylesheet

  Scenario: Backup
    Then Settings offers Download backup, producing customers.csv and transactions.csv for the whole business
    And the Delete business dialog from S-19 links to it

  Scenario: Safe CSV
    Then any cell beginning with =, +, - or @ is prefixed so spreadsheets cannot execute it

  Scenario: Who may export
    Then every member including Viewers can export and print

  Scenario: Large data
    Then exports page through the server so memory stays bounded and progress is shown
```

---

### EPIC E9: Hardening and release

**Objective:** prove the product is accessible, responsive, secure, documented and consistent before it is merged.

#### S-40 Accessibility and keyboard pass

**Size** M | **Depends on** all feature stories | **Touch zone** any file, fixes only | **Commit** `fix(S-40): accessibility and keyboard pass`

An axe-based test library (such as vitest-axe) may be added for this story.

```gherkin
Feature: Everyone can use the product
  Scenario: Automated checks
    Then automated axe checks run on every page and shared component, with zero serious or critical violations

  Scenario: Keyboard only
    Then I can complete these journeys without a mouse: sign in, create business, invite a member, add customer, add transaction, void a transaction, archive and restore a customer, switch business

  Scenario: Focus
    Then dialogs and sheets trap focus, close on Escape and return focus to the trigger
    And a skip-to-content link exists

  Scenario: Announcements
    Then toasts, result counts, sort changes and balance changes are announced to screen readers

  Scenario: Targets and contrast
    Then touch targets are at least 44 by 44 pixels, text and balance colors meet AA in both themes, and meaning never depends on color alone

  Scenario: Motion
    Given prefers-reduced-motion is set
    Then transitions reduce to instant or opacity only
```

#### S-41 Responsive pass

**Size** M | **Depends on** S-40 | **Touch zone** any file, fixes only | **Commit** `fix(S-41): responsive pass across all screens`

```gherkin
Feature: Works on a counter tablet and a phone
  Scenario Outline: Every screen at common widths
    When I view <screen> at <width> pixels
    Then there is no horizontal page scroll and no truncated amount

    Examples:
      | screen                       | width |
      | any page                     | 360   |
      | any page                     | 768   |
      | any page                     | 1024  |
      | any page                     | 1440  |

  Scenario: Pattern consistency
    Then tables become cards under 768 pixels, sheets open from the bottom on mobile, the sidebar becomes a drawer, and safe areas are respected

  Scenario: Evidence
    Then docs/PROGRESS.md records which screens and widths were checked and any issue fixed
```

#### S-42 Security and RLS verification

**Size** M | **Depends on** all backend stories | **Touch zone** `supabase/tests/`, `docs/SECURITY.md` | **Commit** `test(S-42): security verification suite and checklist`

```gherkin
Feature: Data isolation is proven
  Scenario: Negative tests
    Then SQL tests prove all of these are refused: a Viewer writing, an Editor deleting a customer permanently, an Editor changing roles, a non-member reading any table, leave_business as Owner, accepting someone else's invitation, dashboard_summary or customer_ledger for a business I do not belong to

  Scenario: Client hygiene
    Then no service-role key exists in the repo or client bundle and .env.example holds only the URL and anon key
    And a search finds no supabase calls outside the api layer

  Scenario: Content safety
    Then user text (names, notes, tags, business names) is always rendered as text, never as HTML

  Scenario: Documented
    Then docs/SECURITY.md lists the threats considered, the controls, and how to re-run the tests
```

#### S-43 Documentation and release readiness

**Size** M | **Depends on** S-42 | **Touch zone** `README.md`, `docs/`, `BahiKhata-PRD.md` (banner only) | **Commit** `docs(S-43): readme, setup guide and release notes`

```gherkin
Feature: Someone new can run and trust the project
  Scenario: README
    Then README.md explains what the app is, the stack, environment variables, Supabase and Google OAuth setup (including redirect URLs), the order to apply migrations, scripts, project structure, roles and how to run tests

  Scenario: v1 PRD is marked
    Then BahiKhata-PRD.md starts with a banner saying it is superseded in part by the v2 PRD

  Scenario: Release notes
    Then docs/RELEASE-NOTES-v2.md lists what changed for users and what a human must run before deploying

  Scenario: Final regression
    Then the smoke checklist passes for five personas: Owner, Editor, Viewer, a signed-in user with no business, and a user with a pending invitation

  Scenario: Hand-off
    Then PROGRESS.md shows every story Done or explicitly Deferred with a reason
    And the agent prepares a pull request description but does not merge to master
```

---

## 8. UI consistency contract

Copy this section into `docs/UI-CONTRACT.md` (S-13). A story is not Done if its screen breaks any line.

- **Page frame:** every page uses `PageHeader` (title, short description, at most one primary action on the right). One primary button per screen.
- **Lists:** `DataTable` only, with the five states (loading, empty, no-results, error, data), a three-dot `RowActionsMenu`, server-side sort and paging, and a card layout under 768 pixels. List state lives in the query string.
- **Forms:** `EntityDialog` for create and edit (the same component for both), persistent labels, inline errors, a spinner on the submit button, input kept on failure, discard guard when dirty.
- **Destructive actions:** `ConfirmDialog` with a specific verb label. Irreversible actions use the typed-confirmation variant. Never a bare OK.
- **Feedback:** every mutation shows a toast. Success is past tense ('Customer archived'). Errors say what failed and what to do ('Could not archive customer. Try again.'). Undo is offered for archive and void.
- **Money and dates:** only `formatMoney`, `Money`, `formatDate` and `formatRelative`. Amounts are right-aligned, tabular, never truncated.
- **Color:** semantic tokens only. Balance meaning always has a text label as well as color.
- **Permissions:** every write action is wrapped in `Can`. Viewers never see a control that would fail.
- **Accessibility:** labelled controls, focus management, live announcements, 44-pixel touch targets, reduced motion respected.
- **Paths and keys:** links from `paths.ts`, query keys from `queryKeys.ts` with the business prefix.

**Copy glossary**

| Concept                     | Use                           | Never                               |
| --------------------------- | ----------------------------- | ----------------------------------- |
| Customer owes the business  | Owes you                      | Receivable, Debit, Due (in UI text) |
| Business owes the customer  | You owe                       | Payable, Credit balance             |
| Zero balance                | Settled                       | Zero, Paid up                       |
| Hide a customer, reversible | Archive                       | Delete                              |
| Remove a customer forever   | Delete permanently            | Remove                              |
| Cancel a transaction        | Void                          | Delete                              |
| Workspace                   | Business                      | Tenant, Workspace, Organization     |
| Shared access               | Member, Editor, Viewer, Owner | Admin, User                         |

---

## 9. Clarifications that resolve cross-story details

**C-1 Authoritative execution order.** Follow this order exactly. E1 and E2 may be interleaved but each story is still committed on its own.

S-01, S-02, S-03, S-04, S-05, S-06, S-07, S-08, S-09, S-10, S-11, S-12, S-13, S-14, S-15, S-16, S-17, S-18, S-19, S-20, S-21, S-22, S-23, S-24, S-25, S-26, S-27, S-28, S-29, S-30, S-32, S-33, S-34, S-31, S-35, S-36, S-37, S-38, S-39, S-40, S-41, S-42, S-43.

**C-2 The My businesses page exists from S-16.** S-16 redirects to `/businesses`, so S-16 creates a minimal page there: heading, plus a list of the user's memberships (name, role, Open button) using shared components. S-24 adds the Invitations section and S-26 completes the page (sections, cards, switcher).

**C-3 Role checks before S-21.** S-18 and S-19 need to know whether the user is Owner. Until S-21 exists they use `useActiveBusiness().isOwner`. S-21 then replaces that with the shared permission layer.

**C-4 Backup link.** S-19 ships without a backup link. S-39 adds a Download backup link to the delete dialog as an additive change.

**C-5 Migrations.** Numbers follow execution order: 0001 (S-05), 0002 (S-06), 0003 (S-20), 0004 (S-30), 0005 (S-34), 0006 (S-31), 0007 (S-37), 0008 (S-38). Each is additive except 0003. Each gets a MANUAL_STEPS entry. If a screen needs a migration that has not been applied, it shows a clear 'feature not available yet, database update pending' state instead of crashing.

**C-6 Archived customers and totals.** Archived customers and their transactions are excluded from lists, pickers, dashboard totals, the Transactions page and exports of lists. Their data is kept and returns on Restore. Archiving a customer with a non-zero balance shows a warning (S-30).

**C-7 Revision history.** Only the last edit (who, when) is stored and shown. A full revision history table is intentionally out of scope; record it in `docs/BACKLOG.md`.

**C-8 Different file layout.** If a touch zone path does not exist in the real repository, map it to the closest equivalent found in S-01 and note the mapping in `docs/PROGRESS.md`.

---

## 10. Release definition of done

- Every story is Done or explicitly Deferred with a reason, and each Done story has its own green commit on `feat/v2-multi-business`.
- Lint, typecheck, build and tests pass in CI.
- SQL tests prove isolation and role rules.
- The five-persona regression passes.
- Both themes and all four widths were checked.
- `docs/MANUAL_STEPS.md` is complete, ordered and tested on a fresh Supabase project if one is available.
- No story left a TODO(S-20) marker, raw color, hardcoded path or direct Supabase call outside the api layer.

---

## 11. Open questions and assumptions for the product owner

| #   | Question or assumption                                                                                                                                     | Default used in this PRD                                            | Affects      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------ |
| Q1  | Which Google account should own the existing customers and transactions?                                                                                   | Supplied by you when running the backfill script                    | S-20         |
| Q2  | Are three roles (Owner, Editor, Viewer) right, or should shared users always be view-only?                                                                 | Three roles                                                         | S-21 to S-25 |
| Q3  | When someone owns no business but has shared ones, is the My businesses page the right landing, or should they go straight into the first shared business? | My businesses page                                                  | S-16, S-26   |
| Q4  | Is invitation by email address with in-app accept sufficient, or do you want real emails or invite links?                                                  | In-app only, no email sent                                          | S-23, S-24   |
| Q5  | Should archived customers with a balance still count in dashboard totals?                                                                                  | No, excluded, with a warning when archiving                         | S-30, S-36   |
| Q6  | Should Viewers be allowed to export data?                                                                                                                  | Yes                                                                 | S-39         |
| Q7  | Is ownership transfer needed (for example when the owner leaves the business)?                                                                             | Out of scope                                                        | Backlog      |
| Q8  | Is Hindi, Bengali or Urdu UI text needed?                                                                                                                  | English only, strings kept in one place per feature where practical | Backlog      |
| A1  | Hosting stays as in v1 (Vercel), and Supabase stays the backend.                                                                                           | Unchanged                                                           | All          |
| A2  | The actual database matches the v1 data model closely enough that S-03 can reconstruct it.                                                                 | Verified in S-01 and S-03                                           | E1           |
