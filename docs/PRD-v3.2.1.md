# BahiKhata PRD v3.2.1: bug fixes and documentation sync

## 2. Story board (copy into `docs/PRD-v3.2.1.md` and `PROGRESS.md` in P-00)

| ID | Story | Source | Size |
|---|---|---|---|
| P-00 | Branch, baseline, owner confirmations, PRD file and board | | S |
| P-01 | Large amounts are rejected | review #2 | S |
| P-02 | Clearing customer contact details must clear them | review #1 | M |
| P-03 | Customer picker: error and retry, correct empty state | review #3 | S |
| P-04 | Customer picker: server-side search (large businesses) | review #8 | M |
| P-05 | Select a customer right after creating them in the sheet | review #9, B-07 | S |
| P-06 | Chase list: payment-history error state and the "owe" link | review #5, #7 | M |
| P-07 | Mobile customer card shows balance direction in words | review #4, B-11 | S |
| P-08 | "No customers yet" when every customer is archived | B-05 | S |
| P-09 | Archived customers on the dashboard: verify, test, document | B-06 | S |
| P-10 | CSV export: plain numbers are not prefixed | B-10 | M |
| P-11 | Repo-wide guard for bare `[...fr]` grid tracks | B-23 | S |
| P-12 | Loading headers keep the sort affordance; page size in the URL | B-02, B-03 | S |
| P-13 | Documentation sync (README, runbook, history, backlog, contract, release notes) | | M |
| P-14 | Final verification and pull request | | S |

Do P-01 to P-12 in order, then P-13 and P-14. P-12 is optional polish: do it only if
everything before it is done and verified; otherwise leave B-02 and B-03 open in
the backlog and say so.

---

## P-00 · Branch, baseline, confirmations (size S)

1. Create `fix/v3.2.1` from `master`.
2. Record the baseline in `PROGRESS.md`: `npm ci`, `npm run verify` (expect 89 test
   files / 730 passed / 1 skipped, the skip is the `.env`-dependent test),
   `audit:tokens`, `audit:contrast`, `audit:bundle`, `npm audit --omit=dev`, and
   one full responsive-audit run.
3. Add `docs/PRD-v3.2.1.md` containing the story board above and the story text
   below (it is the working spec for this patch, like `PRD-v3.2.md`).
4. Add the v3.2.1 story board to `PROGRESS.md` and the owner-confirmation record
   from section 1.

**Commit:** `docs(P-00): v3.2.1 baseline, owner confirmations and story board`

## P-01 · Large amounts are rejected (size S)

**Evidence.** `src/features/transactions/schemas.ts`, `amountField`: the "at most 2
decimals" check is `Math.abs(Math.round(value * 100) - value * 100) < 1e-9`.
`amountField.safeParse(1234567.89).success` is `false` (₹12,34,567.89 is rejected
with "Amount can have at most 2 decimals"). `100.1`, `99999.99`, `12345.67` pass.
The database column `transactions.amount` is unbounded `numeric`.

**Do.**
1. Replace the check with one that does not depend on a fixed floating tolerance,
   for example validate the decimal representation
   (`/^\d+(\.\d{1,2})?$/.test(String(value))` is safe up to the limit below; handle
   exponent forms such as `1e-7` as invalid) or integer-cents arithmetic with a
   tolerance scaled to the magnitude. Pick one, explain it in a code comment.
2. Add an explicit supported maximum, `MAX_AMOUNT = 999_999_999.99`, with the
   message "Amount must be ₹99,99,99,999.99 or less." (format through the one money
   formatter) and keep "Amount must be above zero".
3. The same rule applies everywhere an amount is parsed: search for other amount
   schemas or parsers (`entry` forms, import mapping `parseAmount`, the removed
   quick add must not reappear). Use one shared `amountField` where possible.
4. Tests (table-driven, in a focused `amountField` test): valid `0.01`, `1`, `100.1`,
   `99999.99`, `12345.67`, `1234567.89`, `9999999.99`, `999999999.99`; invalid `0`,
   `-1`, `0.001`, `1.234`, `1234567.891`, `1e-7`, `NaN`, `Infinity`,
   `1000000000`, `1000000000.01`. Add the "₹12,34,567.89 can be entered" scenario
   to the transaction sheet test.

