# Project review and mobile/dashboard changes

What this repo does: BahiKhata records customer charges and payments for small businesses, with shared business access, statements, imports, exports, and dashboard totals. This review assumes several staff use each business, including phones, with customer lists that can grow beyond a single server response.

The implementation plan was written before source edits in [MOBILE-DASHBOARD-PLAN.md](MOBILE-DASHBOARD-PLAN.md). Work is on `feat/mobile-layout-dashboard`, created from `master`. No dependencies or database migrations were added.

## Fixed in this branch

- **Drawer gap:** the mobile drawer now uses a side-specific 212px width override and its sidebar fills the parent. Short drawers scroll, clear device safe areas, and use a contrasting close button.
- **Creation forms outside the screen:** shared dialogs and sheets now have height limits and scrolling. They track `VisualViewport` resize/scroll events, covering keyboard shrink and viewport panning as well as dynamic browser height. Customer create/edit, transaction create/edit, and invitations inherit the fix. Sheet form bodies can shrink while headers remain readable. Desktop dialogs also fit short windows.
- **Dashboard chart readability:** charges and payments are grouped above zero on a shared scale. The chart measures its actual card width, reserves room for both bars and axes, and groups days into weeks when necessary. Weekly ranges use their actual bucket count instead of treating each day as a weekly bucket. Totals, comparisons, currency formatting, URL ranges, keyboard readout, accessible table, and date links remain available. Selection clears when a resize changes the grouping.
- **Misleading chart drill-down:** partial weeks/months now link only to the dates included in their plotted totals.
- **Dismissal during saves:** shared creation forms ignore close/Escape/backdrop dismissal while a save is pending. Failed saves still keep values and permit retry.
- **Customer picker sizing:** the desktop picker uses Base UI's anchor-width variable; its phone sheet uses dynamic viewport height and inherits viewport containment.
- **Regression evidence:** the existing browser audit now checks popup bounds, including height, and accepts `AUDIT_HEIGHT` for short-window checks. Its previous horizontal-only check could miss the reported form overflow.

## Must fix next

These are additional findings, not changes included in this branch. They are grounded in source paths; the monetary validation case was also reproduced directly against the schema. Production data was not changed to reproduce them.

1. **Clearing customer contact details does not clear the stored values.** [CustomerFormDialog.tsx](../src/features/customers/components/CustomerFormDialog.tsx), [customers/api.ts](../src/features/customers/api.ts), [schemas.ts](../src/features/customers/schemas.ts).
   - **What this is:** customer editing builds the object sent to the update API.
   - **Problem:** clearing phone, email, address, alternate contact, notes, or all tags produces `undefined`. JSON omits those properties, so the update leaves their old database values intact even though saving succeeds.
   - **Fix:** send explicit `null` values for cleared optional fields during edits, including an empty tag list. Add a test that clears existing values, saves, and reloads them. Keep create defaults consistent with the database.
   - **If we skip it:** staff believe stale contact information or notes have been removed when they remain stored.

   Fixed in `0107b1d` (v3.2.1).

2. **Some valid two-decimal amounts are rejected.** [transactions/schemas.ts](../src/features/transactions/schemas.ts).
   - **What this is:** `amountField` checks whether an amount has at most two decimal places.
   - **Problem:** its fixed `1e-9` tolerance after multiplying by 100 is too small for larger valid amounts. Running `amountField.safeParse(1234567.89).success` returns `false`; the form rejects ₹12,34,567.89 despite its two decimals.
   - **Fix:** use a precision check that accounts for the number's magnitude, with an explicit supported amount limit. Pin valid larger amounts and invalid three-decimal amounts in a focused schema test.
   - **If we skip it:** otherwise valid charges or payments cannot be entered, with a misleading decimal-place error.

   Fixed in `43ec7fe` (v3.2.1).

