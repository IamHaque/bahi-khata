# BahiKhata PRD v3.2: finish the skipped features, bulk actions, ownership, history, and one consistent UI

Companion to `PRD-v3.1.md` (shipped as `feat/v3`), `AGENT-PROMPT-v3.2.md`,
`UI-CONTRACT.md` and `RESEARCH-DECISIONS.md`. Written to be implemented by a
coding agent that has not seen the earlier conversation. Everything in this file
was checked against the code at branch head `8a0d3b2` (v3.1 plus the owner's
visual-pass fixes). Where this file names a file, function or line, verify it
first and say so in `docs/PROGRESS.md` if it is different.

---

## 1. What this release is

v3.1 left two screens-worth of features skipped (L-12 entry row, L-13 who to
chase) and a backlog. The owner has now decided to build:

| ID | Item | Origin |
|---|---|---|
| L-12 | Entry row on the customer ledger | skipped in v3.1 (gate G-A2) |
| L-13 | "Who to chase" dashboard list | skipped in v3.1 (gate G-A1) |
| B-08 | Transaction revision history | backlog |
| B-12 | Deletion log export and purge | backlog |
| B-13 | Bulk select and act | backlog |
| B-14 | Ownership transfer | backlog |
| N-1 | Tooltips on every icon-only control | new |
| N-2 | One consistent table system, no wasted space, same actions everywhere | new |
| N-3 | Remove the customer-page "quick add" card (Add charge / Add payment buttons stay) | new |
| N-4 | Redesign the Dashboard activity chart from the ground up | new |

### 1.1 Owner decisions (binding; record them in `RESEARCH-DECISIONS.md`, section 7.1)

- **D-30 Gates.** The owner approves G-A1 and G-A2 by decision, without the user
  research in `RESEARCH-PLAN.md`. Record both as `approved-with-changes`, "Owner
  decision 2026-11, no research run; validated by the owner's own measured
  checks after build (stories S-71 and U-08)". Changes: see D-31 and D-33.
- **D-31 Quick add.** The `CustomerQuickAdd` card (v3.1 L-07) is removed on every
  screen width. The header buttons **Add charge** and **Add payment** (they open
  the transaction sheet) are the only way to add an entry from the customer
  page below `md`. The entry row (L-12) exists at `md` and up only.
- **D-32 Tooltips.** Every control that shows only an icon gets a tooltip and an
  accessible name. No new dependency: use `@base-ui/react/tooltip`.
- **D-33 Tables.** One table system for every list in the app (section 5).
- **D-34 Chart.** The Dashboard chart is rebuilt (U-06). No new dependency;
  `recharts` stays.
- **D-35 Bulk actions** (S-75): page-level selection, hard cap 100 rows, one
  database transaction per action, all-or-nothing.
- **D-36 Ownership transfer** (S-74): immediate and atomic, owner to one existing
  member, typed confirmation. Two-step acceptance is deliberately deferred
  (backlog B-24).
- **D-37 Purge** (S-73): Owner only; only entries older than 30 days or already
  restored; itself logged; always offers an export first.
- **D-38 History** (S-72): recorded from the day the migration is applied;
  nothing is back-filled and the UI says so.

### 1.2 Two things the owner should know (the agent must not "fix" them)

1. D-31 keeps L-12 (the entry row) while removing the quick-add card. They are
   different surfaces (a table row on large screens versus a card on all
   screens). L-12 is isolated in the **last** story (U-08), and nothing else
   depends on it, so the owner can drop it by marking U-08 `skipped (owner)`.
