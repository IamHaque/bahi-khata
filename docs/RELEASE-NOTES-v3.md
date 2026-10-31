# BahiKhata v3.1 — Release notes

What changed for users, the database rollout order, and what a human
must run before deploying. Story-by-story build evidence:
`docs/PROGRESS.md`; the human-facing steps: `docs/MANUAL_STEPS.md`.

## What changed for users

### Delete — and Recently deleted

- **Owners can delete a transaction** (the row is removed from the
  ledger, with an optional reason) and **delete a customer** with their
  whole history — from the list row menu or the customer page, behind a
  typed name confirmation for customers. "Delete permanently" is gone as
  a phrase: delete is now recoverable.
- **Every delete is logged and restorable.** A 10-second **Undo** toast
  appears immediately, and the new **Recently deleted** page
  (Owner-only, in the spine after Import) shows everything deleted —
  who deleted it, when and why — with a **Restore** that puts the item
  back exactly (same ids, authors, timestamps). A transaction whose
  customer was deleted says "Restore the customer first." Editors keep
  **Void**; only Owners get Delete.
- The database guarantees all of this: deletions write a full snapshot
  to a `deletion_log` table first; only the Owner can read it; no client
  can write it.

### The Ledger Page look (gate G-A3 approved)

- The whole app is redesigned around the product's own artefact — a
  paper ledger: **Paper/Sheet/Ink** palette, **Public Sans** for text
  and money with **Bricolage Grotesque** headings, hairline rules
  instead of shadows, a sidebar "spine" with a tally-mark brand, and a
  **Slate** dark theme. Both themes are WCAG AA verified (82 automated
  contrast checks).
- New ledger primitives everywhere: dotted **leader rows** (name …
  amount), **totals rules** (single line above, double below), monogram
  avatars, age flags, and the ledger vocabulary (Date, Particulars,
  Charged, Paid, Balance).

### The customer page is a ledger

- The customer detail page shows a **real ledger table** (caption,
  headers, running balance, a Totals row, voided rows struck through
  but visible) plus a **quick-add card**: record a charge or payment
  without leaving the page, with a live "New balance" preview. Long
  ledgers page via "Show earlier entries".
- Two research gates stayed **pending**, so their alternatives shipped
  as designed: the **entry row** (typing into the Charged/Paid column)
  and **Who to chase** were *not* built — the dashboard keeps **Top
  outstanding balances**, the customer page keeps the quick-add card.

### Dashboard and transactions

- The dashboard reads as a ledger page: **Where you stand** (Owed to
  you / You owe / Net position), **Top outstanding balances**, **Day
  book** (latest ten entries) and a **This week** chart — each section
  loads, errors and retries independently.
- The transactions page gained **Charged** and **Paid** columns (the
  matching amount fills its cell, the other shows a dash), a totals
  strip, and cleaner filters; the customers list now sorts by a server
  computed `last_activity_at` (no transaction rows shipped to the
  browser).

### Faster and smaller

- Route-level code splitting: the login first load is ~100 kB gzipped,
  largest chunk well under the 500 kB budget; the customers list request
  carries no transaction rows; dev-only packages moved out of the
  production dependency tree (`npm audit --omit=dev` = 0 findings).

### Fixes and quality

- Timezone-correct "today": the dashboard and the transactions page now
  cut the local day identically (`dashboard_summary` takes the
  browser's IANA zone).
- Mobile/accessibility sweep (L-14): no horizontal scrolling on any
  route at 360–1440 px, 44 px touch targets measured in a real browser
  (1050 controls, 0 failures), visible focus ring on every keyboard
  stop, dialogs trap and restore focus, reduced motion respected.
- Accessibility is gated in CI: axe tests on every page/dialog state,
  contrast audit, token sync, bundle-size guard, client-hygiene scan.

## Which gates were approved

| Gate | What | Status |
| --- | --- | --- |
| **G-A3** | Adopt the Ledger Page look | **approved** (owner, 19 Oct 2026, before research; research may reverse it) |
| **G-A2** | Entry row on the customer page (L-12) | `pending` — not built; quick-add card stays (the approved default) |
| **G-A1** | "Who to chase" on the dashboard (L-13) | `pending` — not built; Top outstanding balances stays (the approved default) |

Nothing else in v3.1 depends on research (`docs/RESEARCH-DECISIONS.md`,
edited only by a human).

## Database rollout order

Full instructions, verification queries and rollback: the **"v3 database
rollout"** section of `docs/MANUAL_STEPS.md` (steps a–h plus the
post-deploy checklist). In order:

1. **Back up** (app Settings → Download backup + Supabase snapshot).
2. `20261017000000_bahikhata_consolidated_schema.sql` — the consolidated
   schema (idempotent; refuses to proceed if a customer/transaction has
   no business).
3. `20261101000000_v3_deletion_log_and_integrity.sql` — deletion log,
   delete/restore functions, actor stamping, `dashboard_summary` with
   timezone.
4. `20261108000000_v31_last_payment_at.sql` — `last_payment_at` on the
   balance view.
5. Run the **post-deploy checklist** queries (same file) and the 10-point
   smoke checklist (PRD §9.4).
6. Deploy the new client. The old client keeps working meanwhile (the
   timezone parameter has a UTC default), though its dashboard "today"
   stays UTC-cut until the new client is live.

If the project uses Supabase CLI migration history, repair the version
list as described in step (e). Do **not** replay the whole old chain on
an already-migrated database.

## Known limitations (from PRD §10 and the build)

- **Research has not run.** The Ledger Page look is owner-approved, not
  user-tested; it can be reversed when the readout arrives. No claims
  about what shop owners want or how fast they record are verified.
- **Invitations are copy-link** — no email delivery (backlog B-19).
- **One currency** (`₹`), no multi-currency (B-20), no offline/PWA
  (B-21).
- **The deletion log never expires** (kept until the business is
  deleted); a purge/export tool is backlog B-12.
- **No edit-history table** — the Edited badge shows only the last
  editor/time (B-08). **No bulk select-and-act** (B-13), **no ownership
  transfer** (B-14).
- **No end-to-end browser suite** (B-15) — the L-14 audit is a
  measurement script, not a fixture-driven test run; the SQL suite is
  executed against scratch Postgres (`npm run test:sql`), the client
  suite in jsdom.
- **English only**; Bangla/Hindi need font-stack and numeral decisions
  (B-16). The printable statement is not yet restyled to the ledger
  look (B-17).
- **Google sign-in cannot be automated** in tests; the OAuth click-
  through is a manual smoke step.
- **`open_accounts` counts both directions** (a customer you owe counts
  as open — see DEV-20 in `docs/PROGRESS.md` for why).

## Verification before this release

- `npm run verify` (lint, typecheck, 625 tests, build) green.
- Contrast 41/41 checks per theme; token sync 58/58; bundle 22 chunks,
  largest ~326 kB; `npm audit --omit=dev` = 0.
- SQL suite: all 19 sections pass on scratch Postgres (S-50 record).
- Browser audit: 24 scenarios × 5 widths × 2 themes, 121 PASS / 0 FAIL;
  1050 touch controls measured, 0 failures (L-14).
- Open PR `feat/v3` → `master` with these notes as its description.
  **Not merged, not deployed** — a human runs the rollout above first.
