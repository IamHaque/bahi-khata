# BahiKhata v2 — Release notes

What changed for users, and what a human must run before deploying.
Story-by-story build evidence: `docs/PROGRESS.md`.

## What changed for users

### Multiple businesses and teams
- One account can now run **several businesses**; each has its own
  customers, transactions, members and settings. A switcher in the sidebar
  moves between them, and every URL is business-scoped
  (`/b/<businessId>/…`) so links always open the right workspace.
- **Landing logic:** opening the app takes you to your last-used business,
  or the business list if you have several/none, or straight into
  onboarding if you have none. Deep links survive sign-in.
- **Members and roles:** owners invite by email (Editor or Viewer), see
  pending invitations, change roles, remove members, or leave a business
  themselves. Invitees see an invitation count badge and accept/decline
  from the My businesses page. Viewers get a genuinely read-only app —
  write controls are hidden *and* the database refuses writes.

### Customers
- Faster list with search, status filter (Active/Archived), sorting and
  paging — all state kept in the URL, plus a Ctrl/Cmd+K command palette.
- Richer add/edit form: validation with helpful inline errors, duplicate
  detection that links you to the existing customer, and a one-click
  "Add transaction" after creating a customer.
- **Archive / restore** (reversible, with an 8-second Undo toast) and — for
  owners only, behind a typed confirmation — **delete permanently** with a
  transaction-count warning.
- **Customer detail:** balance as the hero, totals/last-activity stats,
  a running-balance ledger with charge/payment/voided filters, contact
  links, tags, and a printable statement for any period.

### Transactions
- A single sheet records **charges and payments** with a live
  "current → resulting balance" preview; it opens pre-picked from row
  actions, the dashboard, or the top bar.
- **Edit** shows an "Edited by … on …" badge in the ledger; **Void** asks
  for an optional reason, keeps the row visible but struck through with a
  Voided badge (excluded from all maths), and offers Undo; **Restore**
  brings a voided row back with its history intact.
- The transactions page has a **detailed** view and a **summarized**
  view (day/week/month roll-ups), date presets, type filters and
  Include-voided — everything shareable via the URL.

### Dashboard
- Server-computed KPIs (total receivable as the headline number, today's
  activity, active customers), a **Top outstanding** list, a **Today**
  card that links to a matching filtered view, a 7/30/90-day trends
  chart, and a recent-activity feed.

### Import, export, backup
- **CSV import** in four steps (Upload → Review → Import → Done): whole
  file validated before anything is written, per-customer preview of
  existing balance vs file delta, clear row-level errors, explicit
  partial-import choice, and an import history. Owners/editors only.
- **CSV export** of the customers and transactions lists with progress,
  a Settings **backup** (customers + transactions), and formula-safe
  cells (`=`, `+`, `-`, `@` neutralised for spreadsheets).

### Experience and quality
- Light/dark/system theme on semantic colour tokens (WCAG AA verified in
  both themes).
- Accessibility pass: skip-to-content, full keyboard journeys for the
  core tasks, screen-reader announcements (sort, counts, balance
  changes), 44-px touch targets on touch devices, reduced-motion
  respected.
- Responsive pass: every screen fits 360/768/1024/1440 px with no
  sideways scrolling and no clipped amounts; tables become cards on
  phones, sheets open from the bottom, the sidebar becomes a drawer,
  and notches/home indicators are respected.
- Security: row-level security on every table, role checks in the
  database (not just the UI), client-hygiene tests (no service-role key
  anywhere), documented threat model in `docs/SECURITY.md`.

## What a human must run before deploying

Ordered; details and verification for each are in `docs/MANUAL_STEPS.md`.

1. **Environment:** create the production `.env` with the production
   Supabase URL + anon/publishable key (never a service key).
2. **OAuth:** in Google Cloud Console add the production redirect URI
   (`https://<project-ref>.supabase.co/auth/v1/callback`); in Supabase →
   Authentication set the production Site URL and add
   `https://your-domain/*` to Redirect URLs. See `README.md`.
3. **Migrations, in order** on the production project:
   the two baseline files (`20260913152312…`, `20260913170000…`), then
   `0001` → `0008` (lettered siblings in place). `0003` includes the
   expand-then-contract cleanup — run its MANUAL_STEPS section at the
   scheduled time; the app shows a clear "database update pending" state
   for anything not yet applied.
4. **Legacy data (one-time):** ~~the S-20 backfill~~ **cancelled — not
   needed:** the owner confirmed a fresh start (existing data deleted),
   so there is nothing to backfill and no owner email to supply.
   Applying migrations in order to the empty database is enough; the
   superseded procedure is kept in `docs/MANUAL_STEPS.md` (S-20) only
   as a reference.
5. **SQL test suite** against a scratch database
   (`supabase/tests/README.md`) — this environment had no database, so
   these are written-and-reviewed, not executed, here.
6. **Deploy `dist/`** (`npm run build`), then smoke-test the five
   personas (Owner, Editor, Viewer, signed-in with no business, pending
   invitation) — the checklist is in `docs/PROGRESS.md` under S-43.
7. Optional re-runs: `node scripts/contrast-audit.cjs`,
   `node scripts/responsive-audit.cjs` (dev server up), `npm test`,
   `npm run lint`, `npm run typecheck`.

## Known honest gaps

- SQL migrations/tests and the real Google-OAuth click-through could not
  be executed in the build environment (no database, no browser
  identity); everything else is covered by the automated suite.
- `docs/BACKLOG.md` holds post-release ideas; `docs/PROGRESS.md`
  records every deviation from the PRD.