2. The chart reads the same `daily_activity` function as today (active and
   edited entries of non-archived customers, cut in the browser's timezone).
   Archived customers are excluded from the chart but included in their own
   balances. The tooltip text in U-06 says "excludes archived customers".

---

## 2. Hard rules (unchanged from v3.1, plus new ones)

Everything in `docs/AGENT-PROMPT-v3.1.md` still applies. Highlights, because they
were the failure points last time:

- One commit per story with the message given in the story; no history
  rewriting; no squashing; no merging; no deploying.
- **No new npm dependencies.** Allowed: `@base-ui/react` (already installed),
  `recharts`, `lucide-react`, `react-hook-form`, `zod`.
- **Never edit the three applied migrations** (`20261017…`, `20261101…`,
  `20261108…`) or anything in `supabase/migrations_archive/`. All SQL goes into
  the new files in section 7.1.
- The forbidden server-side role name (the word "service" followed by an
  underscore and "role") must not appear anywhere in the repo.
- Panels stay flat: no shadow, no ring, never `rounded-xl` or larger.
  Tooltips and popovers use `bg-popover border border-border rounded`.
- **Measured, not inferred (new, and the main lesson of v3.1).** Any story that
  changes layout, tables, charts, tooltips or touch behaviour is not done until
  `scripts/responsive-audit.cjs` has run in real headless Chrome at 360, 390,
  768, 1024 and 1440 px in both themes with zero failures. If Chrome is not
  available, stop and tell the owner. Never mark layout work done from class
  names or jsdom tests alone. "Pending human UI check" may be used only for
  taste, never for anything the audit can measure.
- Each story that touches the database adds SQL test sections (section 7.2) and
  runs `npm run test:sql` against a scratch Postgres (`DATABASE_URL`). Ask the
  owner for one if you do not have it. Never use the real Supabase project.
- Record every deviation as `V-xx` in `docs/PROGRESS.md` with a real commit hash
  (never "(this commit)"). Keep each progress row to two sentences; put detail
  in a checklist section below.

---

## 3. Order of work, checkpoints and effort

| # | Story | Size | Needs |
|---|---|---|---|
| S-70 | Branch, baseline, decisions | S | |
| U-01 | Tooltips and `IconButton` | M | |
| U-02 | Table system: `DataTable` v2 and `RowActions` | L | U-01 |
| U-03 | Migrate Transactions and Customers pages | L | U-02 |
| U-04 | Migrate Customer ledger, Day book, Members, Recently deleted | L | U-02 |
| U-05 | Remove the quick-add card | S | |
| U-06 | Dashboard activity chart, rebuilt | L | U-02 (Day book row) |
| S-71 | Analysis: the "who to chase" threshold (owner runs one query) | S | |
| U-07 | Who to chase (L-13) | M | S-71, U-06 |
| S-72 | Transaction revision history (B-08) | L | |
| S-73 | Deletion log export and purge (B-12) | M | S-72 |
| S-74 | Ownership transfer (B-14) | M | U-04 |
| S-75 | Bulk select and act (B-13) | L | U-03, U-04, S-72 |
| U-08 | Entry row on the ledger (L-12) | M | U-04, U-05 |
| S-76 | Documentation, rollout guide, backlog | M | all |
| S-77 | Final verification and release candidate | S | all |

**Owner checkpoints.** Stop and report after each, so the owner can look at the
screens while tokens are replenished:

- **Checkpoint A** after U-06: tooltips, tables, quick-add removal, new chart.
- **Checkpoint B** after S-75: all database features (one rollout, section 7.3).
- **Checkpoint C** after S-77: release candidate and PR.

Rough effort for an agent: A is the heaviest (about 1.5 to 2 days), B about
1.5 days, C about half a day, plus owner review time. Do not start the next
checkpoint's stories until the owner has replied "continue" if the owner asked
for a pause; otherwise continue.

---

## 4. Baseline and decisions

### S-70 · Branch, baseline and decisions (size S)

**Do.**
1. If the v3.1 pull request is merged, create `feat/v3.2` from `master`. If it is
   not, create it from `feat/v3` and note in `PROGRESS.md` that the PR base must
   be retargeted after v3.1 merges.
2. Run and record in `PROGRESS.md`: `npm ci`, `npm run verify`, `npm run
   audit:tokens`, `npm run audit:contrast`, `npm run audit:bundle`, `npm audit
   --omit=dev`, and `node scripts/responsive-audit.cjs` (needs `npm run dev`).
   These are the v3.2 baseline numbers.
3. Add section **7.1 Owner decisions (v3.2)** to `docs/RESEARCH-DECISIONS.md`
   (this is the one allowed edit of that file in v3.2) listing D-30..D-38 and
   changing the G-A1 and G-A2 rows to `approved-with-changes` with the text in
   D-30. Commit alone.
4. Create `docs/PRD-v3.2.md` (this file) is already in the repo; confirm it is
   committed; add a "v3.2 story board" table to `PROGRESS.md` with every story
   above, status `todo`.

**Commit.** `docs(S-70): v3.2 baseline, owner decisions and story board`

---

## 5. The UI system (N-1, N-2, N-3, N-4)

### Current state that the stories fix (verified at `8a0d3b2`)

- Icon-only controls are hand-written `<button><svg…/></button>` in
  `useLedgerRowActions.tsx` and `transactionColumns.tsx` (Edit, Void, Restore,
  Delete) and similar places; there is no `ui/tooltip.tsx`; only `aria-label`
  names exist. Mouse users get no hint.
- Six different table implementations: `DataTable` (Customers, Transactions,
  Members, Invitations, Recently deleted), a raw `<table>` in `LedgerTable.tsx`
  (customer ledger, with its own mobile list), and a raw `<table>` in
  `DayBook.tsx`. Row actions differ: icon cluster (ledger, transactions),
  `RowActionsMenu` (customers, members), a text "Restore" button (Recently
  deleted), none (Day book). Fixed widths such as `w-36` leave dead space.
- The customer page has Add charge / Add payment in `CustomerHeader.tsx`, a
  second pair inside the empty ledger state in `CustomerDetailPage.tsx`, and the
  `CustomerQuickAdd` card.
- The Dashboard chart is a small recharts bar chart in a narrow right column with
  barely visible bars on sparse data (see the owner's screenshot: about 320 x 190
  px, a single large day dwarfs everything, no readout on touch).

### U-01 · Tooltips and `IconButton` (size M)

**Why.** D-32. Icons alone are ambiguous (Edit, Void, Delete look alike) and
mouse users get no label.

**Touches.** new `src/components/ui/tooltip.tsx`, new
`src/components/app/IconButton.tsx`, `AppShell` (provider), every file that has a
raw icon-only `<button>` or an icon-only `Button`, new guard test
`src/test/iconButtonGuard.test.tsx`, `docs/UI-CONTRACT.md`.

**Do.**
1. `ui/tooltip.tsx`: wrap `@base-ui/react/tooltip` (`Provider`, `Root`,
   `Trigger`, `Positioner`, `Popup`). Popup classes: `z-50 rounded border
   border-border bg-popover px-2 py-1 text-xs text-popover-foreground`, no
   shadow, no ring. Delay 400 ms open, 0 ms close. Mount one `TooltipProvider`
   inside `AppShell` (and in `renderApp` test helper).
2. `IconButton` props: `label` (short tooltip text, sentence case: "Edit",
   "Void", "Restore", "Delete", "More actions"), `ariaLabel?` (long accessible
   name, default `label`; use the specific form such as `Edit charge of
   ₹500.00` where the old code had it), `icon`, `onClick`, `variant`,
   `disabled`, `tone?: "default" | "destructive"`. Renders the shared `Button`
   (`variant="ghost"`, `size="icon"`), 16 px icon, and applies the
   `touch-target` utility so the hit area is 44 px on touch without changing its
   look. The tooltip shows on hover **and** on keyboard focus-visible, closes on
   Escape, never opens on touch.
3. A disabled `IconButton` keeps its tooltip by wrapping the button in a
   `<span tabIndex={0}>` trigger, and the tooltip explains why when `disabledReason`
   is given.
4. Replace every icon-only control with `IconButton`: ledger row actions,
   transaction row actions, row-action cluster, SearchInput clear, FilterBar chip
   remove, Topbar icon buttons (menu, collapse, search, invitations, user menu),
   Dialog and Sheet close buttons, DataTable sort is text so it is exempt.
   Use `lucide-react` icons (`Pencil`, `Ban`, `Undo2`, `Trash2`,
   `MoreHorizontal`, `X`); delete the inline `<svg>` blocks.
5. The "More actions" menu trigger (`RowActionsMenu`) is an `IconButton` too.
6. Guard test: scan `src/**/*.tsx` (excluding tests and `features/dev`) and fail
   when a `<button` or `<Button` element has an `<svg` or a lucide icon child and
   no text child and is not rendered through `IconButton` (allowlist with a
   reason). The test is a cheap regression guard, not proof of behaviour.
7. Tooltip copy lives in one place per action (`src/lib/actionLabels.ts`:
   `edit`, `void`, `restore`, `delete`, `archive`, `more`, …) and is reused by the
   menus (U-02) so words never drift between tooltip and menu.

**Behaviour.**
```gherkin
Scenario: Hover shows the label
  Given a fine pointer on a ledger row
  When I hover the pencil icon for 0.4 s
  Then a tooltip "Edit" appears and its accessible name is "Edit charge of ₹500.00"

Scenario: Keyboard shows the same label
  When I Tab to the icon
  Then the tooltip appears, and Escape closes it without closing a dialog

Scenario: Touch
  Given a coarse pointer
  Then no tooltip opens, the target is at least 44 x 44 px and the control still works
```
**Tests.** `IconButton.test.tsx` (hover and focus tooltip, Escape, disabled with
reason, axe), the guard test. **Verify.** `npm run verify`; responsive audit at
all widths (no new horizontal scroll, 44 px targets). **Commit.** `feat(U-01):
tooltips and IconButton for every icon-only control`

### U-02 · Table system: `DataTable` v2 and `RowActions` (size L)

**Why.** D-33. Every list must look and behave the same, use the whole width, and
show actions the same way at every size.

**The anatomy (the contract every table follows).**

1. **One component.** `DataTable` is the only table. The raw tables in
   `LedgerTable` and `DayBook` are replaced (U-04).
2. **Columns declare how they size** (new `Column` fields):
   - `width: "fit" | "fill"`; exactly **one** `fill` column per table (the main
     text); every other column is `fit` (shrink to content, `whitespace-nowrap`
     for dates, money, counts). No fixed widths such as `w-36`.
   - `priority: 1 | 2 | 3` (default 1). Priority 3 columns hide below `xl`,
     priority 2 below `lg`; a hidden column's content is **folded** into the
     fill column as a muted second line through `fold?: (row) => ReactNode`
     (for example "by Subhan" or the phone number). Nothing is lost, no space
     is wasted.
   - `align`, `sortable`, `sortKey` as today.
3. **Density.** `density: "comfortable" | "compact"`. Comfortable: `px-3
   py-2.5`; compact (Day book, embedded tables): `px-3 py-1.5`. Header row `h-9`,
   sticky inside scroll containers, `bg-muted/60`.
4. **Below 768 px** every table renders a list of cards through one shared
   `mobile` spec, not per-page card code:
   `mobile={{ lead?, title, subtitle?, meta?, trailing, lines? }}` →
   rendered by one `TableCard` (Monogram or `lead` on the left, `title` with
   `trailing` amount on the right, `subtitle`/`meta` as muted lines, actions as
   one 44 px More button at the right). The v3.1 money-first transaction card
   becomes this layout, so all cards look alike.
5. **Selection (used by S-75).** `selectable?: { getId, selected, onChange,
   canSelect? }` adds a first, `fit` checkbox column and the same checkbox on
   cards. Implement now as a no-op until S-75 (props accepted, tested).
6. **Row click.** When a row has a detail page, the whole row is clickable and the
   primary cell holds a real `<Link>` (the keyboard and screen-reader target);
   the row itself is not focusable. Clicking actions or checkboxes never
   navigates.
7. **Footer.** One footer component: `Showing a–b of n`, rows per page
   (10/25/50/100), previous/next; list tables with "show more" (ledger, Day book)
   use the same component with `mode="more"`. A `totals` slot renders the
   `TotalsRule` row inside the table (`tfoot`) for money tables.
8. **States.** Loading skeletons use the real column widths; empty uses
   `EmptyState`; error uses `ErrorState`; all three render inside the same
   bordered container so the page does not jump.
9. **`topRow` slot** (for U-08) renders a `<tr>` above the body.

**`RowActions` (the one actions pattern).**

```
type RowAction = {
  id: "edit" | "void" | "restore" | "archive" | "unarchive" | "delete" | …;
  label: string;           // from actionLabels.ts
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;   // always last, after a divider
  disabled?: boolean; disabledReason?: string;
  hidden?: boolean;        // set from can(...), never rendered
};
```
- Fine pointer and width at least 768 px: the first **two non-destructive**
  actions render inline as `IconButton`s (tooltip from U-01); everything else,
  including every destructive action, sits in a **More actions** menu. If there
  are two or fewer actions in total and none is destructive, no menu.
- Coarse pointer, or the card layout: exactly **one** More actions button (44 px)
  containing every action with icon and text.
- Order everywhere: Edit, Void/Archive, Restore/Unarchive, then a divider, then
  Delete. Keyboard: arrow keys in the menu (as `RowActionsMenu` does today),
  Escape closes and returns focus to the trigger.
- Owner/Editor/Viewer visibility comes from `usePermissions().can`, never from
  the component. A Viewer sees no action column at all.
- `RowActionsMenu`, `RowActionCluster` and `useLedgerRowActions` are folded into
  `RowActions` (keep exported names as thin wrappers only if needed to avoid a
  giant diff; delete them in U-04).

**Touches.** `src/components/app/DataTable.tsx` (rewrite, keep the public props
that pages use, add the new ones), new `RowActions.tsx`, `TableCard.tsx`,
`TableFooter.tsx`, `src/lib/actionLabels.ts`, `docs/UI-CONTRACT.md` (section
"Table anatomy"), tests.

**Do.** Implement the contract above. Keep the existing sort, `aria-sort`,
status-message and pagination behaviour and tests. Add the measurable rules to
`scripts/responsive-audit.cjs` (new **table audit**, run on every table scenario
at 768, 1024 and 1440 px):
- no horizontal scroll of the page, and none inside the table at 1024 px and wider;
- exactly one `fill` column, and for every `fit` column the header width is at
  most its widest cell content + 32 px (this is the "no wasted space" check);
- the action cell has the same structure on every table (inline buttons at most 2 +
  one More button);
- on touch emulation every row has exactly one More button and no inline icons.

**Behaviour.**
```gherkin
Scenario: Same actions everywhere
  Given the Customers, Transactions, Ledger, Members and Recently deleted tables at 1440 px with a fine pointer
  Then each row shows at most two inline icon actions and one More menu, in the order Edit, Void or Archive, Restore, then Delete after a divider

Scenario: No dead space
  Given any table at 1440 px
  Then no fit column is wider than its content plus 32 px, and the fill column takes the rest

Scenario: Phone
  Given a 390 px viewport
  Then every table is a list of cards with the same structure and one 44 px More button each
```
**Tests.** `DataTable.test.tsx` extended (priority folding, fill/fit classes,
mobile spec, selection props, topRow, footer modes), `RowActions.test.tsx`
(inline versus menu rules, order, destructive last, keyboard, hidden by `can`,
axe). **Verify.** `npm run verify`; responsive audit including the table audit
on the **UI gallery** page, which must show one table in each density (the audit
needs a table before the pages are migrated). **Commit.** `feat(U-02): one table
system with fit and fill columns, folding, shared cards and one actions pattern`

### U-03 · Migrate the Transactions and Customers pages (size L)

**Do.**
1. `TransactionsPage` (detailed): columns Date (fit), Customer + Particulars
   merged into the fill column (Monogram, customer link, note as a second line,
   "by {name}" folded as a third line below `xl`, Voided/Imported chips),
   Charged (fit), Paid (fit), row actions. Summarized view: Period (fill),
   Entries, Charged, Paid, Net (fit). Totals row via the `totals` slot. Keep
   every sort key, URL parameter, filter, CSV export and the "Charged | Paid"
   semantics from v3.1 L-09.
2. `CustomersPage`: Customer (fill: Monogram, name link, phone folded below
   `lg`), Balance (fit, `AgeFlag` stays), Last activity (fit, priority 2), Added
   (fit, priority 3), row actions (Edit, Archive/Unarchive, then Delete for
   Owners). Keep status tabs, search, sorting, and the position sheet.
3. Delete the page-local card renderers; use the shared `mobile` spec.
4. Keep every existing test green; update only what the markup change requires
   and say so in `PROGRESS.md`.

**Verify.** `npm run verify`; responsive and table audit at all widths in both
themes; screenshots to `.local/ui-checks/`. **Commit.** `feat(U-03): transactions
and customers on the shared table system`

### U-04 · Migrate the ledger, Day book, Members and Recently deleted (size L)

**Do.**
1. **Customer ledger** (`LedgerTable.tsx`): replace the raw table and the mobile
   `<ul>` with `DataTable`: Date (fit), Particulars (fill, with the margin rule
   cell styling kept, `by {name}` folded), Charged (fit), Paid (fit), Balance
   (fit), actions. `totals` slot keeps the double-rule totals over **every**
   non-voided entry. `mode="more"` footer keeps "Show earlier entries" (50 at a
   time). Voided rows stay muted and struck through. `topRow` is wired but empty
   until U-08.
2. **Day book** (`DayBook.tsx`): `DataTable` with `density="compact"`, no
   pagination footer, a "View all" link in the card header. Columns: Date (fit),
   Customer (fill: link, note, "by …" folded), Charged (fit), Paid (fit). Row
   click opens the transaction. The card keeps `min-w-0`.
3. **Members and Invitations**: Member (fill: name, email folded below `lg`),
   Role (fit), Joined (fit, priority 2), actions via `RowActions` (change role,
   remove; Make owner arrives in S-74). **Recently deleted**: Item (fill: label,
   reason folded), Type (fit), Deleted by (fit, priority 2), Deleted (fit),
   action **Restore** as the first inline action (with tooltip) and View details
   in the menu; restored rows show "Restored {when} by {name}" in the action
   cell.
4. Delete `RowActionsMenu`, `RowActionCluster`, the raw `<table>`s, and the
   per-page card code. Remove now-dead tests; no other test may be deleted.

**Verify.** As U-03, plus the dashboard Day book at 390 and 1440 px. **Commit.**
`feat(U-04): ledger, day book, members and recently deleted on the shared table system`

### U-05 · Remove the quick-add card (size S)

**Why.** D-31. The page already has Add charge and Add payment.

**Do.**
1. Delete `CustomerQuickAdd.tsx` and its tests and its mount in
   `CustomerDetailPage.tsx`. Keep `entry-reveal` CSS (U-08 uses it).
2. The empty-ledger state in `CustomerDetailPage.tsx` currently repeats Add
   charge / Add payment. Remove those two buttons there (the header has them) and
   change the text to "No entries yet. Use Add charge or Add payment above."
3. Header buttons: shown for Owner/Editor when the customer is not archived, at
   every width; on a phone they sit on one row under the customer name, each
   `flex-1`, 44 px high.
4. Update `UI-CONTRACT.md`; remove the quick-add rows from the glossary.

**Behaviour.**
```gherkin
Scenario: Phone
  Given a 390 px viewport and an Editor
  Then the customer page shows Add charge and Add payment in the header and no entry card
Scenario: Viewer or archived
  Then neither button nor any entry control is shown
```
**Commit.** `fix(L-07): remove the quick-add card, the header buttons are the entry point (owner decision D-31)`

### U-06 · The Dashboard activity chart, rebuilt (size L)

**Why.** D-34. The current chart is cramped, unreadable on sparse data, has no
way to read a value on a phone, and sits in a narrow column.

**Layout.** The Dashboard rows become: 1) Position sheet and Who to chase (two
columns, as now); 2) **Activity**, full width; 3) **Day book**, full width. Update
the loading skeleton and `gridGuard` to match. The page header stays.

