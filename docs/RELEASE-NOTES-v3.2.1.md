# BahiKhata v3.2.1

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
Physical-device keyboards, live OAuth and production acceptance remain owner checks.

## Rollback

Redeploy the v3.2 client. There is nothing to undo in the database; do not roll
back or edit the seven frozen migrations.
