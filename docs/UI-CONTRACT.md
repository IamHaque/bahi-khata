# BahiKhata v2 — UI Contract

## Theme decision (S-08)

- **Preset:** no external preset (tweakcn / ui.shadcn.com/themes) was copied.
  Token values were derived directly from PRD 4.5 semantics (indigo/blue
  `primary`, green `receivable`, red-orange `credit`, neutral `settled`)
  as OKLCH, then machine-verified for WCAG AA contrast.
- **Source of truth:** `docs/PRD-v2.md` §4.5 (semantic tokens, radius,
  surfaces) + `docs/ARCHITECTURE-BASELINE.md` §8 (existing token
  architecture, kept). Contrast verified 2026-10-12 with a script
  computing WCAG relative luminance from OKLCH; all 36 token/background
  pairs pass AA (≥4.5:1 text, ≥3:1 borders) on card and page
  backgrounds in both themes.
- **Architecture:** CSS variables in `src/index.css` (`:root` + `.dark`),
  mapped into Tailwind 4 via `@theme inline`. Dark mode via the `.dark`
  class; `ThemeContext` supports `system | light | dark` (PRD scenario
  asks for next-themes — deviation DEV-3: the existing custom context was
  extended with a `system` option instead of adopting next-themes).
- **Font:** Public Sans Variable (the family already wired in v1);
  the unused `@fontsource-variable/geist` package was removed (S-08).
  Tabular numerals enabled globally via `.tabular-nums`.

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
  not archive customer. Try again.'). Undo is offered for archive and
  void.
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

## Copy glossary (copied from PRD §8 — owned by S-13)

| Concept                     | Use                           | Never                               |
| --------------------------- | ----------------------------- | ----------------------------------- |
| Customer owes the business  | Owes you                      | Receivable, Debit, Due (in UI text) |
| Business owes the customer  | You owe                       | Payable, Credit balance             |
| Zero balance                | Settled                       | Zero, Paid up                       |
| Hide a customer, reversible | Archive                       | Delete                              |
| Remove a customer forever   | Delete permanently            | Remove                              |
| Cancel a transaction        | Void                          | Delete                              |
| Workspace                   | Business                      | Tenant, Workspace, Organization     |
| Shared access               | Member, Editor, Viewer, Owner | Admin, User                         |

## Component gallery (owned by S-13)

- Dev-only route `/__ui` (`src/features/dev/UiGallery.tsx`), registered in
  `App.tsx` behind `import.meta.env.DEV` — the route does not exist in
  production builds.
- Every shared component appears there in its states; `src/features/dev/
  __tests__/uiGallery.test.tsx` renders the gallery in both themes and
  fails on any console error or warning.

## Permission matrix ↔ database agreement (S-21)

`src/lib/permissions.ts` is the single UI source for PRD §3. The
database (row-level security) is the source of truth; this table maps
every action name to the SQL test in `supabase/tests/0002_rls_membership.sql`
that proves the database agrees. Fixture roles: Olivia = Owner,
Eli = Editor, Vic = Viewer, Zed = outsider.

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
| `manageMembers` | ✅ | ❌ | ❌ | §6 "Eli cannot change a member role" / "Eli cannot remove a member" / "Eli cannot insert an invitation" (added in S-21) |
| `deleteBusiness` | ✅ | ❌ | ❌ | §6 "Eli cannot delete the business"; §10 "Olivia deleted the business" |
| `leaveBusiness` | ❌ | ✅ | ✅ | §7 "Olivia cannot leave her own business" (owner must delete instead) |

Two guard rails keep the two layers honest:

- **UI → database:** every write mutation calls `assertCan(...)` inside
  `mutationFn`, so a known disallowed role fails with `forbidden` before
  any network call (`src/components/app/__tests__/can.test.tsx`).
- **Database → UI:** `assertCan` only blocks *known* roles; an unknown
  role falls through and the RLS policies refuse the write anyway.
  The UI hiding a control is experience, never security.
