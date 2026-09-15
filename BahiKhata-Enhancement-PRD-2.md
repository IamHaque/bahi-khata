# BahiKhata — Code Review & Enhancement PRD (Round 2)

**Status:** Ready for build — reviewed against the actual `IamHaque/bahi-khata` repository (master, 7 commits)
**Scope of this document:** (1) findings from a direct code review, including confirmed functional bugs and architectural issues, (2) a new global "Quick Add Transaction" capability with a customer picker, (3) a visual design refresh, (4) a unified table system, (5) schema-as-code, test coverage, and architectural cleanup, and (6) a tightened commit process. Written in the same BDD/story format as `BahiKhata-PRD.md` — treat this as an addendum, not a replacement.

---

## 0. Engineering Standards (Non-Negotiable — Applies to Every Story in This Document)

This section exists because "add features" and "keep the codebase sound" are different jobs, and the second one silently loses if it isn't written down. Every Story in this document — and every Story in the original PRD still being worked on — must satisfy these, not as aspirational advice but as acceptance criteria the build agent checks before calling a Story done.

**Single Responsibility.** A React component's job is rendering UI and handling its own local interaction state — nothing else. Data access (talking to Supabase) belongs in `src/lib/*.ts`. Cross-cutting logic used by more than one screen (validation rules, sorting, debouncing, CSV parsing) belongs in a shared hook or a shared pure function, not inline inside a component. If a file is doing two of these jobs at once, it's doing too much.

**Dependency Inversion — pages depend on the data-access layer, never on Supabase directly.** Every page in this app should import from `src/lib/customers.ts` / `src/lib/transactions.ts`, and never import `supabase` from `@/lib/supabase` itself. This is a concrete, checkable rule, not a vague principle — see GAP-004 below for the one place it's currently broken.

**DRY — if it's written twice, it gets extracted before a third copy is allowed.** Validation logic, debounce hooks, and sort-state logic each currently exist in more than one file (see GAP-004, GAP-003). The rule going forward: the moment a second screen needs the same logic, extract it in that same Story — don't wait for a dedicated cleanup pass to justify letting a third copy happen.

**Open/Closed via configuration, not conditionals.** Shared components (`DataTable`, the transaction form) should be extended by passing them different configuration (columns, props, render functions), not by adding `if (screenName === "customers")`-style branching inside the shared component itself.

**Interface Segregation.** Shared hooks and components should expose the minimum props a consumer actually needs. Don't design `CustomerCombobox` to require balance data if a given usage never displays it; don't make every consumer of `DataTable` pass sorting props if that instance isn't sortable.

**Separation of Concerns, three distinct layers, always:** presentation (JSX + Tailwind classes) → domain/business logic (balance derivation, validation rules, CSV grouping — plain TypeScript functions, easily unit-tested, see EPIC-011) → data access (`lib/*.ts`, the only layer allowed to import `supabase`). A single file mixing more than one of these layers is a signal to split it, not a style preference.

**YAGNI, stated explicitly so it isn't mistaken for negligence.** Not every theoretical scaling concern gets built now — pagination, for instance, is flagged below as a real future need but deliberately **not** turned into a Story yet, because building it before there's real data volume to justify it would be speculative engineering, which is its own kind of waste. Section 10 explains this trade-off directly rather than silently doing nothing.

---

## 1. Code Review Findings

I cloned the repo and read the actual source (not just the file listing) before writing anything below. Three things worth your attention, in priority order.

### BUG-001 (Critical — fix first, before any new feature work) — Customers List shows fake balances

**File:** `src/pages/CustomersPage.tsx`, lines 29–34

```ts
function getBalance(_customer: Customer): number {
  // Balance is derived from transactions (Section 22).
  // Until transactions exist (EPIC-003), all balances are 0.
  // This will be replaced with a real query once EPIC-003 is built.
  return 0;
}
```

This was a reasonable placeholder while EPIC-003 (Transaction Ledger) didn't exist yet. **EPIC-003 is now built** (`c38a1db feat: EPIC-003 (Transaction Ledger) + STORY-012`), and `getAllCustomerBalances()` already exists and is already correctly used on the Dashboard (`src/pages/Dashboard.tsx`, line 26). But `CustomersPage.tsx` was never updated to call it — it still hardcodes every customer's balance to `0`. **Every customer in the Customers List currently shows "Settled" regardless of their real balance.** This is the same underlying data the Dashboard already fetches correctly, just not wired into this one screen.

**Fix (STORY-022, Section 12 below, has the full spec):** Replace the stub with a real fetch of `getAllCustomerBalances()` (already imported and used correctly elsewhere — no new backend logic needed), and merge it in exactly the way `Dashboard.tsx` already does.

### GAP-001 (Your primary complaint) — No entry point to add a transaction except via a specific customer

