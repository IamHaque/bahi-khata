# BahiKhata

A credit-ledger web app for small businesses that extend informal credit to
customers — goods go out, payment comes later, often in partial installments.
It replaces a paper notebook with a customer directory, a per-customer
transaction ledger (charges and payments), dashboard roll-ups, CSV import and
export, printable statements, and multi-user access with roles.

Auth is Google sign-in via Supabase; all data lives in Postgres with
row-level security. Internal operational tool — no marketing site.

## Stack

| Layer | Choice |
| --- | --- |
| UI | React 19 + TypeScript 5.8, Vite 7 (Node 22+) |
| Routing | React Router 7 (`/b/:businessId/...` scoped routes) |
| Data | TanStack Query 5 over `@supabase/supabase-js` 2 (API calls only from `src/**/api.ts`) |
| Forms | react-hook-form 7 + zod 4 (`@hookform/resolvers`) |
| Styling | Tailwind CSS 4 (semantic OKLCH tokens in `src/index.css`), shadcn-style components on `@base-ui/react`, lucide icons, sonner toasts, recharts, next-themes (light/dark/system); two fonts — Public Sans (text and money) and Bricolage Grotesque (headings and figures) |
| Database | Supabase (Postgres) — seven migrations in `supabase/migrations/` (v3.2 chain), SQL tests in `supabase/tests/` (24 sections) |
| Quality | ESLint 9 (flat config), `tsc -b`, Vitest 5 + Testing Library + jsdom, axe-core, CI via GitHub Actions |

## Environment variables

Copy the template, then fill in your Supabase project:

```bash
cp .env.example .env
```

