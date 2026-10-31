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

- Primitives: `Button`, `Input`, `Select`, `Textarea`, `Switch`, `Tabs`,
  `Card`, `Dialog`, `AlertDialog`, `Sheet`, `Popover`, `Menu`,
  `EntityDialog`, `ConfirmDialog`, `MoneyField`.
- Ledger (L-04): `LeaderRow` (label + dotted leader + amount, never
  truncates the amount), `TotalsRule` (single rule above, double below),
  `Monogram` (initials avatar on a tone tint), `AgeFlag` (30+ day
  thresholds), `TallyMark`, `TypeBadge` (Charged/Paid), `BalanceBadge`.
- App-level: `PageHeader`, `DataTable` (five states, `RowActionsMenu`,
  mobile cards), `SearchInput`, `FilterBar`, `EmptyState`, `ErrorState`,
  `Skeleton`, `StatCard`, `Money`/`formatMoney`, `LedgerTable` (the L-07
  real-table ledger with caption, header cells and a Totals row).

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

Two guard rails keep the two layers honest:

- **UI → database:** every write mutation calls `assertCan(...)` inside
  `mutationFn`, so a known disallowed role fails with `forbidden` before
  any network call (`src/components/app/__tests__/can.test.tsx`).
- **Database → UI:** `assertCan` only blocks *known* roles; an unknown
  role falls through and the RLS policies refuse the write anyway.
  The UI hiding a control is experience, never security.
