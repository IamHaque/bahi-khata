# BahiKhata v3.2.1

**Status:** Released, merged in PR #8 (`64037fc`), accepted by the owner on the deployed client (per owner statement).

This client patch fixes customer editing, transaction entry, customer search,
collection context and CSV exports. **There are no database changes**: all seven
applied migrations remain frozen. No new npm dependencies were added.

## Changes for users

- Valid large two-decimal amounts work, up to ₹99,99,99,999.99; forms and imports use the same limit.
- Clearing optional customer contact details, notes and tags saves and stays cleared.
- Customer-picker failures show Retry rather than an empty-business prompt.
- Picker search reaches all active customers, including those outside the first response window.
- A customer created inside a transaction is selected immediately without losing the draft.
- Payment-history failures are distinct from never paid, and the chase link lists only customers who owe.
- Mobile customer cards state who owes whom in words.
- An all-archived business offers Show archived and Add customer.
- Dashboard archive/unarchive behavior is pinned by SQL tests; Transactions also excludes archived customers. Archived customer lists and individual ledgers retain their history.
- Numeric CSV columns remain numbers, including negatives; names and notes keep formula protection.
- A repo-wide test prevents bare fractional grid tracks from reintroducing page overflow.
- Loading table headers keep sorting controls; rows-per-page survives reloads and shared URLs.
- Setup, rollout, backlog, UI contract and historical progress records are synchronized.

## Verification and acceptance

Automated evidence, deviations and the owner's v3.2.1 human checklist are in
[PROGRESS.md](PROGRESS.md). Prior v3.2 production rollout and UI acceptance are
recorded per owner statement; this patch has not been deployed by the agent.
Physical-device keyboards, live OAuth and production acceptance passed per owner statement (acceptance commit `14e5289`); the agent did not verify production.

## Rollback

Redeploy the v3.2 client. There is nothing to undo in the database; do not roll
back or edit the seven frozen migrations.

## Release-candidate verification

- Clean clone, no `.env`: two full verification runs passed, each 92 test files, 783 passed and one unchanged conditional hygiene test skipped; lint, typecheck and build passed.
- Headless Chrome: 35 scenarios at 360, 390, 768, 1024 and 1440px in both themes; 350 passing cells and 1,538 touch checks with zero failures.
- Scratch PostgreSQL 17.11: all 24 SQL sections passed; six new archive/unarchive expectations were individually mutation-tested.
- Token/contrast/bundle guards passed; production dependency audit reports zero vulnerabilities.

The audit uses synthetic fixtures and clicks. Physical-device focus restoration,
real keyboards and live OAuth are covered by owner acceptance per owner statement.
CI passed on `master` at `64037fc` and its Vercel production deployment is live,
per owner statement; the agent did not inspect CI or production.