**The Activity card.**
1. **Header:** title "Activity", a segmented range control (`Toggle group` or
   `Tabs`, 44 px on touch): **7 days · 30 days · 90 days · 12 months**. Default 30
   days. The choice is kept in the URL (`?activity=30`) so a reload restores it.
2. **Summary tiles** (three, in a row; stacked on a phone): **Charged**, **Paid**,
   **Net** for the range, each a `Money` figure with a swatch; and under each a
   small comparison with the previous period of the same length, such as `▲ 12%
   vs previous 30 days` or `—` when the previous figure is zero. Computed from a
   single `daily_activity` call of `2 × days` (365 + 365 days for 12 months is
   fine) split into current and previous. The tiles are the legend: no separate
   legend.
3. **Chart (diverging bars).** Charges are bars **above** the zero line
   (`--receivable`), payments are bars **below** it (`--credit`), net per bucket
   is not drawn. A heavier zero baseline (`--foreground`), dashed light gridlines,
   a symmetric Y axis with "nice" ticks and compact Indian labels (`1k`, `50k`,
   `1L`, `10L`, `1Cr`; a helper `formatCompactInr` with tests). Height 280 px at
   `md` and up, 220 px below; width 100% with `ResponsiveContainer`
   (keep `initialDimension` for jsdom).