3. **A failed customer search looks like an empty business.** [CustomerCombobox.tsx](../src/components/CustomerCombobox.tsx).
   - **What this is:** the transaction form loads customers for selection.
   - **Problem:** the component reads `data = []` and `isLoading`, but ignores query errors. On an initial failed request it displays the empty-customer flow and offers to create another customer.
   - **Fix:** show the query error and a retry action before the empty state. Test a rejected request followed by a successful retry.
   - **If we skip it:** users cannot tell whether customers are missing or the connection failed, and may create duplicates.

   Fixed in `fe20735` (v3.2.1).

4. **Mobile customer balances lose their direction.** [CustomersPage.tsx](../src/features/customers/pages/CustomersPage.tsx), mobile card configuration near `mobile={(row) => ...}`.
   - **What this is:** a mobile card shows the customer's balance.
   - **Problem:** it renders `Math.abs(row.balance)` and uses colour to distinguish money owed by the customer from money owed to them. For balances of +500 and −500, both cards say ₹500.00. The desktop cell supplies direction words; the phone card does not. This is also recorded in existing backlog B-11.
   - **Fix:** include the existing `balanceWords` text beside the phone amount or in its accessible label and visible subtitle.
   - **If we skip it:** screen-reader users and people who cannot distinguish the colours can read the debt direction incorrectly.

   Fixed in `8d8840d` (v3.2.1).

5. **Payment-history failures are presented as “no payments yet.”** [ChaseList.tsx](../src/features/dashboard/components/ChaseList.tsx), [chase.ts](../src/features/dashboard/chase.ts).
   - **What this is:** the dashboard adds last-payment information to the customers who owe most.
   - **Problem:** pending/error data falls back to `{}`. Missing values become “no payments yet,” and there is no payment-history loading or error state. A customer who has paid can receive this label when that request fails.
   - **Fix:** distinguish unavailable history from a successful `null` result; show a neutral loading/error label and permit retry. Test a last-payment query failure with an existing debtor.
   - **If we skip it:** the dashboard gives staff incorrect collection context during connection problems.

   Fixed in `341bc59` (v3.2.1).

6. **Setup instructions omit four migrations used by the current UI.** [README.md](../README.md), [supabase/migrations](../supabase/migrations).
   - **What this is:** the README tells a deployer which migrations to apply.
   - **Problem:** it describes seven migrations in the stack table but instructs the reader to apply only the three v3.1 migrations. The directory also contains migrations for transaction revisions, deletion-log purge, ownership transfer, and bulk actions. A database initialized only from that checklist lacks the later tables/functions.
   - **Fix:** update the checklist to all seven migrations in order and reconcile the linked rollout instructions. Verify schema-dependent features against a scratch database.
   - **If we skip it:** a new deployment can load successfully while history and administrative/bulk actions fail. Whether the deployed database is missing these migrations was not checked.

   Fixed in `afdbed1` (v3.2.1).

## Should fix

7. **The “customers who owe” link includes customers who do not owe.** [ChaseList.tsx](../src/features/dashboard/components/ChaseList.tsx).
   - **What this is:** the link opens the full customer list from the chase panel.
   - **Problem:** its URL sets `sort=balance-desc` but omits `status=owes`. Once the user reaches the end of debtors, settled and credit customers appear too. Existing tests pin the incomplete URL.
   - **Fix:** add `status=owes` and update the two link assertions in the chase/dashboard tests.
   - **If we skip it:** the destination does not match the link's promise.

   Fixed in `341bc59` (v3.2.1).

8. **The picker only searches the customer rows returned in one response.** [CustomerCombobox.tsx](../src/components/CustomerCombobox.tsx), [customers/api.ts](../src/features/customers/api.ts).
   - **What this is:** `listCustomers` reads the active customer list once, and the picker filters that array locally.
   - **Problem:** there is no pagination or server-side search here. If a business exceeds its configured API response row limit, customers outside the returned set cannot be found; the picker can instead offer to create another customer. The deployed row limit and business sizes were not inspected, so this is a conditional scale risk.
   - **Fix:** reuse the existing paged/searchable customer query for picker searches, with the selected customer resolved separately when needed. Test a customer beyond the first response window.
   - **If we skip it:** the picker stops being complete as businesses grow, even though the main customer list already supports paging.

   Fixed in `8c43309` (v3.2.1).

