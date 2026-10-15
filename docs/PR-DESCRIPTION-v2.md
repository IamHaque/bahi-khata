# PR description — v2 multi-business release

Prepared for the hand-off (S-43). **Do not merge to `master` without the
human owner's review.**

---

## BahiKhata v2 — multi-business, teams and a hardened quality bar

Closes out `docs/PRD-v2.md`: stories **S-01 → S-43** (execution order C-1),
one reviewed commit per story on `feat/v2-multi-business`.

### What's in it

**Data & tenancy**
- Multi-business schema (`0001`), membership RLS + helper functions/RPCs
  (`0002`, `0002b`, `0002c`), enforced tenancy with expand-then-contract
  (`0003` + `0003b`), archive/permanent-delete (`0004`), void/restore
  (`0005`), customer ledger + rollups (`0006`, `0006b`), daily activity
  (`0007`), import history (`0008`). All additive; none applied anywhere
  from here — application steps live in `docs/MANUAL_STEPS.md`.

**Product**
- Business-scoped routes `/b/:businessId/…`, landing resolver, business
  switcher, My businesses (own / shared / invitations).
- Teams: owner invites by email, roles Editor/Viewer, role change, remove,
  leave; invitation accept/decline with count badge; lost-access handling.
- Customers v2 (URL-driven list, rich form, archive/restore/permanent
  delete with undo), customer detail with running-balance ledger.
- Transactions v2 (shared add sheet with balance preview, edit with badge,
  void with reason + undo, detailed + summarized views), dashboard KPIs,
  trends chart, activity feed.
- CSV import (validated, atomic, role-gated), CSV exports + backup +
  printable statement.

**Quality**
- UI consistency contract + dev gallery; tests on every story
  (**463 tests / 53 files**, plus SQL proofs in `supabase/tests/`).
- Accessibility pass (axe zero serious/critical on 13 routes, keyboard
  journeys, focus, announcements, 44-px touch targets, contrast AA in
  both themes), responsive pass (real headless-Chrome audit: 13 routes ×
  360/768/1024/1440 = 52/52 PASS), security verification (8 negative
  cases mapped to SQL proofs + automated client hygiene, `docs/SECURITY.md`).

### Test plan / verification

- `npm run lint` — 0 errors (7 pre-existing warnings, unchanged)
- `npm run typecheck` — clean
- `npm run build` — succeeds
- `npm test` — 463 passed / 53 files
- `node scripts/responsive-audit.cjs` (dev server up) — 52/52 PASS
- `node scripts/contrast-audit.cjs` — 18 token pairs × 2 themes, all ≥ AA
- SQL suite: **written + reviewed, not executed here** (no database) —
  run per `supabase/tests/README.md`; ordered steps in `docs/MANUAL_STEPS.md`
- Five-persona smoke evidence: `docs/PROGRESS.md` → S-43 notes

### Before deploying

`docs/RELEASE-NOTES-v2.md` § "What a human must run before deploying" —
env, OAuth redirects, migration order, SQL tests, persona smoke.
(The S-20 legacy backfill was cancelled by the owner's fresh-start
decision of 2026-10-15 — existing data is deleted, nothing to backfill.)

### Status

All 43 stories **Done** (`docs/PROGRESS.md`), deviations logged there,
extra ideas in `docs/BACKLOG.md`. PRD working copies
(`docs/PRD-v2.md`, `BahiKhata-Enhancement-PRD-3.md`) intentionally not
committed.
