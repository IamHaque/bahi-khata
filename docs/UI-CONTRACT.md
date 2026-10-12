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
  ('Customer archived'). Errors say what failed and what to do. Undo is
  offered for archive and void.
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
