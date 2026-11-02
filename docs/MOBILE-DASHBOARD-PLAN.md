# Mobile layout and dashboard improvement plan

Branch: `feat/mobile-layout-dashboard` (from `master`).

## Findings and scope

1. **High: creation forms exceed short viewports.** `EntityDialog` uses an unbounded bottom sheet on phones and an unbounded centered dialog on larger screens. Customer create/edit, transaction create/edit, invitations, and the UI gallery share it. Fix containment centrally, retain scrolling, validation, failed-save values, focus handling, and discard confirmation.
2. **Medium: mobile navigation has mismatched widths.** `SheetContent` applies a side-specific 75% width while `MobileDrawer` supplies a generic 212px width and its child stays 212px wide. Use the same side-specific width selector, let the sidebar fill its parent, and allow navigation to scroll on short screens.
3. **Medium: activity chart wastes height and guesses its width.** The symmetric positive/negative scale uses half the plot for each positive amount, while bucketing assumes 350px or 1000px regardless of the containing card. Use grouped positive bars and measure the container with Recharts' existing resize callback. Reserve room for axes and two bars per bucket. Keep currency formatting, zero-filled periods, comparison totals, range URL state, partial-period labels, accessible table, keyboard navigation, and transaction links.
4. **Medium: saves can be dismissed while pending.** Footer buttons disable, but Escape/backdrop/close still run the dirty-discard flow. Ignore dismissal while saving; verify failure still permits retry.
5. **Medium: customer picker still refers to a Radix sizing variable.** This project uses Base UI. Use its anchor-width variable and bound the mobile picker to the available height.
6. **Medium: partial chart buckets link beyond the displayed period.** Weekly/monthly labels acknowledge partial periods, but their link dates cover the entire calendar bucket. Clamp drill-down dates to the included rows and add regression coverage.

## Implementation order

1. Record this plan before source edits; keep existing `src/components`, feature, test, and `docs` structure.
2. Bound shared dialogs/sheets with dynamic viewport height, safe-area clearance, and scroll containment. Keep sheet headers from shrinking and form bodies scrollable. Check every `SheetContent`/`DialogContent` caller, including nested customer selection and destructive confirmations.
3. Correct the navigation width at its caller and make the inner sidebar inherit its container width. Preserve desktop rail width, active links, and route-change close behavior.
4. Replace diverging activity bars with grouped charge/payment bars, a zero-based axis, responsive density and wrapping controls. Retain the current data/API contracts; no dependencies or database changes.
5. Fix the pending-save dismissal and picker sizing issues in the shared paths. Clamp partial-bucket drill-down dates without changing amounts.
6. Add focused coverage for width/height structure, pending saves, measured chart density and partial-bucket dates; run lint, typecheck, tests and production build.
7. Finish a source review of adjacent data, customer and transaction flows; document additional confirmed issues separately from suggestions and record validation limits.

## Acceptance checks

- At phone widths and short landscape heights, navigation fills its drawer and scrolls; form content and actions remain reachable within a bounded popup.
- Both mobile sheets and centered desktop/tablet dialogs have a viewport height cap; scrolling stays within the popup. Safe-area spacing remains present.
- Charts adapt to the actual card width and keep all charges/payments in their totals. Zero-only data uses the empty state; payments remain positive on the axis, with net shown separately.
- Range changes preserve unrelated query parameters; keyboard selection, accessible data, and date-filtered links still work.
- Failed saves retain input; pending saves cannot be discarded through the close controls.
- Automated checks are evidence for structure and behavior, not real phone keyboard geometry. Physical iOS/Android keyboard and browser-toolbar checks remain necessary before claiming those cases verified.

## Boundaries

No dependency additions, migrations, production data writes, deployment, or broad feature redesign. The detailed review will identify remaining work without quietly expanding this branch.
