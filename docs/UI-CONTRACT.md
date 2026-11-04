# BahiKhata v3.1 - UI Contract

## Tokens and class rules (PRD v3.1 sections 5.2 and 5.6 — applied in L-01 and S-67)

Tokens come from `design/design-tokens.ledger.css` (applied by L-01, verified by 82 automated contrast checks).

| Need | Use | Never |
|---|---|---|
| Page canvas ("Paper") | `bg-background` | hard-coded colours |
| Panel, ledger, table container ("Sheet") | `bg-card border border-border` | `shadow-*`, `ring-*`, gradients, `rounded-xl` or larger |
| Sidebar ("spine") | `bg-sidebar text-sidebar-foreground` | `bg-card` |
| Active spine item (the tab that joins the page) | `bg-background text-foreground font-semibold` | outlines, left bars |
| Row rule, divider | `border-t border-border` | `border-input` on dividers |
| Table header strip | `bg-muted/60 text-xs font-medium text-muted-foreground` | upper-case, letter-spaced labels |
| Ledger margin rule (between Date and Particulars) | `margin-rule` (or `border-l-2 border-margin`) | red |
| A total (single rule above, double rule below) | `totals-rule` | box borders |
| Name joined to an amount | `leader` on the row and `<i className="leader-dots" aria-hidden="true" />` between | CSS tricks that hide the amount |
| Form control (input, select, textarea, checkbox, outline button) | `border border-input` | `border-border` (too faint for 3:1) |
| Tinted chip | light `bg-TONE/10`, dark `dark:bg-TONE/8`, text `text-TONE` | `/12` or higher (the audit assumes 10 and 8) |
| Popover, menu, dialog | `bg-popover border border-border`; dialogs add `border-t-2 border-t-foreground` | custom backgrounds |
| Tooltip (U-01) | `bg-popover border border-border rounded px-2 py-1 text-xs text-popover-foreground` | `shadow-*`, `ring-*`, `rounded-xl` or larger |
| Page title and section heading | `font-heading` | any other family |
| Hero figure (balances, net position) | `font-display tabular-nums` | proportional digits |
| All money | `<Money>` / `formatMoney` (guard test added in L-03) | hand formatting |

`scripts/contrast-audit.cjs` audits text, tinted chips and control borders in both themes (82 checks); `scripts/check-token-sync.cjs` keeps it in step with `src/index.css`. Both run in CI.

## Hard rules (v3.1)

- **All money** goes through `formatMoney` / the `<Money>` component —
  never hand-formatted. Enforced by `src/__tests__/noRawMoney.test.ts`
  (fails on any raw `₹` interpolation in `src/`).
- **No shadows on panels, tables or cards** (D-26): flat surfaces carry
  hairline rules, never `shadow-*` / `ring-*`. Overlays (dialogs, the
  bottom sheet) keep their existing elevation treatment.
- **Two fonts** (D-25): Public Sans for all text and every money figure,
  Bricolage Grotesque (`font-heading` / `font-display`) for headings and
  hero figures. The v2 "one UI font" rule is retired.

## Consistency checklist (copied from PRD §8 — owned by S-13)

- **Page frame:** every page uses `PageHeader` (title, short description,
  at most one primary action on the right). One primary button per screen.
- **Lists:** `DataTable` only, with the five states (loading, empty,
  no-results, error, data), a three-dot `RowActionsMenu`, server-side sort
  and paging, and a card layout under 768 pixels. List state lives in the
  query string.
- **Forms:** `EntityDialog` for create and edit (the same component for
  both), persistent labels, inline errors, a spinner on the submit button,
  input kept on failure, discard guard when dirty.
- **Destructive actions:** `ConfirmDialog` with a specific verb label.
  Irreversible actions use the typed-confirmation variant. Never a bare OK.