**Commit:** `fix(P-01): accept valid large two-decimal amounts, with an explicit maximum`

## P-02 · Clearing customer contact details must clear them (size M)

**Evidence.** `CustomerFormDialog.tsx` (about lines 69 to 75) builds
`phone: form.phone || undefined`, `email`, `address`, `alternate_contact_name`,
`alternate_contact_phone`, `notes` the same way and `tags: splitTags(form.tags)`.
`updateCustomer` in `customers/api.ts` does `.update({ ...input, updated_at })`.
JSON drops `undefined`, so a cleared field is **not sent** and the old database
value stays while the save reports success. (`createCustomer` already maps
`input.phone ?? null`.)

**Do.**
1. On **edit**, send explicit `null` for every optional field the user cleared
   (phone, email, address, alternate contact name and phone, notes) and `null`
   for an empty tag list (the column is `text[]`; `null` and an empty array should
   both read back as "no tags", keep the same convention the create path uses).
   On **create** keep omitting empty fields. Make `CustomerInput`/`Partial` types
   allow `null` where needed.
2. Keep trimming: whitespace-only counts as cleared.
3. Tests: (a) component test: edit a customer that has all fields, clear each, save;
   assert the payload sent to `updateCustomer` contains `null` for each (not
   `undefined`, not missing); (b) API test: `updateCustomer` passes `null` through to
   the supabase `update` call; (c) a round trip with a stateful mock: clear, save,
   reopen the dialog, fields are empty; (d) create still omits empty fields.
4. Customer list, detail header and search must treat `null` phone/email as absent
   (they already do for create; assert it).

**Commit:** `fix(P-02): editing a customer can clear phone, email, address, alternate contact, notes and tags`

## P-03 · Customer picker: error and retry (size S)

**Evidence.** `src/components/CustomerCombobox.tsx` reads `data = []` and
`isLoading` and ignores `isError`. After a failed request it shows "No customers
yet." (about line 83) and offers to create another customer.

**Do.**
1. Show an error state with a **Retry** action (call `refetch`) before the empty
   state. The create-customer option is not offered while the list failed to load.
2. Use the shared `ErrorState` or the same wording and tone as other lists.
3. Tests: rejected request then retry succeeds (list appears, no duplicate-create
   prompt); empty list still shows "No customers yet." only on a successful empty
   result; axe on the error state.

**Commit:** `fix(P-03): the customer picker shows a load error with retry, not an empty business`

## P-04 · Customer picker: server-side search (size M)

**Evidence.** `CustomerCombobox` filters the array returned by `listCustomers`
once. A business with more customers than the API response limit (Supabase's
default is 1000 rows) cannot find customers beyond the returned window and is
offered "create new" instead. The Customers page already has a paged, searchable
query (`queryCustomers` with `search`, `status`, `page`, `pageSize`).

**Do.**
1. When the user types in the picker, query the existing paged search (debounced
   300 ms, active customers only, page size 20) and show the results. With an empty
   search show the first 20 alphabetically plus a muted line "Type to search all
   customers".
2. Resolve the currently selected customer separately by id (so it always displays
   even if it is not in the current result window).
3. Keep the "Add … as a new customer" option and the loading, error (P-03) and
   empty states.
4. Tests: a customer beyond the first response window is found by typing; the
   selected customer still displays when the result list changes; request is
   debounced; unchanged behaviour for small businesses.

**Commit:** `fix(P-04): the customer picker searches the server, so large businesses find every customer`

## P-05 · Select a customer right after creating them (size S)

**Evidence.** `TransactionSheet.tsx` and `CustomerFormDialog.tsx`: inline creation
refreshes the list but does not return the new customer to the open transaction
form; the user must open the picker and select them again.

**Do.** Give the create dialog an `onCreated(customer)` callback used by this
caller; set the form's `customer_id` to the new customer and keep the amount, type,
date, time and note the user already typed. Other callers of the dialog are
unchanged. Test: type an amount, create a customer inline, the customer is selected
and the amount is preserved.

**Commit:** `fix(P-05): a customer created from the transaction sheet is selected immediately (B-07)`

## P-06 · Chase list: payment-history errors and the "owe" link (size M)