4. **Buckets.** 7 days and 30 days are daily; 90 days is weekly (Monday start);
   12 months is monthly. A pure function `bucketActivity(rows, bucket)` in
   `src/features/dashboard/activity.ts` does the grouping on the date strings the
   RPC already returns (no timezone math in the client) and returns `{key, label,
   charges, payments, net}`. Bars never narrower than 6 px; if the range would
   produce thinner bars it switches to the next coarser bucket automatically
   (record the rule in the tests).
5. **Reading values (works with mouse, keyboard and touch).** Hover or tap a
   bucket highlights a full-height band and fills a **readout line under the
   chart**: `Wed 15 Oct · Charged ₹41,676.00 · Paid ₹0.00 · Net ₹41,676.00` with a
   link "View entries" that opens Transactions filtered to those dates (add `from`
   and `to` date params to `transactionsPath` if they do not exist; extend
   `TransactionsPage` to accept them and add them to its filter chips). The
   readout also exists as `aria-live="polite"` text. Keyboard: the chart region is
   focusable (`role="group"`, label "Activity chart, use left and right arrow
   keys"), Left/Right move between buckets, Home/End jump, Escape clears. Do not
   rely on a floating tooltip alone.
6. **X axis.** Daily: `17 Oct` at a readable interval (never overlapping); weekly:
   `13 Oct`; monthly: `Oct 26`. First and last label always shown.
7. **Sparse and empty data.** All zeros: empty state "No charges or payments in
   this period" with the range control still usable. Very sparse data keeps the
   same axes (do not rescale to hide the zero baseline). A single huge bucket must
   not flatten the rest: add a "Compress large values" is **not** wanted; instead
   the Y axis uses the real maximum and the readout/tiles carry the exact
   figures.
8. Keep the `sr-only` data table and a `role="img"` summary sentence.
9. Excluding archived customers is stated in a small muted line under the chart:
   "Archived customers are not included."
10. No animation (`isAnimationActive={false}`), tokens only, flat card.

**Behaviour.**
```gherkin
Scenario: Wide and readable
  Given a 1440 px desktop and 30 days of data
  Then the Activity card spans the content width, the chart is at least 280 px high and no label overlaps

Scenario: Phone
  Given a 390 px viewport
  When I tap a bar
  Then the readout under the chart shows that day's Charged, Paid and Net, and there is no horizontal scroll

Scenario: Keyboard
  When I focus the chart and press Right arrow
  Then the next bucket is highlighted and the readout is announced

Scenario: Ranges
  Then 7 days and 30 days show daily bars, 90 days weekly, 12 months monthly, and the choice survives a reload
```
**Tests.** `activity.test.ts` (bucketing, previous period split, percent change
with zero, compact INR, auto-coarsening), `TrendChart` tests (tiles, readout,
keyboard, axe, reduced motion, empty), `DashboardPage` layout and grid guard
update. **Verify.** `npm run verify`; responsive audit at all widths in both
themes (Activity and Day book scenarios, 7/30/90/365); screenshots. **Commit.**
`feat(U-06): rebuild the dashboard activity chart (diverging bars, tiles, readout, ranges)`

> **Checkpoint A.** Stop and report: U-01..U-06 results, audit table, screenshots path.

---

## 6. Features with a decision or analysis step

### S-71 · Analysis: who to chase (size S)

**Why.** The owner asked to "research and analyze first if needed". User research
is not possible from here; the data question is answerable with one read-only
query on production data, which the owner runs.

**Do.**
1. Add to `docs/MANUAL_STEPS.md` a section "v3.2 analysis query" with this
   read-only query for the Supabase SQL editor and ask the owner (in `PROGRESS.md`,
   as an explicit human item) to paste the result:
```sql
-- days since last payment, for customers who owe money (read-only)
select width_bucket(extract(day from now() - last_payment_at)::int,
                    array[7,14,30,60,90]) as bucket,
       count(*)                                           as customers,
       round(sum(balance), 2)                             as outstanding
  from public.customer_balances
 where balance > 0 and archived_at is null
 group by 1 order by 1;
-- plus: how many owe money and never paid
select count(*) filter (where last_payment_at is null) as never_paid,
       count(*) as owing
  from public.customer_balances
 where balance > 0 and archived_at is null;
```
2. Decision rule (write it in `PROGRESS.md`): keep `CHASE_AFTER_DAYS = 30` if at
   least 20 percent of the outstanding amount is older than 30 days and fewer than
   half of owing customers are flagged; if more than half would be flagged choose
   60; if fewer than 5 percent of the amount would be flagged choose 14. If the
   owner has not pasted a result when U-07 starts, use 30 and record that it is a
   default.
3. Never block on the owner for more than this item: continue with U-07 using 30.

**Commit.** `docs(S-71): who-to-chase analysis query and threshold rule`

### U-07 · Who to chase (L-13) (size M)

Follow `PRD-v3.1.md` story L-13 (Do 1 to 5 and its Behaviour scenarios) with
these changes:
- Threshold from S-71 (`CHASE_AFTER_DAYS`); `AgeFlag` uses the same constant.
- It replaces `TopOutstanding` in row 1 of the Dashboard (right column). Remove
  `TopOutstanding` when nothing else imports it; keep its empty text.
- Rows are `LeaderRow`s: Monogram, customer link, sub-line (`paid today`,
  `paid yesterday`, `last paid N days ago`, `no payments yet`), `AgeFlag`, amount.
  The whole row is one 44 px link target on touch.
- Add a link under the list: **See all customers who owe** → Customers page with
  the balance sort descending.
- `customer_balances.last_payment_at` exists in production (migration
  `20261108000000`). Verify with a read of the view in the SQL tests; if it is
  missing, stop and tell the owner.

**Tests.** As in L-13 plus the touch-target audit and `gridGuard`. **Commit.**
`feat(L-13): who to chase on the dashboard, flagged by days since last payment`

---

## 7. Database features (one rollout)

### 7.1 Migration files (new; never edit the three applied ones)

Apply in this order, by hand, in the Supabase SQL editor, one at a time (same
procedure as `MANUAL_STEPS.md` "v3 database rollout"):

1. `20261201000000_v32_transaction_revisions.sql` (S-72)
2. `20261201000100_v32_deletion_log_purge.sql` (S-73)
3. `20261201000200_v32_ownership_transfer.sql` (S-74)
4. `20261201000300_v32_bulk_actions.sql` (S-75)

Each file: header comment (purpose, what it adds, idempotent, how to verify),
`create … if not exists` / `create or replace` / `drop … if exists`, RLS enabled
on every new table, `revoke all … from anon`, `revoke insert, update, delete,
truncate … from authenticated` on log-style tables, `grant execute … to
authenticated` and `revoke execute … from public, anon` on every function, every
function `set search_path = public`. Write functions `security invoker` unless
the story says otherwise.

### 7.2 SQL tests

Add sections to `supabase/tests/bahikhata_consolidated_tests.sql` (new section
numbers after the last; same helpers, one savepoint per section). Update
`supabase/tests/README.md` and `docs/RLS.md`. The runner must still end with
`==> SQL tests passed`.

### 7.3 Rollout notes (for S-76)

Rollout is additive: old clients keep working (no existing function changes
signature). Apply all four files before deploying v3.2. Backups first. Provide
verification queries per file (object exists, RLS on, grants) in `MANUAL_STEPS.md`.

### S-72 · Transaction revision history (B-08) (size L)

**Why.** Only the last editor survives today (`updated_by`, `updated_at`).
Owners want to see what changed, by whom, and when (amount fixed, date moved,
voided and restored).

**Database (`…_v32_transaction_revisions.sql`).**
1. `transaction_revisions`: `id uuid pk default gen_random_uuid()`, `business_id
   uuid not null references businesses on delete cascade`, `transaction_id uuid
   not null` (**no foreign key**: history must outlive a deleted-then-restored
   row), `action text not null check (action in ('edit','void','restore'))`,
   `changes jsonb not null default '{}'` (for edits: `{field: {from, to}}` for
   `customer_id`, `type`, `amount`, `occurred_at`, `note`), `reason text`,
   `changed_by uuid references auth.users on delete set null`, `changed_at
   timestamptz not null default now()`. Index `(business_id, transaction_id,
   changed_at desc)`.
2. RLS: members of the business can `select` (same visibility as the
   transaction itself, Viewers included). No insert/update/delete for any client
   role (revoked); rows are written only by the trigger.
3. Trigger function `record_transaction_revision()` `security definer`, `after
   update on transactions for each row`: skip when `current_setting('bahikhata.
   restoring', true) = 'on'`; when the content tuple `(customer_id, type, amount,
   occurred_at, note)` differs, insert an `edit` row with only the changed
   fields; when status goes to `voided`, insert `void` with `new.void_reason`;
   when it leaves `voided`, insert `restore`. Actor: `auth.uid()`, falling back
   to `new.updated_by`/`new.voided_by`. A no-op update inserts nothing.
4. RPC `transaction_history(p_transaction_id uuid)` `security invoker`, returns
   rows (action, changes, reason, changed_at, changed_by, actor_name from
   `profiles`) newest first, limit 200.
5. No back-fill. Add a column-free marker: the UI computes "history starts on
   {earliest changed_at of the business or the migration date}" from a small
   `select min(changed_at)`; simpler: store the migration date as a constant in
   `src/features/transactions/historyStart.ts`, set by the owner after rollout
   (document in `MANUAL_STEPS.md`; default text "History is recorded from the
   day v3.2 was installed").

**UI.**
1. `TransactionDetailPage`: a **History** section under the details: a vertical
   list, newest first. First item (derived, not stored) "Recorded by {creator}
   on {date}" at the bottom. Each item: icon, who, when (relative with absolute
   on hover/title via tooltip), a sentence such as "Changed amount ₹1,000.00 →
   ₹1,200.00", "Moved date 12 Oct → 14 Oct", "Changed note", "Voided: {reason}",
   "Restored". Amounts through `Money`; all text readable without colour.
2. The `EditedBadge` (ledger, transactions) links to the detail page's History
   section (`#history`; only a plain `#name` hash is allowed).
3. Rows edited before the migration show "Edited (earlier changes were not
   recorded)".