**Files:** `src/components/AddTransactionSheet.tsx`, `src/pages/CustomerDetailPage.tsx` (only place it's used — confirmed via repo-wide search, zero other references)

`AddTransactionSheet` requires a `customerId` prop and is only ever rendered from inside `CustomerDetailPage.tsx`. There is no customer picker anywhere in the component, and no "Add Transaction" action exists on the Dashboard, header, or Customers List. To log a transaction today you must: open Customers → find the customer → open their detail page → tap Add Transaction. This exactly matches what you described. Section 4 below (EPIC-007) specifies the fix.

### GAP-002 — Visual design is the untouched default shadcn theme

**File:** `src/index.css`, `components.json`

```json
"baseColor": "neutral"
```

```css
--background: oklch(1 0 0);
--foreground: oklch(0.145 0 0);
--primary: oklch(0.205 0 0);
/* ...every non-financial token is oklch(x 0 0) — pure grayscale, zero hue, zero character */
```

The build agent correctly implemented the **financial** semantic tokens (`--receivable`, `--credit`, `--settled`) that the original PRD asked for, and correctly avoided gradients/chip-soup/card-nesting. But everything else — background, primary, borders, radius (`0.625rem`, the shadcn default), font (Geist Variable, the shadcn default) — is the stock "neutral" shadcn preset, completely untouched. This is why it reads as generic: it's not wrong, it's just the out-of-the-box template with financial colors bolted on, not an intentionally-designed "Soft/Calm, editorial numeric hierarchy" system as Section 20 of the original PRD called for. Section 5 below (EPIC-008) specifies an actual design pass.

### PROCESS-001 — Commit cadence was per-Epic, not per-Story

```
e53f335 data: Test data to be imported
1d040ac chore: Polish pass - motion, toasts, accessibility
c9da945 feat: STORY-017 (Extended Customer Profile Fields)
5ba28f1 feat: EPIC-006 (Transactions Reporting & Enhanced Browsing)
35983ae feat: EPIC-004 (Dashboard & Summary Analytics)
c38a1db feat: EPIC-003 (Transaction Ledger) + STORY-012 (back-dated entries)
f75b7b3 feat: EPIC-001 (Auth) + EPIC-002 (Customer Management) + EPIC-005 foundation
```

The agent did commit (this wasn't actually missing), but most commits bundle an entire Epic (sometimes two) into one commit. That's too coarse — if something breaks, you can't isolate which Story caused it, and you can't `git revert` just one piece of functionality. Section 13 below adds an explicit per-Story commit rule for all future work, including everything in this document.

### BUG-002 — Dashboard "Today's Activity" doesn't actually pre-filter the Transactions page

**Files:** `src/pages/Dashboard.tsx` line 198, `src/pages/TransactionsPage.tsx` line 129

```tsx
// Dashboard.tsx — the link carries no information about "today":
<Link to="/transactions" className="...">

// TransactionsPage.tsx — always defaults to this-month regardless of how you arrived:
const [datePreset, setDatePreset] = useState("this-month");
```

The original PRD's STORY-013 acceptance criteria explicitly required that clicking "Today's Activity" on the Dashboard lands on the Transactions page pre-filtered to today. It doesn't — clicking through always shows "This Month" instead, silently showing the wrong range. Section 6 (STORY-026) fixes this alongside the table consistency work, since both touch `TransactionsPage.tsx`'s filter-initialization logic.

### GAP-003 — Every table/list in the app looks and behaves differently

**Files:** `src/pages/TransactionsPage.tsx`, `src/pages/CustomersPage.tsx`, `src/pages/CustomerDetailPage.tsx`, `src/components/ui/table.tsx`

A grep across the codebase shows `src/components/ui/table.tsx` — the shadcn Table primitive — is **installed but imported nowhere**. Instead:

- `TransactionsPage.tsx` hand-rolls a raw `<table>` with its own sort-toggle logic (`toggleSort`, local `sortBy`/`sortDir` state) and its own `useDebounce` hook defined inline.
- `CustomersPage.tsx` uses an entirely different pattern — `<div role="list">` of clickable `<button>` rows, no `<table>` element at all, and its **own separate copy** of the same `useDebounce` hook.
- `CustomerDetailPage.tsx`'s transaction history also uses `<div role="list">`, with **no sorting at all** — it's permanently fixed to most-recent-first with no user control.
- Dashboard's "Top Outstanding Balances" is a third, simpler ad hoc row pattern, and "Today's Activity" is just a single summary line/link, not a table at all, even though it's summarizing tabular data.

Three different row-rendering patterns, duplicated sort/debounce logic, and only one of four transaction/customer-listing screens has any sorting. Section 6 (EPIC-009) consolidates all of this into one shared, consistent table.

### GAP-004 — Data-access layer is bypassed in one place, and validation logic is duplicated in three

**Files:** `src/pages/TransactionsPage.tsx` line 13; `src/components/AddTransactionSheet.tsx`, `src/components/EditTransactionSheet.tsx`

Every other page in this app reads/writes data through `src/lib/customers.ts` or `src/lib/transactions.ts`. `TransactionsPage.tsx` is the one exception — it imports `supabase` directly (`import { supabase } from "@/lib/supabase"`) and builds its own query (`supabase.from("transactions").select("*, customers(name, phone)")...`) instead of going through the data-access layer like everything else. This is a Dependency Inversion violation (Section 0): if the schema or query logic ever changes, there are now two places to update instead of one, and this page can silently drift out of sync with the rest of the app's data rules.

Separately, `EditTransactionSheet.tsx` has its **own independently written** `validate()` function — the same amount/date rules already implemented in `AddTransactionSheet.tsx`, copy-pasted rather than shared. This was already flagged as a two-way duplication in Section 4's STORY-018 Technical Notes (in the context of the new Quick Add sheet), but it's actually a **three-way** duplication once Quick Add is added — Add, Edit, and Quick Add would each have their own copy of the same rules. Section 9 (EPIC-012) fixes both of these together, since they're both instances of the same underlying problem (Section 0's Separation of Concerns / DRY rules not being followed consistently).

### RISK-001 — No version-controlled database schema

**Files:** none — that's the finding. There is no `supabase/migrations/` folder, no `.sql` file, and no schema definition anywhere in the repository.

The entire table structure (`customers`, `transactions`) and — critically — whatever Row Level Security policies exist protecting this data live only inside the Supabase dashboard, invisible to version control. For most apps that's a minor process gap. For a ledger app whose entire value proposition is "you can trust these numbers," it means: no audit trail of schema changes, no reproducible way to stand up a new environment, and no way for anyone reviewing this repository to verify RLS is actually configured correctly without manually checking the dashboard. Section 7 (EPIC-010) fixes this.

### RISK-002 — Zero automated test coverage

**Files:** none exist; confirmed via `find . -iname "*.test.*"` returning nothing, and no `test` script in `package.json`.

`getCustomerBalance`, `getAllCustomerBalances` (`lib/transactions.ts`), and the CSV row-validation/customer-grouping logic (`lib/csv-import.ts`) are all pure functions — no side effects, cheap to test — and they are exactly the functions where a silent regression means someone's balance is quietly wrong, with nothing surfacing it except a human noticing by chance. This is the highest-value place in the entire codebase to have test coverage, and currently the only place with none. Section 8 (EPIC-011) adds it.

### PERF-001 — Balance calculations happen client-side

**Files:** `src/lib/transactions.ts` (`getCustomerBalance`, `getAllCustomerBalances`)

Both functions fetch every relevant transaction row to the browser and reduce/sum in JavaScript. This was already flagged as a performance requirement in the original PRD (Section 25: "computed via an efficient aggregate query...not by pulling every transaction into the client") but is exactly what's implemented. It works fine at today's data volume; it will slow down and ship more transaction detail to the client than necessary once years of imported history accumulate — precisely the scenario the original PRD designed for. Section 9 (EPIC-012) replaces this with a Postgres view/RPC.

### BUG-003 — CSV import date parsing can shift dates by a day

**File:** `src/lib/csv-import.ts`, date parsing via `new Date(value)`

A plain date string like `"2024-01-15"` is parsed by JavaScript's `Date` constructor as UTC midnight. When that value is later formatted for display in a browser west of UTC, it can render as `2024-01-14` — a real, user-visible off-by-one-day bug specifically for imported historical transactions, which is exactly the data this feature exists to bring in accurately. Section 10 (EPIC-013) fixes this.

_(Round 3 note: fixed in commit `40451c1`, verified by STORY-030's regression test — closed.)_

### GAP-005 (Round 3) — Dark mode exists in CSS but is completely unreachable

**File:** `src/index.css`, no matching toggle anywhere in `src/`

`.dark { ... }` is fully defined with correctly-adjusted colors (confirmed by direct inspection). But nothing in the codebase ever adds the `dark` class to anything — no theme context, no toggle component, no `prefers-color-scheme` media query. This is dead code: a complete dark theme a user can never actually see. This isn't a bug in the strict sense (nothing is broken) — it's a Story I never wrote in Round 2, despite the original PRD's Section 14 requiring dark mode "from the beginning." EPIC-014 (this round) fixes it.

### GAP-006 (Round 3) — App shell has no mobile navigation strategy

**File:** `src/components/AppLayout.tsx`

The header renders the logo, all three nav links (`Dashboard`/`Customers`/`Transactions`), the Add Transaction button, the signed-in user's email, and sign-out — all inline, all the time, with zero responsive collapse logic (confirmed: no hamburger, no breakpoint-conditional rendering of the nav itself; only the Add Transaction button has a `sm:hidden`/`sm:flex` icon-vs-label swap). On a narrow phone this header has no room to breathe. EPIC-015 (this round) fixes this.

### GAP-007 (Round 3) — Customer picker uses a fragile nested-overlay pattern on mobile

**Files:** `src/components/CustomerCombobox.tsx`, `src/components/ui/popover.tsx`

`CustomerCombobox` is a `Popover` (absolutely positioned, width pinned to `[--radix-popover-trigger-width]`) rendered **inside** a bottom `Sheet` (already a fixed-position overlay). This exact nesting is what caused the `cmdk` crash already fixed once this round (commit `0fcd43b`) — the underlying pattern (overlay-inside-overlay) is still fragile even after that fix, and Popovers specifically are a poor fit for small viewports: they're positioned relative to their trigger rather than taking over the screen, awkward to tap accurately, and easy to render partially off-screen near a viewport edge — exactly where a bottom sheet's trigger tends to sit. EPIC-015 (this round) replaces this with a viewport-aware pattern: Popover on desktop, full-screen picker on mobile.

---

## 2. What Was Actually Requested vs. Built So Far

Going through your brainstorm point by point, so nothing gets lost:

| You said                                                                        | Status                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| "no easy way to add a transaction besides going to the customer"                | **Confirmed gap (GAP-001).** Fixed by EPIC-007 below.   |
| "a simple page from the dashboard...I press the button"                         | EPIC-007, STORY-018 — global action, not tucked away    |
| "customer name and stuff...menu" (a picker)                                     | EPIC-007, STORY-018 — searchable combobox               |
| "customer is also pre-populated...list of available customers is shown"         | EPIC-007, STORY-018                                     |
| "an option to add a customer if I want to create it from that screen"           | EPIC-007, STORY-019 — inline create, no navigating away |
| "UI doesn't look as good as I want"                                             | GAP-002 → EPIC-008 (design refresh)                     |
| Tables should look similar, share standard design, sorting/filtering everywhere | GAP-003 → EPIC-009 (unified table system)               |
| "periodically committing the code"                                              | PROCESS-001 → Section 13                                |

---

## 3. New Component & File Plan (Overview)

Before the stories — the concrete file-level shape of the change, since you asked for code-block-level and file-structure-level detail.

**New files:**

```
src/components/ui/command.tsx          — shadcn Command primitive (for the searchable customer picker)
src/components/ui/popover.tsx          — shadcn Popover primitive (wraps the Command for a combobox pattern)
src/components/CustomerCombobox.tsx    — new: searchable customer picker + "Add new customer" affordance
src/components/QuickAddTransactionSheet.tsx — new: customer-agnostic version of AddTransactionSheet
src/components/DataTable.tsx           — new: shared sortable table wrapper used by every table/list in the app (EPIC-009)
src/hooks/useDebouncedValue.ts         — new: extracted shared debounce hook (currently duplicated in CustomersPage.tsx and TransactionsPage.tsx)
src/hooks/useSort.ts                   — new: extracted shared column-sort state hook (currently reimplemented locally in TransactionsPage.tsx)
```

**Modified files:**

```
src/components/AppLayout.tsx           — add a persistent header-level "Add Transaction" button
src/pages/Dashboard.tsx                — add a prominent Quick Add entry point; convert "Today's Activity" into a live preview table (EPIC-009); fix the pre-filter link (BUG-002)
src/pages/CustomersPage.tsx            — fix BUG-001 (wire in getAllCustomerBalances); convert to <DataTable> (EPIC-009)
src/pages/CustomerDetailPage.tsx       — convert transaction history to <DataTable>, adding sorting where none existed (EPIC-009)
src/pages/TransactionsPage.tsx         — refactor its existing raw <table> onto the shared <DataTable> component; fix BUG-002 (read an initial filter from the URL)
src/components/AddTransactionSheet.tsx — extract shared form internals so QuickAddTransactionSheet doesn't duplicate validation logic (see STORY-018 Technical Notes)
src/index.css                          — design refresh (EPIC-008)
components.json                        — baseColor change if the shadcn CLI is re-run for new components
package.json                           — add `cmdk` dependency (required by shadcn's Command component)
```

**No changes needed to:** `src/lib/transactions.ts` (`createTransaction` already takes an arbitrary `customer_id` — it was already built generically, it's only the UI layer that's missing), `src/lib/customers.ts` (`listCustomers()` already returns everything a picker needs), the Supabase schema, or any route in `App.tsx` (this is a sheet/dialog overlay, not a new page).

---

## 4. EPIC-007 — Quick Add Transaction (Global Entry Point)

**Objective:** Let the owner or staff log a transaction from anywhere in two actions — open the picker, pick or create the customer — instead of the current three-screen path (Customers → find → Detail → Add Transaction).
**Scope:** A persistent, globally-reachable "Add Transaction" action; a searchable customer combobox; inline customer creation from within that same flow.
**Out of Scope:** Changing how `AddTransactionSheet` behaves once a customer is selected — the form itself (type/amount/date/note, validation, balance context) is correct as built and is reused as-is.
**Dependencies:** None new — reuses `createTransaction` (`lib/transactions.ts`), `listCustomers`/`createCustomer` (`lib/customers.ts`), all already correct.
**Design Considerations:** Per the original PRD's hierarchy rule (Section 11), this new action must not compete with the Dashboard's two totals for visual dominance — it should read as a clearly-available, calm action, not a loud CTA. A header-level button (always present, on every screen) plus a lightweight Dashboard entry point both route to the same component.
**Technical Considerations:** `AddTransactionSheet` currently hardcodes a known `customerId`. Rather than duplicating its form logic, extract the form body (type/amount/date/note fields, validation, submit handling) into a shared internal component that both `AddTransactionSheet` (customer known, launched from Customer Detail) and the new `QuickAddTransactionSheet` (customer chosen via combobox) render — see STORY-018's Technical Notes for the exact split.

### STORY-018 — Global "Add Transaction" Action with Customer Picker

> As a user,
> I want to open an "Add Transaction" action from anywhere in the app and pick the customer from a searchable list,
> so that I can log a transaction in a couple of taps without navigating to that customer's page first.

**Context:** This is the direct fix for your stated pain point. It sits alongside, not instead of, the existing per-customer "Add Transaction" button on Customer Detail (that one still makes sense when you're already looking at a customer).

**Requirements:**

- A "+ Add Transaction" button is always visible in the app header (`AppLayout.tsx`), reachable from every screen without navigating away.
- Clicking it opens `QuickAddTransactionSheet`, which shows: a customer picker (searchable combobox, see STORY-019 for its "create new" behavior) as the **first** field, followed by the same Type/Amount/Date/Note fields already built in `AddTransactionSheet`.
- Once a customer is selected, their current balance appears as context (identical treatment to the existing sheet — "Current balance: ₹X owed").
- Until a customer is selected, Type/Amount/Date/Note fields are present but the Save button is disabled (you cannot save a transaction with no customer).
- On save, behaves identically to the existing flow: toast confirmation, sheet closes, and — critically — whichever screen you're on refreshes if it displays data affected by the save (e.g., if you're on the Dashboard when you Quick-Add a transaction, the totals and Today's Activity update without a manual page reload).

**UX Behavior:** Header button → Sheet opens from the bottom (mobile) / side (desktop), consistent with the existing `AddTransactionSheet` motion. Customer field is focused first. Typing filters the list live. Selecting a customer reveals the rest of the form (or the rest of the form is always visible but disabled — either is acceptable; disabled-until-selected is simpler and is the specified default).

**UI Components:** `Sheet` (reused), new `CustomerCombobox` (built on `Popover` + `Command`, both newly added via `npx shadcn@latest add popover command`), existing `Input`/`Label`/`Button` for the shared form fields.

**States:**

- Sheet closed (default)
- Sheet open, no customer selected yet — Save disabled
- Sheet open, customer selected — full form active, current balance shown
- Saving (button loading state, identical to existing sheet)
- Save error (identical inline treatment to existing sheet)
- Combobox: no customers exist at all yet (empty state inside the combobox: "No customers yet — add one below" pointing at the create action, see STORY-019)
- Combobox: search has no matches ("No customers match '<query>'" + the same create-new affordance)

**Validation:** Customer selection is required to enable Save (new rule, specific to this entry point — the existing per-customer sheet doesn't need this check since the customer is already fixed by context). Amount/Date validation is identical to the existing sheet (reused, not reimplemented).

**Accessibility:** Combobox is a proper `combobox`/`listbox` pattern (this is what shadcn's `Command`+`Popover` combination provides out of the box) — keyboard-navigable (arrow keys, Enter to select, Escape to close), with the currently-highlighted option announced. The header button has a clear accessible name ("Add Transaction") distinguishable from the per-customer one if both are ever visible in the same view (they won't be, in practice, since the per-customer one only appears on Customer Detail).

**Responsive:** On mobile, the header button can collapse to an icon-only button (a "+" icon, `lucide-react` already a dependency) to conserve header space, with an accessible label still present via `aria-label`. Combobox list scrolls independently of the sheet if the customer list is long.

**Motion:** Sheet open/close reuses the existing transition (Section 19 of the original PRD, already implemented). No new motion needed for the combobox itself — standard Popover open/close is sufficient; no arbitrary decoration.

**Technical Notes:**

- Split `AddTransactionSheet.tsx`'s current form body (everything from the `type` state through the `SheetFooter`) into a shared internal component, e.g. `TransactionFormFields`, parameterized by `customerId: string | null` and `currentBalance: number | null`. `AddTransactionSheet` keeps its existing external API (always has a known `customerId`) and renders `TransactionFormFields` with it fixed. `QuickAddTransactionSheet` renders the same internals but manages `customerId` as local state driven by `CustomerCombobox`, fetching that customer's balance (`getCustomerBalance(customerId)`, already exists in `lib/transactions.ts`) once selected.
- This avoids the trap of copy-pasting the validation logic (amount > 0, date not in future) into a second file, which would let the two forms silently drift apart over time.
- `CustomerCombobox` needs a list of customers with balances for potential future use (e.g., showing balance inline in the picker), but for v1 of this story, a plain `listCustomers()` call is sufficient — no need to also fetch balances just for the picker unless you want them shown inline (optional nice-to-have, not required).
- Refreshing the current screen after a Quick Add save: the simplest correct approach is a shared refetch callback — e.g., a lightweight event bus or a shared "data changed" context that `Dashboard.tsx`, `CustomersPage.tsx`, and `TransactionsPage.tsx` each subscribe to and refetch on. Do not solve this by prop-drilling a refetch function through `AppLayout` into every page — that couples the layout to every page's internals. A simple `useSyncExternalStore`-based event emitter, or even just calling `window.dispatchEvent(new CustomEvent("transaction-saved"))` and having each page's existing `fetchData`/`fetchCustomers` effect listen for it, is enough for this app's scale — no need for a heavier state library.

**Dependencies:** STORY-019 (the combobox's create-new affordance) is tightly coupled — build them together.

**Acceptance Criteria:**

- Given any screen in the app, when the user looks at the header, then an "Add Transaction" action is visible and reachable without navigating away from the current page.
- Given the Quick Add sheet is open with no customer selected, when the user attempts to click Save, then Save is disabled and cannot be triggered.
- Given the user selects a customer from the combobox, then that customer's current balance appears in the sheet exactly as it does in the existing per-customer Add Transaction flow.
- Given a valid transaction is saved via Quick Add while the Dashboard is the active screen, then the Dashboard's totals and Today's Activity reflect the new transaction without a manual page refresh.
- Given the same save while the Customers List is active, then that customer's balance in the list updates (this also depends on BUG-001 being fixed first — see STORY-022).

**Definition of Done:** Verified that a transaction logged via Quick Add is indistinguishable in the database and in Customer Detail history from one logged the original way — same table, same validation, same audit behavior — and that whichever screen was open at the time reflects the change without a manual refresh.

### STORY-019 — Inline "Add New Customer" from the Transaction Picker

> As a user,
> I want to create a brand-new customer directly from the Add Transaction picker if they're not already in the list,
> so that I don't have to cancel out, go add the customer separately, and start over.

**Requirements:** When the combobox search finds no matching customer, show an "Add '<query>' as a new customer" option at the bottom of the results (or a generic "+ Add new customer" option always present at the bottom of the list, even with results — either is acceptable, but it must always be reachable without clearing the search).

**UX Behavior:** Selecting that option opens the existing `CustomerFormDialog` (already built, already handles Name/Phone/Email/Address/Alternate Contact/Tags per STORY-017) **on top of** the Quick Add sheet, pre-filling the Name field with whatever was typed in the combobox search. On successful save, the dialog closes, the new customer is automatically selected in the combobox, and the user lands back in the Quick Add sheet with that customer now chosen and the rest of the transaction form active.

**UI Components:** Reuses `CustomerFormDialog` as-is — no new customer form needed.

**States:** Combobox default / searching / no-matches-with-create-option / create-dialog-open / customer-just-created-and-selected.

**Validation:** Identical to the existing Add Customer flow (Name required, others optional) — no new validation rules.

**Accessibility:** The "Add new customer" option is reachable via keyboard exactly like any other combobox item; opening the nested dialog moves focus into it and traps focus there per the existing `CustomerFormDialog` behavior; closing it (whether saved or cancelled) returns focus to the combobox.

**Responsive:** No special handling — nested Dialog-over-Sheet is a standard, already-supported pattern with the Radix/Base UI primitives already in use.

**Motion:** Reuses `CustomerFormDialog`'s existing entrance animation. No new motion needed.

**Technical Notes:** `createCustomer` (already in `lib/customers.ts`) returns the created `Customer` record directly — use that return value to immediately set the combobox's selected customer, rather than re-fetching the full customer list and searching for it again.

**Dependencies:** STORY-018 (the combobox it lives inside), `CustomerFormDialog` (existing, unchanged).

**Acceptance Criteria:**

- Given the user types a name that matches no existing customer, when they select "Add as new customer," then `CustomerFormDialog` opens with that name pre-filled.
- Given the user completes and saves that dialog, then the new customer is immediately selected in the Quick Add sheet, with no need to search for them again.
- Given the user cancels the create-customer dialog, then they return to the combobox with their original search text intact and no customer selected.

**Definition of Done:** A brand-new customer created this way appears correctly in the Customers List and is fully identical to one created via the standalone Add Customer flow (same fields, same validation).

---

## 5. EPIC-008 — Visual Design Refresh

**Objective:** Move the visual system from "default shadcn neutral theme with financial colors added" to an intentional, considered application of the Soft/Calm + editorial numeric hierarchy direction the original PRD specified (Section 20), without changing any functional behavior.
**Scope:** Color tokens, typography scale, spacing/radius decisions, and the visual weight of numeric figures specifically (Dashboard totals, balances throughout).
**Out of Scope:** Any new screens, flows, or components — this is a styling-only pass. Do not touch component logic, only class names, tokens, and the underlying CSS variables.
**Dependencies:** None functional — can be done independently of EPIC-007, though doing EPIC-007 first means new components (`CustomerCombobox`, `QuickAddTransactionSheet`) inherit the refreshed tokens for free rather than needing a second pass.
**Design Considerations:** The financial semantic tokens (`--receivable`, `--credit`, `--settled`) are already well-conceived and should be kept, just re-tuned alongside the rest of the palette so they feel like part of one system rather than the only considered colors in an otherwise-default theme. See Section 5.0 below for the full design brief this Epic must follow.
**Technical Considerations:** All changes should stay within `src/index.css`'s existing token structure (`@theme inline` block and `:root`/`.dark`) — the component code already correctly uses semantic classes (`bg-background`, `text-foreground`, etc.) throughout, per grep of the codebase, so this is a low-risk, high-leverage change: editing tokens in one file cascades correctly everywhere, with no component file edits required for the color/spacing pass itself.

### 5.0 — Design Brief: Grounding, Token System, and Self-Critique

This section exists because a generic instruction like "make the UI look nicer" reliably produces the same handful of AI-template looks regardless of what the product actually is. The brief below follows a structured process — ground the design in what BahiKhata specifically is, propose a concrete token system, then explicitly check that system against the known AI-template clusters before any code is written — so the agent building this has no room to default to a generic look.

#### Ground the design in the actual subject matter

BahiKhata is not a generic SaaS dashboard. It is a **digital replacement for a physical paper ledger book**, used by a shop owner and their accountant, often at a counter, often several times an hour, usually with a customer standing right there. The product's entire reason to exist is trust and speed around money that changes hands informally. That's the brief's real content — the design should come from _that_, not from "financial dashboard" as a generic category.

The one genuinely rich, specific, and true piece of subject matter here is the ledger book itself: paper, ink, and the historical convention — still used by bookkeepers — of writing debits in one ink color and credits in another ("in the red" / "in the black" are literally ledger-ink idioms). That convention already maps exactly onto this product's `--receivable`/`--credit` distinction, and it's a much more specific, earned visual language than a generic dashboard's arbitrary green/red.

#### Design plan (Pass 1 — brainstorm)

**Color — a paper-and-ink palette, not a SaaS palette:**

| Token                       | Hex       | Role                                                                                                                                                                             |
| --------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--paper` (background)      | `#FAF9F5` | A cool, barely-tinted off-white — paper, not cream. Deliberately _not_ the `#F4F1EA` warm-cream-plus-terracotta cluster common in AI-generated design (see self-critique below). |
| `--ink` (foreground)        | `#211E1B` | Iron-gall ink black — the historical standard ledger ink color, very slightly warm rather than a flat `#000`.                                                                    |
| `--ledger-red` (receivable) | `#9C3B2C` | A muted brick/vermillion — the traditional "red ink" debit marking, deliberately dulled so it reads as ink on paper, not an alert color.                                         |
| `--ledger-blue` (credit)    | `#28415C` | A deep, muted Prussian blue — the traditional "black ink"/blue-black credit marking.                                                                                             |
| `--pencil` (muted/settled)  | `#8A8378` | A warm graphite — for settled balances and secondary text, evoking pencil rather than printed ink.                                                                               |
| `--brass` (primary accent)  | `#8A6A2F` | A single warm brass tone, used only for the one dominant action per screen — evokes a ledger book's metal clasp or binding, not a generic "brand blue."                          |

Dark mode is not simply an inverted grayscale — it should read like the same ledger under lamplight (a warm, dark brown-black page, not a cold `#111`), with the ink colors slightly lightened for contrast, same approach already correctly used for `--receivable`/`--credit` in the current codebase, just extended to the rest of the palette.

**Type — one family, personality carried by numerals, not a display serif:**

Use a single, well-chosen humanist sans-serif for everything (per the skill's own guidance: you don't need two families). Recommend **Public Sans** (distinct from the current Geist Variable, which is itself becoming a common AI-default choice, and distinct from Inter) — it has excellent tabular figures, which matters more here than a display face does. Deliberately **do not** reach for a serif display headline — that specific move (serif display + warm cream background) is one of the most recognizable AI-template tells, and this product has no "hero" moment to justify one anyway; it's a working tool, not a landing page.

Instead, the typographic personality of BahiKhata lives entirely in how **numbers** are set, which is the actually distinctive, subject-grounded choice for a ledger app:

- All monetary figures: `font-variant-numeric: tabular-nums`, a heavier weight (700) than any surrounding text, and slightly tightened letter-spacing at large sizes (e.g. `-0.02em` on the Dashboard totals) so large numbers feel crisp and deliberate rather than merely "big text."
- UI text (labels, navigation, body): regular/medium weight of the same family, sentence case throughout — no tracked-out all-caps labels anywhere (an explicit AI-tell to avoid, see below).

**Layout — hairlines, not cards:**

```
Dashboard                                    [+ Add Transaction]
────────────────────────────────────────────────────────────────
Total Receivable              Total Credit
₹42,300                       ₹3,150
Customers owe the business    Business owes customers

12 customers with outstanding balances

Top Outstanding Balances                            View all →
────────────────────────────────────────────────────────────────
Ramesh Traders                                       ₹8,200
Anita General Store                                  ₹6,750
────────────────────────────────────────────────────────────────
Today's Activity
6 transactions today, net +₹1,200
```

Customer rows, transaction rows, and any other list content are separated by a single hairline rule (`--border`, already a token in use) rather than each being wrapped in its own rounded, shadowed card. This is a deliberate rejection of the "SaaS-card kit" default (identical rounded cards, one radius on everything, soft grey shadow under each) that the skill explicitly flags as a generic tell — and it happens to also reinforce the ledger metaphor (ruled paper) rather than just avoiding a cliché for its own sake. Keep the existing restrained radius scale for actual controls — buttons, inputs, the Sheet/Dialog panels — since those genuinely benefit from a soft edge; the hairline treatment is specifically for list rows, not a blanket "zero radius everywhere" broadsheet pastiche.

Content stays left-aligned in a constrained reading width (not full-bleed edge-to-edge tables), consistent with the original PRD's "avoid ultra-wide stretched tables" guidance.

**Principles specific to this brief:**

1. **The ledger, not the label.** A number always outranks the text around it. If a balance and its caption are ever competing for attention, the balance wins.
2. **Hairlines, not cards.** Rows are separated by rules, the way ruled paper is, not by boxes.
3. **One brass accent, spent once per screen.** The single warm accent color marks exactly one primary action per screen (the pattern already correctly established in the original PRD's hierarchy rule) — never used decoratively.
4. **Ink tells the story, not icons or badges.** Receivable/credit/settled are distinguished by ink color plus a plain-language word, never by a decorative icon, emoji, or colored status pill.

#### Self-critique — checked against known AI-template defaults

Before this plan is built, here's the explicit check the skill calls for, cluster by cluster:

1. _Warm cream + high-contrast serif + terracotta accent_ — **avoided.** Background is a cool near-white, not cream; no serif display face is used anywhere; the accent is a muted brass/ochre, not terracotta, and is spent on one action, not scattered.
2. _Near-black background + neon accent_ — **avoided.** The default theme is the light paper palette above; dark mode is a warm dark brown-black, not a cold near-black, and there is no bright/neon accent anywhere in either mode.
3. _Broadsheet zero-radius newspaper columns_ — **partially and deliberately borrowed, not imitated wholesale.** Hairline rules between rows are taken from ruled-ledger-paper, a genuinely different reference than broadsheet newspaper columns, and radius is kept (not zeroed) on controls, dialogs, and buttons — this is a conscious partial borrow for a specific reason (the ledger metaphor), not the full newspaper-pastiche package.
4. _SaaS-card kit_ — **explicitly rejected.** No list content is wrapped in a rounded, shadowed card; only the existing Sheet/Dialog surfaces (which are genuinely modal, not list rows) keep elevation.
5. _Template chrome_ — **explicitly banned, given as a checklist to the build agent:** no tracked-out ALL-CAPS eyebrow labels above headings, no meta strings joined with middle dots, no "WORD — fragment" labels with a spaced em-dash, no tinted-near-black standing in for true black outside the two specified ink tokens, no monospace font for data labels, no "→" appended to button/link text (the "View all" link in the Dashboard wireframe above is deliberately plain text with no arrow).

#### Copywriting — applying the same intentionality to words

The app's existing copy (toasts, empty states, errors) is already reasonably good and should mostly stay as-is — a quick audit against the skill's writing guidance:

- **Active, consistent verbs:** "Charge added," "Payment recorded" already correctly match their trigger buttons — keep this pattern for any new copy (e.g. a Quick-Add save should say "Transaction added," not a generic "Success").
- **Errors in the interface's voice, not a person's:** "Failed to save. Please try again." is appropriately plain and non-apologetic — keep this tone; don't add "Oops!" or exclamation points anywhere.
- **Empty states as invitations, not just absence:** "No customers yet. Add your first customer to get started." already does this correctly — extend the same pattern to any new empty state introduced by EPIC-007 (e.g. the combobox's zero-customers state should read "No customers yet — add one below," not just "No customers").
- **No filler, sentence case throughout, no tracked-out labels** — already broadly true in the current codebase; hold the line on this as new UI is added.

### STORY-020 — Considered Color, Typography, and Shape Tokens

> As the business owner using this app dozens of times a day,
> I want the interface to feel calm, warm, and intentional rather than like a generic dashboard template,
> so that daily use feels pleasant rather than sterile.

**Requirements:** Implement the exact token system specified in Section 5.0 above. Concretely, in `src/index.css`:

```css
:root {
  --background: #faf9f5; /* --paper */
  --foreground: #211e1b; /* --ink */
  --receivable: #9c3b2c; /* --ledger-red */
  --credit: #28415c; /* --ledger-blue */
  --settled: #8a8378; /* --pencil */
  --primary: #8a6a2f; /* --brass — the single accent, spent once per screen */
  /* card/popover/muted/border/input/ring derived from --background and --foreground
     at the same relative contrast steps already established in the current file —
     do not recalculate these from scratch, just re-anchor them to the new base pair */
}

.dark {
  --background: #221d17; /* warm dark brown-black, not a cold near-black */
  --foreground: #f2ede4;
  --receivable: #c97a63; /* lightened for dark-mode contrast, same hue family */
  --credit: #6c93b8;
  --settled: #a39c8e;
  --primary: #c4a05c;
}
```

Font: replace `@fontsource-variable/geist` with **Public Sans** (`@fontsource-variable/public-sans` or equivalent), applied as the single family for both UI text and numerals — no second/display typeface.

Numeral treatment: everywhere a monetary amount is rendered (Dashboard totals, all balance displays, Transactions page amounts), apply `font-variant-numeric: tabular-nums`, weight 700, and `letter-spacing: -0.02em` at the larger Dashboard-total size specifically. Audit every existing `tabular-nums` usage (Dashboard, Customer Detail, Customers List, Transactions Page, Add Transaction sheet) to confirm the weight/letter-spacing is applied consistently, not just the tabular-nums utility alone.

List rows (Customers List, Transactions Page detailed view, Customer Detail transaction history): replace any per-row card/box treatment with a single hairline `border-b border-border` between rows, per Section 5.0's "hairlines, not cards" principle. Keep existing radius on `Sheet`, `Dialog`, `Button`, and `Input` — do not zero out radius everywhere.

**UX Behavior:** No behavioral change — this is purely a re-tuning of `src/index.css`'s `:root` and `.dark` variable blocks, plus the font import and a handful of row-level class changes (box → hairline).

**UI Components:** N/A — token-level and class-level change only, no new components.

**States:** N/A.

**Validation:** N/A.

**Accessibility:** Re-verify contrast ratios (WCAG AA minimum) for the new tokens in both light and dark mode — `--ledger-red`/`--ledger-blue` text against the new `--paper`/dark backgrounds specifically, since the original PRD explicitly calls out balance-figure contrast as a first-class accessibility requirement (Section 17).

**Responsive:** N/A — tokens apply uniformly across breakpoints.

**Motion:** N/A.

**Technical Notes:** This is intentionally scoped to `src/index.css` (plus the font package swap in `package.json`/`index.css`'s `@import`) and, for the hairline-vs-card row change, small class-name edits in `CustomersPage.tsx`, `TransactionsPage.tsx`, and `CustomerDetailPage.tsx` — no logic changes in any of them. Do not introduce a second source of truth (e.g., inline styles or one-off Tailwind arbitrary values) for any of these tokens — if a component currently uses an arbitrary color instead of a semantic token, fix it to use the token while you're in that file, rather than leaving a growing list of exceptions.

**Acceptance Criteria:**

- Given the updated tokens, when any existing screen is viewed, then no component requires a logic change to pick up the new palette (proving the semantic-token discipline already in place is being correctly leveraged) — only `index.css` and the specific row-level hairline class edits noted above.
- Given light and dark mode, when balance figures are displayed, then contrast against their background meets WCAG AA in both modes.
- Given any screen showing a monetary amount, then it renders with tabular figures, weight 700, and the letter-spacing treatment specified above — no screen should treat numbers more or less prominently than another without a stated reason.
- Given the Customers List, Transactions Page, and Customer Detail history, when rows are viewed, then they are separated by a single hairline rule, not individually boxed/shadowed cards.
- Given the self-critique checklist in Section 5.0, when the finished screens are reviewed against it, then none of the five AI-template clusters are present.

**Definition of Done:** A side-by-side before/after of Dashboard, Customer Detail, and Transactions Page shows a visibly more intentional, cohesive, ledger-grounded palette with no functional regressions and no new accessibility violations.

### STORY-021 — Dashboard Numeric Hierarchy Pass

> As a user glancing at the Dashboard,
> I want the two totals to unmistakably dominate the screen,
> so that I get the business's standing in under a second, exactly as the original PRD intended.

**Context:** The current Dashboard (`text-4xl` for the totals) is close to correct already but was reviewed alongside the rest of the app's default styling — worth a deliberate check now that STORY-020's tokens are in place, rather than assuming the existing size is definitely the right one.

**Requirements:** Confirm (or adjust) that the Total Receivable / Total Credit figures are unambiguously the largest, boldest text on the page — larger than the page's own `<h2>Dashboard</h2>` heading, which they currently roughly match in visual weight once you account for the heading's tracking/weight — and that "Top Outstanding Balances" and "Today's Activity" remain clearly secondary, matching the original PRD's Section 11 hierarchy rule.

**Acceptance Criteria:**

- Given the Dashboard loads, when comparing the page's own heading to the two totals, then the totals are unambiguously the dominant visual element on the page.
- Given the "Today's Activity" line and "Top Outstanding Balances" list, then neither competes with the two totals for attention.

**Definition of Done:** A quick visual scan (by a person who's never seen the app) correctly identifies "how much is owed" as the first thing they notice, without being told where to look.

### 5.1 — Design Brief Addendum, Round 3: Richer and More Confident

STORY-020/021 were implemented exactly to the Round 2 brief — verified directly against the code, not assumed. The feedback after seeing it live is that the _direction itself_ (Soft/Calm, deliberately restrained) reads as plain, not that anything was built wrong. This addendum is my response to that feedback, confirmed against your direction: **keep the same paper-and-ink family — don't change the core hex values or reintroduce a generic palette — but apply it with more confidence: deeper accent use, more contrast, less empty space.**

**What stays exactly as-is:** `--paper`, `--ink`, `--ledger-red`, `--ledger-blue`, `--pencil`, `--brass` keep their Section 5.0 hex values. The ledger-ink metaphor and the "hairlines, not cards" principle both stay — this addendum is about _application_, not a new palette.

**What changes:**

1. **Relax "one brass accent, spent once per screen" into "brass is the app's signature, used with intent wherever it reinforces structure."** The original rule was appropriately conservative for a first pass; it's now reading as _absence_ rather than restraint. Expand brass's role to:
   - The active nav item in the header (an underline or filled-pill state, not just text color change).
   - Selected/active table rows and the active sort column's header.
   - A deliberate, subtle brass-tinted background wash (`--brass` at ~6–8% opacity, a new derived token `--accent-wash`) behind the Dashboard's hero totals specifically — a single, considered anchor panel, not a reintroduction of the banned card-kit pattern everywhere. This is the one place richness and the "hairlines not cards" principle need to be reconciled: **one wash, one place, on purpose.**
   - Focus and hover states get a visibly warmer brass tint rather than the current plain muted-gray hover.

2. **Increase contrast, specifically:** darken `--border` slightly (from `#d8d4ca` to roughly `#c9c3b5`) so hairline dividers read as more deliberate structure rather than being nearly invisible; darken `--muted-foreground` a touch for secondary text legibility; keep `--ink`/`--paper` as the primary contrast pair unchanged (that pairing already tests well for accessibility per STORY-020's own acceptance criteria — don't touch what's already correct).

3. **Reduce empty space, specifically:**
   - Tighten the Dashboard's vertical rhythm — `space-y-8` between major sections reads as too generous once the hero-panel treatment (above) is in place; step it down to `space-y-6`.
   - Add a **third data point** to the Dashboard's hero area: alongside Total Receivable/Total Credit, show the net position (`receivable − credit`) as a smaller third figure, so the hero area has three things happening instead of two numbers on a lot of background.
   - Table rows (Customers List, Transactions Page, Customer Detail history) get slightly tighter vertical padding — still comfortable touch targets (44px minimum, per the original PRD's accessibility requirement, non-negotiable), but less air than the current Round 2 spacing.

**Explicit non-goals for this addendum, so it isn't read as license to abandon Section 5.0 entirely:** no gradients, no card-in-card nesting, no second accent color, no decorative icons, no serif display type. This is "the same direction, turned up," not a new direction.

### STORY-036 — Apply the Round 3 Richness Addendum

> As the business owner using this app daily,
> I want the calm design I asked for to feel confident and considered rather than empty,
> so that it feels like a crafted tool, not an unfinished one.

**Requirements:** Implement every change specified in Section 5.1 above: the new `--accent-wash` token and its single application (Dashboard hero panel), expanded brass usage on nav/selected-rows/active-sort-header/hover states, the border/muted-foreground contrast bump, the tightened Dashboard spacing, and the new net-position figure.

**UI Components:** No new components — this is token additions plus class-level changes to `AppLayout.tsx` (nav active/hover state), `DataTable.tsx` (selected-row and active-sort-header treatment, shared everywhere per EPIC-009's whole point), and `Dashboard.tsx` (hero panel wash, third figure, spacing).

**Technical Notes:** Because `DataTable` is the single shared table component (EPIC-009), the row-selection and active-sort-header brass treatment only needs to be implemented once there and every table in the app inherits it — this is exactly the payoff EPIC-009 was built for.

**Accessibility:** Re-verify contrast for the new `--accent-wash` panel (text inside it against the tinted background, not just against plain `--paper`) and for the darkened `--border`/`--muted-foreground` values, in both light and dark mode (the dark-mode equivalents of these adjustments need the same treatment — see EPIC-014 for the toggle that makes dark mode reachable at all).

**Acceptance Criteria:**

- Given the Dashboard, when compared to the Round 2 version, then it shows three figures (Receivable, Credit, Net) inside a single considered panel with a subtle brass wash, not two bare numbers on empty background.
- Given any `DataTable` instance, when a row is selected or a column is actively sorted, then brass is visibly used to indicate that state, consistent across every table in the app (not just one screen).
- Given the nav in `AppLayout`, when a link is active, then it's marked with brass, not just a muted-background/foreground-color change.
- Given the self-critique checklist from Section 5.0, when re-run against this addendum's output, then none of the five AI-template clusters have reappeared — specifically confirm the hero-panel wash hasn't drifted into a bordered/shadowed "card," it should read as a tint, not a boxed container.

**Definition of Done:** A side-by-side of Round 2 vs. Round 3 Dashboard and one migrated table shows a visibly more confident, less empty result, using strictly the same six-color family from Section 5.0.

---

## 6. EPIC-009 — Unified Table System (Consistency, Sorting, Filtering)

**Objective:** Every place in the app that lists transactions or customers should look, sort, and filter the same way — one shared component, not four independent implementations. This directly answers your ask: "the today's transaction, the transaction page, and the customer page — all tables should look similar, share the standard design, and have sorting/filtering built in."
**Scope:** One shared `DataTable` component and shared sort/debounce hooks (STORY-023); migrating `CustomersPage`, `CustomerDetailPage`'s transaction history, `TransactionsPage`, and Dashboard's "Today's Activity" onto it (STORY-024 through STORY-027).
**Out of Scope:** Changing what data each screen shows (columns, filters specific to that screen stay as specified in the original PRD/EPIC-006) — this is about the shared _mechanism_, not new fields or filters beyond what's already specified.
**Dependencies:** EPIC-006 (the filtering/sorting behavior already specified for Transactions Page and Customers List); BUG-001 fix (STORY-022) should land first so `CustomersPage` has real balances to sort/filter on before it's rebuilt onto the new component.
**Design Considerations:** The shared table's row styling is where Section 5.0's "hairlines, not cards" principle actually gets implemented once, in one place, rather than being reinvented (or forgotten) per page — this Epic and EPIC-008 should be built together for that reason, in the order given in Section 12.
**Technical Considerations:** Build on the **existing, currently-unused** `src/components/ui/table.tsx` shadcn primitive rather than introducing a new table library — it's already installed and already correctly structured (`Table`, `TableHeader`, `TableBody`, etc.), it's just never been imported anywhere.

### STORY-023 — Shared `DataTable` Component and Sort/Filter Hooks

> As a developer working on this codebase (human or agent),
> I want one shared, sortable table component and shared sort/debounce hooks,
> so that every screen that lists data behaves and looks identically, and a fix or improvement in one place applies everywhere.

**Requirements:**

- `src/components/DataTable.tsx`: a generic component built on `ui/table.tsx`'s existing primitives, accepting:

  ```tsx
  interface Column<T> {
    key: string;
    header: string;
    align?: 'left' | 'right' | 'center';
    sortable?: boolean;
    render: (row: T) => React.ReactNode;
    sortValue?: (row: T) => string | number;
  }

  interface DataTableProps<T> {
    columns: Column<T>[];
    rows: T[];
    getRowKey: (row: T) => string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    onSortChange?: (key: string, dir: 'asc' | 'desc') => void;
    onRowClick?: (row: T) => void;
    loading?: boolean;
    loadingRowCount?: number;
    emptyState?: React.ReactNode;
    noResultsState?: React.ReactNode;
  }
  ```

  Sortable column headers are keyboard-operable (`tabIndex`, `Enter`/`Space` to toggle) and expose `aria-sort`, matching the accessibility behavior `TransactionsPage.tsx` already implements today by hand — this Story lifts that existing, correct logic into the shared component rather than inventing new behavior.

- `src/hooks/useDebouncedValue.ts`: the `useDebounce` function currently duplicated verbatim in `CustomersPage.tsx` and `TransactionsPage.tsx`, extracted once.
- `src/hooks/useSort.ts`: a small hook wrapping `{ sortBy, sortDir, toggleSort }` state, replacing `TransactionsPage.tsx`'s locally-defined `toggleSort` function.
- Row styling inside `DataTable` implements Section 5.0's hairline principle directly: `border-b border-border` between rows, no per-row box/shadow, consistent cell padding across every usage.

**UX Behavior:** No visible behavior change from this Story alone — it's the foundation the next four Stories build on. `TransactionsPage`'s existing detailed-view table is the reference implementation to generalize from, since it's the only screen that already has real sorting today.

**UI Components:** Built entirely on the existing `ui/table.tsx` primitives — no new UI dependency.

**States:** `DataTable` itself renders `loading` (skeleton rows, count via `loadingRowCount`), `emptyState` (nothing exists at all), `noResultsState` (filtered to nothing), and the normal populated table — these are passed in by each page, not hardcoded, since the right copy differs per screen (Section 5.0's copywriting guidance: empty states are invitations, worded specifically to what's missing).

**Accessibility:** Identical to `TransactionsPage.tsx`'s current implementation (already correct) — proper `<table>` semantics, `aria-sort` on sortable headers, keyboard operability — just centralized.

**Responsive:** `DataTable` wraps its `<table>` in the same `overflow-x-auto` container `TransactionsPage.tsx` already uses; per-page mobile collapse-to-cards behavior (if a given screen wants it) stays a per-page concern layered on top, not baked into `DataTable` itself.

**Motion:** None — no new motion introduced.

**Technical Notes:** This Story touches no page directly — it only adds the three new files. The following four Stories do the actual migration, one screen at a time, so each can be reviewed and committed independently per Section 13's process rule.

**Dependencies:** None (foundational).

**Acceptance Criteria:**

- Given `DataTable` is used with a sortable column, when its header is clicked or activated via keyboard, then `onSortChange` fires with the correct key/direction and `aria-sort` updates accordingly.
- Given `useDebouncedValue` replaces the duplicated inline hooks, then `CustomersPage.tsx` and `TransactionsPage.tsx` both import the same shared implementation with no behavioral difference from before.
- Given no page has been migrated yet, then the app's visible behavior is completely unchanged (this Story adds files, it doesn't wire them in).

**Definition of Done:** `DataTable` and both hooks exist, are unused by any page yet (that's the next Stories), and have no TypeScript or lint errors.

### STORY-024 — Convert Customers List to the Shared Table

> As a user browsing customers,
> I want the Customers List to look and sort like every other table in the app,
> so that the whole product feels like one consistent tool instead of several different screens bolted together.

**Requirements:** Replace `CustomersPage.tsx`'s `<div role="list">` of button-rows with `<DataTable>`. Columns: Name (sortable), Phone, Balance (sortable, right-aligned, ink-colored per Section 5.0). Row click navigates to Customer Detail, same as today. The existing "Filter" `Select` (Owes us / We owe them / Settled) stays exactly as specified in EPIC-006 — only the row-rendering and sorting mechanism changes, not the filtering options.

**UX Behavior:** Clicking the Name or Balance column header sorts by that column, replacing the current separate "Sort" `Select` dropdown (Name / Balance high–low / Balance low–high / Recently added) with direct column-header interaction for Name and Balance — the two that map cleanly onto real columns. "Recently added" sort (which doesn't correspond to a visible column) can remain as a small separate control, or be dropped if you'd rather keep the table strictly column-driven — recommend keeping it as a lightweight secondary control since "recently added" has no natural column to click.

**UI Components:** `DataTable`, existing `Select` for balance-status filter (unchanged), existing `Input` for search (unchanged).

**States:** Uses `DataTable`'s built-in loading/empty/no-results slots, filled with the exact copy `CustomersPage.tsx` already has today (it's good copy, per Section 5.0's audit — don't rewrite it, just relocate it into the `emptyState`/`noResultsState` props).

**Validation:** N/A (read-only view).

**Accessibility:** Inherits `DataTable`'s sortable-header behavior; row click targets remain full-row clickable (not just the name text), matching the current button-row pattern's generous hit target.

**Responsive:** Collapse to a stacked mobile layout exactly as the original PRD's Section 18 specifies — `DataTable` should support an optional `mobileCard` render prop for this, or the page can conditionally render `DataTable` on wider screens and a simpler stacked list on narrow ones; either is acceptable, but pick one approach and apply it consistently across all four migrated screens rather than mixing strategies.

**Motion:** None new.

**Technical Notes:** This is also where **BUG-001 must already be fixed** (STORY-022) — sorting/filtering by Balance is meaningless while every balance is hardcoded to zero. Confirm STORY-022 landed before starting this Story.

**Dependencies:** STORY-022 (bug fix), STORY-023 (DataTable itself).

**Acceptance Criteria:**

- Given customers with real balances, when the Balance column header is clicked, then rows re-sort correctly and `aria-sort` reflects the active direction.
- Given the existing balance-status filter is applied, then it combines correctly with column sorting (e.g., "Owes us" + sorted by Balance descending shows only positive balances, highest first).
- Given the visual result, when compared to the Transactions Page table, then row height, hairline dividers, header styling, and typography are visually identical.

**Definition of Done:** Verified visually consistent with `TransactionsPage.tsx` side-by-side, and functionally verified against the same balance-state seed data used in STORY-016/STORY-022.

### STORY-025 — Convert Customer Detail Transaction History to the Shared Table

> As a user viewing one customer's history,
> I want to sort their transactions by date or amount,
> so that I'm not stuck with a fixed order when I'm trying to find something specific.

**Requirements:** Replace `CustomerDetailPage.tsx`'s `<div role="list">` transaction history with `<DataTable>`. Columns: Date (sortable, default sort, descending), Type, Amount (sortable, ink-colored), Note, plus the existing edit/void row actions (Section 13.5/STORY-008 of the original PRD) preserved exactly as they work today. This is a genuine new capability, not just a visual refactor — today this screen has **no sorting at all**.

**UX Behavior:** Identical to today except: column headers are now clickable/sortable, matching `TransactionsPage.tsx`'s interaction pattern exactly. Edit/void actions remain per-row, positioned consistently (e.g., a trailing actions column).

**UI Components:** `DataTable`, existing edit `Sheet` and void `AlertDialog` (unchanged, per original PRD STORY-008).

**States:** Uses `DataTable`'s slots; empty state keeps the existing "customer has zero transactions" copy from the original PRD's Section 13.5.

**Validation:** N/A (read-only view; edit/void validation is unchanged, defined in original PRD STORY-008).

**Accessibility:** Same sortable-header pattern as every other migrated screen; edit/void row actions keep their existing accessible names and confirmation behavior (STORY-008, unchanged).

**Responsive:** Same approach chosen in STORY-024, applied consistently here.

**Motion:** None new.

**Technical Notes:** This screen has a "voided"/"edited" status treatment (per original PRD FR-9a) that the other three tables don't — confirm `DataTable`'s `render` prop is flexible enough to show a muted/struck-through row style for voided transactions without needing a special case inside `DataTable` itself (it should be, since `render` is just arbitrary JSX per cell/row).

**Dependencies:** STORY-023.

**Acceptance Criteria:**

- Given a customer with multiple transactions, when the Amount column header is clicked, then the history re-sorts correctly while edit/void actions remain attached to the correct row.
- Given a voided transaction, then it still renders with its existing muted/"Voided" treatment inside the new table structure.
- Given the visual result, then it matches the styling of the Customers List and Transactions Page tables.

**Definition of Done:** Sorting verified correct against seed data with known dates/amounts; edit/void flows re-verified unchanged after the markup swap.

### STORY-026 — Dashboard "Today's Activity" as a Live Preview Table (and Fix BUG-002)

> As a user on the Dashboard,
> I want to actually see today's transactions, not just a count, and have "view all" genuinely take me to today's filtered view,
> so that the Dashboard's daily summary is actually useful, not just a number.

**Requirements:**

- Replace the current single summary line ("6 transactions today, net +₹1,200") with a small `<DataTable>` preview — up to 5 most recent transactions from today, same columns as the Transactions Page detailed view minus the Source column (not needed at a glance on the Dashboard).
- Add a "View all" row/link beneath the preview, going to `/transactions?range=today`.
- Fix **BUG-002**: `TransactionsPage.tsx` must read an initial date-range preset from the URL (`?range=today`, `?range=this-week`, `?range=this-month`) on mount, defaulting to `"this-month"` only when no query param is present. Update the Dashboard link accordingly.
- Keep "Total Receivable"/"Total Credit" as the unambiguously dominant elements on the page (Section 5.0/Section 11 of the original PRD) — this preview table is still secondary, smaller, and positioned below them, same hierarchy as today.

**UX Behavior:** If there are no transactions today, keep the existing plain "No activity yet today" message (Section 5.0 copy guidance) rather than showing an empty table shell.

**UI Components:** `DataTable` (compact variant — fewer columns, no sort controls needed here since it's a fixed "most recent 5" preview, not an interactive view).

**States:** `DataTable`'s loading/empty slots; no "no-results" state needed here since there's no user-driven filtering on this preview.

**Validation:** N/A.

**Accessibility:** Same table semantics as every other `DataTable` usage; "View all" link has a clear accessible name including "today" so its destination is unambiguous to screen reader users.

**Responsive:** Same collapse strategy as the other three migrated screens.

**Motion:** None new.

**Technical Notes:** `TransactionsPage.tsx`'s `dateRange` `useMemo` already has all three preset calculations (`getTodayRange`, `getThisWeekRange`, `getThisMonthRange`) — the fix is purely in how `datePreset`'s initial state is derived (from `useSearchParams` instead of a hardcoded string), not in the range logic itself, which is already correct.

**Dependencies:** STORY-023 (DataTable); should be built after STORY-027 lands the DataTable refactor into `TransactionsPage.tsx`, since this Story also touches that same file's filter-initialization logic.

**Acceptance Criteria:**

- Given transactions exist today, when the Dashboard loads, then up to 5 of them appear in the preview table, matching exactly what `/transactions?range=today` shows in detailed view.
- Given the user clicks "View all," then they land on the Transactions Page with the date filter already set to "Today," not "This Month."
- Given no transactions exist today, then the plain empty message appears instead of an empty table.

**Definition of Done:** Manually verified that the Dashboard preview and the Transactions Page (after clicking through) show identical counts and rows for "today," closing BUG-002 for good.

### STORY-027 — Refactor Transactions Page onto the Shared Component

> As a developer maintaining this codebase,
> I want the Transactions Page's existing hand-rolled table replaced with the shared component,
> so that this screen — the one that already got sorting right — becomes the single source of truth other screens inherit from, instead of a one-off.

**Requirements:** Replace `TransactionsPage.tsx`'s raw `<table>` JSX (both the Detailed and Summarized views) with `<DataTable>`, using its existing `filtered`/`grouped` data exactly as computed today — this Story changes markup and removes duplicated hook logic (in favor of `useDebouncedValue`/`useSort`), not the filtering/grouping behavior itself, which is already correct and already matches the original PRD's EPIC-006 spec.

**UX Behavior:** No visible change to filters, presets, or the Detailed/Summarized toggle — purely an internal consistency refactor plus the BUG-002 fix from STORY-026's requirements (these two Stories touch the same file; do STORY-027 first, then STORY-026's URL-param logic on top of the now-shared component).

**UI Components:** `DataTable` replaces the raw `<table>`; `Select`/`Input`/`Button` filter controls are unchanged.

**States:** Existing empty/no-results/loading copy is preserved, just passed through `DataTable`'s slots instead of being inlined.

**Validation:** N/A.

**Accessibility:** No regression — `DataTable` was generalized from this exact screen's existing correct implementation (STORY-023), so behavior should be identical, just centralized.

**Responsive:** Same collapse strategy chosen across STORY-024/025/026, applied here too (this screen currently uses `overflow-x-auto` with no mobile-specific collapse — decide the shared strategy here first, since this is the most complex table and the others can follow its lead).

**Motion:** None new.

**Technical Notes:** This is the most mechanical of the four migration Stories — the sorting/grouping/filtering logic already works correctly; this Story is purely "swap the JSX and remove duplicated hooks," which is why it's sequenced last among the migrations (least risky, most confirmatory that `DataTable` was generalized correctly from a known-good reference).

**Dependencies:** STORY-023.

**Acceptance Criteria:**

- Given the same filters and data as before the refactor, then the Detailed and Summarized views render identical rows, sort order, and grouping as before.
- Given the local `toggleSort` function and inline `useDebounce` hook are removed, then the page imports `useSort`/`useDebouncedValue` instead, with no behavioral difference.

**Definition of Done:** A before/after diff shows markup and hook-usage changes only — no changes to `fetchData`, `dateRange`, `groupTransactions`, or any other data logic.

---

## 7. EPIC-010 — Database Schema as Code & Security Verification

**Objective:** Make the database schema and its access rules a reviewable, versioned part of this repository instead of invisible dashboard state — directly addressing RISK-001.
**Scope:** A `supabase/migrations/` directory capturing the current schema (`customers`, `transactions`) as SQL, plus an explicit, documented Row Level Security policy set, checked into git.
**Out of Scope:** Any schema _changes_ — this Epic documents and versions what exists today; if the review below reveals RLS is missing or wrong, fixing that is a follow-up Story once the current state is actually known, not something to guess at here.
**Dependencies:** Access to the Supabase project dashboard (to read the current live schema/policies before writing them down).
**Design Considerations:** N/A — this is a backend/process Epic.
**Technical Considerations:** Use the Supabase CLI's own tooling (`supabase db pull` or `supabase db diff`) to generate an accurate migration from the live database, rather than hand-writing SQL from memory — hand-written SQL risks silently not matching what's actually deployed, which would defeat the point.

### STORY-028 — Version-Controlled Schema & RLS Policy Documentation

> As anyone maintaining this codebase,
> I want the database schema and security policies committed to the repository,
> so that the app's data model and access rules are reviewable, auditable, and reproducible, not locked inside a dashboard only one person can see.

**Requirements:**

- Run `supabase db pull` (or equivalent) against the live project to generate an accurate `supabase/migrations/<timestamp>_initial_schema.sql` capturing `customers` and `transactions` exactly as they exist today, including all constraints (the `type`/`status`/`source` enums, foreign keys, defaults) specified in the original PRD's Section 22.
- Separately document every RLS policy currently active on both tables in a checked-in `supabase/RLS.md` — policy name, which operations it covers (select/insert/update/delete), and its condition, in plain English alongside the raw SQL.
- If this documentation step reveals a table with RLS **disabled**, or a policy that's broader than intended (e.g., allowing access without requiring authentication), flag it immediately as a new, separate finding — do not silently tighten it as part of "just documenting," since that's a security-relevant behavior change that deserves its own review and Story.
- Add a short `README` section (or a `supabase/README.md`) explaining how to apply these migrations to a fresh Supabase project, so environment setup no longer depends on tribal knowledge.

**Technical Notes:** This Story is deliberately "document what exists," not "redesign the schema" — resist the urge to also fix unrelated things you notice while doing this (e.g., adding an index) in the same Story; file those as separate, smaller Stories so this one stays reviewable as "here is our schema, now version-controlled."

**Dependencies:** None (foundational, but requires dashboard access to complete).

**Acceptance Criteria:**

- Given a fresh, empty Supabase project, when the generated migration file is applied, then the resulting schema is identical to the current production schema (column-for-column, constraint-for-constraint).
- Given `supabase/RLS.md`, when read by someone unfamiliar with the project, then they can state, for both tables, exactly who can read/write what without needing dashboard access.
- Given the audit uncovers a genuine gap (RLS disabled, or a policy broader than the single-business/all-authenticated-users-equal-access model in the original PRD's Section 7), then it is written up as an explicit new finding, not silently patched inside this Story.

**Definition of Done:** `supabase/migrations/` and `supabase/RLS.md` exist, are committed, and have been verified against the live project by someone who can compare them side-by-side with the dashboard.

---

## 8. EPIC-011 — Automated Test Coverage for Balance-Critical Logic

**Objective:** Put a safety net under the exact functions where a silent bug means someone's money is quietly miscounted — directly addressing RISK-002.
**Scope:** Unit tests for `getCustomerBalance`/`getAllCustomerBalances` (`lib/transactions.ts`) and the CSV validation/customer-grouping logic (`lib/csv-import.ts`). No UI/component/end-to-end tests in this round — those are a reasonable future addition, but the highest-value, lowest-effort win is the pure business logic, and that's what this Epic scopes to.
**Out of Scope:** Testing React components directly, integration tests against a real Supabase instance, end-to-end/browser tests — all reasonable later, deliberately not this Epic (see Section 0's YAGNI note: start with the highest-value, cheapest tests, not full coverage everywhere at once).
**Dependencies:** A test runner needs to be added to the project — none currently exists (confirmed: no `test` script, no test framework in `package.json`).
**Technical Considerations:** Given this is a Vite project, **Vitest** is the natural fit (same config format Vite already uses, near-zero setup overhead) — recommend it unless there's a reason to prefer something else.

### STORY-029 — Add a Test Runner and Cover Balance Derivation

> As anyone changing transaction or balance logic in the future,
> I want automated tests that fail loudly if balance math breaks,
> so that a regression is caught before it ships, not after a customer notices their balance is wrong.

**Requirements:**

- Add Vitest (`npm install -D vitest`) and a `test` script in `package.json`.
- Write unit tests for `getCustomerBalance(customerId)` and `getAllCustomerBalances()` covering: a customer with only charges, only payments, a mix (net positive/receivable), a mix resulting in negative/credit, a customer with zero transactions (balance exactly 0), and a customer whose history includes a **voided** transaction (must be excluded from the sum) and an **edited** transaction (must reflect its edited amount, not its original one) — directly exercising the FR-9a audit-trail rules from the original PRD's Section 9.
- Since these functions currently call Supabase directly, tests will need either a mocked Supabase client or (preferably, per Section 0's Separation of Concerns) the pure summation logic extracted into its own testable function (e.g., `computeBalance(transactions: Transaction[]): number`) that `getCustomerBalance` calls after fetching — this is the cleaner long-term shape and is the recommended approach, not just "make it testable somehow."

**Technical Notes:** Extracting `computeBalance` as a pure function is also a Separation of Concerns win independent of testing — it cleanly splits "how do we fetch transactions" (data access) from "how do we turn transactions into a balance" (business logic), consistent with Section 0's three-layer rule.

**Dependencies:** None.

**Acceptance Criteria:**

- Given the mixed-history test cases above, when `computeBalance` is run against each, then it returns the exact expected signed balance, including correctly excluding voided rows and using edited amounts.
- Given `npm test` (or equivalent) is run, then it executes without needing a live Supabase connection for the balance-logic tests specifically.

**Definition of Done:** All listed scenarios pass, and the test suite runs in CI-friendly fashion (no external network dependency for this Story's tests).

### STORY-030 — Cover CSV Import Validation and Customer-Grouping Logic

> As anyone relying on bulk CSV import,
> I want the row-validation and customer-matching logic covered by tests,
> so that a change to the import code can't silently start mis-grouping customers or accepting bad data without anyone noticing.

**Requirements:** Unit tests for `csv-import.ts` covering: a fully valid file, a file with each individual invalid-row type (missing name, bad date, non-numeric amount, invalid type) called out in the original PRD's STORY-011 acceptance criteria, a file where two rows share the same customer (name+phone match) and correctly group into one customer with two transactions, and — directly covering BUG-003 — a date-only string that must parse to the same calendar date regardless of the test runner's local timezone.

**Dependencies:** None (independent of STORY-029, can be built in parallel).

**Acceptance Criteria:**

- Given each invalid-row scenario from the original PRD's STORY-011, when validated, then the correct row-level error reason is produced.
- Given two CSV rows for the same customer, when grouped, then exactly one customer with two transactions results, not two customers.
- Given a date string like `"2024-01-15"`, when parsed, then the resulting date is `2024-01-15` regardless of the environment's timezone (this test should fail before BUG-003 is fixed and pass after — see STORY-035).

**Definition of Done:** All scenarios pass; this Story's timezone test specifically is the regression guard for STORY-035.

---

## 9. EPIC-012 — Architecture Cleanup: DRY & Separation of Concerns

**Objective:** Fix the three concrete architectural issues found during review — the bypassed data-access layer, the three-way duplicated transaction-validation logic, and client-side balance aggregation — bringing the codebase in line with Section 0's standing rules.
**Scope:** One shared transaction form used by Add/Edit/Quick-Add; routing `TransactionsPage` through `lib/transactions.ts`; moving balance computation server-side.
**Out of Scope:** Any behavior change visible to the user — every Story in this Epic should be invisible from the UI, verified by "the app works exactly the same, the code underneath is just structured correctly now."
**Dependencies:** EPIC-007 (Quick Add) should exist first, since STORY-032 below is explicitly about unifying Add/Edit/**Quick-Add** together — doing this cleanup before Quick Add exists would mean redoing it once Quick Add lands.

### STORY-031 — Consolidate Transaction Form Logic Across Add, Edit, and Quick Add

> As a developer maintaining this codebase,
> I want one shared transaction form implementation instead of three independently maintained copies,
> so that a validation-rule change only needs to happen once, and the three entry points can never quietly drift apart.

**Requirements:** Extract the shared internals — type/amount/date/note fields, `validate()` logic, submit handling — from `AddTransactionSheet.tsx` and `EditTransactionSheet.tsx` into a single `src/components/TransactionFormFields.tsx` (or equivalent shared component/hook), matching exactly what STORY-018's Technical Notes already specified for Add + Quick-Add, now explicitly extended to include Edit as the third consumer. Each of the three sheets keeps its own thin wrapper (managing its own `customerId` source and its own Sheet open/close chrome) but delegates the actual form to the shared piece.

**Technical Notes:** This is the concrete fix for GAP-004's validation half. A reasonable shape: a `useTransactionForm({ customerId, initialValues? })` hook holding all the field state and validation, returned to each of the three sheet components, which each render the same set of field markup and call the hook's `submit()`. Whether it's a hook, a shared render-prop component, or a shared "dumb" fields component driven by parent-managed state — pick one approach and apply it consistently; don't let the three sheets end up with three different internal architectures even after consolidation.

**Dependencies:** STORY-018 (Quick Add must exist to be included in the consolidation).

**Acceptance Criteria:**

- Given the validation rules (amount > 0, date not in future) are defined in exactly one place, when tested via all three entry points (Add, Edit, Quick Add), then all three enforce identical validation with identical error messages.
- Given a future change to a validation rule, then it requires editing exactly one file, not three.

**Definition of Done:** Verified via STORY-029/030's testing setup — ideally the extracted validation logic itself is a pure function covered by a unit test, not just manually re-verified across three UIs each time.

### STORY-032 — Route Transactions Page Through the Data-Access Layer

> As a developer maintaining this codebase,
> I want every page to talk to the database through `lib/`, with no exceptions,
> so that data-access rules live in one place and no screen can silently diverge from how the rest of the app reads or writes data.

**Requirements:** Add a `listAllTransactions(filters)` function to `src/lib/transactions.ts` — accepting the same date-range/type/customer filter shape `TransactionsPage.tsx` already builds today — that performs the join against `customers` currently done inline in the page. Update `TransactionsPage.tsx` to call this function instead of importing `supabase` directly; remove that import from the page entirely.

**Technical Notes:** This Story should produce **zero behavior change** — it's a pure refactor moving an existing, already-correct query from the wrong layer to the right one. Good pairing with STORY-027 (the DataTable refactor also touching this file) — doing both together in the same sitting avoids touching `TransactionsPage.tsx`'s data-fetching code twice.

**Dependencies:** None functionally, but sequence alongside STORY-027 for efficiency (see Section 12).

**Acceptance Criteria:**

- Given `TransactionsPage.tsx`, when grepped for `supabase`, then there are zero matches — all data access goes through `lib/transactions.ts`.
- Given the same filters as before the refactor, then `listAllTransactions` returns identical results to the previous inline query.

**Definition of Done:** A repo-wide grep for `from "@/lib/supabase"` outside of `src/lib/*.ts` and `src/contexts/AuthContext.tsx` returns zero results — confirming no page anywhere talks to Supabase directly.

### STORY-033 — Server-Side Balance Aggregation

> As a user of an app that may eventually hold years of imported ledger history,
> I want balance calculations to happen in the database, not in my browser,
> so that the app stays fast and doesn't need to download every transaction just to add them up.

**Requirements:** Replace the client-side reduction in `getCustomerBalance`/`getAllCustomerBalances` with either a Postgres view (e.g., `customer_balances`, pre-aggregating `SUM` per customer) or an RPC function (`get_customer_balance(customer_id)` / `get_all_customer_balances()`) called via the Supabase client — either is acceptable, but the SQL itself must live in `supabase/migrations/` per EPIC-010, not be a one-off manual change to the dashboard.

**Technical Notes:** This Story depends on EPIC-010 existing first — there's no sense adding new schema objects before schema changes are even version-controlled; do this after STORY-028.

**Dependencies:** EPIC-010 (STORY-028).

**Acceptance Criteria:**

- Given the same transaction history, when balances are computed via the new server-side approach, then results are identical to the current client-side implementation for every existing test case from STORY-029.
- Given a customer with a large transaction history, when their balance is fetched, then the amount of data transferred to the client is a single number (or small row), not their entire transaction log.

**Definition of Done:** STORY-029's balance tests are re-run against the new implementation and pass unchanged, confirming no behavior regression alongside the performance win.

---

## 10. EPIC-013 — Resilience & Correctness Fixes

**Objective:** Two small, independent fixes that don't deserve a bigger Epic but shouldn't be forgotten either.
**Scope:** A top-level error boundary; the CSV import timezone bug.
**Out of Scope:** Pagination. Flagged explicitly here rather than silently dropped: every list/table in this app currently fetches its entire dataset with no paging. That will matter once a business has years of imported history, but building pagination now — before there's real data volume to design against — would be speculative (Section 0's YAGNI note). Recommendation: revisit this once EPIC-005's bulk import has been used on at least one real, large paper-ledger dataset, so the pagination design is informed by actual row counts rather than a guess.

### STORY-034 — Top-Level Error Boundary

> As a user at a live counter with a customer waiting,
> I want the app to show a recoverable error screen instead of going blank if something breaks,
> so that a bug in one screen doesn't strand me mid-transaction with no way forward.

**Requirements:** Wrap the app's route tree in a top-level React error boundary (`src/components/ErrorBoundary.tsx`) showing a plain, calm message ("Something went wrong") and a "Reload" action — consistent with Section 5.0's copywriting tone (plain, non-apologetic, no exclamation points).

**Acceptance Criteria:**

- Given any uncaught render error in any page, when it occurs, then the user sees the fallback screen with a working reload action, not a blank white screen.

**Definition of Done:** Verified by deliberately throwing an error in a test page and confirming the fallback renders.

### STORY-035 — Fix CSV Import Date Timezone Parsing (Fixes BUG-003)

> As a user importing historical transactions,
> I want the dates I entered in my CSV to be the exact dates that appear in the app,
> so that my paper ledger's history isn't silently shifted by a day.

**Requirements:** Replace `new Date(value)` in `csv-import.ts` with explicit local-date parsing (e.g., splitting `YYYY-MM-DD` and constructing the date from year/month/day components directly, avoiding the UTC-midnight interpretation entirely).

**Dependencies:** STORY-030's timezone test case is the regression guard for this fix — implement them together.

**Acceptance Criteria:**

- Given a CSV row with date `"2024-01-15"`, when imported and viewed in any timezone, then it displays as `2024-01-15`, never shifted by a day.

**Definition of Done:** STORY-030's timezone-specific test passes.

---

## 11. EPIC-014 — Theme System (Light/Dark Toggle)

**Objective:** Make the dark theme that already exists in CSS actually reachable — directly closing GAP-005.
**Scope:** A theme context with persistence, defaulting to the user's system preference; a visible toggle in the app shell.
**Out of Scope:** Selectable accent-color themes — explicitly decided against for this round (light/dark only); multiple accent themes are a reasonable future request but not this one.
**Dependencies:** None functional — can be built independently, but should land before or alongside STORY-036 (Section 5.1) so the richness-addendum's dark-mode contrast can be verified against a working toggle rather than only inspected in code.
**Technical Considerations:** `localStorage` is appropriate here (a UI preference, not sensitive data) — this is a production web app, not a sandboxed artifact, so standard browser storage APIs are fine to use directly.

### STORY-037 — Theme Context, Persistence, and System-Preference Default

> As a user,
> I want the app to start in whichever theme my device prefers, and remember my choice if I override it,
> so that I don't have to re-select a theme every time I open the app.

**Requirements:**

- A `ThemeProvider` (`src/contexts/ThemeContext.tsx`, matching the existing `AuthContext.tsx` pattern for consistency) exposing `{ theme: "light" | "dark", setTheme }`.
- On first load with no stored preference, default to `window.matchMedia("(prefers-color-scheme: dark)")`.
- Once a user explicitly picks a theme (via STORY-038's toggle), persist it to `localStorage` and prefer the stored value over system preference on subsequent loads.
- The provider toggles the `dark` class on `document.documentElement` — the mechanism the existing `.dark { ... }` CSS block in `index.css` (Section 5.0/GAP-005) has been waiting for since Round 2.

**Technical Notes:** Wrap this provider around the app in `main.tsx` or `App.tsx`, outside `AuthProvider` (theme shouldn't depend on auth state). Keep this context's responsibility narrow — theme state and persistence only, per Section 0's Single Responsibility rule — the toggle UI itself is STORY-038, not this Story.

**Dependencies:** None.

**Acceptance Criteria:**

- Given a user with no stored preference and a system dark-mode setting, when they load the app for the first time, then it renders in dark mode.
- Given a user has explicitly picked a theme, when they close and reopen the app, then their explicit choice persists, overriding system preference.

**Definition of Done:** Verified across a hard page reload and a new browser tab that the persisted preference holds.

### STORY-038 — Theme Toggle in the App Header

> As a user,
> I want a visible way to switch between light and dark, wherever I am in the app,
> so that dark mode is actually something I can turn on, not just something that exists in the code.

**Requirements:** A toggle button in `AppLayout.tsx`'s header (sun/moon icon swap via `lucide-react`, already a dependency), calling `ThemeContext`'s `setTheme`. Placed alongside the existing Add Transaction / sign-out controls — see EPIC-015's STORY-039 for exactly where it lands once the header itself is restructured for mobile, since both Stories touch the same file.

**Accessibility:** Button has a clear accessible name reflecting the action ("Switch to dark mode" / "Switch to light mode", not a static "Theme"), and the icon alone is never the only indicator — `aria-label` carries the actual state change.

**Motion:** A brief icon crossfade (~150ms) on toggle, consistent with the restrained motion philosophy already established (original PRD Section 19) — no page-wide color transition animation, which would be gratuitous.

**Dependencies:** STORY-037.

**Acceptance Criteria:**

- Given the toggle is clicked, when the theme changes, then every screen currently rendered updates immediately without a page reload.
- Given the toggle's current state, then its accessible name correctly reflects which action it will perform next, not just its current icon.

**Definition of Done:** Verified on every page in the app (not just Dashboard) that dark mode renders correctly — this is also the first real-world check of Section 5.1's dark-mode contrast adjustments.

---

## 12. EPIC-015 — Mobile-First Responsive Overhaul

**Objective:** Close GAP-006 and GAP-007 — the app shell and the customer picker are the two structurally weakest points on small viewports, and both need a real mobile-specific pattern, not just a narrower version of the desktop layout.
**Scope:** A collapsible mobile navigation pattern for the header; replacing the nested Popover-in-Sheet customer picker with a viewport-aware component; a systematic responsive audit of every modal/sheet in the app.
**Out of Scope:** A native mobile app or PWA wrapper — this is a responsive web pass, not a platform change.
**Dependencies:** EPIC-014 (STORY-038's toggle needs a home in the restructured header — build these together, not sequentially, since both touch `AppLayout.tsx`).
**Design Considerations:** Reuse the existing `Sheet` component for the mobile nav drawer rather than introducing a new overlay primitive — consistent with Section 0's DRY principle and the app's existing patterns.

### STORY-039 — Responsive App Shell & Mobile Navigation

> As a user on a phone,
> I want the header to collapse into something that fits my screen,
> so that I'm not fighting a cramped, wrapping nav bar at the counter.

**Requirements:**

- Below the `sm` breakpoint, collapse the header to: logo, a hamburger/menu icon button, the Add Transaction icon button (already exists), and the theme toggle (STORY-038). Nav links, user email, and sign-out move into a `Sheet` (side, matching the existing left/right Sheet variant already used elsewhere in the app) triggered by the hamburger — reusing the existing component rather than building a new drawer primitive.
- At `sm` and above, the header keeps its current Round 2 inline layout (nav links, full Add Transaction button with label, user email) — this Story only changes behavior below that breakpoint.
- The mobile nav Sheet closes automatically on navigation (selecting a link closes the drawer, doesn't leave it open behind the new page).

**UI Components:** Existing `Sheet`, `Button` (hamburger trigger).

**States:** Mobile drawer open/closed; active nav item highlighted inside the drawer using the same brass active-state treatment from STORY-036, for consistency.

**Accessibility:** Hamburger button has a clear accessible name ("Open menu" / "Close menu" depending on state); drawer traps focus while open and returns focus to the trigger on close, consistent with every other Sheet/Dialog in the app (original PRD Section 17).

**Responsive:** This Story's entire point is the `< sm` breakpoint — verify at common small-phone widths (360–390px), not just at the `sm` boundary itself.

**Technical Notes:** Where exactly STORY-038's theme toggle sits (inside the collapsed header vs. inside the drawer) is this Story's call to make during implementation — either is acceptable, but pick one and keep it consistent with where it sits at desktop width, so the control doesn't appear to move to a conceptually different "place" between breakpoints.

**Dependencies:** STORY-038 (build together).

**Acceptance Criteria:**

- Given a viewport under 640px, when the header renders, then nav links, email, and sign-out are not visible inline — they're reachable via the hamburger drawer.
- Given the drawer is open and a nav link is tapped, then the drawer closes and the app navigates to that page.
- Given a viewport at `sm` and above, then the header behaves exactly as it did at the end of Round 2 — no regression to the desktop experience.

**Definition of Done:** Verified at 360px, 390px, 768px, and 1024px widths with no overlapping, wrapping, or cut-off header content at any of them.

### STORY-040 — Mobile-Appropriate Customer Picker (Replace Nested Popover)

> As a user on a phone adding a transaction,
> I want to pick a customer from a picker that actually fits my screen,
> so that I'm not fighting a tiny floating popover inside a bottom sheet.

**Requirements:** `CustomerCombobox` renders differently depending on viewport, via a shared `useMediaQuery` hook (new: `src/hooks/useMediaQuery.ts`):

- **At `sm` and above:** keep the existing `Popover`-based picker exactly as built (it works fine at desktop sizes — this isn't broken there, only on small viewports).
- **Below `sm`:** replace the `Popover` with a second, full-screen `Sheet` (side `"bottom"`, `h-full` or near-full-height) that opens _on top of_ the Add/Quick-Add Transaction sheet when the customer field is tapped — the same search input, list, loading/empty/no-matches states, and "Add new customer" affordance from the current implementation, just given the whole screen instead of a pinned-width popover.

**UI Components:** Existing `Sheet` (reused for the mobile variant), existing search `Input` and row list markup from the current `CustomerCombobox` (reused, not rewritten) — this Story changes the _container_ the picker renders in below `sm`, not the picker's internal search/list/create-new logic, which already works correctly.

**States:** Same states `CustomerCombobox` already has (loading, no-matches, add-new) — carried over unchanged into the mobile Sheet variant.

**Accessibility:** The mobile Sheet variant gets the same focus-trap/Escape/return-focus behavior every other Sheet in the app already has; no new accessibility pattern to invent, just apply the existing one.

**Responsive:** This is the Story that directly closes GAP-007 — verify specifically that a Sheet-inside-a-Sheet (Add Transaction sheet, then the full-screen customer picker sheet on top of it) doesn't reintroduce the same class of nesting fragility that caused the `cmdk` crash. Test this combination explicitly, not just each Sheet in isolation.

**Technical Notes:** This is a more structurally sound nesting than the original Popover-in-Sheet: two `Sheet`s stacking is a well-supported pattern (the underlying primitives already handle stacked portals correctly elsewhere in the app), whereas a `Popover` expects to be positioned relative to a trigger that may itself be moving/resizing inside another fixed-position overlay, which is the actual source of the fragility.

**Dependencies:** New `useMediaQuery` hook (small, self-contained, no other dependency).

**Acceptance Criteria:**

- Given a viewport under 640px, when the customer field is tapped inside Add/Quick-Add Transaction, then a full-screen picker opens, not a small floating popover.
- Given a customer is selected in the mobile picker, then it closes and returns focus correctly to the transaction form with that customer populated, identical to the desktop flow's outcome.
- Given a viewport at `sm` and above, then the existing Popover-based picker is unchanged — no regression to the desktop experience validated in EPIC-007.

**Definition of Done:** Verified specifically on a small-viewport device/emulation that the two-sheets-stacked flow (transaction sheet → customer picker sheet → back to transaction sheet with a customer selected) works without the kind of crash `cmdk` produced, confirming GAP-007 is actually closed, not just visually improved.

### STORY-041 — Responsive Audit Across Every Modal and Sheet

> As a user on a phone,
> I want every dialog and sheet in the app — not just the ones explicitly redesigned — to work properly on my screen,
> so that mobile isn't a "some screens work" experience.

**Requirements:** Systematically verify, at 360px and 390px widths, every `Dialog`/`Sheet`/`AlertDialog` in the app: Add/Edit Customer, Add/Edit/Quick-Add Transaction (post-STORY-040), Void confirmation, CSV Import flow (`ImportPage.tsx`). For each: confirm no horizontal scroll is required, all touch targets meet the 44px minimum (original PRD Section 17, already a stated requirement — this Story is verification, not a new rule), and form fields stack in a single readable column rather than any fixed multi-column grid clipping content.

**Technical Notes:** This Story is deliberately **verification-and-fix**, not a rewrite — most of these were already built with `sm:`-prefixed responsive classes per the original PRD's Section 18; the expectation is that most pass already and only genuine gaps need code changes. Document what was found broken vs. already correct, so this doesn't read as if the whole app was assumed broken.

**Dependencies:** STORY-039, STORY-040 (do this last, after the two structural fixes, so the audit isn't immediately invalidated by them).

**Acceptance Criteria:**

- Given each listed modal/sheet, when opened at 360px width, then no content requires horizontal scrolling and every interactive element meets the minimum touch-target size.
- Given the CSV Import flow specifically (the one screen the original PRD explicitly scoped as "desktop-first, mobile functional but not optimized" — Section EPIC-005/STORY-011), then confirm it's at least usable (no broken layout), without needing to match the polish level of the counter-facing screens.

**Definition of Done:** A written list of what was checked and what (if anything) needed a fix, so this isn't just an unverifiable claim of "mobile now works."

---

## 13. Process Update — Commit Cadence

Add this to the standing instructions for any agent (this one or future ones) working on this repository:

> **Commit after every completed Story, not just every Epic.** Each commit should correspond to exactly one Story ID from the relevant PRD (e.g., `feat(STORY-018): global add-transaction header action`) and should leave the repository in a working, buildable state — never commit a Story half-done. If a Story is split across multiple work sessions, that's fine, but don't bundle two or more Story IDs into a single commit; if you find yourself wanting to, it's a signal the Story may need splitting (see Section 36 of the original PRD's Story Sizing guidance). Push after each commit rather than batching multiple commits into one push, so there's always a recent, inspectable remote state.

Suggested commit message prefixes, consistent with what's already in the repo's history: `feat(STORY-XXX): ...`, `fix(BUG-XXX): ...`, `chore: ...` for non-story housekeeping (dependency bumps, config).

---

## 14. Recommended Implementation Sequence

### Round 2 (complete — all Stories below shipped, per the commit history reviewed at the top of this document)

1. **EPIC-010 (Schema as Code)** — STORY-028, first of all, before anything else touches the database, so every subsequent Story is working against a known, documented schema and can surface any RLS gap immediately rather than late.
2. **BUG-001 fix** (STORY-022, below) — trivial, high-impact, and should not be sitting broken while new features are layered on top of it.
3. **EPIC-011 (Test Coverage)** — STORY-029 then STORY-030 — establishing the test runner and balance/CSV test coverage early means every architectural change from here on (EPIC-012 especially) has a safety net to verify against, rather than adding tests after the fact to code that already moved.
4. **EPIC-007 (Quick Add Transaction)** — STORY-018 then STORY-019, in that order, since 019 lives inside 018's component.
5. **EPIC-008 (Visual Design Refresh)** — STORY-020 then STORY-021 — done after EPIC-007 so the new combobox/sheet components are styled by the refreshed tokens automatically rather than needing to be revisited.
6. **EPIC-009 (Unified Table System)** — STORY-023 (shared component/hooks) → STORY-024 (Customers List) → STORY-025 (Customer Detail history) → STORY-027 (Transactions Page refactor) → STORY-026 (Dashboard preview + BUG-002 fix, since it depends on STORY-027's changes to the same file). Built after EPIC-008 so every migrated table already renders with the refreshed hairline/ink-color tokens instead of needing a second visual pass.
7. **EPIC-012 (Architecture Cleanup)** — STORY-031 (consolidate transaction forms — now that Quick Add from EPIC-007 exists, all three entry points can be unified at once) → STORY-032 (route Transactions Page through `lib/`, done alongside/immediately after STORY-027 since both touch that file's data-fetching) → STORY-033 (server-side balance aggregation, which itself depends on EPIC-010's schema-as-code foundation being in place).
8. **EPIC-013 (Resilience & Correctness)** — STORY-034 and STORY-035 can happen any time after EPIC-011's test runner exists (STORY-035 specifically needs STORY-030's regression test written first).

### Round 3 (new — start here)

1. **EPIC-014 (Theme System)** — STORY-037 (context/persistence) → STORY-038 (toggle UI). Build first this round: both EPIC-015 (which needs to place the toggle in the restructured header) and STORY-036 (whose dark-mode contrast can only really be checked once dark mode is reachable) depend on this existing.
2. **STORY-036 (Design Richness Addendum, Section 5.1)** — done after EPIC-014 so its dark-mode adjustments can be verified live via the new toggle, not just inspected in code. Note this Story also touches `DataTable.tsx`, so it benefits from EPIC-009 already being in place (it is — Round 2 is complete).
3. **EPIC-015 (Mobile-First Responsive Overhaul)** — STORY-039 (app shell/nav, built together with STORY-038 since both touch `AppLayout.tsx`) → STORY-040 (mobile customer picker) → STORY-041 (systematic audit, done last, after the two structural fixes it depends on).
4. Commit after each Story per Section 13, in this exact order.

### STORY-022 — Fix Customer List Balance Display (Bug Fix)

> As a user viewing the Customers List,
> I want to see each customer's real, current balance,
> so that I can trust the list instead of it silently showing "Settled" for everyone.

**Requirements:** Replace `CustomersPage.tsx`'s `getBalance()` stub with a real fetch of `getAllCustomerBalances()` (already implemented in `lib/transactions.ts`, already correctly used in `Dashboard.tsx`), merged into the customer list the same way `Dashboard.tsx` already does it.

**Technical Notes — the fix, concretely:**

```tsx
// Remove entirely:
function getBalance(_customer: Customer): number { return 0; }

// In fetchCustomers (or a new combined fetch), add:
const [customersData, balances] = await Promise.all([
  listCustomers(),
  getAllCustomerBalances(),
]);
setCustomers(customersData);
setBalances(balances); // new state: Record<string, number>

// In the customersWithBalance useMemo, replace:
balance: getBalance(c),
// with:
balance: balances[c.id] ?? 0,
```

**Acceptance Criteria:**

- Given customers with real transaction history, when the Customers List loads, then each customer's displayed balance exactly matches their balance shown on their own Customer Detail page.
- Given the existing sort/filter controls (Balance high–low, Owes us, etc.), then they now operate on real balances instead of a constant zero, producing correct ordering and filtering.

**Definition of Done:** Cross-checked against at least three customers with different balance states (owes, in credit, settled) that the Customers List and Customer Detail agree exactly.

---

## 15. Traceability

| Your request                                                                    | Section/Story                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| "no easy way to add a transaction besides going to the customer"                | EPIC-007, STORY-018                                                      |
| Dashboard button, customer menu, pre-populated list                             | STORY-018                                                                |
| Add a customer from that same screen                                            | STORY-019                                                                |
| UI doesn't look as good as I want                                               | EPIC-008, Section 5.0 (design brief), STORY-020, STORY-021               |
| Periodically committing the code                                                | Section 13                                                               |
| Tables should look similar, share standard design, sorting/filtering everywhere | EPIC-009, STORY-023 through STORY-027                                    |
| Ensure the codebase follows SOLID, DRY, separation of concerns                  | Section 0 (standing principles) + EPIC-010, EPIC-011, EPIC-012, EPIC-013 |
| App looks plain and boring                                                      | Section 5.1 (design addendum), STORY-036                                 |
| No theme option present                                                         | GAP-005 → EPIC-014, STORY-037, STORY-038                                 |
| Mobile responsiveness poor (nav, modals)                                        | GAP-006, GAP-007 → EPIC-015, STORY-039, STORY-040, STORY-041             |
| Summary/Dashboard page is bland                                                 | STORY-036 (hero panel, net-position figure, tightened spacing)           |

| (Found during review, not requested but necessary) eturn 0; }

// In fetchCustomers (or a new combined fetch), add:
const [customersData, balances] = await Promise.all([
listCustomers(),
getAllCustomerBalances(),
]);
setCustomers(customersData);
setBalances(balances); // new state: Record<string, number>

// In the customersWithBalance useMemo, replace:
balance: getBalance(c),
// with:
balance: balances[c.id] ?? 0,

```

**Acceptance Criteria:**

- Given customers with real transaction history, when the Customers List loads, then each customer's displayed balance exactly matches their balance shown on their own Customer Detail page.
- Given the existing sort/filter controls (Balance high–low, Owes us, etc.), then they now operate on real balances instead of a constant zero, producing correct ordering and filtering.

**Definition of Done:** Cross-checked against at least three customers with different balance states (owes, in credit, settled) that the Customers List and Customer Detail agree exactly.

---

## 15. Traceability

| Your request | Section/Story |
| --- | --- |
| "no easy way to add a transaction besides going to the customer" | EPIC-007, STORY-018 |
| Dashboard button, customer menu, pre-populated list | STORY-018 |
| Add a customer from that same screen | STORY-019 |
| UI doesn't look as good as I want | EPIC-008, Section 5.0 (design brief), STORY-020, STORY-021 |
| Periodically committing the code | Section 13 |
| Tables should look similar, share standard design, sorting/filtering everywhere | EPIC-009, STORY-023 through STORY-027 |
| Ensure the codebase follows SOLID, DRY, separation of concerns | Section 0 (standing principles) + EPIC-010, EPIC-011, EPIC-012, EPIC-013 |
| App looks plain and boring | Section 5.1 (design addendum), STORY-036 |
| No theme option present | GAP-005 → EPIC-014, STORY-037, STORY-038 |
| Mobile responsiveness poor (nav, modals) | GAP-006, GAP-007 → EPIC-015, STORY-039, STORY-040, STORY-041 |
| Summary/Dashboard page is bland | STORY-036 (hero panel, net-position figure, tightened spacing) |
| (Found during review, not requested but necessary) | BUG-001 / STORY-022, BUG-002 / STORY-026, BUG-003 / STORY-035, RISK-001 / STORY-028, RISK-002 / STORY-029–030, GAP-004 / STORY-031–032, PERF-001 / STORY-033, GAP-005/006/007 / STORY-036–041 |

Nothing you raised is left unaddressed. Round 2's architectural findings are closed (verified against the actual commit history at the top of this document); Round 3 addresses what could only be seen once the app was actually running — the design direction reading as too restrained, and two real mobile-specific structural gaps (nav collapse, nested-overlay picker) that don't show up in a code review alone without also considering how the pieces combine on a small screen.
```