**Evidence.** `ChaseList.tsx` and `dashboard/chase.ts`: while the last-payment query
is pending or failed the data falls back to `{}`, so every debtor shows "no
payments yet", which is wrong for a customer who has paid. The component has no
loading or error state for that query. Separately the "See all customers who owe"
link is `${paths.customers(businessId)}?sort=balance-desc` (about line 74) and omits
`status=owes`; existing tests pin the incomplete URL.

**Do.**
1. Distinguish **unavailable** history from a successful `null` (a real "never
   paid"). While loading show a neutral skeleton or "—" in the sub-line; on error
   show "Payment history unavailable" with a Retry action; "no payments yet" only
   for a successful `null`. The debtor rows and balances still render.
2. If the balances query behind the list can fail, give it an error state with
   Retry as well; check how the parent passes data and fix the whole chain.
3. Link: `?status=owes&sort=balance-desc`. Update the two test assertions that pin
   the old URL and add one that the target page shows only customers who owe.
4. Tests: last-payment query rejected with an existing debtor shows the neutral
   error, not "no payments yet"; retry succeeds; `AgeFlag` is not shown when the
   history is unavailable.
5. Browser audit: add or adjust the chase-list scenario (data) at all widths.

**Commit:** `fix(P-06): chase list separates unavailable payment history from never paid; link opens customers who owe`

## P-07 · Mobile customer card shows direction in words (size S)

**Evidence.** `CustomersPage.tsx`, the `mobile={(row) => …}` card: the amount is
`Math.abs(row.balance)` and the direction is only colour (a +500 and a −500
customer both read ₹500.00). The desktop cell adds "owes you" / "you owe" through
`balanceWords`.

**Do.** Show the same words on the card (visible sub-line) and include them in the
accessible name. Use the existing `balanceWords`. Test both signs and zero
("settled"). Add the card to the responsive audit's customers scenario with one
customer of each kind.

**Commit:** `fix(P-07): mobile customer cards state who owes whom in words (B-11)`

## P-08 · "No customers yet" when every customer is archived (size S)

**Evidence.** BACKLOG B-05. With the default filter and zero active customers but
some archived ones, the empty state says "Add your first customer".

**Do.** On `CustomersPage`, when the result is empty, there is no search text and
the status is not `archived`, check whether archived customers exist (one extra
`queryCustomers({ status: "archived", pageSize: 1 })` only in this case). If they
do, show "All your customers are archived" with two actions: **Show archived**
(sets `status=archived`) and **Add customer**. Otherwise keep today's text. Tests
for both states and axe. Add the state to the responsive audit if a fixture is cheap.

**Commit:** `fix(P-08): the customers page says when every customer is archived (B-05)`

## P-09 · Archived customers on the dashboard (size S, no SQL migration)

**Correction to the backlog.** B-06 says Today activity is "deliberately
transaction-derived" and includes archived customers' entries. That note is stale.
In the v3 SQL, `dashboard_summary`'s `today` part joins `customers` and filters
`c.archived_at is null`, and `daily_activity` does the same, so **Today, Position
and the Activity chart already agree**: they all exclude archived customers.

**Do.**
1. Add SQL **test** assertions (no migration) to the suite: with one archived
   customer who has an entry today, `dashboard_summary`'s `today_count` and
   `today_net` exclude it and `daily_activity` for today agrees; unarchiving brings
   it back into both. Run the suite on the scratch database; it must end
   `==> SQL tests passed`. Prove the assertions can fail (mutate, see red, restore).
2. Check what the **Transactions page** shows for `range=today`: the Position sheet
   links the "Today" line to it. If that list includes archived customers' entries
   the count and the list can differ by those entries. Verify with a test or the
   browser. If it differs, add a muted suffix to the Today line (for example
   "active customers") or pass a parameter that makes the list match; choose the
   smaller change and record it.
3. Write the rule in `UI-CONTRACT.md` ("Dashboard figures exclude archived
   customers; the customer list and Transactions page are the places to see them")
   and mark B-06 resolved in `BACKLOG.md` with the corrected explanation.

**Commit:** `test(P-09): pin that dashboard figures exclude archived customers; document the rule (B-06)`

## P-10 · CSV export: plain numbers are not prefixed (size M)

**Evidence.** `src/features/import-export/csv.ts`: `FORMULA_PREFIX = /^[=+\-@]/` and
`escapeCsvCell(value: string | number)` prefix any cell that begins with `-`, so a
plain negative amount exports as text (apostrophe + `-500`) and stops summing in a
spreadsheet. Export callers: Transactions, Customers, statement, Recently deleted
(`TransactionsPage`, `CustomersPage`, `DeletedItemsPage`, `Settings`/`DangerZone`).

**Do.**
1. Keep the formula-injection protection for **text**: any string beginning with
   `=`, `+`, `-`, `@` (and tab or carriage return) stays prefixed.
2. Add an explicit numeric cell type (for example `csvNumber(n)` or
   `{ kind: "number", value }`) used only by columns that are genuinely numeric
   (amounts, balances, counts). A number cell is written as a plain number
   (`-500`, `1234.5`), never prefixed, never quoted. A numeric-looking **string**
   such as a note "-5" is still text and still prefixed.
3. Update every export builder to mark its numeric columns; the safest default for
   an unmarked cell is text.
4. Tests: negative amount exports `-500` and sums in a parse-back test; notes and
   names `=1+1`, `+SUM(A1)`, `-cmd|' /C calc'!A0`, `@x`, `-5` (as text) are
   prefixed; quotes, commas and newlines are still escaped; each export's header
   and a sample row snapshot.

**Commit:** `fix(P-10): numeric CSV cells are exported as numbers, text keeps the formula guard (B-10)`

## P-11 · Repo-wide guard for bare `[...fr]` grid tracks (size S)

**Evidence.** `src/test/gridGuard.test.tsx` renders only the Dashboard and Settings.
The bug class (a bare `1fr` track widening the page) caused the L-14 horizontal
scroll. BACKLOG B-23.

**Do.** Add a source-scan test (like `iconButtonGuard`, using the TypeScript
compiler API or a careful regex over `src/**/*.tsx`, excluding tests and
`features/dev`) that fails on any arbitrary `grid-cols-[...]` value containing `fr`
that is not inside `minmax(0, …)`, reporting `file:line`. Allowlist only with a
one-line reason. Prove it works: temporarily add a bad class, see it fail, remove
it. Keep the existing render assertions.

**Commit:** `test(P-11): repo-wide guard for bare fr grid tracks (B-23)`

## P-12 · Optional polish (size S): B-02 and B-03

Only if P-01 to P-11 are done and verified.
- **B-02:** the `DataTable` loading branch renders plain `<th>`s; keep the sort
  affordance (`role`, `aria-sort`, cursor) on loading headers so the layout does
  not jump. Update the test that pinned the old behaviour.
- **B-03:** keep `pageSize` in the URL (`pageSize` param, validated against the
  allowed sizes, default dropped from the URL) for Customers and Transactions, so
  reload and shared links keep the rows-per-page. Tests for parse, default and an
  invalid value.

**Commits:** `fix(P-12): loading table headers keep the sort affordance (B-02)` and
`feat(P-12): rows per page in the URL (B-03)`

---

## P-13 · Documentation sync (size M)

Do all of these; each is part of "done" for the patch.

1. **`README.md`** (the migration facts are wrong in three places):
   - Stack table: "seven migrations … (v3.2 chain)" is correct; change "(23
     sections)" to **24**.
   - Setup step 2 says "Apply the **three v3.1 migrations**". List **all seven** in
     filename order with one line each (`20261017…consolidated_schema`,
     `20261101…v3_deletion_log_and_integrity`, `20261108…v31_last_payment_at`,
     `20261201000000…transaction_revisions`, `20261201000100…deletion_log_purge`,
     `20261201000200…ownership_transfer`, `20261201000300…bulk_actions`), say they
     are applied once, in order, and that the four v3.2 files are re-runnable but
     frozen. Point to the "v3 database rollout" and "v3.2 database rollout"
     sections of `docs/MANUAL_STEPS.md`.
   - Project structure: "the three v3.1 migrations" becomes "the seven migrations";
     the `docs/` list must include `PRD-v3.2.md`, `PRD-v3.2.1.md`,
     `RELEASE-NOTES-v3.2.md`, `RELEASE-NOTES-v3.2.1.md`, `MOBILE-DASHBOARD-*`.
   - Check the scripts table (`test:sql` description) and every other count.
2. **`docs/MANUAL_STEPS.md`**:
   - "Production status": replace `YYYY-MM-DD` with `2026-11-02 (UTC, from the
     deployment time recorded in HISTORY_START_DATE; the owner corrects it if the
     migrations were applied on another day)`.
   - Add a "v3.2.1" section: **no database changes**; deploy the client only;
     the standing "Is production on the fixed version?" check stays.
3. **`docs/PROGRESS.md`**:
   - Restore the v2 S-42 history. Line about 89 currently reads "SQL now passes all
     24 sections on local scratch PostgreSQL 17.11 … **End state: 43/43 stories
     Done, master untouched, branch `feat/v2-multi-business` pushed.**" That is v3.2
     text written into a v2 record. Find the original wording with
     `git log -p -S"End state: 43/43" -- docs/PROGRESS.md` (the version before
     commit `7be8529`) and restore it exactly. Keep the v3.2 SQL result only in the
     v3.2 sections.
   - Owner validation record (section 1) and: change the open
     `[ ] CI sql job green - not confirmed on GitHub` item to confirmed "per owner
     statement"; mark the Phase E "Human look…" items, the v3.2 "Human Verification
     Checklist" items and the S-77 "Human Do.1 visual pass" as accepted by the owner
     on the deployed v3.2 code **per owner statement** (do not invent per-item
     detail; do not say you verified them).
4. **`docs/BACKLOG.md`**: mark done with hashes B-05, B-07, B-10, B-11, B-23 (and B-02,
   B-03 if P-12 was done); mark B-06 resolved with the corrected explanation from
   P-09. Rewrite the "Mobile/dashboard review follow-ups" paragraph: all nine
   findings fixed in v3.2.1 (hashes). Add an **Operations** section with three open
   items: a staging Supabase project (prerequisite for B-15; never run end-to-end
   tests against production), confirmation that production has automated backups or
   point-in-time recovery, and runtime error reporting. Add to B-15's row that it
   needs the staging project.
5. **`docs/MOBILE-DASHBOARD-REVIEW.md`**: append "Fixed in `<hash>` (v3.2.1)" under
   each of the nine findings; do not rewrite the findings.
6. **`docs/UI-CONTRACT.md`**: add the rules introduced here: amount validation and
   the maximum; edit semantics for optional customer fields (cleared means `null`);
   list and picker error states with Retry; the chase list's unavailable/never-paid
   distinction; direction words on mobile cards; the all-archived empty state;
   CSV number cells versus text; the dashboard archived-customer rule (P-09). Do
   not describe the chart as diverging; the contract already (correctly) says
   grouped bars.
7. **`docs/RELEASE-NOTES-v3.2.1.md`**: what changed for users, what did **not**
   change (database), the fixes with one line each, and how to roll back (redeploy
   v3.2; nothing to undo in the database).
8. **`docs/PRD-v3.2.md`**: do not edit it. Where this patch contradicts it (the
   chart is grouped bars, decided by the owner in the mobile branch), record one
   `V-xx` in `PROGRESS.md` saying so.

**Commit:** `docs(P-13): README migrations, runbook, restored v2 history, backlog, contract and release notes`

## P-14 · Final verification and pull request (size S)

1. On a clean clone, with **no `.env`**: `npm ci`, `npm run verify` twice, `npm run
   audit:tokens`, `npm run audit:contrast`, `npm run audit:bundle`,
   `npm audit --omit=dev`; the SQL suite on the scratch database (expect
   `==> SQL tests passed`, section count and labels in the output); the full
   responsive audit (five widths, both themes, all scenarios including the new
   ones). Record the numbers next to the baseline.
2. Zero audit failures are required. List any exception as a `V-xx` and say who
   approved it.
3. Write the human checklist for the owner in `PROGRESS.md`: amount `1234567.89`
   enters; clearing a customer's phone and email saves and sticks; picker error
   with the network off, then retry; search finds a customer in a large business;
   inline-created customer is selected; chase list with the payment-history request
   failing; the "owe" link; mobile card words for owes and credit; all-archived
   empty state; CSV export opens in a spreadsheet with a negative amount summing;
   `/customers?pageSize=25` reload (if P-12).
4. Open the pull request `fix/v3.2.1` into `master` with
   `RELEASE-NOTES-v3.2.1.md` as the description. Do not merge or deploy.

**Commit:** `chore(P-14): v3.2.1 release candidate verified`