- **Feedback:** every mutation shows a toast. Success is past tense
  ('Customer archived'). Errors say what failed and what to do ('Could
  not archive customer. Try again.'). Undo is offered for archive, void
  and delete (delete's Undo calls `restore_deleted` for 10 seconds).
- **Money and dates:** only `formatMoney`, `Money`, `formatDate` and
  `formatRelative`. Amounts are right-aligned, tabular, never truncated.
- **Color:** semantic tokens only. Balance meaning always has a text
  label as well as color.
- **Permissions:** every write action is wrapped in `Can`. Viewers never
  see a control that would fail.
- **Accessibility:** labelled controls, focus management, live
  announcements, 44-pixel touch targets, reduced motion respected.
- **Paths and keys:** links from `paths.ts`, query keys from
  `queryKeys.ts` with the business prefix.

## Copy glossary (PRD v3.1 §5.6 — applied in S-67, replaces the v2 table)

| Concept | Use | Never |
| --------------------------- | ----------------------------- | ----------------------------- |
| Customer owes the business | Owes you | Receivable, Debit, Due (in UI text) |
| Business owes the customer | You owe | Payable, Credit balance |
| Dashboard totals | Owed to you, You owe, Net position | Receivable, Payable |
| Zero balance | Settled | Zero, Paid up |
| Ledger columns | Date, Particulars, Charged, Paid, Balance | Debit, Credit, Dr, Cr |
| Hide a customer, reversible | Archive | Delete |
| Remove a customer from the ledger (restorable by the Owner) | Delete | Remove, Delete permanently |
| Cancel a transaction but keep it visible | Void | Delete |
| Remove a transaction from the ledger (Owner only, restorable) | Delete | Remove, Erase |
| Bring back a deleted item | Restore | Undelete, Recover |
| Workspace | Business | Tenant, Workspace, Organization |
| Shared access | Member, Editor, Viewer, Owner | Admin, User |
| Transfer business ownership | Make owner | Transfer, Hand over |
| Clean up old deletion log | Clean up | Purge, Prune, Wipe |
| Transaction edits and audit trail | History | Audit log, Revisions, Changelog |
| Bulk action mode | Select | Multi-select, Batch |
| Dashboard trend visualization | Activity | Chart, Trends, Volume |

The note field keeps the label **Note** in forms; its ledger column header
is **Particulars** (D-27).

## Component gallery (owned by S-13)

- Dev-only route `/__ui` (`src/features/dev/UiGallery.tsx`), registered in
  `App.tsx` behind `import.meta.env.DEV` — the route does not exist in
  production builds.
- Every shared component appears there in its states; `src/features/dev/
  __tests__/uiGallery.test.tsx` renders the gallery in both themes and
  fails on any console error or warning.

Shared components (the `ui/` primitives plus the L-04 ledger set):

- Primitives: `Button`, `IconButton`, `Tooltip`, `Input`, `Select`, `Textarea`, `Switch`, `Tabs`,
  `Card`, `Dialog`, `AlertDialog`, `Sheet`, `Popover`, `Menu`,
  `EntityDialog`, `ConfirmDialog`, `MoneyField`.
- Ledger (L-04): `LeaderRow` (label + dotted leader + amount, never
  truncates the amount), `TotalsRule` (single rule above, double below),
  `Monogram` (initials avatar on a tone tint), `AgeFlag` (30+ day
  thresholds), `TallyMark`, `TypeBadge` (Charged/Paid), `BalanceBadge`.
- App-level: `IconButton` (44px touch hit area via `.touch-target`, accessible name + tooltip, disabled triggers supported), `PageHeader`, `DataTable` (five states, `RowActionsMenu`,
  mobile cards), `SearchInput`, `FilterBar`, `EmptyState`, `ErrorState`,
  `Skeleton`, `StatCard`, `Money`/`formatMoney`, `LedgerTable` (the L-07
  real-table ledger with caption, header cells and a Totals row).

## Table anatomy (PRD v3.2 U-02, D-33)

Every list and table follows one shared contract:
1. **One component:** `DataTable` is the single table component across the app.
2. **Column sizing & priority folding:**
   - `width: "fit" | "fill"`: Exactly one `fill` column per table (the primary descriptive text); every other column is `fit` (`w-px whitespace-nowrap` shrink-to-fit for dates, money, badges, counts). No fixed column widths.
   - `priority: 1 | 2 | 3`: Priority 3 hides below `xl` (1280px), priority 2 hides below `lg` (1024px).
   - `fold?: (row) => ReactNode`: When priority 2 or 3 columns hide, their content folds into the `fill` column as a muted second line.
3. **Density:**
   - `"comfortable"` (default): `px-3 py-2.5`, `text-sm`.
   - `"compact"`: `px-3 py-1.5`, `text-xs` (for Day book and embedded tables).
   - Header row is `h-9`, sticky (`sticky top-0 z-10 bg-muted/60 text-xs font-medium text-muted-foreground`).
4. **Mobile cards (< 768px):** Shared `mobile` spec renders rows through `TableCard` (`lead`, `title`, `subtitle`, `meta`, `trailing`, `lines`) with a single 44px More button on the right.
5. **Row actions:** Rendered via `RowActions` (`src/components/app/RowActions.tsx`) with copy from `src/lib/actionLabels.ts`.
   - Fine pointer at >= 768px: up to two non-destructive actions inline as `IconButton`s; remaining actions (including all destructive actions) collapse into a More actions menu.
   - Coarse pointer (touch) or mobile card: exactly one More actions menu (44px touch target) holding all actions.
   - Action ordering: Edit -> Void/Archive -> Restore/Unarchive -> [Divider] -> Delete.
6. **Selection:** `selectable` prop adds a checkbox fit column and select-all header, plus checkbox support on mobile cards.
7. **Footer & Totals:** `TableFooter` supports standard pagination (`Showing a–b of n`, rows per page, prev/next) and `mode="more"` (`Showing k of n`, "Show more" button). `totals` slot renders a `TotalsRule` within `tfoot`.
8. **Top row slot:** `topRow` renders an optional `<tr>` above `tbody` for inline quick-entry.

## Dashboard Activity chart (PRD v3.2 U-06, D-34)

1. **Grouped bar chart:** Charges (receivable) and payments (credit) side by side above zero; net remains in the summary. Zero-based Y-axis with nice limits and compact INR formatting (0, 1k, 50k, 1L, 10L, 1Cr).
2. **Range controls:** 7 days, 30 days, 90 days, 12 months synced to URL (?activity=30 default).
3. **Summary comparison tiles:** Charged, Paid, Net comparing current period against the immediately preceding period of equal length.
4. **Partial buckets:**
   - Daily buckets (7 and 30 days) are never partial.
   - Weekly buckets (90 days): first bucket is partial if the range starts after Monday 00:00; last bucket is partial if the range ends before Sunday 23:59. Label: `Week of 13 Oct (from 15 Oct)` or `Week of 13 Oct (to 15 Oct)`.
   - Monthly buckets (12 months): first bucket is partial if range starts after the 1st; last bucket is partial if the current month has not ended. Label: `Oct 2026 (from 17 Oct)` or `Nov 2026 (so far)`.
   - Visual: partial bars render with reduced opacity (`fillOpacity={0.6}`).
   - Accessible descriptions: interactive readout and screen-reader `sr-only` table describe partial bucket coverage.

## Permission matrix ↔ database agreement (S-21)

`src/lib/permissions.ts` is the single UI source for PRD §3. The
database (row-level security) is the source of truth; this table maps
every action name to the SQL test that proves the database agrees —
sections of `supabase/tests/0002_rls_membership.sql`, plus
`0002c_membership_management.sql` (S-25) for the membership-management
rows. Fixture roles: Olivia = Owner, Eli = Editor, Vic = Viewer, Zed =
outsider.

| UI action (`permissionMatrix` key) | Owner | Editor | Viewer | SQL test assertion(s) in `0002_rls_membership.sql` |
| ---------------------------------- | ----- | ------ | ------ | -------------------------------------------------- |
| `view` | ✅ | ✅ | ✅ | §4 "Olivia/Eli/Vic reads Acme customers" (1 row each); "Zed reads zero customers" |
| `export` | ✅ | ✅ | ✅ | Same SELECT policies as `view` — §4 counts prove every role reads the rows they export |
| `manageCustomers` | ✅ | ✅ | ❌ | §5 "Vic cannot insert a customer" / "Vic cannot update a customer"; §6 "Eli inserted a customer" |
| `archiveCustomers` | ✅ | ✅ | ❌ | §5 "Vic cannot update a customer" (archive is an update); §6 "Eli updated a customer" |
| `deleteCustomer` | ✅ | ❌ | ❌ | §6 "Eli cannot permanently delete a customer"; §5 "Vic cannot delete a customer" |
| `manageTransactions` | ✅ | ✅ | ❌ | §5 "Vic cannot insert a transaction" / "Vic cannot update a transaction"; §6 "Eli inserted a transaction" |
| `importTransactions` | ✅ | ✅ | ❌ | Same insert policy as `manageTransactions` (a batch is many inserts) — §6 "Eli inserted a transaction" |
| `manageBusiness` | ✅ | ❌ | ❌ | §6 "Eli cannot update the business details" (added in S-21); §7 "Olivia updated the business" |
| `manageMembers` | ✅ | ❌ | ❌ | 0002 §6 "Eli cannot change a member role" / "Eli cannot remove a member" / "Eli cannot insert an invitation" (S-21); 0002c §3 owner changes a role, owner row protected (no promote-to-owner, no remove) (S-25) |
| `deleteBusiness` | ✅ | ❌ | ❌ | §6 "Eli cannot delete the business"; §10 "Olivia deleted the business" |
| `leaveBusiness` | ❌ | ✅ | ✅ | 0002 §7 "Olivia cannot leave her own business" (owner must delete instead); 0002c §5 a member leaves and loses access (S-25) |
| `exportDeletionLog` | ✅ | ❌ | ❌ | §21 export_deletion_log: owner reads; editor/viewer/outsider refused |
| `purgeDeletionLog` | ✅ | ❌ | ❌ | §21 purge_deletion_log: owner cleans up; editor/viewer/outsider refused (42501) |
| `transferOwnership` | ✅ | ❌ | ❌ | §22 transfer_ownership: owner transfers; editor/viewer/outsider refused (42501) |

Two guard rails keep the two layers honest:

- **UI → database:** every write mutation calls `assertCan(...)` inside
  `mutationFn`, so a known disallowed role fails with `forbidden` before
  any network call (`src/components/app/__tests__/can.test.tsx`).
- **Database → UI:** `assertCan` only blocks *known* roles; an unknown
  role falls through and the RLS policies refuse the write anyway.
  The UI hiding a control is experience, never security.


## Tooltips & IconButton (PRD v3.2 U-01, D-32)
1. **Single Tooltip primitive:** Wrapped `@base-ui/react/tooltip`, styled with `bg-popover border border-border text-xs rounded px-2 py-1`.
2. **IconButton:** Standard icon-only button control. Requires `label` (or `ariaLabel`), renders Lucide icon, auto-wraps in `Tooltip`. Touch hit target is expanded to 44px on coarse pointers via `.touch-target`.
3. **Disabled state with reason:** When disabled, `disabledReason` displays in the tooltip as `"{label}: {disabledReason}"`. The button renders an accessible focusable wrapper with `aria-label` describing the reason.
4. **Touch suppression:** Tooltips never open on tap/touch (`pointer: coarse`); clicking or tapping activates the control directly without lingering tooltip artifacts. Enforced by `src/test/iconButtonGuard.test.tsx`.

## Bulk Selection & Actions (PRD v3.2 S-75, B-13)
1. **Selection contract:**
   - Desktop and mobile: Checkboxes appear on selectable rows/cards.
   - Header checkbox toggles all visible rows on current page, with indeterminate state for partial selection.
   - Shift+click allows range selection across rows on desktop.
   - Page change, filter change, search query change, tab switch, or Escape key clears active selection.
2. **BulkActionBar:**
   - Sticky floating bar on desktop; fixed above bottom safe area on mobile.
   - `aria-live="polite"` announcement of count (e.g., "3 customers selected").
   - Action buttons with icon + label (Archive/Restore/Delete for customers; Void/Restore/Delete for transactions; Restore for deleted items).
   - Escape key dismisses selection.
3. **BulkConfirmDialog:**
   - Dialog listing up to 5 affected items plus "and n more".
   - Shows summary totals (e.g. sum of charged and paid amounts for transactions).
   - Explains recoverability (archived/voided can be undone; permanently deleted can be restored within 30 days).
   - Destructive permanent deletes require typing uppercase `DELETE {n}` before confirming.
   - Provides a 10-second Undo toast on completion.
4. **Batch limits:** Backend caps operations to 100 items per call with atomic all-or-nothing rollback on any row error.

## Transaction Revision History (PRD v3.2 S-72, B-08)
1. **Audit trail:** Any edit, void, or restore to a transaction is recorded in `transaction_revisions` via database trigger.
2. **History section:** Displayed on `TransactionDetailPage` below the details card for all members (Viewers included).
3. **Changes formatting:** Each revision displays actor name, timestamp, and field-level differences (amount, note, occurred date, status).
4. **Edited badge:** In tables and lists, the `EditedBadge` displays a pencil icon and links directly to `#history` on the detail page.
5. **History start notice:** Revisions are tracked starting from the v3.2 database installation date.

## Ownership Transfer (PRD v3.2 S-74, B-14)
1. **Owner-only atomic transfer:** Executed via `transfer_ownership(p_business_id, p_new_owner)` RPC.
2. **Make owner dialog:**
   - Opened from member row menu on Members page for business Owner.
   - Warns of irreversible consequences (caller becomes Editor; new owner can change roles, remove anyone, or delete business).
   - Requires typing the exact business name to enable confirmation.
   - Refreshes app permissions and navigates safely upon completion.

## Deletion Log Export & Purge (PRD v3.2 S-73, B-12)
1. **Clean up dialog:**
   - Owner-only operation on Recently Deleted page.
   - Floor of 30 days: items deleted within the last 30 days can never be purged.
   - Dry run preview calculates exact count of items eligible for permanent removal.
   - Requires typing `PURGE` to confirm.
   - Audit trail logged to `deletion_log_purges`.
2. **Export:** Export button downloads deletion log as CSV before cleanup.

## Mobile/dashboard follow-up behavior

- Popup height follows the visual viewport, with dynamic CSS viewport height as fallback. Long forms scroll internally; pending saves cannot be dismissed.
- Drawer width and sidebar content width agree; short navigation panels scroll and respect safe areas.
- Activity grouping uses the measured chart width. View entries opens the last valid selected bar's inclusive calendar dates, clamped to the plotted range for partial periods. Cleared hover indices must not select the first bar.
- Transactions custom dates represent local calendar days, with an exclusive query end at the next local midnight.

Implementation evidence and manual verification limits: [MOBILE-DASHBOARD-REVIEW.md](MOBILE-DASHBOARD-REVIEW.md).

## Archived customers (v3.2.1 P-09)

Dashboard figures (Today, Position and Activity) exclude archived customers. Unarchiving restores their entries to the dashboard figures. The cross-customer Transactions page, including Today, also excludes archived customers; use the Archived customer list and each customer's ledger to see archived customers and their history.
