# BahiKhata v3.2 — Release notes

What changed for users, database updates, rollout instructions, and rollback procedures.
Story-by-story build evidence: `docs/PROGRESS.md`; human-facing steps: `docs/MANUAL_STEPS.md`.

---

## Unreleased mobile/dashboard follow-up

Branch `feat/mobile-layout-dashboard`; implemented locally, not deployed. Drawer content fills its panel; creation popups have scrolling and visual-viewport height limits. Picker sizing and pending-save dismissal are corrected. Chart links preserve the last valid hovered period, clamp partial periods, and apply local calendar dates in Transactions.

Evidence and remaining issues: [review](MOBILE-DASHBOARD-REVIEW.md). Physical-device acceptance is pending in [manual steps](MANUAL_STEPS.md). No new dependencies, migrations, or environment settings.

## 1. What changed for users

### Tooltip system and icon buttons (U-01)
- Every icon-only button across the entire application now features an accessible tooltip on hover and keyboard focus using `@base-ui/react/tooltip`.
- Disabled buttons explain *why* they are disabled directly within the tooltip via `disabledReason`.
- Touch devices suppress hover tooltips so tapping activates the control cleanly without sticky popups.
- Hit areas are guaranteed at least 44×44px on coarse pointers via `.touch-target`.

### Single table system: `DataTable` v2 & `RowActions` (U-02, U-03, U-04)
- All tables (Customers, Transactions, Customer Ledger, Day Book, Members, Recently Deleted) now use a unified `DataTable` component.
- **Fit/fill sizing:** Exactly one descriptive column expands to fill remaining space; all other columns shrink-to-fit with no wasted whitespace and zero horizontal scroll.
- **Priority folding:** Secondary columns fold gracefully into a neat second line below `lg` (1024px) and `xl` (1280px).
- **Mobile cards:** Below 768px (`md`), tables automatically convert into clean two-line mobile cards (`TableCard`) featuring a single 44px More menu.
- **Unified RowActions:** Desktop displays up to two inline icon buttons plus a More menu; mobile and touch pointers consolidate all actions into a single menu.

### Rebuilt Dashboard Activity chart (U-06)
- Activity compares charges and payments side by side above zero, with net shown separately. Grouping adapts to the measured card width.
- Zero-based Y-axis with nice tick bounds and compact Indian numbering format (₹1k, ₹50k, ₹1L, ₹10L, ₹1Cr).
- Four range options: **7 days**, **30 days**, **90 days**, **12 months**, synchronized to the URL query string (`?activity=30`).
- Three comparison metric tiles (Charged, Paid, Net) comparing the selected window to the preceding period of equal length.
- Interactive keyboard-accessible readout with a direct "View entries" deep link.
- Partial buckets (e.g. current month or partial weeks) display with reduced opacity and clear labels (`Nov 2026 (so far)`).

### Who to chase (U-07 / L-13)
- Replaces "Top outstanding balances" on the dashboard.
- Highlights customers owing money whose last payment exceeds the threshold (`CHASE_AFTER_DAYS = 30`), sorted largest balance first (at most 5).
- Displays trailing `AgeFlag` indicating days since last payment.
- Dotted leader rows connect customer names directly to outstanding balances.
- Offers a "See all" deep link to the filtered Customers page.

### Inline ledger entry row (U-08 / L-12)
- Fast recording directly on the customer ledger for desktop users (`md` and up).
- 6-cell row matching ledger columns: Date, Particulars, Charged, Paid, Balance, Save.
- Dynamic balance preview shows live impact (`after: ₹X.XX`) as numbers are typed.
- Entering Charged auto-clears Paid (and vice versa); entering both displays an inline validation message.
- Keyboard navigation: Tab moves between fields, Enter submits, Escape clears. Focus automatically resets to Charged on save with an `entry-reveal` fade animation.
- Mobile retains header buttons "Add charge" and "Add payment" as the clean entry point.

### Transaction revision history (S-72 / B-08)
- Every edit, void, or restore to a transaction is recorded in `transaction_revisions` via database trigger.
- `TransactionDetailPage` includes a dedicated **History** section detailing the actor, timestamp, action, and field-level diffs.
- `EditedBadge` in table rows links directly to `#history`.

### Deletion log export and clean up (S-73 / B-12)
- Business owners can export the entire deletion log as a CSV file.
- Clean up dialog allows purging deletion records older than 30 days (permanent purge floor).
- Dry-run preview calculates the exact number of entries, customers, transactions, and revisions to be removed.
- Requires typing `PURGE` to confirm; purge runs are audited in `deletion_log_purges`.

### Business ownership transfer (S-74 / B-14)
- Owners can hand over a business to an existing member via atomic `transfer_ownership` RPC.
- "Make owner…" action on the Members page opens a safety dialog outlining consequences (caller demoted to Editor; new owner gains full control).
- Requires typing the exact business name to confirm.

### Bulk select and act (S-75 / B-13)
- Select multiple items across Customers, Transactions, and Recently Deleted lists.
- Indeterminate header checkbox and Shift+click range selection.
- Floating `BulkActionBar` with polite screen reader announcements.
- Destructive deletes require typing `DELETE {n}` in `BulkConfirmDialog`.
- 10-second Undo toast allows restoring deleted batches.
- Backend atomic batches capped at 100 items per operation.

---

## 2. Database changes

Four new additive migration files in `supabase/migrations/`:

| File | Purpose |
| --- | --- |
| `20261201000000_v32_transaction_revisions.sql` | `transaction_revisions` table, trigger `tr_record_transaction_revision`, `transaction_history` RPC |
| `20261201000100_v32_deletion_log_purge.sql` | `deletion_log_purges` audit table, `purge_deletion_log` RPC, `export_deletion_log` RPC |
| `20261201000200_v32_ownership_transfer.sql` | `ownership_transfers` audit table, atomic `transfer_ownership` RPC |
| `20261201000300_v32_bulk_actions.sql` | 5 atomic bulk RPCs capped at 100 items (`bulk_set_customers_archived`, `bulk_set_transactions_voided`, `bulk_delete_transactions`, `bulk_delete_customers`, `bulk_restore_deleted`) |

The consolidated test suite now spans **23 sections** covering all RLS, constraints, triggers, and RPC security rules.

---

## 3. Rollout & verification

1. Take a full database backup prior to migration.
2. Apply the 4 migrations in numeric filename order using Supabase SQL editor or CLI.
3. Run verification queries from `docs/MANUAL_STEPS.md` to confirm tables, triggers, and RPC definitions exist.
4. Deploy the frontend build (`npm run build`).

---

## 4. Rollback notes

- **Database rollback:** The 4 migrations are strictly additive. If the client frontend needs to be rolled back to v3.1, redeploy the v3.1 build. Existing v3.1 functions and queries continue operating normally with the v3.2 database objects in place.
- **Full database restore:** If a migration script fails during application, restore the database from the pre-migration backup before re-attempting.

---

## 5. Known limits

1. **Revision history start date:** Transaction revisions are tracked starting from the day v3.2 migrations are applied; previous edits under v3.1 are not retroactively available.
2. **Deletion log purge floor:** The minimum retention floor is 30 days. Items deleted less than 30 days ago cannot be purged by design.
3. **Ownership transfer:** Transfer is immediate and atomic; two-step invitation/acceptance is deferred to B-24.
4. **Bulk action batch cap:** Bulk operations are limited to 100 items per request to guarantee fast atomic execution and avoid Postgres timeout limits.
