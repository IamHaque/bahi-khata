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
| Database | Supabase (Postgres) — three migrations in `supabase/migrations/` (v3.1 chain), SQL tests in `supabase/tests/` |
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
2. Apply the **three v3.1 migrations in filename order** (the pre-v3 chain
   is archived in `supabase/migrations_archive/` — do not replay it on a
   migrated database):
   1. `20261017000000_bahikhata_consolidated_schema.sql` (consolidated
      multi-business schema + membership RLS)
   2. `20261101000000_v3_deletion_log_and_integrity.sql` (deletion log,
      delete/restore functions, actor stamping, timezone-aware
      `dashboard_summary`)
   3. `20261108000000_v31_last_payment_at.sql` (`last_payment_at` on the
      balance view)
   The Supabase CLI (`supabase db push`) or the SQL Editor both work; the
   full step-by-step — backup, rollout, post-deploy checklist, rollback —
   is the **"v3 database rollout"** section of `docs/MANUAL_STEPS.md`.
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
| `npm run test:sql` | Runs every migration + the 19-section SQL suite against a scratch Postgres (`DATABASE_URL` required — **never** a real Supabase project) |
| `node scripts/responsive-audit.cjs` | Headless-Chrome audit: every route at 360/768/1024/1440 px, needs the dev server running (S-41) |

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
supabase/            the three v3.1 migrations, SQL test suite, RLS notes
scripts/             contrast / token / bundle audit tooling + SQL runner
docs/                PRD (working copy), PROGRESS, MANUAL_STEPS, SECURITY,
                     UI-CONTRACT, RLS, RELEASE-NOTES-v3, BACKLOG,
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
- `docs/RELEASE-NOTES-v3.md` — what changed for users in v3.1 + pre-deploy checklist
- `docs/RESEARCH-DECISIONS.md` — the research gates (G-A1/G-A2/G-A3) and their statuses; **edited only by a human**
- `docs/PROGRESS.md` — build status story by story
