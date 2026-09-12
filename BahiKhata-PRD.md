# BahiKhata — Product Requirements Document

**Status:** Ready for build — confirmed decisions locked, remaining opens flagged below
**Project name:** BahiKhata
**Audience:** Product owner, design, engineering/AI build agent, QA

---

## 1. Executive Summary

The client runs a business that extends informal credit to customers — goods go out, payment sometimes comes later, sometimes in partial installments. Today this is tracked in a paper notebook indexed by customer name, which makes lookups slow and makes it effectively impossible to get summarized numbers (total owed, total in credit) without manual tallying.

This product replaces the notebook with a web dashboard: a customer directory, a per-customer transaction ledger (charges and payments), and a summary view that shows aggregate receivables/payables at a glance. Auth is offloaded entirely to a third-party provider (Google sign-in). No marketing site, no public landing page — this is an internal operational tool.

## 2. Problem Statement

Manual, paper-based ledgers are slow to search, error-prone to tally, and provide no real-time visibility into who owes the business money, how much, or which accounts are overdue. The business needs a fast, reliable digital replacement that preserves the exact mental model staff already use (a running account per customer) while making summaries instant instead of manual.

## 3. Product Vision

A calm, fast, trustworthy ledger tool that a non-technical shop owner or their accountant can use dozens of times a day without friction — find a customer in seconds, log a transaction in two taps, and see the full financial picture of the business on one screen.

## 4. Goals

- Replace the paper ledger with a digital customer + transaction record.
- Make it fast to find a customer and log a charge or a payment.
- Provide instant aggregate summaries (total receivable, total payable/credit, customer count, etc.) with zero manual calculation.
- Support multiple staff/accountant users logging in with equal access (v1).
- Keep auth implementation minimal by delegating to a third-party identity provider.

## 5. Non-Goals (v1)

- No public-facing marketing site or landing page.
- No multi-tenant support for multiple separate businesses (single business only).
- No role-based permission tiers (owner vs. restricted staff) — deferred, see Section 7.
- No SMS/WhatsApp payment reminders (open question, see Section 29).
- No multi-currency support.
- No offline mode.
- No accounting-standard double-entry bookkeeping (this is a simple running-balance ledger, not a GL).

## 6. Target Users & Personas

**Primary: Business Owner** — runs the day-to-day operation, not necessarily technical, needs the fastest path from "customer walks in" to "transaction logged."

**Secondary: Accountant / Staff** — reconciles the books periodically, needs to review full transaction history per customer and the summary dashboard; per your answer, has the _same_ access level as the owner in v1.

## 7. User Roles & Permissions

**v1 decision (confirmed):** Single role. Any authenticated user (owner or staff) has full read/write access to all customers, transactions, and summary data. No differentiated permissions in v1.

**Architectural note for the build agent:** Model authorization as a permission check function/middleware layer even though v1 has only one role — do not hardcode "any logged-in user can do anything" directly into every component. This keeps the door open for a future `role` field (e.g., `owner` / `staff`) without a rewrite, but **do not build role UI or role assignment in v1** — that is out of scope until requested.

## 8. User Journeys

### Journey A — Log a new charge for an existing customer

1. User logs in (Google) → lands on Dashboard.
2. User searches/selects customer from Customers list.
3. On Customer Detail, user taps "Add Transaction" → selects "Charge" → enters amount, date (defaults to today), optional note → saves.
4. Customer's running balance updates immediately; transaction appears at top of their history.

### Journey B — Record a partial payment

1. User finds customer (search or list).
2. Taps "Add Transaction" → selects "Payment" → enters amount (system shows current balance as context) → saves.
3. Running balance decreases by the payment amount (does not need to reference any specific prior charge — confirmed decision).

### Journey C — Add a brand-new customer

1. From Customers list, user taps "Add Customer."
2. Enters name (required), phone number (optional but recommended), opens with zero balance.
3. Immediately available for transaction entry.

### Journey D — Check business-wide standing

1. User lands on/navigates to Dashboard.
2. Sees: total amount owed to the business, total amount the business owes customers (credit balances), number of customers with outstanding balances, and a quick list of top debtors.

### Journey E — Look up a customer's full history

1. User searches by name or phone from anywhere via global search.
2. Opens Customer Detail → sees full chronological transaction list and current balance.

### Journey F — Review all transactions across the business for a period

1. User navigates to the Transactions page.
2. Filters by a date range (or a quick preset like "Today," "This Week," "This Month") and optionally by type or customer.
3. Either scans the detailed row-by-row list, or switches to a summarized view grouped by day/week/month to see totals per period without manually tallying.

## 9. Functional Requirements

| ID    | Requirement                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| FR-1  | System shall support Google sign-in via a third-party auth provider; no custom password auth.                                                                                                                                        |
| FR-2  | System shall allow creating, viewing, and editing customer records (name, phone number, optional notes, and additional optional profile fields — see FR-16).                                                                         |
| FR-3  | System shall allow recording two transaction types per customer: **Charge** (increases what customer owes) and **Payment** (decreases what customer owes).                                                                           |
| FR-4  | A customer's balance is a signed running total: positive = customer owes the business; negative = business owes the customer (credit).                                                                                               |
| FR-5  | Payments reduce the overall balance only — no allocation to specific prior transactions (confirmed).                                                                                                                                 |
| FR-6  | System shall display a chronological transaction history per customer, most recent first.                                                                                                                                            |
| FR-7  | System shall provide a global search across customers by name or phone number.                                                                                                                                                       |
| FR-8  | System shall provide a Dashboard summarizing: total receivable, total payable/credit, count of customers with non-zero balance, and a ranked list of top outstanding balances.                                                       |
| FR-9  | System shall allow editing or voiding a transaction entry (mistakes happen at a counter) — see FR-9a.                                                                                                                                |
| FR-9a | Edits/voids must be visibly marked (e.g., "edited" or "voided" indicator) rather than silently overwriting history, to preserve an audit trail analogous to a paper ledger (you don't erase a notebook, you cross out and annotate). |
| FR-10 | All authenticated users have equal read/write access in v1 (no permission tiers).                                                                                                                                                    |
| FR-11 | Every transaction records a timestamp (date required, time auto-captured on creation; manual date/time editing allowed for back-dating past transactions from the physical notebook).                                                |
| FR-12 | System shall provide a global **Transactions** page listing every transaction across all customers, independent of any single Customer Detail view.                                                                                  |
| FR-13 | The Transactions page shall support filtering by date range (with quick presets — today/this week/this month/custom range), transaction type (Charge/Payment/All), and customer; plus free-text search by customer name or phone.    |
| FR-14 | The Transactions page shall support toggling between a **detailed** row-level list and a **summarized** view grouped by day, week, or month, showing transaction count and net total per period.                                     |
| FR-15 | The Customers List shall support sorting (by name, current balance, date added) and filtering (customers who owe / customers in credit / settled), in addition to existing search.                                                   |
| FR-16 | Customer records shall support additional optional profile fields beyond name and phone — recommended: email, address, an alternate contact, and free-form tags — giving the owner flexibility a paper notebook couldn't offer.      |

## 10. Non-Functional Requirements

- **Performance:** Customer list and search must return results in well under 1s for a realistic dataset (hundreds to low thousands of customers). The Transactions page must remain responsive when filtering/grouping across a dataset that may include years of imported history.
- **Reliability:** Transaction writes must be atomic — a transaction and its balance effect must never partially save.
- **Availability:** Standard web app uptime; no offline requirement in v1.
- **Data integrity:** Running balance must always be derivable/reconcilable from the transaction log (never store balance as the _only_ source of truth — see Data Model).
- **Usability:** Primary counter workflow (find customer → log transaction) must be completable in under ~10 seconds of interaction.

## 11. UX Requirements & Design Direction

**Chosen direction: Soft/Calm, with Editorial numeric hierarchy.**

Why: This is a financial tool used dozens of times a day by non-technical staff standing at a counter, often mid-transaction with a customer waiting. It needs to feel _trustworthy and unhurried_, not flashy. Numbers (money, balances) are the actual content — they need the same disciplined hierarchy an editorial layout gives to text. Low-contrast, generously-spaced surfaces reduce fatigue over repeated daily use; strict typographic hierarchy makes "is this customer in debt or credit" scannable at a glance without color-coding overload.

- **Typography:** One typeface family, clear weight hierarchy. Monetary values get a distinct numeric treatment (tabular figures, slightly larger/bolder than surrounding text) so amounts are always the visual anchor of a row — not competing with names, dates, or buttons.
- **Color strategy:** Neutral background/foreground via semantic tokens (`bg-background`, `text-foreground`, `bg-muted`). Two semantic accent meanings only: one for "owes business" (receivable) and one for "business owes them" (credit) — applied as _text/number color_, not decorative chips or badges everywhere. Primary action color reserved for the single dominant CTA per screen.
- **Density:** Comfortable, not cramped — this is a daily-use tool, not a dense trading terminal. But also not so airy that scanning a list of 30 customers requires excessive scrolling. Medium density.
- **Shape language:** Soft, consistent radii (rounded-md scale), no mixing of sharp and pill-shaped elements arbitrarily.
- **Interaction philosophy:** Every primary action reachable in one tap/click from the relevant context (Add Transaction lives on the Customer Detail screen itself, not buried in a menu).
- **Motion philosophy:** Motion confirms state changes (a balance updating, a transaction being saved) — it is feedback, not decoration.

### Hierarchy rule (Impeccable)

On every screen, exactly one element wins the eye:

- **Dashboard:** the total receivable figure is the dominant element; the "Add Customer" action is present but secondary.
- **Customer Detail:** the customer's current balance is dominant; "Add Transaction" is the clear secondary action, styled as a strong but non-competing button (doesn't out-shout the balance number).
- **Customers List:** the search bar/list is dominant; "Add Customer" is a secondary, consistently-placed action (top-right).