## Nice to have

9. **Select a customer immediately after creating them inside a transaction.** [TransactionSheet.tsx](../src/features/transactions/components/TransactionSheet.tsx), [CustomerFormDialog.tsx](../src/features/customers/components/CustomerFormDialog.tsx).
   - **What this is:** the transaction picker can open an inline customer creation form.
   - **Problem:** creation refreshes the list, but does not return the created customer to the current transaction form. The user must open the picker and select them again.
   - **Fix:** return the created customer through a success callback used by this caller, then set the existing transaction form's customer field. Preserve its amount, date, type, and note.
   - **If we skip it:** the flow still works, with an extra search and selection step.

   Fixed in `b176206` (v3.2.1).

## Verification

- Final full verification gate after all code changes: **89 files, 731 tests passed**, lint, TypeScript and production build passed. Targeted navigation/hover regressions also pass in Los Angeles time.
- Lint: passes with **10 pre-existing Fast Refresh warnings**, no errors.
- TypeScript and production build: pass. Build output contains third-party Zod annotation warnings.
- Contrast audit: **41 checks, zero failures**. Token sync: **58 tokens match**. Bundle-size guard: passes.
- Fixture-backed headless browser, **400px height**, light theme: 30-day, 90-day, and yearly charts, transaction creation, and customer creation pass at **360, 768, and 1440px** widths. Checks include popup bounds, horizontal overflow, amount clipping, and phone touch targets.
- Open navigation drawer: bounds and sidebar fill pass at **360, 390, and 768px**, **400px height**, both themes. Its final close-button contrast adjustment was separately rechecked.
- Browser requests were matched to local fixtures; these checks did not exercise the deployed Supabase database. The audit's synthetic button clicks do not establish physical-device focus restoration, so that remains a manual check.

Verdict: the reported layout defects have shared fixes and automated regression evidence. Fix customer-field clearing, amount validation, and misleading failure states next; verify database migration state before attributing deployed administrative failures to frontend code.

Not checked: every repository file, live production behavior, real iOS/Android keyboards, live OAuth redirects, SQL test execution, deployment migration state, dependency vulnerability audit, and sustained multi-user load. The deepest review covered shared UI, dashboard aggregation, customer creation/editing, transaction entry, query invalidation, business guards, and build/CI configuration; this is not a full security certification.

## Follow-up: View entries changes to the first bar

Moving away from a hovered period can send a cleared (`null`) tooltip index through Recharts' event callback. The chart accepted it and converted it with `Number(null)`, selecting index zero and changing both the readout and transaction link. Hover/click handlers now ignore cleared indices and retain the last valid period; explicitly selecting the first bar still works. The link continues to filter to the chosen bar's day/week/month.

A regression reproduces selecting a later bar, receiving cleared hover/click indices, and retaining the same link dates. Additional tests click the real chart link through to Transactions and check the visible date inputs, range label, detailed query, and totals query for daily, partial weekly, and monthly periods.

Those navigation tests also exposed a separate custom-range bug west of UTC: `new Date("YYYY-MM-DD")` was interpreted as UTC before being rounded to local midnight, shifting the query a day earlier. Custom filters now parse local midnight directly and advance the inclusive end date by one local calendar day, including across daylight-saving changes. The tests failed before the fixes and passed afterwards. All 49 targeted dashboard/transaction tests, lint, and TypeScript pass; timezone regressions were checked in India and Los Angeles.

PR preparation: the full verification gate was repeated successfully after the hover/date follow-up (731 tests). Source and documentation are submitted together; deployment and the unchecked manual acceptance steps remain pending.