4. Hook `useTransactionHistory(businessId, id)`, query key in `queryKeys.ts`,
   invalidated by update/void/restore mutations.

**SQL tests (new sections).** edit of amount creates one `edit` row with the old
and new value; edit of two fields creates one row with both; no-op update creates
none; void and restore create rows with the reason and actor; actor comes from
`auth.uid()` not from client-supplied columns; Viewer can read, outsider cannot,
nobody can insert/update/delete directly; deleting then restoring a transaction
keeps its history readable; deleting the business cascades; `restore_deleted`
itself adds no revision.

**Frontend tests.** timeline rendering for each action, empty history ("No
changes recorded"), error state, axe. **Commit.** `feat(S-72): transaction
revision history (trigger, RPC and History section)`

### S-73 · Deletion log export and purge (B-12) (size M)

**Database (`…_v32_deletion_log_purge.sql`).**
1. `deletion_log_purges`: `id`, `business_id` (cascade), `purged_by` (set null),
   `purged_at`, `criteria jsonb` (scope, before), `entries_removed int`,
   `customers_removed int`, `transactions_removed int`, `revisions_removed int`.
   RLS: Owners can select; no client writes.
2. `purge_deletion_log(p_business_id uuid, p_before timestamptz, p_scope text,
   p_dry_run boolean default true)` `security definer`: Owner only
   (`has_role(…, 'owner')`); `p_scope in ('restored','all')`; `p_before` must be
   at least 30 days in the past (raise `22023` otherwise); selects entries with
   `deleted_at < p_before` and, for `restored`, `restored_at is not null`; with
   `p_dry_run` returns counts only (`entries`, `customers`, `transactions`,
   `unrestored`); otherwise deletes the entries, deletes
   `transaction_revisions` whose `transaction_id` appears only in purged
   snapshots and no longer exists in `transactions`, inserts one
   `deletion_log_purges` row, and returns the counts. One transaction.
3. `export_deletion_log(p_business_id uuid)` `security invoker` (RLS: Owners
   only already) returns up to 5000 rows without the heavy `snapshot` column.

**UI (`DeletedItemsPage`).**
1. Header actions: **Export CSV** (Owner; filename `deleted-items-{business}-
   {date}.csv`; reuse the safe-CSV helper from S-39 and the numeric-cell
   exemption from B-10 if it exists; columns: Deleted at, Type, Item, Deleted by,
   Reason, Restored at, Restored by, Amount where relevant) and **Clean up…**.
2. **Clean up dialog:** scope radio ("Items already restored" or "All items"),
   age select (30 days, 90 days, 6 months, 1 year; minimum 30 days), a live
   preview from the dry run ("42 entries: 12 customers, 30 transactions; 3 are
   not restored and cannot be brought back"), a button **Export first**, and for
   scope "All items" or any unrestored count above 0 a typed confirmation
   (`PURGE`). Toast with the counts afterwards.
3. Under the header, if a purge exists: "Last cleaned up {when} by {name}:
   {n} entries removed."
4. Permissions: add `exportDeletionLog` and `purgeDeletionLog` (Owner only) to
   `permissions.ts`, `UI-CONTRACT.md` and the SQL tests.

**SQL tests.** Owner only (Editor, Viewer, outsider refused); minimum age
enforced; `restored` scope never removes an unrestored entry; dry run changes
nothing; real run writes exactly one audit row with correct counts; revisions of
purged, no-longer-existing transactions are removed and others are kept; cascade
on business delete. **Commit.** `feat(S-73): export and clean up the deletion log (owner only, logged)`

### S-74 · Ownership transfer (B-14) (size M)

**Rules (D-36).** Only the current Owner may transfer. The target must be an
existing member (Editor or Viewer), not the caller, and must **not already own a
business** (there is a unique index on `businesses.owner_id`; the message says a
person can own only one). The old Owner becomes an Editor. The partial unique
index `one_owner_row_per_business` must never see two owners: demote first, then
promote. `businesses.owner_id` is updated too (the app reads it to show the owner
name on the Businesses page). Pending invitations stay valid.

**Database (`…_v32_ownership_transfer.sql`).**
1. `ownership_transfers` (`id`, `business_id` cascade, `from_user`, `to_user`,
   `transferred_at`); RLS: members can select, no client writes.
2. `transfer_ownership(p_business_id uuid, p_new_owner uuid)` `security definer`,
   `set search_path = public`: `select … from businesses where id = … for update`;
   checks as above with these messages (use `errcode 42501` for permission and
   `55000` for state): "Only the owner can transfer ownership." / "Choose a
   member of this business." / "This person already owns a business. A person can
   own only one." / "You are already the owner."; then, in this order: update the
   caller's member row to `editor`, update the target's member row to `owner`,
   update `businesses.owner_id`, insert the `ownership_transfers` row; return the
   new member rows as jsonb.
3. Verify with `grep -rn owner_id` that no policy or function breaks when
   `owner_id` changes (at `8a0d3b2`: only the insert policy and `create_business`
   use it). Update `leave_business`'s message to "Owners cannot leave. Transfer
   ownership first, or delete the business." only if you can do it with
   `create or replace` safely; otherwise leave SQL as is and change the UI copy.

**UI.**
1. Members page, Owner only: member row menu item **Make owner…** (not on the
   Owner row, not on yourself). Dialog "Transfer ownership to {name}?": a short
   list of consequences (you become an Editor; {name} can change roles, remove
   anyone, including you, and delete the business; you cannot undo this
   yourself), the business name to type, a destructive primary button **Transfer
   ownership** (disabled until the name matches), the database message shown
   inline on failure.
2. After success: refetch memberships and permissions so the role switches to
   Editor immediately, toast "{name} is now the owner", stay on the Members page.
3. Settings and the leave-business UI: replace "Owners cannot leave" copy with a
   pointer to Make owner.
4. Permissions: add `transferOwnership` (Owner only) to the matrix and
   `UI-CONTRACT.md`.

**SQL tests.** Success swaps roles and `owner_id` and writes one transfer row;
exactly one owner afterwards; Editor, Viewer and outsider refused; target not a
member refused; target who owns another business refused (and nothing changed);
self-transfer refused; concurrent calls cannot produce two owners (second fails
cleanly after the first, test with two sequential calls); old owner can no longer
call owner-only functions; business deletion rules still hold for the new owner.
**Frontend tests.** dialog disabled until the name matches, error rendering,
permissions refresh, axe. **Commit.** `feat(S-74): transfer ownership of a
business (atomic, owner only, logged)`

### S-75 · Bulk select and act (B-13) (size L)

**Rules (D-35).** Selection is per page (clears when the page, filter, sort or
tab changes), at most 100 rows, one RPC call = one transaction = all or nothing.
Viewers see no checkboxes. Destructive bulk actions need a typed confirmation
(`DELETE 7`, the count included).

**Database (`…_v32_bulk_actions.sql`).** Every function takes `p_business_id`,
caps the array at 100 (error `54000`), refuses ids outside that business, and
raises (rolling everything back) naming the first row that cannot be changed.
1. `bulk_set_customers_archived(p_business_id, p_ids uuid[], p_archived boolean)`
   → `int`; `security invoker` (RLS "Editors can update customers" is the gate).
2. `bulk_set_transactions_voided(p_business_id, p_ids uuid[], p_voided boolean,
   p_reason text default null)` → `int`; invoker; voiding sets `voided_at`,
   `voided_by`, `void_reason`; restoring calls `restore_transaction` per id so the
   active/edited rule stays in one place.
3. `bulk_delete_transactions(p_business_id, p_ids, p_reason)` → `jsonb {count,
   log_ids}`; `security definer`; Owner only; loops `delete_transaction`.
4. `bulk_delete_customers(p_business_id, p_ids, p_reason)` → `jsonb {count,
   transactions, log_ids}`; Owner only; loops `delete_customer_permanently`.
5. `bulk_restore_deleted(p_log_ids uuid[])` → `jsonb {count}`; Owner only; loops
   `restore_deleted`; the error names the first conflicting item (the single
   function already raises explanatory `55000` messages; keep them).
(Read the exact current signatures of the single-row functions in
`20261101000000_v3_deletion_log_and_integrity.sql` before writing the loops.)

**UI.**
1. `DataTable` `selectable` (stubbed in U-02): checkbox column (use
   `@base-ui/react/checkbox`, new `ui/checkbox.tsx` with `touch-target`), header
   checkbox with the indeterminate state, **Shift+click range select**, cards get
   the checkbox at the left, labels `Select {name}`.
2. `BulkActionBar`: appears when at least one row is selected; sticky at the top
   of the table on desktop, fixed above the safe area on a phone; shows `3
   selected`, actions, **Clear**; `aria-live="polite"` count; Escape clears.
3. Actions by table: **Customers** Archive, Restore (unarchive), Delete (Owner).
   **Transactions** Void, Restore, Delete (Owner). **Recently deleted** Restore
   (Owner). Hide actions the role cannot do; hide ones that cannot apply to the
   current selection (for example Restore when nothing selected is archived).
4. Confirmation dialogs use the existing `ConfirmDialog`/typed-confirmation
   pattern, list the first five names with "and n more" and the total
   (transactions: sum charged and paid; customers: number of entries that go with
   them via a head count query), and describe recovery ("they go to Recently
   deleted").
5. After a delete, the toast has **Undo** (10 s) calling `bulk_restore_deleted`
   with the returned `log_ids`, as single delete does today. Success clears the
   selection and invalidates the same queries as the single actions.
6. Errors keep the selection and show the database message.

**SQL tests.** For each function: Editor/Viewer/Owner matrix as in the permission
table; cap of 100 enforced; foreign ids refused; all-or-nothing (one bad id rolls
back the rest); counts; `log_ids` feed `bulk_restore_deleted` round trip;
archived customer's transactions cannot be voided (message). **Frontend tests.**
selection behaviour (page change clears, range select, header indeterminate),
bar visibility per role, each confirm flow, Undo, axe, 44 px touch targets
(audit). **Commit.** `feat(S-75): bulk select and act on customers, transactions and deleted items`

> **Checkpoint B.** Stop and report: S-71..S-75, SQL suite result (section count),
> the list of the four migration files, the rollout order, screenshots.

---

## 8. The entry row (L-12)

### U-08 · Entry row on the ledger (size M)

Follow `PRD-v3.1.md` story L-12 (all numbered Do steps and Behaviour scenarios)
with these changes:
- It is the `topRow` of the migrated ledger `DataTable` (U-04), so the columns,
  widths and the Balance column are the real table's.
- It exists at `md` (768 px) and up only, for Owners and Editors, when the
  customer is not archived. **Below `md` nothing replaces it**: the header's Add
  charge and Add payment buttons are the entry point (D-31). Delete every mention
  of `CustomerQuickAdd` from this story.
- Typing in Charged clears Paid and vice versa; both filled blocks saving with
  "Enter either Charged or Paid"; Enter saves; Escape clears; focus returns to
  Charged after success; `entry-reveal` on the new row; `toastSuccess("Charge
  added" | "Payment added")`.
- Two buttons in the header and an entry row on desktop do the same job; the
  header buttons stay, as the owner prefers. If the owner later decides against
  the entry row, delete only `LedgerEntryRow.tsx`, its tests and the `topRow`
  prop usage (the table needs no other change).
- Validation self-test for the owner (put it in `PROGRESS.md` as a human item):
  record five charges and five payments by keyboard only on a test customer and
  note any wrong-column entry; the target from the research plan is zero.

**Tests.** `LedgerEntryRow.test.tsx` for every scenario, label association, axe;
`CustomerDetailPage` test that at `md` and up exactly one entry surface exists
(row), and below `md` none (buttons only). **Verify.** `npm run verify`;
responsive audit (no layout shift when the row mounts, 44 px targets on touch
not applicable since it does not render there). **Commit.** `feat(L-12): entry
row on the customer ledger`

---

## 9. Release

### S-76 · Documentation, rollout guide and backlog (size M)

**Do.**
1. `docs/MANUAL_STEPS.md`: section "v3.2 database rollout" (backup; the four
   files in order; verification queries per file; deploy after; the analysis
   query from S-71; the history-start date from S-72; what to do if a step
   fails: stop, do not run later files, restore from backup if data changed).
2. `docs/UI-CONTRACT.md`: Tooltips, Table anatomy and Row actions, Bulk
   selection, Activity chart, Ownership transfer, Revision history, Purge. Update
   the permission matrix table and the glossary (new words: Make owner, Clean
   up, History, Select, Activity).
3. `docs/RLS.md` and `supabase/tests/README.md`: new tables, functions and
   sections.
4. `docs/RELEASE-NOTES-v3.2.md`: what changed for users, what changed for the
   database, rollback notes (the new functions are additive; to roll back the
   client redeploy v3.1, the new tables are harmless), known limits (history
   starts at install; purge minimum 30 days; ownership transfer is immediate).
5. `docs/BACKLOG.md`: mark B-08, B-12, B-13, B-14 done; add **B-24** two-step
   ownership transfer with acceptance, **B-25** automatic purge by retention
   setting, **B-26** select-all-matching-filter for bulk actions, **B-27** revision
   history for customers, **B-28** per-business chase threshold setting, **B-29**
   cross-page selection.
6. `README.md`: feature list and the new scripts if any.

**Commit.** `docs(S-76): v3.2 documentation, rollout guide and backlog`

### S-77 · Final verification and release candidate (size S)

**Do.**
1. On a clean clone: `npm ci`, `npm run verify`, `npm run audit:tokens`, `npm run
   audit:contrast`, `npm run audit:bundle` (largest chunk must stay under
   500 kB), `npm audit --omit=dev`, `npm run test:sql` against a scratch
   Postgres, and the full `scripts/responsive-audit.cjs` run (all routes and all
   table scenarios, five widths, both themes). Record the numbers next to the
   v3.2 baseline in `PROGRESS.md`.
2. Zero failures are required in the responsive and table audits. List any
   exception as `V-xx` with the owner's name for who approved it.
3. Write the human checklist in `PROGRESS.md`: tooltips on hover and keyboard,
   one table of each kind at 390 and 1440, Add charge / Add payment on a phone,
   the new chart on a real phone, bulk archive/void/delete/undo, ownership
   transfer between two real accounts (one has no business of its own), history
   after an edit, export and cleanup of the deletion log, the entry row.
4. Open the pull request into `master` (or into `feat/v3` if v3.1 is not merged)
   with `RELEASE-NOTES-v3.2.md` as the description. **Do not merge. Do not
   deploy. Do not apply any SQL to the real database.**

**Commit.** `chore(S-77): v3.2 release candidate verified`

> **Checkpoint C.** Stop and report with at most 15 lines: audit table, test
> counts, SQL sections, deviations, commit hashes, what only the owner can check.

---

## 10. Risks and how the plan handles them

| Risk | Handling |
|---|---|
| The table rewrite touches six pages and breaks tests | U-02 first, then migrate two pages (U-03), then four (U-04); every step runs `verify` and the table audit; no test may be deleted except tests of removed code |
| Layout bugs that jsdom cannot see (last release's problem) | "Measured, not inferred" rule, table audit with numeric thresholds, five widths, both themes |
| The chart readout depends on a transactions date filter that may not exist | U-06 step 5 says to add `from`/`to` to `transactionsPath` and the page; test it |
| A bulk action on 100 rows is slow or fails halfway | One RPC, one transaction, hard cap 100, all-or-nothing, tested |
| Ownership transfer by mistake | Typed business name, plain consequences, server prechecks, audit table; two-step version is backlog B-24 |
| Purge removes data the owner needs | 30-day minimum, restored-only option, export first, typed confirmation for unrestored, audit row |
| History table grows | One small row per edit; purge (S-73) removes orphaned history; B-25 covers automatic retention |
| The agent runs out of tokens mid-story | Three checkpoints; one commit per story; `PROGRESS.md` is the resume point; a story is not "done" until measured |

## 11. Definition of done for v3.2

- Every story above is `done` (or `skipped (owner)` for U-08 only), each with a
  real commit hash.
- `npm run verify`, all audits and `npm run test:sql` are green on a clean clone.
- The responsive and table audits show zero failures at 360, 390, 768, 1024 and
  1440 px in both themes.
- No new dependency; the three applied migrations unchanged; four new migration
  files documented and verified on a scratch database.
- A pull request exists with the release notes; the owner has the human
  checklist.
