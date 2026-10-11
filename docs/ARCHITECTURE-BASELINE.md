# BahiKhata v1 — Architecture Baseline

**Produced by:** S-01 repository audit (2026-10-11)
**Branch:** `feat/v2-multi-business` (from `master` @ `cc92edb`)
**Method:** full read of `src/`, config files, `supabase/`, `package.json`. No database access was available; schema facts are taken from the two versioned migrations and the TypeScript types, which agree with each other.

---

## 1. Stack (confirmed from package.json)

| Concern | Reality |
| --- | --- |
| Build | Vite 7, `npm run build` = `tsc -b && vite build` |
| UI | React 19.1, TypeScript 5.8 (strict, `noUncheckedIndexedAccess`) |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`), `tw-animate-css`, shadcn/ui on **Base UI** (`@base-ui/react` 1.8) — composition via `render` prop, confirmed in `components.json` (`"style": "base-nova"`) |
| Routing | react-router-dom 7.6 (`BrowserRouter`, declarative `<Routes>` in `src/App.tsx`) |
| Backend | `@supabase/supabase-js` 2.52 (Google OAuth + Postgres) |
| Toasts | sonner 2.x (`<Toaster position="bottom-right" richColors />`) |
| Icons | lucide-react |
| Fonts | `@fontsource-variable/public-sans` (loaded in `index.css`); `@fontsource-variable/geist` installed but **not loaded** |
| Theme | **Custom `ThemeContext`** (light/dark, localStorage). `next-themes` is installed but **unused** |
| Tests | vitest 5, pure-logic tests only (no jsdom, no component tests) |
| Query layer | **none** — no `@tanstack/react-query`; data fetching is hand-rolled `useEffect` + `useState` with a `transaction-saved` window event for invalidation |

**Pre-existing failures on master (S-02 must fix):**
- `npm run lint` **fails**: ESLint 9.39 is installed but there is no `eslint.config.js` (flat config). No lint config file exists at all.
- There is no `typecheck` script; type checking only happens inside `npm run build`.

## 2. Routes, pages and layouts

All routes are declared in `src/App.tsx`. There is no `paths.ts`; every link is a hardcoded string.

| Path | Component | Notes |
| --- | --- | --- |
| `/login` | `src/pages/Login.tsx` | Google sign-in button; `<Navigate to="/">` when already signed in |
| `/` | `src/pages/Dashboard.tsx` | Landing page for signed-in users (no resolver logic yet) |
| `/customers` | `src/pages/CustomersPage.tsx` | List + search + balance filter + local sort; Add Customer dialog; Import CSV link |
| `/customers/:id` | `src/pages/CustomerDetailPage.tsx` | Profile, current balance, transaction table, Add Transaction sheet, Edit sheet |
| `/customers/import` | `src/pages/ImportPage.tsx` | Client-side CSV parse → preview → commit (no server RPC) |
| `/transactions` | `src/pages/TransactionsPage.tsx` | Detailed + summarized views, date presets, type filter, customer search |
| `/transactions/:id` | `src/pages/TransactionDetailPage.tsx` | Single transaction view + Edit sheet (with Void) |

**Layout:** `src/components/AppLayout.tsx` — a **top header bar** (not a left sidebar): brand link, horizontal nav (Dashboard / Customers / Transactions), theme toggle, email, Sign out, and a hamburger opening a `Sheet` drawer on mobile (`sm:` breakpoint). Content is `<Outlet />` inside `max-w-5xl`.

**Guards:** `src/components/ProtectedRoute.tsx` — shows "Loading..." while the auth session loads, redirects to `/login` when signed out, otherwise renders `<Outlet />`.

**Error boundary:** `src/components/ErrorBoundary.tsx` — full-page fallback with a Reload button.

## 3. Auth flow

`src/contexts/AuthContext.tsx`:
- `supabase.auth.getSession()` on mount + `onAuthStateChange` subscription.
- `signInWithGoogle()` → `signInWithOAuth({ provider: "google", redirectTo: origin + "/" })`.
- `signOut()` → `supabase.auth.signOut()`.
- Exposes `{ session, user, loading, signInWithGoogle, signOut }` via `useAuth()`.

No profile table, no user metadata storage, no post-login routing decision (signed-in users always land on `/`).

## 4. Data access (today: direct `src/lib/*.ts`, no api/hooks split)

There is **no** `features/*/api.ts` / `hooks.ts` structure. Data functions live in `src/lib/` and are called directly from pages:

| File | Exports | Supabase calls |
| --- | --- | --- |
| `src/lib/supabase.ts` | `supabase` client | client construction only (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) |
| `src/lib/customers.ts` | `listCustomers`, `getCustomer`, `createCustomer`, `updateCustomer`, `CustomerInput` | `customers` select/insert/update |
| `src/lib/transactions.ts` | `listTransactionsByCustomer`, `createTransaction`, `createTransactionsBatch`, `updateTransactionStatus`, `updateTransaction`, `getCustomerBalance`, `getAllCustomerBalances`, `getTodayActivity`, `getAllTransactions`, `getTransactionById`, `getTodayTransactions` | `transactions` CRUD + RPC `get_customer_balance`, `get_all_customer_balances` |
| `src/lib/balance.ts` | `computeBalance` (pure) | none |
| `src/lib/csv-import.ts` | `parseAndValidateCsv`, `groupByCustomer`, types | none (client-side parser) |
| `src/lib/utils.ts` | re-exports `cn` | none |
| `src/contexts/AuthContext.tsx` | auth | `supabase.auth.*` |

**Every file that touches Supabase (direct answer to the audit question):**
1. `src/lib/supabase.ts` — client definition
2. `src/lib/customers.ts` — `customers` table
3. `src/lib/transactions.ts` — `transactions` table + balance RPCs
4. `src/contexts/AuthContext.tsx` — auth API

**Invalidation pattern:** pages listen for a `window` `CustomEvent("transaction-saved")` (dispatched by `QuickAddTransactionSheet`) and refetch. No query cache exists.

## 5. Database schema (as inferred from migrations + types)

Migrations in `supabase/migrations/` (both exported from the live project `nhjjanrrismmrfeyiegp` on 2026-09-13, idempotent `create-if-not-exists` style):

### `20260913152312_remote_schema.sql`
- Enums: `transaction_type ('charge','payment')`, `transaction_status ('active','edited','voided')`, `transaction_source ('manual','import')`
- **`customers`**: `id` uuid pk, `name` text, `phone`, `email`, `address`, `alternate_contact_name`, `alternate_contact_phone`, `tags` text[], `notes`, `created_at`, `updated_at` — all timestamps `timestamptz default now()`
- **`transactions`**: `id` uuid pk, `customer_id` uuid fk→customers, `type` transaction_type, `amount` numeric, `occurred_at` timestamptz, `note`, `status` default 'active', `source` default 'manual', `created_by` uuid fk→auth.users (not null), `created_at`, `updated_at`
- RLS **enabled** on both tables with a single permissive policy each: `FOR ALL TO authenticated USING (true) WITH CHECK (true)` — every authenticated user sees and can modify every row.

### `20260913170000_add_balance_rpc_functions.sql`
- `get_customer_balance(p_customer_id uuid) returns numeric` — `security definer`, sums `charge - payment` over `status in ('active','edited')`. **No `search_path` pinning, no RLS awareness** (definer rights bypass RLS).
- `get_all_customer_balances() returns table(customer_id, balance)` — same, grouped.

### TypeScript mirror (`src/types/index.ts`)
`Customer`, `Transaction`, `TransactionType`, `TransactionStatus`, `TransactionSource`, `CustomerWithBalance`, `TransactionWithCustomer` — matches the SQL one-to-one.

**Not present (all new in v2):** `profiles`, `businesses`, `business_members`, `business_invitations`, `business_id` columns, `deleted_at`/`deleted_by`/`updated_by`/`voided_at`/`voided_by` columns, any views, any role/permission concept, any pagination.

## 6. Shared components that exist today

| Component | File | Notes |
| --- | --- | --- |
| `DataTable` | `src/components/DataTable.tsx` | Column-driven (`Column<T>`: key/header/align/sortable/render/sortValue), `aria-sort` on sortable headers, skeleton loading rows, empty/no-results slots. **Local sorting only** (parent sorts), no paging, no mobile card mode, no row actions menu |
| `CustomerFormDialog` | `src/components/CustomerFormDialog.tsx` | Add+edit in one dialog, hand-rolled validation (name 1–100, phone/email regex), inline errors, toast on success. **Not** react-hook-form/zod |
| `AddTransactionSheet` | `src/components/AddTransactionSheet.tsx` | Bottom sheet, type segmented control, amount/date/note, current-balance context |
| `EditTransactionSheet` | `src/components/EditTransactionSheet.tsx` | Same fields + Void via `AlertDialog` (no shared ConfirmDialog) |
| `QuickAddTransactionSheet` | `src/components/QuickAddTransactionSheet.tsx` | Customer picker + same fields; dispatches `transaction-saved` |
| `TransactionFormFields` | `src/components/TransactionFormFields.tsx` | Shared field group (type/amount/date/note) |
| `CustomerCombobox` | `src/components/CustomerCombobox.tsx` | Searchable picker, popover on desktop / sheet on mobile, "add new customer" affordance |
| `useTransactionForm` | `src/hooks/useTransactionForm.ts` | Form state + validation (amount > 0, date not in future) |
| `useSort`, `useDebouncedValue`, `useMediaQuery` | `src/hooks/` | Small generic hooks |
| shadcn primitives | `src/components/ui/` | alert-dialog, button, dialog, input-group, input, label, popover, select, sheet, sonner, table, textarea, toggle, toggle-group |

**Missing vs PRD 4.5 component list:** `PageHeader`, `StatCard`, `Money`, `BalanceBadge`, `StatusBadge`, `EmptyState`, `ErrorState`, `Skeleton*`, `SearchInput`, `FilterBar`, `EntityDialog`, `ConfirmDialog`, `RowActionsMenu`, `Avatar`, `AppShell`/`Sidebar`/`Topbar`, `OnboardingLayout`, command palette.

## 7. Money, dates, paths, query keys

- **Money:** no `lib/format.ts`. Every screen does `₹{x.toLocaleString("en-IN")}` inline. No Indian-decimal helper, no single formatter.
- **Dates:** `new Date(x).toLocaleDateString("en-IN")` inline everywhere; no `formatDate`/`formatRelative`.
- **Paths:** hardcoded strings (`/customers`, `/customers/${id}`, …) in every page and in `AppLayout`.
- **Query keys:** none (no react-query).

## 8. Theme tokens (today)

`src/index.css` defines CSS variables in `:root` and `.dark`, mapped into Tailwind via `@theme inline`. The palette is a hand-picked "paper-and-ink" scheme: brass primary (`#8a6a2f` light / `#d4af6a` dark), warm off-white background, ledger-red `--receivable`, ledger-blue `--credit`, graphite `--settled`, plus `--accent-wash`. Radius scale derived from `--radius: 0.625rem`. `tabular-nums` utility and a `balance-flash` keyframe exist. Reduced-motion media query is present.

This **contradicts PRD 4.5** (preset-driven theme, indigo primary, green receivable, red-orange credit, Geist font, next-themes). S-08 owns that alignment.

## 9. Tests

- `src/lib/__tests__/csv-import.test.ts` — parser/validator unit tests (incl. BUG-003 timezone regression).
- `src/lib/__tests__/transactions.test.ts` — `computeBalance` unit tests.
- 26 tests, all passing. No component tests, no jsdom, no CI workflow (`.github/` does not exist).

## 10. Smoke checklist baseline (v1 behavior to preserve)

Re-run after every story that touches data or routing (see `docs/PROGRESS.md`):

1. Sign in with Google → land on Dashboard.
2. List customers → all customers visible with balances.
3. Add customer → appears in list.
4. Add transaction (charge) → balance increases, row appears on customer page.
5. Dashboard totals → receivable/credit/top-debtors match the sum of customer balances.