## 12. Information Architecture

```
/ (Dashboard - summary + top balances + today's activity)
/customers (Customer list + global search + filter/sort + Add Customer)
/customers/[id] (Customer Detail - balance, transaction history, Add Transaction)
/customers/import (CSV import flow - upload, preview, confirm)
/transactions (Global transactions - detailed table + daily/weekly/monthly summary view)
/login (Google sign-in only)
```

No settings page, no separate reports page, in v1 — summary lives on the Dashboard.

## 13. Screen / Page Specifications

### 13.1 Login

- **Purpose:** Gate access; nothing else.
- **UI:** Centered card, "BahiKhata" wordmark/logo (placeholder logo acceptable, but the text "BahiKhata" itself should be used, not a generic business-name placeholder), single "Continue with Google" button. No password fields, no "forgot password," no sign-up form.
- **States:** default, loading (button shows spinner during OAuth redirect), error (auth failed — show inline message with retry).

### 13.2 Dashboard (`/`)

- **Purpose:** One-glance business standing.
- **Primary content:** Total receivable (customers owe business) and total credit (business owes customers) as the two dominant numbers, side by side or stacked, clearly labeled.
- **Secondary content:** Count of customers with an open balance; a short ranked list ("Top outstanding balances," 5–10 rows) linking to Customer Detail; a compact **"Today's Activity"** line (count of transactions today + net total today), clearly secondary to the main totals, linking through to the Transactions page pre-filtered to today.
- **Primary action:** none competing with the numbers — a lightweight link/button to Customers list.
- **States:** default (data loaded), loading (skeleton for the two summary numbers + list + today's activity), empty (no customers yet — friendly empty state with a single "Add your first customer" CTA), error (failed to load — retry action).

### 13.3 Customers List (`/customers`)

- **UI structure, top to bottom:** Page heading → search input (prominent, always visible, filters as-you-type) → a compact filter/sort control row (filter: All / Owes us / We owe them / Settled; sort: Name / Balance high–low / Balance low–high / Recently added) → "Add Customer" button (top-right, secondary visual weight) → customer rows (name, phone, current balance with receivable/credit color treatment) → empty/loading states.
- **Primary action:** Add Customer (opens a Dialog/Sheet, does not navigate away).
- **Row interaction:** tapping a row navigates to Customer Detail.
- **States:** default, loading (skeleton rows), empty (no customers — CTA to add first customer), no-search-results (distinct from true-empty: "No customers match '<query>'"), no-filter-results (a customer set exists but none match the active filter, e.g. "No customers currently owe you money").

### 13.4 Add / Edit Customer (Dialog)

- **Fields:** Name (required, visible label, text input), Phone number (optional, visible label, tel input with basic format validation), Email (optional, visible label, basic format validation), Address (optional, visible label, multi-line text), Alternate contact (optional — a name + phone pair, for when the primary contact isn't reachable), Tags (optional — short free-form labels, e.g. "wholesale," "regular," for the owner's own organizing convenience), Notes (optional, free text).
- **Actions:** Save (primary), Cancel (secondary/ghost).
- **Validation:** Name required, inline error on blur/submit if empty. Phone and Alternate Contact phone, if provided, validated for plausible format but not overly strict (this is informal record-keeping, not billing). Email, if provided, validated for basic format (contains `@` and a domain) but not verified/confirmed.
- **Note on field set:** these additional fields (email, address, alternate contact, tags) go beyond what the client's paper notebook captured — proposed specifically because a website can hold more than a notebook page can, at no extra cost to the primary flow. All remain optional so they never slow down the core "add a customer fast" journey; only Name is required.

### 13.5 Customer Detail (`/customers/[id]`)

- **UI structure, top to bottom:** Customer name + phone (header) → current balance (dominant, color-coded per receivable/credit semantics, plain-language label like "Owes ₹X" or "In credit ₹X" or "Settled" at zero) → "Add Transaction" button (secondary visual weight, but clearly the primary _action_) → chronological transaction list (most recent first): each row shows type (Charge/Payment), amount, date, optional note, and an edit/void affordance.
- **Secondary actions:** Edit customer details (name/phone), accessible but not prominent (e.g., a small icon button near the header, not competing with balance/Add Transaction).
- **States:** default, loading (skeleton for balance + list), empty (customer has zero transactions — balance shows "Settled," list shows a friendly empty message and points at "Add Transaction"), error.

### 13.6 Add Transaction (Sheet/Dialog, launched from Customer Detail)

- **Fields:** Type toggle (Charge / Payment — clear, mutually exclusive, e.g., a segmented control, not a dropdown, since it's binary and used constantly), Amount (required, numeric, visible label, currency-formatted), Date (required, defaults to today, editable for back-dating), Note (optional, free text).
- **Context shown:** current balance displayed inside this sheet so the user isn't guessing while entering a payment ("Current balance: ₹X owed").
- **Actions:** Save (primary), Cancel.
- **Validation:** Amount required and must be a positive number greater than zero; Date required and cannot be in the future (edge case: confirm this restriction is acceptable — flagged as P2 assumption, since back-dating past notebook entries is expected but _post_-dating is not an obvious real use case).

### 13.7 Transactions Page (`/transactions`)

- **Purpose:** A business-wide view of every transaction across every customer — the "whole notebook laid open," filterable and summarizable, rather than having to open one customer at a time.
- **UI structure, top to bottom:** Page heading → view toggle (**Detailed** / **Summarized**, segmented control) → filter row (date range with quick presets — Today, This Week, This Month, Custom — plus type filter All/Charge/Payment, plus a customer search/filter) → content area (table).
- **Detailed view:** One row per transaction — date, customer name (a link through to Customer Detail), type, amount (receivable/credit-colored per the same convention used elsewhere), note, and a small source indicator distinguishing imported vs. manually-entered rows for anyone doing an audit. Columns for date and amount are sortable.
- **Summarized view:** One row per period (day, week, or month — chosen via the same date-range control, e.g., selecting "This Month" with weekly grouping shows one row per week) — showing period label, transaction count, total charges, total payments, and net change for that period. This is the direct answer to "what happened today/this week/this month" without manual tallying.
- **Primary action:** none — this is a reference/reporting screen; the view toggle and filters are the dominant interactive elements, no single CTA needs to dominate.
- **States:** default (data loaded for current filter), loading (skeleton rows/periods), empty (no transactions exist in the system at all — distinct message from "no matches"), no-filter-results (transactions exist elsewhere but none match the current filter — e.g., "No transactions on this date"), error (failed to load, retry action).
- **Design note:** This screen is naturally denser than the rest of the app (it's a reporting table), which is an intentional, contained exception to the "calm by default" rule elsewhere — density here serves the page's actual purpose (scanning many rows), and filters keep it from feeling overwhelming rather than trying to make every row visually light.

## 14. Component Requirements (shadcn/Radix mapping)

| Need                                                  | Component                                                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Add/Edit Customer form                                | `Dialog`                                                                                                                                        |
| Add Transaction form                                  | `Sheet` (feels like a quick counter-side action, not a full context switch)                                                                     |
| Global/list search                                    | `Command` or a simple controlled input with debounced filter (Command if we want a command-palette-style global search reachable from anywhere) |
| Transaction type selection                            | Segmented control built on `Tabs` or `ToggleGroup` (Radix) — not a `Select` dropdown, since it's a binary, frequent choice                      |
| Customer/transaction lists                            | Native table/list markup styled with Tailwind — not over-componentized                                                                          |
| Destructive action confirm (void transaction)         | `AlertDialog`                                                                                                                                   |
| Field-level help / balance context in Add Transaction | `Tooltip` where genuinely useful, not decorative                                                                                                |
| Toasts for save/error feedback                        | `Sonner`/`Toast`                                                                                                                                |
| Transactions page Detailed/Summarized toggle          | `Tabs` or `ToggleGroup`                                                                                                                         |
| Date-range selection (quick presets + custom)         | `Popover` containing a calendar/date-range picker, with preset buttons (Today/This Week/This Month) above the calendar                          |
| Customers List / Transactions Page filters            | `Select` (for filter dropdowns like balance status or transaction type) and `DropdownMenu` (for sort options)                                   |
| Customers List / Transactions table (larger dataset)  | `Table` (shadcn `Table` primitive), with sortable column headers                                                                                |

## 15. States & Edge Cases

- **Zero balance ("Settled"):** must have its own neutral visual treatment — not styled as receivable (green/positive) or credit — a true neutral state.
- **Negative balance (business owes customer):** distinct label and color from "customer owes business," never just an unlabeled negative number.
- **Customer with zero transactions:** empty ledger state, not an error.
- **Voided/edited transaction:** remains visible in history with a clear marker, excluded from balance recalculation as appropriate (edit updates the effective amount; void removes its effect but not its record).
- **Search with no results:** distinct empty state from "no customers exist at all."
- **Duplicate customer names:** allowed (real-world names repeat) — phone number and/or a secondary disambiguator should help distinguish in list view.

## 16. Validation Rules

| Field                                     | Rule                                                                                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer name                             | Required, 1–100 chars                                                                                                                                     |
| Customer phone                            | Optional; if present, basic numeric/format check, not strict international validation                                                                     |
| Customer email                            | Optional; if present, basic format check (`@` + domain), not verified via confirmation email                                                              |
| Customer address                          | Optional; free text, no format validation                                                                                                                 |
| Customer alternate contact (name + phone) | Optional; phone follows same basic format check as primary phone                                                                                          |
| Customer tags                             | Optional; short free-form labels, no fixed vocabulary enforced in v1                                                                                      |
| Transaction amount                        | Required, numeric, > 0 (no zero or negative transactions — a negative payment doesn't make sense; corrections happen via edit/void, not negative entries) |
| Transaction date                          | Required, defaults to today, must not be in the future (flagged assumption, confirm)                                                                      |
| Transaction type                          | Required, one of Charge / Payment                                                                                                                         |

## 17. Accessibility Requirements

- All form inputs (Add Customer, Add Transaction, filters on Customers List and Transactions Page) have visible, persistent labels — never placeholder-as-label.
- Full keyboard navigation for search, list rows, filter/sort controls, table sorting, and all dialog/sheet forms.
- Focus trapping inside Dialog/Sheet/AlertDialog while open; focus returns to the triggering element on close.
- Escape key closes any open Dialog/Sheet/AlertDialog.
- Color is never the _only_ signal for receivable vs. credit vs. settled — each state also has a text label.
- Sufficient contrast in both light and dark mode for balance figures specifically (they are the most important content on the page).
- Screen-reader announcements for save success/failure (toast content must be announced, not just visually shown), and for filter/sort result count changes on the Customers List and Transactions Page (e.g., "Showing 12 of 340 transactions").
- Touch targets (especially "Add Transaction," row actions, filter controls) meet minimum 44×44px on mobile/tablet, since this is used at a physical counter, possibly on a tablet.
- Sortable table column headers are operable via keyboard (e.g., Enter/Space to toggle sort) and announce their current sort state (ascending/descending/unsorted).

## 18. Responsive Requirements

- **Mobile (counter tablet/phone use is realistic here):** Single-column layout. Add Transaction opens as a full-height Sheet from the bottom. Customer list rows stack name/phone/balance vertically if needed to avoid truncating the balance figure (balance must never be cut off or truncated — it's the reason the app exists). The Transactions Page's detailed table collapses to a stacked card-per-row layout on narrow widths rather than a horizontally-scrolling table, prioritizing readability of date/amount/customer over strict tabular alignment.
- **Tablet:** Customer list and Customer Detail can sit in a two-pane layout (list left, detail right) if screen width allows — this matches real counter usage of "search then act" without a full page navigation, but is not required for v1 if it adds complexity; single-pane navigation is an acceptable fallback.
- **Desktop:** Full multi-column layout, Dashboard summary numbers can sit side-by-side rather than stacked. Transactions Page shows a true multi-column table with sortable headers.
- **Large desktop:** Content max-width constrained (this is a data tool, not a marketing page — avoid ultra-wide stretched tables); center the layout with generous margins.

## 19. Motion & Interaction Requirements

| Trigger                                               | Element                           | Property                               | Duration/Easing           | Purpose                                                                  | Essential?              |
| ----------------------------------------------------- | --------------------------------- | -------------------------------------- | ------------------------- | ------------------------------------------------------------------------ | ----------------------- |
| Transaction saved                                     | Balance figure on Customer Detail | Number value + subtle background flash | ~200ms ease-out           | Confirms the balance actually changed                                    | Essential               |
| Add Transaction Sheet open/close                      | Sheet panel                       | transform (translateY/X) + opacity     | ~250ms, standard ease-out | Spatial continuity, feels like a quick counter action, not a page change | Essential               |
| Dialog open/close (Add Customer)                      | Dialog + overlay                  | opacity + scale (subtle, ~0.98→1)      | ~150–200ms                | Standard modal entrance, low-key                                         | Essential               |
| List filtering on search                              | Row list                          | opacity/height on filtered-out rows    | ~150ms                    | Smooth rather than jarring re-render                                     | Optional (nice-to-have) |
| Save button                                           | Button                            | loading spinner swap                   | immediate                 | Direct feedback, must never leave the user wondering if it saved         | Essential               |
| Transactions Page view toggle (Detailed ↔ Summarized) | Content area                      | opacity crossfade                      | ~150ms                    | Signals the data reshaped, not a full page reload                        | Optional (nice-to-have) |

All motion respects `prefers-reduced-motion` — reduce to instant/opacity-only transitions when set. No decorative or looping animation anywhere (no pulsing dots, no idle motion).

## 20. Design System Direction

- **Typography:** Single sans-serif family for UI text; monetary figures use tabular/lining numerals so columns of amounts align. Heading hierarchy: page title > section label > body > metadata (dates, phone numbers).
- **Color (semantic tokens):** `bg-background`, `text-foreground`, `bg-muted`/`text-muted-foreground` for structure; two custom semantic tokens for financial meaning — e.g. `text-receivable` (customer owes) and `text-credit` (business owes) — defined once in the Tailwind theme, applied consistently everywhere a balance appears, never as one-off hex values.
- **Shape:** Consistent `rounded-md` scale across buttons, inputs, cards, dialogs/sheets. No mixing of sharp and pill radii.
- **Spacing:** Standard Tailwind scale; generous vertical rhythm between list rows for tap-target comfort.
- **Elevation:** Minimal — a subtle shadow on Dialog/Sheet only, none on static content. No card-in-card nesting for list rows.
- **Iconography:** Small, functional set only (search, add, edit, void/trash, phone) — no decorative icons without semantic purpose.
- **Dark mode:** Full parity via Tailwind `dark:` — receivable/credit token colors re-mapped for contrast in dark mode, not just inverted background/foreground.

## 21. Technical Architecture

- **Frontend:** React + TypeScript + Tailwind CSS + shadcn/ui + Radix primitives, as mandated.
- **Backend/Auth (confirmed):** Supabase (Postgres + built-in Auth with Google OAuth provider). Rationale: bundles a relational database (a natural fit for customers/transactions), row-level security, and Google sign-in in one service, minimizing moving parts for a "dumb agent" build.
- **Hosting:** Vercel (pairs naturally with a React/Next.js app) — assumption, confirm if the client has an existing hosting preference.
- **State/data fetching:** Standard React Query (or equivalent) pattern against Supabase client SDK; no need for a heavier state library given the app's scope.

## 22. Data Model

**`customers`**

| Field                   | Type      | Notes                                                                                    |
| ----------------------- | --------- | ---------------------------------------------------------------------------------------- |
| id                      | uuid      | PK                                                                                       |
| name                    | text      | required                                                                                 |
| phone                   | text      | optional                                                                                 |
| email                   | text      | optional                                                                                 |
| address                 | text      | optional                                                                                 |
| alternate_contact_name  | text      | optional                                                                                 |
| alternate_contact_phone | text      | optional                                                                                 |
| tags                    | text[]    | optional; short free-form labels the owner defines themselves, no fixed vocabulary in v1 |
| notes                   | text      | optional                                                                                 |
| created_at              | timestamp |                                                                                          |
| updated_at              | timestamp |                                                                                          |

**`transactions`**

| Field       | Type                             | Notes                                                                                                                                                                                                                                                                                        |
| ----------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id          | uuid                             | PK                                                                                                                                                                                                                                                                                           |
| customer_id | uuid                             | FK → customers                                                                                                                                                                                                                                                                               |
| type        | enum(`charge`,`payment`)         | required                                                                                                                                                                                                                                                                                     |
| amount      | numeric                          | required, > 0                                                                                                                                                                                                                                                                                |
| occurred_at | timestamp                        | user-editable date (+ auto-captured time on creation); for imported rows, this is the actual historical date from the paper ledger, which may be well in the past                                                                                                                            |
| note        | text                             | optional; import rows may carry over whatever note text existed in the source ledger, if any                                                                                                                                                                                                 |
| status      | enum(`active`,`edited`,`voided`) | default `active`, supports FR-9a audit trail                                                                                                                                                                                                                                                 |
| source      | enum(`manual`,`import`)          | default `manual`; `import` marks rows created via the bulk CSV migration tool (EPIC-005) as opposed to entered live through Add Transaction (whether dated today or manually back-dated) — this is purely an audit/provenance marker, both sources behave identically in balance calculation |
| created_by  | uuid                             | FK → auth user, for audit purposes even without role tiers                                                                                                                                                                                                                                   |
| created_at  | timestamp                        |                                                                                                                                                                                                                                                                                              |
| updated_at  | timestamp                        |                                                                                                                                                                                                                                                                                              |

**Balance derivation:** A customer's balance = `SUM(charge amounts) − SUM(payment amounts)` across all `active`/`edited` (non-voided) transactions for that customer, **regardless of whether each transaction is `manual` or `import` in origin.** A brand-new customer with zero transactions has a balance of exactly zero. Balance is **never** stored as an independent mutable field — it is always computed (or maintained via a database view/materialized aggregate) from the full transaction log, so it can never drift out of sync with history, whether that history was typed in today or migrated from years of notebook entries.

## 23. API / Integration Requirements

- Google OAuth via Supabase Auth (confirmed).
- Standard CRUD endpoints (or Supabase client SDK equivalents) for customers and transactions, scoped so only authenticated users of this single business can read/write (no cross-tenant concern in v1, but row-level security should still be enabled as good practice).
- **CSV import endpoint/tooling** for one-time migration of the existing paper ledger (confirmed requirement — see EPIC-005).
- No other external/third-party data integrations required in v1 (no SMS, no payment gateway, no accounting software sync) — see Open Questions for whether this is truly out of scope.

## 24. Security Considerations

- All routes except `/login` require an authenticated session.
- Auth delegated entirely to the third-party provider — no custom password handling, no credential storage.
- Row-level security enabled at the database layer even for a single-business v1, to prevent any accidental data leakage if multi-tenancy is ever added later.
- No sensitive payment data (card numbers, etc.) is ever stored — this is a record of debt, not a payment processor.

## 25. Performance Considerations

- Customer search should be indexed on name and phone for sub-second filtering even at a few thousand customers.
- Dashboard summary figures should be computed via an efficient aggregate query (or materialized view), not by pulling every transaction into the client and summing in JavaScript.
- The Transactions page must query with server-side filtering and pagination (indexed on `occurred_at` and `customer_id`) rather than loading the entire transaction history into the browser and filtering client-side — this matters especially once years of imported history are present.
- Summarized (day/week/month) grouping on the Transactions page should be computed via a database aggregate query, not by fetching every row and grouping in JavaScript.

## 26. Analytics / Observability

- Minimal in v1: basic error logging (failed saves, failed auth) is sufficient. No user-behavior analytics needed for an internal single-business tool.

## 27. Error Handling

- All save actions (transaction, customer) show a clear inline or toast error on failure and do not silently discard user input — the form stays open with data intact so the user can retry.
- Network/auth failures on load show a retry action, never a blank/broken screen.

## 28. Assumptions

- Single currency, no currency selector.
- Single business, not multi-tenant.
- No offline requirement.
- Transactions cannot be dated in the future (P2, confirm) — note this applies to import rows too: a historical `date` in a CSV must be today or earlier.
- Supabase is the confirmed backend/auth choice.
- Vercel is the default hosting assumption pending client confirmation.
- Customer de-duplication during bulk import is based on exact name + phone match — flagged as an assumption; if the client's notebook has inconsistent name spellings across entries for the same real customer, some manual cleanup/merging may be needed (a customer-merge tool is not currently in scope — see Section 31).

## 29. Open Questions

### Resolved

- ~~Auth/backend provider~~ → **Supabase, confirmed.**
- ~~Historical data import~~ → **Needed, confirmed, full transaction-by-transaction history** (not just an opening balance) via bulk CSV import (STORY-011) and/or manual back-dated entry (STORY-012). See EPIC-005.

### Still open from P1 (recommend proceeding with default, confirm before/soon after build starts) **Notifications:** Is there any expectation of reminding customers (SMS/WhatsApp) about outstanding balances? If yes, this becomes a new Epic; if no, phone number is reference-only

### P2 (safe to decide later without blocking build)

- Future-dated transactions: allowed or blocked?
- Printable/exportable per-customer statement (for the accountant to hand a customer a paper summary)?
- Multiple business outlets/locations tracked separately?
- Transaction "note/reason" — free text vs. fixed categories?

## 30. Acceptance Criteria (Product-Level)

- Given a logged-in user, when they search a customer by partial name or phone, then matching customers appear without a full page reload.
- Given a customer with prior transactions, when a new Charge is saved, then the customer's balance increases by exactly that amount and the transaction appears at the top of their history.
- Given a customer with an existing balance, when a Payment is saved, then the balance decreases by exactly that amount (never below what the data model allows — it can legitimately go negative into credit, per the signed-balance decision).
- Given the Dashboard, when it loads, then total receivable and total credit are each independently correct sums derived from live transaction data, not stale/cached incorrect values.
- Given any form (Add Customer, Add Transaction), when a required field is empty on submit, then an inline, visible error is shown next to that field and the form does not save.

## 31. Out of Scope (v1)

- Role-based permission tiers.
- Multi-tenant/multi-business support.
- SMS/WhatsApp reminders.
- Payment gateway integration.
- Multi-currency.
- Offline mode.
- Printable statements (pending confirmation, currently excluded).
- Customer merge/de-duplication tooling beyond exact name+phone matching during import (Section 28 assumption).

## 32. Dependencies

- Google OAuth app/credentials set up in Supabase (or by the client, with their Google account) before auth can be tested end-to-end.
- Client needs to prepare/export their paper ledger into the CSV format specified in EPIC-005 (name, phone, signed balance, as-of date) before an import can be run — this is a client-side data-prep dependency, not a build dependency.

## 33. Risks

- **Ambiguous debt direction misread by build agent:** mitigated by the explicit signed-balance data model in Section 22.
- **Silent balance drift** if implementation stores balance as an independently editable field instead of deriving it from transactions — explicitly prohibited in Section 22 to prevent this.
- **Over-scoping v1** if the "dumb agent" tries to build role permissions or notifications not yet confirmed — mitigated by explicit Out of Scope section.

## 34. Definition of Done (Product-Level)

- All Epics in Section 35 are implemented and pass their stories' acceptance criteria.
- Both light and dark mode verified for contrast/hierarchy parity, specifically on balance figures.
- Full keyboard and screen-reader pass on Add Customer, Add Transaction, and Void/Edit flows.
- Dashboard summary figures independently verified against a manual sum of seed/test transaction data.

---

# 35. Epic Decomposition

## EPIC-001 — Authentication & Access

**Objective:** Any authorized staff member can securely access the dashboard with zero custom auth code.
**Scope:** Google sign-in, session handling, route protection.
**Out of Scope:** Role tiers, sign-up flows, password reset (none of these exist — provider-managed).
**Dependencies:** Auth/backend provider decision (Section 29).
**Design Considerations:** Bare-bones login screen per Section 13.1; must not feel like an afterthought despite being minimal — calm, on-brand, single clear action.
**Technical Considerations:** Provider SDK session management; protected route wrapper/middleware.

### STORY-001 — Google Sign-In

> As a business owner or staff member,
> I want to sign in with my Google account,
> so that I can access the ledger without managing a separate password.

**Context:** Client explicitly requested offloading auth to a third-party provider.
**Requirements:** Single "Continue with Google" action triggers OAuth flow via chosen provider; on success, redirect to Dashboard; on failure, show inline error with retry.
**UX Behavior:** Centered card, one button, loading state while redirecting/processing.
**UI Components:** Card, Button (with loading spinner state).
**States:** default, loading, error.
**Validation:** N/A (delegated to provider).
**Accessibility:** Button is keyboard-reachable and has a clear accessible name ("Continue with Google"); error message is announced to screen readers.
**Responsive:** Card centers and scales down gracefully on mobile; no layout break at any width.
**Motion:** Button shows spinner immediately on click (essential — user must never wonder if the click registered).
**Technical Notes:** Use provider's hosted OAuth flow; store session per provider SDK conventions.
**Dependencies:** Auth provider selected (Section 29).
**Acceptance Criteria:**

- Given an unauthenticated user visits any protected route, when they are not logged in, then they are redirected to `/login`.
- Given a user clicks "Continue with Google," when authentication succeeds, then they land on the Dashboard.
- Given authentication fails or is cancelled, when the redirect returns, then an inline error message is shown and the button resets to its default state.
  **Definition of Done:** Sign-in works end-to-end against a real Google account in a staging environment; protected routes verified unreachable without a session.

### STORY-002 — Session Persistence & Sign-Out

> As a signed-in user,
> I want my session to persist across visits and to be able to sign out,
> so that I don't have to log in every time and can hand off the device safely.

**Requirements:** Session persists per provider defaults (e.g., refresh tokens); a visible sign-out action exists (e.g., in a simple header/account menu).
**UI Components:** DropdownMenu (account menu) with a Sign Out item.
**States:** signed-in (menu visible), signing-out (brief loading), signed-out (redirect to login).
**Accessibility:** Menu fully keyboard-operable, focus returns appropriately after close.
**Acceptance Criteria:**

- Given a signed-in user closes and reopens the app within the session window, when they return, then they remain signed in without re-authenticating.
- Given a signed-in user selects Sign Out, when the action completes, then they are redirected to `/login` and protected routes are no longer accessible.
  **Definition of Done:** Verified across a browser refresh and a new tab.

---

## EPIC-002 — Customer Management

**Objective:** Maintain an accurate, searchable directory of customers.
**Scope:** Create, view, edit customer records; global search.
**Out of Scope:** Bulk import (pending confirmation), customer deletion (deferred — deleting a customer with transaction history is a destructive edge case not requested; editing/archiving can be considered later if needed).
**Dependencies:** EPIC-001 (must be signed in).
**Design Considerations:** Section 13.3/13.4; search is the dominant element on the list screen.
**Technical Considerations:** Indexed search on name/phone (Section 25).

### STORY-003 — Add Customer

> As a user,
> I want to add a new customer with their name and phone number,
> so that I can start tracking transactions for them.

**Requirements:** Dialog form per Section 13.4; name required, phone optional, notes optional.
**UX Behavior:** Triggered from Customers List "Add Customer" button; on save, dialog closes and new customer appears in the list, ready for immediate transaction entry.
**UI Components:** Dialog, labeled text/tel inputs, primary Save button, secondary Cancel.
**States:** default, saving (button loading), validation error, save error.
**Validation:** Name required (1–100 chars, inline error on empty submit); phone optional with basic format check.
**Accessibility:** All fields have visible persistent labels; focus moves to Name field on open; focus trapped in dialog; Escape closes.
**Responsive:** Dialog becomes a near-full-screen sheet-like layout on small mobile widths if needed for comfortable tap targets.
**Motion:** Dialog entrance per Section 19 (subtle scale/opacity, ~150–200ms).
**Technical Notes:** Insert into `customers` table; return new record to update the list without a full refetch.
**Dependencies:** EPIC-001.
**Acceptance Criteria:**

- Given the Add Customer dialog is open, when Name is left empty and Save is clicked, then an inline error appears under Name and no record is created.
- Given valid Name (and optional phone/notes), when Save is clicked, then the customer is created with a zero balance and appears in the Customers List immediately.
  **Definition of Done:** New customer is queryable via search immediately after creation.

### STORY-004 — Edit Customer Details

> As a user,
> I want to correct a customer's name or phone number,
> so that records stay accurate over time.

**Requirements:** Same field set/validation as Add Customer, pre-filled; accessible from Customer Detail header (Section 13.5).
**UI Components:** Dialog (reused Add/Edit form).
**States:** default (pre-filled), saving, validation error, save error.
**Accessibility:** Same as STORY-003.
**Acceptance Criteria:**

- Given a customer's existing details are open for edit, when a valid change is saved, then the Customer Detail header reflects the update immediately.
- Given Name is cleared and Save attempted, then the same inline validation as Add Customer applies.
  **Definition of Done:** Edited details persist and are reflected in both Detail and List views.

### STORY-005 — Customer List & Global Search

> As a user,
> I want to search for a customer by name or phone,
> so that I can find their account quickly at the counter.

**Requirements:** Search input filters the Customers List as-you-type (debounced); each row shows name, phone, and current balance (with receivable/credit color+label treatment).
**UI Components:** Search input (or `Command` for a global/anywhere-accessible variant), list rows.
**States:** default (all customers, likely paginated/virtualized if large), loading skeleton, no-results-for-query, true-empty (zero customers exist).
**Validation:** N/A (search is non-destructive, no validation needed).
**Accessibility:** Search input has a visible label or clearly associated accessible name (not just a placeholder); results list is announced as updating (e.g., via `aria-live` region reporting result count) for screen reader users.
**Responsive:** Search remains visible/sticky while scrolling the list on mobile.
**Motion:** Optional subtle fade on filtered rows (Section 19) — not essential, skip if it adds complexity.
**Technical Notes:** Server-side filtered query recommended once customer count grows past a small in-memory-filterable size; index on `name`, `phone`.
**Acceptance Criteria:**

- Given customers exist, when a user types a partial name, then only matching customers remain visible within the debounce window.
- Given a query matches nothing, then a distinct "no matches" message is shown (not the true-empty state).
- Given zero customers exist at all, then the true-empty state with an "Add your first customer" CTA is shown instead of a blank list.
  **Definition of Done:** Search verified correct against name and phone matches, including partial and case-insensitive matches.

---

## EPIC-005 — Historical Data Import

**Objective:** Migrate the client's existing paper ledger into the system — **full transaction-by-transaction history**, not just a current balance snapshot — so that switching off the notebook doesn't lose any prior context, and each customer's balance is simply the natural result of summing their real transaction history (old and new) exactly like every other customer's.
**Scope:** Two supported paths into the system for historical data, both producing ordinary `charge`/`payment` rows (just tagged `source = import` or `source = manual` for provenance — see Section 22):

1. **Bulk CSV import** — for customers with substantial notebook history, upload a file with one row per historical transaction; the system creates any new customers it encounters and inserts every valid transaction row against them.
2. **Manual one-at-a-time historical entry** — for a smaller number of past transactions, or to fill gaps/corrections, the user can simply use the existing **Add Transaction** flow (STORY-006) with a back-dated date field. No new UI is needed for this path — it's the same flow already specified, just used with historical dates instead of today's date.

**Out of Scope:** OCR/automatic reading of physical notebook photos (the client or their staff must transcribe into the CSV format, or enter manually) — not requested and a much larger technical undertaking.
**Dependencies:** EPIC-001 (must be signed in), EPIC-002 (customer data model/validation), EPIC-003 (transaction data model — bulk import writes the exact same `transactions` rows that STORY-006 writes, just via a different entry point).
**Design Considerations:** This is a rare, high-stakes, one-time-per-customer-or-batch admin action, not a frequent-use screen — it should feel deliberately more procedural/careful than the calm, high-frequency Add Customer/Add Transaction flows: explicit validation preview before commit, clear confirmation, since it can create a large volume of historical records at once.
**Technical Considerations:** Must validate the whole file before committing anything (no partially-imported files left in a half-done state); customer de-duplication (by name+phone) so importing multiple historical transactions for the same customer doesn't create duplicate customer records; every imported row tagged `source = import` for audit purposes, but otherwise indistinguishable in balance math from a manually-entered transaction (Section 22).

### STORY-011 — Bulk CSV Import of Historical Transactions

> As a user,
> I want to upload a CSV containing my existing notebook's transaction history,
> so that every customer's full past activity — and therefore their correct current balance — is already in the system when I start using it, without me having to re-type each one by hand.

**Requirements:**

- Accepts a CSV with **one row per historical transaction** — columns: `customer_name` (required), `customer_phone` (optional, used alongside name for matching/de-duplication), `type` (required: `charge` or `payment`), `amount` (required, > 0), `date` (required — the actual historical date from the notebook, can be any time in the past), `note` (optional).
- On upload, the system parses and validates the **entire file first** and shows a preview — total row count, a per-customer summary (how many transactions and resulting balance per customer name it detected), and any invalid rows clearly listed by row number and reason — before anything is committed.
- Customer matching: if a `customer_name` (+ `customer_phone` if provided) matches an existing customer already in the system, new transactions are added to that existing customer rather than creating a duplicate. If no match exists, a new customer is created automatically as part of the import.
- User confirms via an explicit action before any data is written.
- Rows with errors are excluded from the commit and reported back clearly; the user can choose to import only the valid rows (partial import) or fix the file and re-upload — this must be an explicit user choice, not an automatic decision.
- Every transaction created this way is inserted as an ordinary `charge` or `payment` row with `source = import`, dated to its real historical date — resulting balances are simply the natural sum of these rows plus any transactions entered afterward, with no special "opening balance" concept needed.

**UX Behavior:** Dedicated Import screen/flow (reachable from Customers List, e.g., an "Import from CSV" secondary action) → file upload → validation preview (per-customer summary + flagged error rows) → explicit confirm → success summary ("X customers, Y transactions imported").

**UI Components:** File upload control, a preview `Table` (grouped or summarized by customer), inline error indicators per row, an explicit confirmation step (this is a high-impact bulk action even though additive), success/summary toast or panel.

**States:** default (no file chosen), file-selected/parsing, preview (valid + invalid rows shown, grouped by customer), confirming, importing (progress indicator — may take a few seconds for a larger file with many transactions), success (summary), partial-success (some rows imported, some skipped — clearly distinguished from full success), error (file unreadable/wrong format).

**Validation:**

- `customer_name`, `type`, `amount`, `date` required per row; `type` must be exactly `charge` or `payment`; `amount` must be a positive number; `date` must be a valid, parseable date.
- File-level: must be valid CSV with expected headers; a clear error is shown if headers don't match, before any row-level parsing is attempted.

**Accessibility:** Upload control is keyboard-operable with a visible label; the preview table (including per-customer grouping) is navigable and errors are associated with their specific row (not just a generic banner); the confirm action has an unambiguous accessible name (e.g., "Import 340 transactions for 58 customers," not just "Confirm").

**Responsive:** Preparing and reviewing a large historical CSV is realistically a desktop, sit-down task — a functional but not heavily optimized mobile layout is acceptable; desktop is the primary target for this story.

**Motion:** None essential beyond standard loading/progress indication during commit — this screen prioritizes clarity and confidence over delight, consistent with its high-stakes, infrequent nature.

**Technical Notes:** The import must be transactional at the database level for its own batch — the whole confirmed set of valid rows commits, or none of it does, so a failure mid-import never leaves customers with partial history. Customer de-duplication logic (match on name + phone) should run once per file, grouping rows by detected customer before insert, to avoid creating the same customer multiple times within one import. Each transaction row is tagged `source = import`; balance for every affected customer is simply recalculated (or naturally reflected, since it's derived) once their historical rows are in place — no separate "opening balance" logic is required anywhere in the system (Section 22).

**Dependencies:** EPIC-001, EPIC-002, EPIC-003 (writes the same `transactions` shape STORY-006 writes).

**Acceptance Criteria:**

- Given a well-formed CSV with multiple historical transactions across several customers, when the user uploads and confirms, then a customer record exists for each unique customer in the file (creating new ones, reusing matched existing ones), each with all of their corresponding transactions inserted with the correct type, amount, date, and `source = import`.
- Given a customer who already exists in the system before the import, when the CSV contains transactions for that same customer (matched by name/phone), then the imported transactions are added to their existing history rather than creating a duplicate customer.
- Given a CSV with some invalid rows (bad date, non-numeric amount, invalid type, missing name), when previewed, then each invalid row is clearly flagged with its specific reason before any commit happens.
- Given the user chooses to import only the valid rows from a partially-invalid file, then only those rows are committed and the result is reported as a partial success, distinct from full success.
- Given the import commit fails partway through, then no partial data is left committed — the batch either fully succeeds or fully rolls back.
- Given an imported customer, when their Customer Detail is viewed afterward, then their full imported transaction history appears in chronological order alongside any new transactions entered after the import, with their balance correctly reflecting the sum of all of it, and imported rows are distinguishable via their `source` for audit purposes without disrupting the natural chronological ordering.
- Given a brand-new customer with no notebook history at all, when they are simply added via Add Customer (STORY-003) with no import involved, then their balance is exactly zero until a transaction (manual or imported) is recorded.

**Definition of Done:** Verified against a realistic sample CSV (multiple customers, multiple transactions each, at least one intentionally malformed row, and at least one row matching an already-existing customer) that customer de-duplication, chronological ordering, partial-import, and full-rollback-on-failure all behave as specified, and resulting balances exactly match a manual sum of the source CSV per customer.

### STORY-012 — Manual Historical Entry (Back-Dated Transactions)

> As a user,
> I want to manually add a past transaction with its real historical date,
> so that I can bring in a customer's notebook history one entry at a time when a bulk file isn't practical for that customer.

**Context:** This story requires **no new UI** — it is the existing Add Transaction flow (STORY-006) used with a past date instead of today's date. It is called out here explicitly so the build agent does not mistake "historical entry" as requiring a separate form, and so the date field's back-dating behavior is treated as a first-class requirement rather than an incidental one.
**Requirements:** The Date field in Add Transaction (Section 13.6) must support selecting any past date, not just today, with no artificial restriction beyond "not in the future" (Section 16/29).
**Acceptance Criteria:**

- Given a user opens Add Transaction for any customer, when they select a date earlier than today, then the transaction saves successfully with that historical date and the customer's history/balance reflect it correctly, identically to STORY-006's acceptance criteria.
  **Definition of Done:** Covered entirely by STORY-006's Definition of Done — this story exists for traceability/clarity, not as separate build work.

---

## EPIC-003 — Transaction Ledger

**Objective:** Accurately record charges and payments per customer, deriving a trustworthy running balance.
**Scope:** Add transaction, view transaction history, edit/void a transaction.
**Out of Scope:** Allocating payments to specific prior charges (explicitly decided against).
**Dependencies:** EPIC-002 (customer must exist).
**Design Considerations:** Balance is the dominant visual element on Customer Detail (Section 13.5); Charge/Payment is a binary segmented control, not a dropdown.
**Technical Considerations:** Balance is always derived from transactions, never stored independently (Section 22).

### STORY-006 — Add Transaction (Charge or Payment)

> As a user,
> I want to record a charge or a payment for a customer,
> so that their balance reflects reality.

**Requirements:** Sheet per Section 13.6; Type toggle (Charge/Payment), Amount (required, > 0), Date (required, defaults today), Note (optional); current balance shown as context inside the sheet.
**UX Behavior:** Opens from Customer Detail's "Add Transaction" button; on save, sheet closes, balance updates with the confirming motion treatment (Section 19), new row appears at top of history.
**UI Components:** Sheet, ToggleGroup/Tabs (Charge/Payment), labeled numeric input, labeled date input, optional note field, primary Save, secondary Cancel.
**States:** default, saving, validation error, save error.
**Validation:** Amount required and > 0 (inline error otherwise); Date required, not in the future (Section 16/29 — confirm before final lock).
**Accessibility:** Segmented control operable via keyboard with clear selected-state announcement; all fields labeled.
**Responsive:** Full-height sheet from bottom on mobile; side sheet or centered on desktop.
**Motion:** Sheet entrance/exit per Section 19; balance-update flash on the underlying Customer Detail once saved (essential, confirms the action worked).
**Technical Notes:** Insert into `transactions` with `status = active`; recompute/refetch derived balance rather than manually incrementing a stored counter.
**Dependencies:** EPIC-002.
**Acceptance Criteria:**

- Given a customer with balance X, when a Charge of amount N is saved, then the displayed balance becomes X + N.
- Given a customer with balance X, when a Payment of amount N is saved, then the displayed balance becomes X − N (which may go negative, representing credit).
- Given Amount is 0, negative, or empty, then Save is blocked with an inline error.
- Given a valid save, then the new transaction appears at the top of the Customer Detail history with correct type, amount, and date.
  **Definition of Done:** Verified against multiple sequential transactions that the derived balance always matches a manual sum of the transaction log.

### STORY-007 — View Customer Transaction History

> As a user,
> I want to see every transaction for a customer in order,
> so that I (or an accountant) can review or explain the balance.

**Requirements:** Chronological list, most recent first, each row showing type, amount, date, optional note, and edit/void affordance.
**UI Components:** List/table rows within Customer Detail.
**States:** default, loading skeleton, empty (customer has no transactions yet).
**Accessibility:** List semantically structured (e.g., list/table markup) so screen reader users can navigate row by row.
**Responsive:** Rows reflow to stack type/amount/date/note on narrow widths without truncating the amount.
**Acceptance Criteria:**

- Given a customer with N transactions, when Customer Detail loads, then exactly N rows are shown, ordered most-recent-first.
- Given a customer with zero transactions, then the empty state is shown instead of an empty list with no explanation.
  **Definition of Done:** History order and content verified against seed data.

### STORY-008 — Edit or Void a Transaction

> As a user,
> I want to correct or void a mistaken transaction entry,
> so that the ledger stays accurate without losing the audit trail.

**Requirements:** Per FR-9/FR-9a — edits are recorded (not silently overwritten) and voids mark a transaction as excluded from balance without deleting the row.
**UX Behavior:** Row-level edit action opens the same form as Add Transaction, pre-filled; row-level void action requires confirmation (destructive-leaning action).
**UI Components:** Sheet (edit, reused from STORY-006), AlertDialog (void confirmation).
**States:** default, editing, void-confirming, voided (visually distinct — e.g., muted/struck-through row with a "Voided" label).
**Validation:** Same as STORY-006 for edits.
**Accessibility:** AlertDialog focus-trapped, clear "Void" vs "Cancel" labeling (never ambiguous "OK"/"Cancel" alone).
**Motion:** None required beyond standard Dialog/Sheet motion (Section 19) — this is not a moment for delight, it's a corrective action; keep it calm and clear.
**Technical Notes:** Void sets `status = voided`, excluded from balance derivation but retained in the row for audit visibility; edit sets `status = edited` and updates the relevant fields, retaining an accessible record that a change occurred.
**Dependencies:** STORY-006.
**Acceptance Criteria:**

- Given an existing transaction, when its amount is edited and saved, then the customer's balance recalculates to reflect the new amount, and the row is visibly marked as edited.
- Given an existing transaction, when voided (after confirmation), then it no longer affects the balance but remains visible in history marked "Voided."
- Given the void confirmation is cancelled, then no change occurs.
  **Definition of Done:** Balance recalculation verified correct after both an edit and a void in sequence.

---

## EPIC-004 — Dashboard & Summary Analytics

**Objective:** Give an instant, accurate business-wide financial snapshot.
**Scope:** Total receivable, total credit, count of open balances, ranked outstanding list.
**Out of Scope:** Historical trend charts, date-range filtering (not requested; the pain point is "current standing," not trend analysis).
**Dependencies:** EPIC-003 (transactions must exist to summarize).
**Design Considerations:** The two totals are the dominant elements on the page (Section 11/13.2).
**Technical Considerations:** Efficient aggregate query, not client-side summing of all transactions (Section 25).

### STORY-009 — Dashboard Summary Totals

> As a user,
> I want to see total receivable and total credit at a glance,
> so that I know the business's standing without manual calculation.

**Requirements:** Two clearly labeled aggregate figures computed live from transaction data.
**UI Components:** Two prominent numeric displays (not cards-within-cards — plain, dominant typographic treatment per Section 20).
**States:** default, loading (skeleton numbers), empty (zero customers/transactions — show zero states plainly, not an error), error (retry action).
**Accessibility:** Figures have accessible labels ("Total amount owed to the business: ₹X"), not just visually implied by position/color.
**Acceptance Criteria:**

- Given a set of customers with mixed positive/negative balances, when the Dashboard loads, then total receivable equals the sum of all positive balances and total credit equals the sum of all negative balances (as an absolute value), each independently correct.
- Given no transactions exist anywhere, then both totals show as zero, not an error or blank state.
  **Definition of Done:** Totals verified against a manually-computed sum of seed data.

### STORY-010 — Top Outstanding Balances List

> As a user,
> I want to see which customers owe the most,
> so that I know who to follow up with first.

**Requirements:** Ranked list (e.g., top 5–10) of customers by balance magnitude, each linking to their Customer Detail.
**UI Components:** Simple ranked list, reused row treatment from Customers List where sensible.
**States:** default, loading skeleton, empty (no outstanding balances — a positive, calm "all settled" message, not a generic empty state).
**Accessibility:** List is navigable and each row's link has a clear accessible name including the customer name and balance.
**Acceptance Criteria:**

- Given multiple customers with outstanding balances, when the Dashboard loads, then the list is ordered by balance magnitude, descending.
- Given no customer has an outstanding balance, then a distinct "all settled" state is shown instead of an empty list.
  **Definition of Done:** Ordering verified against seed data with known balances.

### STORY-013 — Dashboard "Today's Activity" Summary

> As a user,
> I want to see a quick summary of today's transactions right on the Dashboard,
> so that I know what happened today without opening the full Transactions page.

**Requirements:** A compact line/panel showing count of transactions recorded today and the net total (charges minus payments) for today, linking through to the Transactions page pre-filtered to today.
**UX Behavior:** Sits below the two main totals — clearly secondary, never competing with them for attention (Section 11 hierarchy rule).
**UI Components:** Simple text/number display, no card-in-card nesting.
**States:** default, loading skeleton, empty (no transactions yet today — a plain "No activity yet today" message, not an error).
**Accessibility:** Accessible label states the figure in full ("Today: 6 transactions, net +₹1,200"), not conveyed by position alone.
**Acceptance Criteria:**

- Given transactions exist dated today, when the Dashboard loads, then the count and net total shown match exactly what the Transactions page shows when filtered to today.
- Given no transactions exist today, then a plain empty message is shown instead of "0" with no context.
  **Definition of Done:** Verified consistent with Transactions page's own "Today" filter result (Section EPIC-006), so the two never disagree.

---

## EPIC-006 — Transactions Reporting & Enhanced Customer Browsing

**Objective:** Give the owner (and accountant) a business-wide, filterable view of all transaction activity — not just per-customer — plus better ways to browse and organize the customer list itself, going beyond what a paper notebook could ever offer.
**Scope:** Global Transactions page (detailed + summarized/grouped views, filtering, sorting); Customers List sorting and filtering; extended optional customer profile fields (email, address, alternate contact, tags).
**Out of Scope:** Exporting reports to file (CSV/PDF export of the Transactions page) — not requested; flagged as a natural P2 addition if wanted later, since the underlying filtered/grouped query would already exist.
**Dependencies:** EPIC-002 (customer data model), EPIC-003 (transaction data model — this Epic is a new _view_ over existing data, not a new data-writing flow), EPIC-005 (imported historical transactions must appear here identically to manually-entered ones).
**Design Considerations:** The Transactions page is intentionally denser than the rest of the app (Section 13.7) — a deliberate, contained exception to "calm by default," justified because its whole purpose is scanning volume. The extended customer fields (Section 13.4) must stay optional and visually unobtrusive in the Add/Edit form so they never slow down the core "add a customer fast" flow.
**Technical Considerations:** Requires server-side filtering, sorting, and aggregation (Section 25) — this is the first screen in the product where a naive "fetch everything, filter in the browser" approach would break down once a business has years of imported history.

### STORY-014 — Global Transactions Table (Detailed View)

> As a user,
> I want to see every transaction across all customers in one place,
> so that I can review recent activity without opening each customer individually.

**Requirements:** Table of all transactions, most recent first by default; columns: date, customer (linked), type, amount, note, source (manual/import); sortable by date and amount.
**UX Behavior:** Reachable via primary navigation; loads with a sensible default filter (e.g., "This Month") rather than the entire multi-year history at once, to keep initial load fast — user can broaden the range via filters.
**UI Components:** `Table` with sortable headers.
**States:** default, loading skeleton, empty (no transactions exist anywhere), no-filter-results, error.
**Validation:** N/A (read-only view).
**Accessibility:** Table uses proper semantic table markup; sortable headers keyboard-operable and announce sort direction; customer links have clear accessible names.
**Responsive:** Collapses to stacked cards on mobile (Section 18) rather than a horizontally-scrolling table.
**Motion:** None essential; standard loading skeleton only.
**Technical Notes:** Server-side paginated query, indexed on `occurred_at`; must correctly include both `source = manual` and `source = import` rows with no special-casing needed beyond the visual source indicator.
**Dependencies:** EPIC-003, EPIC-005.
**Acceptance Criteria:**

- Given transactions exist across multiple customers, when the page loads, then rows from every customer appear together, ordered most-recent-first by default.
- Given the user clicks the date or amount column header, then the table re-sorts accordingly and the header reflects the active sort direction.
- Given zero transactions exist anywhere in the system, then the true-empty state is shown, distinct from a filtered-to-nothing state.
  **Definition of Done:** Verified against seed data spanning multiple customers and both manual and imported transactions.

### STORY-015 — Transactions Filtering & Summarized Grouping

> As a user,
> I want to filter transactions by date range, type, or customer, and see totals grouped by day, week, or month,
> so that I can answer "what happened today/this week/this month" without manual tallying.

**Requirements:** Filter controls: date range (with Today/This Week/This Month/Custom presets), type (All/Charge/Payment), customer (search/select); a Detailed/Summarized view toggle where Summarized groups by the selected period granularity and shows count + total charges + total payments + net per period.
**UX Behavior:** Filters apply immediately (no separate "apply" step needed for simple filters) with a loading indicator during refetch; switching Detailed↔Summarized preserves the active filters.
**UI Components:** `Popover` with calendar/date-range picker + preset buttons, `Select` for type filter, customer search input, `Tabs`/`ToggleGroup` for the view toggle.
**States:** default, loading, no-filter-results ("No transactions match these filters" with the active filters visible so the user knows what to adjust), error.
**Validation:** Custom date range must have a start ≤ end; invalid ranges show an inline error rather than silently returning nothing.
**Accessibility:** All filter controls have visible labels; changing a filter announces the updated result count for screen reader users (Section 17).
**Responsive:** Filter row collapses into a compact filter/sort menu on mobile rather than a full horizontal row, to preserve space for the actual data.
**Motion:** Optional crossfade on Detailed↔Summarized toggle (Section 19) — skip if it adds complexity, not essential.
**Technical Notes:** Grouping computed via a database aggregate query keyed on truncated date (day/week/month), not client-side reduction (Section 25).
**Dependencies:** STORY-014.
**Acceptance Criteria:**

- Given the user selects "Today," then only today's transactions appear in Detailed view, and the Dashboard's "Today's Activity" (STORY-013) shows the same count/net.
- Given the user selects "This Month" and switches to Summarized with weekly grouping, then each row shows the correct count, total charges, total payments, and net for that week, matching a manual sum of the underlying transactions.
- Given a filter combination matches no transactions, then the no-filter-results state is shown with the active filters visible, not a generic blank screen.
  **Definition of Done:** Summarized totals independently verified against Detailed-view manual sums for at least three different grouping periods.

### STORY-016 — Customers List Sort & Filter

> As a user,
> I want to sort and filter the customer list (e.g., by balance, or to just see who owes me),
> so that I can prioritize follow-ups without scanning the entire list manually.

**Requirements:** Sort options: Name (A–Z), Balance (high–low), Balance (low–high), Recently added. Filter options: All, Owes us, We owe them (credit), Settled.
**UX Behavior:** Sort and filter controls sit alongside the existing search bar (Section 13.3), combinable with an active search query.
**UI Components:** `Select` or `DropdownMenu` for sort; `Select` or a small segmented control for the balance-status filter.
**States:** default, loading, no-filter-results (distinct from no-search-results, per Section 13.3).
**Validation:** N/A (non-destructive, read-only controls).
**Accessibility:** Both controls have visible labels and announce the active selection; combined filter+search+sort result count is announced on change.
**Responsive:** Controls collapse into a single compact "Filter & Sort" menu on mobile to preserve space for the list itself.
**Motion:** None essential beyond the existing optional list-filter fade (Section 19).
**Technical Notes:** Sorting/filtering should be server-side once the customer count is large enough that client-side sorting would be noticeably slow (Section 25); combinable with the existing name/phone search.
**Dependencies:** EPIC-002 (STORY-005).
**Acceptance Criteria:**

- Given customers with mixed balances, when "Balance (high–low)" is selected, then the list re-orders accordingly.
- Given "Owes us" filter is active, then only customers with a positive balance appear; given "Settled," only customers with exactly zero balance appear.
- Given a filter is combined with an active search query, then only customers matching both conditions appear.
  **Definition of Done:** Verified against seed data covering all four balance states (owes, in credit, settled, and a customer with zero transactions).

### STORY-017 — Extended Customer Profile Fields

> As a user,
> I want to optionally record a customer's email, address, an alternate contact, and some tags,
> so that I have more useful context than a paper notebook could hold, when I need it.

**Requirements:** Add Email, Address, Alternate Contact (name + phone), and Tags fields to the existing Add/Edit Customer form (Section 13.4); all optional.
**UX Behavior:** These fields appear below the core Name/Phone fields, visually de-emphasized (e.g., grouped under a lightweight "Additional details" heading within the same form) so they never compete with or slow down the primary fast-add flow.
**UI Components:** Additional labeled text inputs within the existing `Dialog` from STORY-003/004 — no new dialog needed.
**States:** Shares the same states as STORY-003/004 (default, saving, validation error, save error).
**Validation:** Email basic format check; alternate contact phone same basic check as primary phone; tags and address unrestricted free text (Section 16).
**Accessibility:** Each new field has its own visible label, consistent with all other form fields in the product.
**Responsive:** Fields stack normally on mobile; no special layout needed.
**Motion:** None — reuses existing Dialog motion.
**Technical Notes:** Extends the existing `customers` table (Section 22) — no schema redesign, purely additive columns.
**Dependencies:** STORY-003, STORY-004.
**Acceptance Criteria:**

- Given a user fills in any combination of the new optional fields and saves, then those values persist and appear when the customer is reopened for editing or viewed on Customer Detail.
- Given a user leaves all new fields blank, then the customer saves successfully exactly as before (Section 13.4) — nothing about the new fields is required.
  **Definition of Done:** Verified that omitting all new fields produces identical behavior to the pre-existing Add Customer flow, and that populating them round-trips correctly.

---

# 36. Story Sizing Review

- All stories above are independently implementable and independently testable — no story requires another to be "mostly done" first beyond its stated Epic dependency.
- **STORY-006 (Add Transaction)** is the largest and most central story; it is appropriately sized as one story because Charge and Payment share the same form, validation, and save path — splitting by type would create artificial coupling (both types must always stay in sync on the balance model).
- **STORY-008 (Edit or Void)** could be split into two stories (Edit vs. Void) if the build agent struggles with combined scope; flagged here as a safe split point if needed, not a mandatory one.
- **STORY-011 (Bulk CSV Import)** is the largest story in the document by necessity — it touches customer de-duplication, transaction insertion, validation preview, and transactional rollback all at once. It is kept as one story because these pieces are not independently meaningful (a "preview" with no commit path, or a "commit" with no validation, isn't a usable feature on its own) — but flagged here as the single story most likely to need the build agent's full attention/iteration.
- **STORY-015 (Filtering & Summarized Grouping)** depends on STORY-014 existing first (a table to filter) — correctly sequenced as a follow-on within the same Epic rather than a separate Epic.
- **STORY-017 (Extended Customer Profile Fields)** is intentionally small and additive — it was considered for merging into STORY-003/004 directly, but kept separate since it can be safely deferred or descoped without blocking the core Add/Edit Customer flow, unlike the required Name/Phone fields.
- No story is currently underspecified with missing acceptance criteria or states.

---

# 37. Recommended Implementation Sequence

1. **EPIC-001 (Auth)** — nothing else is reachable without this; establishes the protected-route foundation.
2. **Design System Foundation** (Section 20 tokens, typography, Tailwind theme, base shadcn setup) — must exist before any real screen is styled, to avoid rework.
3. **EPIC-002 (Customer Management)** — customers must exist before transactions can be recorded against them, and the import tool (EPIC-005) reuses this same data model/validation.
4. **EPIC-005 (Historical Data Import)** — built right after Customer Management, ahead of day-to-day transaction entry, so the client can migrate their paper ledger's full history and have accurate, real transaction records in place _before_ they start recording new live activity. Note STORY-011 (bulk CSV) technically also depends on the `transactions` shape from EPIC-003 — in practice this means the transaction data model is finalized alongside EPIC-002 before EPIC-005's bulk-import logic is built, even though the day-to-day Add Transaction _screen_ (STORY-006) isn't needed until step 5.
5. **EPIC-003 (Transaction Ledger)** — the core day-to-day value of the product; depends on customers (and their imported history) existing.
6. **EPIC-004 (Dashboard & Summary)** — depends on real (imported + live) transaction data existing to summarize meaningfully; also validates that the derived-balance approach (Section 22) is correct end-to-end, across both imported and manually-entered data.
7. **EPIC-006 (Transactions Reporting & Enhanced Browsing)** — built last among functional epics, since it's a reporting/reference layer over data structures the earlier epics already established; also the natural point to add the extended customer fields (STORY-017), since the core customer flows are already stable by this point.
8. **Polish pass:** accessibility audit, dark mode parity check, motion/reduced-motion verification, empty/error state review across all screens.

This order follows architecture dependencies first (auth, design tokens), then "create the thing being tracked" → "migrate its full history" → "track new activity against it" → "summarize the essentials" → "add richer reporting and browsing on top," ending with cross-cutting polish once all screens exist to polish.

---

# 38. Traceability Matrix

| Client Requirement                                                                           | PRD Requirement                                    | Epic                                 | Story                |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ | -------------------- |
| Notebook of customers, indexed by name                                                       | FR-2, Section 13.3                                 | EPIC-002                             | STORY-003, STORY-005 |
| Amount, date, (time), phone number per entry                                                 | FR-2, FR-11, Section 22 data model                 | EPIC-002, EPIC-003                   | STORY-003, STORY-006 |
| Optional "what was it for"                                                                   | Note field (Section 13.4/13.6)                     | EPIC-002, EPIC-003                   | STORY-003, STORY-006 |
| Partial repayments                                                                           | FR-3, FR-5 (confirmed: reduces overall balance)    | EPIC-003                             | STORY-006            |
| Manual indexing is slow                                                                      | FR-7, Section 25 performance                       | EPIC-002                             | STORY-005            |
| Hard to get summarized info (who owes, surplus)                                              | FR-8, Section 11                                   | EPIC-004                             | STORY-009, STORY-010 |
| Dashboard, no landing page                                                                   | Section 2 Non-Goals, IA (Section 12)               | — (structural decision, not a story) | —                    |
| Bare-bones login, third-party auth                                                           | FR-1                                               | EPIC-001                             | STORY-001, STORY-002 |
| Client wants dialogue on ambiguity                                                           | Section 29 Open Questions                          | —                                    | —                    |
| Existing paper ledger's full transaction history needs to carry over (bulk or one-at-a-time) | FR-2 note, Section 22 (`source` field), Section 23 | EPIC-005                             | STORY-011, STORY-012 |
| Dashboard should show that day's transactions                                                | FR-12/FR-14, Section 13.2                          | EPIC-004                             | STORY-013            |
| A transactions page summarizing daily/weekly/monthly, filterable/searchable                  | FR-12, FR-13, FR-14, Section 13.7                  | EPIC-006                             | STORY-014, STORY-015 |
| Customer list should be filterable/sortable like a table too                                 | FR-15, Section 13.3                                | EPIC-006                             | STORY-016            |
| More customer info fields than just phone, since it's a website                              | FR-16, Section 13.4, Section 22                    | EPIC-006                             | STORY-017            |

**No client requirement is currently unmapped.** All stated needs trace to at least one Epic and Story.

---

# 39. Final Quality Audit (Summary)

- **Product:** Problem, goals, and non-goals are explicit; assumptions (Section 28) are separated from confirmed requirements throughout.
- **UX:** All primary journeys (Sections 8, 13) have defined default/loading/empty/error states; forms are explicitly labeled (Sections 13.4, 13.6, 17); the Transactions page's intentional density (Section 13.7) is explicitly justified rather than left as an unexamined exception to "calm by default."
- **Design:** Single coherent direction (Soft/Calm + editorial numeric hierarchy) stated with rationale; Section 7 (anti-slop) checked against — no gradients, no chip-soup, no card-in-card nesting introduced anywhere in this spec, including the new filter/reporting UI.
- **Motion:** Every animation in Section 19 has a stated trigger and purpose; reduced-motion explicitly addressed; new Transactions-page motion kept optional/minimal, consistent with its reporting (not delight-driven) purpose.
- **Technical:** Architecture dependencies (auth → design tokens → customers → import → transactions → dashboard → reporting) are explicit in Section 37; data integrity risk (balance drift) is explicitly designed against in Section 22, and the new reporting layer (EPIC-006) is explicitly required to use server-side aggregation rather than client-side summing (Section 25), preventing a performance cliff once historical import data accumulates.
- **Stories:** Every story has requirements, states, validation, accessibility, responsive, motion, and testable Given/When/Then acceptance criteria; sizing reviewed in Section 36, including the two largest/most complex stories (STORY-006, STORY-011) and their rationale for staying unsplit.
- **Traceability:** Confirmed complete in Section 38 — no orphaned client requirement, including all requirements raised across this entire conversation.

This document is ready to hand to a build agent, starting with EPIC-001.
