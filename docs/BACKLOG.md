# Backlog (ideas beyond the PRD)

Extra ideas surfaced while executing stories (v2 and v3.1). Not
commitments — candidates for a later hardening/polish story or a
post-v3.1 pass. B-01, B-04, B-06 and B-09 are done and kept as history.

| # | Idea | Where it came from | Notes |
| --- | --- | --- | --- |
| B-01 | Grouped "last activity" instead of embedding every transaction per customer row | S-28 `queryCustomers` embeds `transactions(occurred_at)` (ungrouped) so each list row carries its history's dates | **Done by S-53 + the v3.1 migration:** `customer_balances` now computes `last_activity_at` (and `last_payment_at`); the list reads the view column and the transactions join is gone. Kept as history. |
| B-02 | DataTable loading headers keep the sort affordance | S-28 tests: the loading branch renders plain `<th>`s (no `role`/`aria-sort`/cursor) while data rows are skeletons | **Done in v3.2.1 (`ca30829`):** Loading headers retain sorting behavior and affordances. |
| B-03 | Rows-per-page in the URL | S-28 keeps `pageSize` in component state (PRD lists only `q, status, sort, page` for the URL) | **Done in v3.2.1 (`2be6768`):** Rows per page persist in validated URL state on both list pages. |
| B-04 | Re-point the "Customer added" toast action at the transaction sheet | S-29 — the toast action promised "Add transaction" before S-32 existed, so it opened the new customer's ledger for now | **Resolved by S-32:** the action now calls `openTransactionSheet()` with the new customer preselected (documented stretch on S-29's dialog — the same treatment the row predicted). Kept in the table as history. |
| B-05 | "No customers yet" when every customer is archived | S-30 — with status=all and zero active customers but archived ones existing, the empty state invites "Add your first customer", which is the right next action but reads oddly for a business with history | **Done in v3.2.1 (`34e45c3`):** All-archived empty state has Show archived and Add customer actions. |
| B-06 | Dashboard archived-customer consistency | Earlier transaction-derived note was stale | **Resolved in v3.2.1 (`f35baa3`):** Today, Position and Activity exclude archived customers; SQL tests pin archive/unarchive agreement. Transactions also excludes them; use the Archived customer list and individual ledgers for history. |
| B-07 | Auto-select a customer created inline from the sheet's picker | S-32 — "Add … as a new customer" inside the picker creates the customer and refreshes the list, but the user must still click them in the picker (same as v1 quick add) | **Done in v3.2.1 (`b176206`):** Inline-created customer is selected without resetting the transaction draft. |
| B-08 | Full revision history for transactions | S-33's Done-when explicitly defers it | **Done by S-72 (v3.2):** `transaction_revisions` table, audit trigger `tr_record_transaction_revision`, `transaction_history` RPC, History section on `TransactionDetailPage`, and `EditedBadge` link to `#history`. |
| B-09 | `p_timezone` overload of `dashboard_summary` | DEV-14 — the RPC cuts "today" in the DB session timezone (UTC) while the S-35 page cuts the browser's local day, so entries recorded in the local 00:00–06:00 window are counted by the transactions page but not by the dashboard's today KPI (for a UTC+6 user) | **Done by the v3 migration (S-50) + S-52:** `dashboard_summary(uuid, text)` carries `p_timezone` **with a `default 'UTC'`** — the uuid-only overload is dropped but a one-argument call still resolves (the migration says so explicitly), so the old client keeps working with the old UTC behaviour. The new client always sends the browser's IANA zone (shared `currentTimeZone()` helper, UTC fallback). Note V-07d called the parameter "mandatory"; the default makes it optional at the SQL level (S-67 correction). Kept as history. |
| B-10 | Exempt purely-numeric cells from the safe-CSV prefix | S-39 - the PRD's safe-CSV rule prefixes ANY cell beginning with -, so a plain negative amount exports as text (shown as apostrophe + -500) and stops summing in spreadsheets | **Done in v3.2.1 (`dc95ced`):** Explicit numeric CSV cells preserve numbers; text retains formula guards. |
| B-11 | Direction words on the mobile customer card | L-08 - the mobile LeaderRow card shows the balance in tone colour only (spec: leading/label/sub/amount), while the desktop cell adds "owes you" / "you owe" beneath | **Done in v3.2.1 (`8d8840d`):** Mobile cards state balance direction visibly and accessibly. |
| B-12 | Automatic purge or export of the deletion log | v3.1 PRD 2.2 / Q-6 — the log grows forever | **Done by S-73 (v3.2):** `deletion_log_purges` audit table, `purge_deletion_log` RPC (30-day minimum floor), and `export_deletion_log` CSV export tool in `DeletedItemsPage`. |
| B-13 | Bulk select and act | v3.1 PRD 2.2 — destructive actions were single-row | **Done by S-75 (v3.2):** Checkbox selection in `DataTable`, floating `BulkActionBar`, `BulkConfirmDialog` with typed `DELETE {n}`, 10s undo toast, and 5 atomic bulk RPCs capped at 100 items. |
| B-14 | Ownership transfer | v3.1 PRD 2.2 — a business could only lose Owner by deletion | **Done by S-74 (v3.2):** `transfer_ownership` RPC, `ownership_transfers` audit log, Make owner dialog with typed business name confirmation on `MembersPage`. |
| B-15 | Playwright smoke suite | v3.1 PRD 2.2 — no end-to-end browser tests; the L-14 audit is a measurement script, not a fixture-driven test suite | A small Playwright project walking the 9.4 smoke checklist against a preview deployment + scratch DB would catch wiring regressions jsdom cannot. Requires a staging Supabase project and preview environment; never run end-to-end tests against production. |
| B-16 | Bangla and Hindi translation | v3.1 Q-11 — out of scope for v3.1 | The font stack needs `Noto Sans Bengali` (and Devanagari for Hindi) plus numeral decisions (Latin digits vs native numerals in money columns); then i18n wiring for every string in the UI-CONTRACT tables. |
| B-17 | Printable statement in the ledger style | S-39 statement is functional but predates the Ledger Page look (L-04 primitives) | Restyle the print CSS with `TotalsRule`/`LeaderRow`/the two-font system; keep the existing print-only colours. |
| B-18 | WhatsApp reminder from "Who to chase" | Only if research asks for it (gate G-A1 is still `pending`) | A share/WhatsApp link on a chase row ("balance ₹X, last paid N days ago") — client-side only, no messaging dependency, no server secrets. |
| B-19 | Email delivery of invitations | v3.1 PRD 2.2 — invitations are copy-link / dashboard-only today | Real email needs an edge function + a sending provider + rate limiting; until then the Owner copies the invitation link. |
| B-20 | Multi-currency | v3.1 PRD 2.2 | One currency per business, `₹` throughout; a currency column + per-business formatter + symbol in the token table. |
| B-21 | Offline / PWA | v3.1 PRD 2.2 | Service worker + optimistic queue; the RLS-write model makes offline-first hard (conflicts on balances). |
| B-22 | A light/dark redesign beyond tokens | v3.1 PRD 2.2 | Both themes get the identical ledger treatment today; a redesign would be a fresh design pass, not a token swap. |
| B-23 | Repo-wide source scan for bare […fr] grid tracks in gridGuard | Owner visual pass finding: bare […fr] grid tracks without minmax(0, …) cause layout widening when children have large content | **Done in v3.2.1 (`fe255ac`):** Repo-wide source guard rejects bare fractional grid tracks. |
| B-24 | Two-step ownership transfer with acceptance | S-74 (v3.2) — transfer is immediate and atomic | Allow nominee to accept or decline the transfer before ownership swaps, preventing accidental transfer to inactive member accounts. |
| B-25 | Automatic purge by retention setting | S-73 (v3.2) — purge is manual via Owner dialog | Scheduled background worker or cron invoking `purge_deletion_log` based on a per-business retention policy (e.g. 90 days). |
| B-26 | Select-all-matching-filter for bulk actions | S-75 (v3.2) — bulk selection applies to rows on the current page | Allow selecting all items matching search/filter across all pages with a "Select all N matching" link in the selection bar. |
| B-27 | Revision history for customers | S-72 (v3.2) — history tracks transaction changes | Add a `customer_revisions` table and trigger to track changes to customer name, phone, address, and notes. |
| B-28 | Per-business chase threshold setting | S-71 / U-07 (v3.2) — CHASE_AFTER_DAYS is hardcoded to 30 | Store `chase_after_days` on the `businesses` table so each business can configure its own overdue threshold. |
| B-29 | Cross-page selection | S-75 (v3.2) — page navigation clears active selection | Retain selected row IDs across page changes so users can build a selection across multiple pages before taking action. |
| B-30 | Preserve international phone numbers in CSV | Final v3.2.1 review: the text formula guard prefixes phone numbers beginning with `+` with an apostrophe, visible in spreadsheets. | **Open.** Candidate: a phone cell type kept as text without a prefix only for leading `+` followed by digits; needs its own test. |
| B-31 | One payment-history error notice above the chase list | Final v3.2.1 review: every row repeats "Payment history unavailable" beside a single Retry button. | **Open.** Move the notice above the list. |
| B-32 | Scope P-09 SQL fixture deletion | Final v3.2.1 review: P-09 uses `delete from public.transactions;` to build its fixtures. | **Open.** Delete only rows it creates so later assertions cannot depend on the broad deletion. |
| B-33 | Close browser audit measurement gaps | [V-18 in PROGRESS.md](PROGRESS.md#p-00-responsive-baseline-result): three legacy history/deletion-log requests receive empty fixtures; dialog focus restoration is checked synthetically only. | **Open.** Cover real requests and focus restoration through B-15 and the staging Supabase project in [Operations](#operations). |

## Next minor release (v3.3) candidates

Candidates for the owner to confirm, not commitments:

1. Staging Supabase project and Playwright smoke suite (B-15); never run end-to-end tests against production.
2. WhatsApp reminder from "Who to chase" (B-18), after deciding phone normalisation, for example a per-business default country code.
3. Printable ledger-style statement (B-17).
4. Per-business chase threshold (B-28), only after real usage data or the S-71 analysis result.

## Mobile/dashboard review follow-ups

All nine findings are fixed in v3.2.1: customer clearing `0107b1d`, amount validation `43ec7fe`, picker errors `fe20735`, mobile words `8d8840d`, payment history and owes link `341bc59`, server search `8c43309`, inline selection `b176206`, and README migration instructions `afdbed1`. Individual findings retain their original text and fix references in [MOBILE-DASHBOARD-REVIEW.md](MOBILE-DASHBOARD-REVIEW.md).

## Operations

- [ ] Create a staging Supabase project, prerequisite for B-15; never run end-to-end tests against production.
- [ ] Confirm production has automated backups or point-in-time recovery.
- [ ] Add runtime error reporting.