| Variable | Meaning |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL (`https://<project-ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | The **anon/publishable** key — safe for browsers, the only key this app ever ships |

Never put a service-role key anywhere in this repo; a test
(`src/lib/__tests__/clientHygiene.test.tsx`) fails the build if one appears.
See `docs/SECURITY.md`.

## Supabase setup

1. Create a Supabase project (a scratch one first — never run experiments
   against production).
2. For a new project, apply **all seven migrations once, in filename order**:
   1. `20261017000000_bahikhata_consolidated_schema.sql` — multi-business schema and membership RLS.
   2. `20261101000000_v3_deletion_log_and_integrity.sql` — deletion log, delete/restore, actor stamping and timezone-aware dashboard.
   3. `20261108000000_v31_last_payment_at.sql` — last payment on customer balances.
   4. `20261201000000_v32_transaction_revisions.sql` — transaction revision history.
   5. `20261201000100_v32_deletion_log_purge.sql` — deletion-log export and cleanup.
   6. `20261201000200_v32_ownership_transfer.sql` — ownership transfer.
   7. `20261201000300_v32_bulk_actions.sql` — atomic bulk actions.
   Upgrading from v3.1 requires only the four v3.2 files. Those four files are
   re-runnable but frozen; do not edit applied migrations or replay the archived
   pre-v3 chain. See the **v3 database rollout** and **v3.2 database rollout**
   sections of [MANUAL_STEPS.md](docs/MANUAL_STEPS.md) for backup, ordered rollout,
   verification and rollback. v3.2.1 has no database changes.
3. Run the SQL tests: `DATABASE_URL=postgresql://…/scratch npm run test:sql`
   (scratch Postgres only — see `supabase/tests/README.md`).

## Google OAuth setup

1. **Google Cloud Console** → APIs & Services → Credentials → OAuth client
   (Web application). Add the authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`
2. **Supabase Dashboard** → Authentication → Providers → Google → paste the
   client ID and secret, enable the provider.
3. **Supabase Dashboard** → Authentication → URL Configuration → set the
   Site URL to `http://localhost:5173/` and add `http://localhost:5173/*`
   to Redirect URLs (production gets its own origin added the same way).
4. The app starts the flow with `redirectTo: window.location.origin + "/"`
   (`src/features/auth/api.ts`), so after consent Google returns through
   Supabase to the app root; the landing resolver then picks the right
   route (last business, `/businesses`, or onboarding).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (http://localhost:5173) |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run verify` | lint + typecheck + full test suite + build — the gate every commit must pass |
| `npm run lint` | ESLint over the whole repo |
| `npm run typecheck` | `tsc -b`, no emit |
| `npm test` | Full Vitest suite (jsdom) |
| `npm run audit:contrast` | WCAG AA contrast audit of every semantic token pair, both themes (S-40) |
| `npm run audit:tokens` | Design-token sync check (`design/` ↔ `src/index.css`) |
| `npm run audit:bundle` | Bundle-size budget guard over the built chunks |
| `npm run test:sql` | Runs every migration + the 24-section SQL suite against a scratch Postgres (`DATABASE_URL` required — **never** a real Supabase project) |
| `node scripts/responsive-audit.cjs` | Headless-Chrome audit: routes and states at 360/390/768/1024/1440 px, both themes, needs the dev server running (S-41) |

## Running the tests

```bash
npm test                                  # everything
npx vitest run src/features/__tests__      # one directory
npx vitest run src/lib/__tests__/clientHygiene.test.tsx   # security hygiene
```

Database-level proofs live in `supabase/tests/` and run against a real
Postgres (see that directory's README). `docs/MANUAL_STEPS.md` is the
ordered list of everything a human must apply/run by hand (migrations,
backfills, SQL tests).

## Project structure

```
supabase/            the seven migrations, SQL test suite, RLS notes
scripts/             contrast / token / bundle audit tooling + SQL runner
docs/                PRD (working copy), PROGRESS, MANUAL_STEPS, SECURITY,
                     UI-CONTRACT, RLS, RELEASE-NOTES-v3, BACKLOG,
                     PRD-v3.2.md, PRD-v3.2.1.md, RELEASE-NOTES-v3.2.md,
                     RELEASE-NOTES-v3.2.1.md, MOBILE-DASHBOARD-*,
                     RESEARCH-DECISIONS, ARCHITECTURE-BASELINE
src/
  components/        shared UI (ui/ primitives, app/ DataTable+dialogs, layout/ shell)
  contexts/          Auth, Business, Theme providers
  hooks/  lib/       shared hooks; paths.ts, queryKeys.ts, format.ts, permissions, supabase client
  features/          one folder per domain — api.ts (the ONLY place that
                     talks to Supabase), hooks, components, pages, __tests__
                     auth, business, customers, dashboard, import-export,
                     members, transactions, deleted-items, dev (UI gallery)
  test/              harness (renderApp), a11y helper, fixtures, setup
```

Route pattern: `/login`, `/` (landing resolver), `/businesses`,
`/onboarding/business`, then everything business-scoped under
`/b/:businessId/…` (dashboard, customers, transactions, members, settings).

## Roles

Three roles per business, enforced by Postgres row-level security first
and mirrored in the UI (viewers never see a control that would fail):

| Role | Can |
| --- | --- |
| **Owner** | Everything: create/delete the business, invite/remove members, change roles, delete customers and transactions (recoverable — every delete is logged and restorable from **Recently deleted**), CSV import, backup |
| **Editor** | Read + write customers, transactions, imports; no member management, no customer/transaction deletes (Void instead), no business deletion |
| **Viewer** | Read-only everything; write controls are hidden, and the database refuses writes regardless |

A user can belong to several businesses and switch between them; the active
business is the `/b/:businessId` in the URL.

## Where to start reading

- `docs/UI-CONTRACT.md` — the visual/interaction rules every screen follows
- `docs/SECURITY.md` — threats, controls, how to re-run the proofs
- `docs/RLS.md` — the row-level-security picture per table and role
- `docs/RELEASE-NOTES-v3.2.1.md` — patch fixes, verification and client-only rollback
- `docs/RELEASE-NOTES-v3.2.md` — what changed for users in v3.2 + rollout and rollback guide
- `docs/RELEASE-NOTES-v3.md` — what changed for users in v3.1 + pre-deploy checklist
- `docs/RESEARCH-DECISIONS.md` — the research gates (G-A1/G-A2/G-A3) and their statuses; **edited only by a human**
- `docs/PROGRESS.md` — build status story by story
