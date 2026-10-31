# BahiKhata: rethinking the interface ("The Ledger Page")

**Status:** concept approved by the owner on 19 Oct 2026 (gate G-A3); **not yet validated with users**. The build specification is `PRD-v3.1.md`; the research plan is `RESEARCH-PLAN.md`
**Date:** 19 October 2026
**Companion:** the visual concept canvas (<https://claude.ai/artifact/DkcAZ9KCMNtt5AzFrgRx6a>) and `PRD-v3.md`
**Skills applied:** `/strategize` (framing), `/investigate` (research plan), frontend-design (visual direction)

---

## 0. Read this first

1. **You were right.** The interface looks plain. My v3 design direction (softer tonal surfaces, a light shadow under every card, tinted washes) would have made it _smoother_, not _distinctive_. It is the generic "SaaS card kit": identical rounded cards, one soft shadow, gradient washes. I should have said so in v3. Section 1 explains.
2. **This document proposes a different design idea**, taken from what the product actually replaces: the paper account ledger. It is a concept, shown in four boards on the canvas.
3. **Nothing here is validated.** There has been no research with shop owners. Every claim about what users want is an assumption, tagged as such. Section 7 is a research plan that decides whether to adopt the concept.
4. **The concept changes behaviour in three places** (recording by column, a "who to chase" list, a new database column). Those are product bets, not styling. Section 5 separates them from pure look-and-feel.
5. **I could not look at the rendered canvas.** The boards were built and checked for well-formed markup only. Check them visually before judging.

---

## 1. Diagnosis: why it feels plain, and why v3's styling would not fix it

### 1.1 What makes the current screens read as plain (from your screenshots and the code)

| Observation                                             | Cause                                                                                                                      | Evidence                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Every screen is the same near-black with the same boxes | One neutral hue family; four near-identical surface tones; every region is a bordered card                                 | `src/index.css` tokens                       |
| Lists look like spreadsheets                            | Row = avatar, name, badge, date, menu in identical columns on every page                                                   | Customers, Transactions, Members screenshots |
| Nothing is memorable                                    | Standard shadcn components, one accent colour used for buttons, nav and charts                                             | Whole app                                    |
| The numbers, the product's point, are not the hero      | Money is the same size and weight as labels except in four dashboard tiles                                                 | Dashboard, Customers                         |
| No sense of what this is                                | No brand mark, no illustration, no language of the domain (ledger, khata) anywhere; the login page is a title and a button | Login screenshot                             |

### 1.2 Self-critique of my v3 direction

The frontend-design guidance lists five defaults that appear whatever the subject. My v3 section 5 specified two of them:

- **The SaaS-card kit:** content "chopped into identical rounded cards, one border-radius on everything, the same soft shadow under each, and gradient washes as decoration". v3's `Card`, `StatCard` tones (`tone-receivable` and so on) and `shadow-card` are exactly this.
- **Template chrome:** v3 kept the standard sidebar, top bar, stat-tile row and table-in-a-card layout.

v3's token work is still worth keeping for accessibility reasons (it found that the "You owe" badge fails contrast). The _look_ is what should be replaced.

---

## 2. Strategic frame (`/strategize`)

### 2.1 Situation, complication, resolution

- **Situation.** BahiKhata v2 is a working, secure, multi-business credit ledger. It is well built (469 tests, strict types, role-based access) and PRD v3 completes its functionality (delete, recovery, quick add).
- **Complication.** It looks and feels like any other admin dashboard. For a product whose paper ancestor is a physical, trusted object (the account book), that is a missed opportunity: the interface neither signals trust nor makes the central task faster, and a redesign that only softens the same layout will not change that.
- **Resolution.** Build the interface around the structure of the thing it replaces: a ruled ledger page with columns for what was charged and what was paid, a running balance, and accounting totals. Make the _customer page_ the signature (record an entry by typing into the column you mean), and keep everything else quiet. Validate with shop owners before committing the full build.

### 2.2 The five questions (with evidence status)

| Question                | Answer                                                                                                                      | Evidence status                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Where are we?           | Functionally complete after v3; visually generic; no user research on file                                                  | **Observed** (code, screenshots). No research.               |
| Where should we be?     | Instantly recognisable as a ledger, with the main task (record, check, chase) faster and less error-prone                   | **Assumption**                                               |
| What stands in the way? | The visual system is stock; the recording flow is a modal that hides the customer's history; no sense of "who to follow up" | **Observed** for the first two; **assumption** for the third |
| What are the options?   | A) v3 as specified (soft cards). B) The Ledger Page. C) A bolder consumer-fintech look (gradients, illustration).           | See 2.4                                                      |
| What do we recommend?   | B, gated by a two-week validation (section 7)                                                                               | **Judgment**                                                 |

### 2.3 Strategy brief (template from `/strategize`)

**Context.** Small businesses (assumed: neighbourhood shops and service providers in South Asia) sell on credit and keep a notebook of who owes what. BahiKhata replaces the notebook. Users are an Owner and their staff, often on a phone, often interrupted mid-conversation with a customer.

**Gap.** Today's UI is correct but anonymous, and it spends the user's attention on layout (open dialog, pick customer, pick type) rather than on the balance and the next action.

**Opportunity.** Use the ledger's own structure as the interface. If a customer's page _is_ the ledger, then reading it needs no learning and recording an entry needs one decision (which column), not three.

**Goals** (targets are hypotheses; calibrate against a baseline measured in research, section 7.5):

1. Recording a charge or payment takes fewer steps and less time than today, with no more mistakes of type or amount. _(Target to set after baseline.)_
2. Owners can say, within 10 seconds of opening the app, how much they are owed and whom to follow up with.
3. First impression is "this is a ledger I can trust", not "this is another dashboard". _(Measured by the impression test, 7.4.)_

**Constraints** (all from PRD v2 and v3, none negotiable without a recorded decision):

- Colour meaning stays: `receivable` green, `credit` red-orange (v2 D-10). Structure and brand colours must not collide with them.
- Glossary stays: "Charged" and "Paid" (not Debit/Credit); "Owes you" and "You owe" (v2 UI-CONTRACT).
- 44 px minimum touch targets; WCAG AA for text and tinted badges in both themes; keyboard operable; reduced motion respected.
- One primary action per screen. Money only through `formatMoney`/`Money` with Indian digit grouping and two decimals.
- Component base stays shadcn on Base UI with Tailwind v4; no new runtime dependency except the font swap in 4.2 (needs your approval).

**Guiding principles.**

1. **The ledger is the interface.** Columns, rules and totals carry meaning; none is decoration.
2. **Money is the hero.** Balances are the largest type on their screen.
3. **One memorable thing.** The customer ledger page. Everything else stays disciplined.
4. **Never colour alone.** Position, label and a rule or icon accompany every colour.
5. **Phone first, counter second.** The recording flow must work one-handed on a phone.

**Key assumptions and open questions** (each is tested in section 7):

- A1. Owners think in "who owes me and how old is it" more than in totals. _(drives the Chase list)_
- A2. Typing into a _column_ is a more natural way to choose Charge versus Payment than a toggle. _(drives the entry row)_
- A3. A paper-ledger look builds trust rather than reading as old-fashioned. _(drives the whole concept)_
- A4. Dotted-leader rows scan faster than avatar-and-badge rows.
- A5. Most recording happens on phones.
- A6. Newest-first with the entry row at the top is better than a paper-style bottom-of-page entry.

**Scope.** Phase 1 (this concept): visual system, shell, dashboard, customer ledger, customers list, dialogs, mobile. Out of scope: Bangla translation, light/dark preference redesign beyond the two themes, printing statements.

### 2.4 The three options considered

|                 | A. v3 as specified                      | B. The Ledger Page (recommended)                                   | C. Consumer-fintech                                   |
| --------------- | --------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| Idea            | Soft tonal cards, shadows, tinted tiles | The screen is a ruled ledger; accounting structure carries meaning | Gradient hero card, illustrations, rounded everything |
| Distinctiveness | Low (the common default)                | High and specific to the subject                                   | Medium (also a common default)                        |
| Cost            | Lowest (already specified)              | Medium (new primitives, one database column)                       | Medium to high (illustration assets)                  |
| Risk            | It still reads as plain                 | Might feel old-fashioned or cramped on a phone (A3, A4)            | Feels like a payments app, which this is not          |
| Verdict         | Keep only its accessibility fixes       | **Recommend, after validation**                                    | Reject                                                |

---

## 3. The concept in one page

**The memorable thing.** A customer's page is a real ledger: _Date, Particulars, Charged, Paid, Balance_, ruled lines, a blue margin rule, a running balance, and totals set the way accountants set them (a single rule above, a double rule below). The **entry row** sits at the top of the ledger. You record a charge by typing in the _Charged_ column and a payment by typing in the _Paid_ column. The balance after saving is previewed live.

**What stays quiet.** Everything else: one brand colour (blue-black ink), square corners (3 px), hairline rules instead of boxes, no shadows, no gradients. The only large flourish is the numerals.

**Where the ideas come from** (subject matter, not trend):

- _Columnar accounting pads_ are pale green-grey, hence **Paper** `#E6ECE4` and **Sheet** `#F4F7F1` (not cream).
- _Fountain-pen ink_ is blue-black, hence **Ink** `#13203A` and **Parker blue** `#1D3FBF` as the only brand colour.
- _Ledger structure_: ruled rows, a margin line, running balance, totals with a double underline.
- _Restaurant bill and ledger leaders_: a dotted leader from a name to its amount, which also makes long names and short amounts easy to match.
- _Tally marks_ (four strokes and a diagonal) as the logo: counting by hand is where credit books began.
- _The shop chalkboard_ inspires the dark theme, **Slate** `#0D1613`.

**Navigation as a book spine.** The sidebar is a solid ink column; the current page is a tab in the page colour that joins the content, like an index tab on a ledger.

### 3.1 What each board shows

| Board                | Shows                                                                                                                                                                                                                                                                |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard            | "Where you stand": owed to you, you owe, and a **Net position** total with a double rule. "Who to chase": largest balances with leaders and age flags. "Day book": recent entries in Charged and Paid columns. "This week": a plain bar chart with a ruled baseline. |
| Customer ledger      | The signature page: header with the balance set as a total; the entry row (a charge of 15,000 typed, preview of the balance after); seven entries with running balance; a voided entry struck through and kept; totals with the double rule.                         |
| Mobile, dark (Slate) | The dashboard and the customer page on a phone: bottom tabs; the entry panel with **Charged / Paid** as two big choices and a very large amount field.                                                                                                               |
| Design language      | Palette (both themes), type, and the four structural devices.                                                                                                                                                                                                        |

All figures on the boards are mock data. The ledger's arithmetic is internally consistent (charged ₹2,49,011.00, paid ₹11,572.00, balance ₹2,37,439.00).

---

## 4. Design system specification

### 4.1 Colour (verified)

Hex values are what the canvas uses. OKLCH values are the exact conversions for `src/index.css`. All pairs below pass WCAG AA (4.5:1 for text, including text on 10% tinted chips in light and 8% in dark; 3:1 for control borders) in both themes: **82 contrast checks (41 per theme: text, tinted chips, control borders), 0 failures**, run on the exact OKLCH tokens in `design/design-tokens.ledger.css`, run on the hex values.

| Role (existing token)           | Light, "Columnar"                      | Dark, "Slate"                          |
| ------------------------------- | -------------------------------------- | -------------------------------------- |
| `--background` (Paper)          | `#E6ECE4` `oklch(0.936 0.012 138)`     | `oklch(0.150 0.018 263)`                 |
| `--card`, `--popover` (Sheet)   | `#F4F7F1` `oklch(0.972 0.009 129)`     | `oklch(0.190 0.017 263)`                 |
| `--foreground` (Ink / Chalk)    | `#13203A` `oklch(0.247 0.053 263)`     | `oklch(0.930 0.010 263)`                 |
| `--muted-foreground`            | `#4A5870` `oklch(0.458 0.043 261)`     | `oklch(0.680 0.018 263)`                 |
| `--primary` (Parker blue)       | `#1D3FBF` `oklch(0.438 0.203 266)`     | `#93ABFF` `oklch(0.757 0.124 271)`     |
| `--primary-foreground`          | Sheet `#F4F7F1`                        | Background `oklch(0.150 0.018 263)`     |
| `--receivable`                  | `#1B6B3A` `oklch(0.468 0.109 152)`     | `#72D391` `oklch(0.790 0.132 153)`     |
| `--credit`                      | `#B03A1A` `oklch(0.515 0.160 35)`      | `#FF9C82` `oklch(0.789 0.125 36)`      |
| `--warning` (age flag)          | `#7A5200` `oklch(0.471 0.099 76)`      | `#E3B04B` `oklch(0.785 0.131 82)`      |
| `--sidebar` (spine)             | Ink `#13203A` (text `#C9D3E6`, 10.8:1) | `oklch(0.120 0.014 263)` (text `oklch(0.680 0.018 263)`, 7.05:1) |
| `--border` (rules, decorative)  | Ink at 16%                             | Foreground at 14% (hue 263)            |
| `--input` (control border, 3:1) | Ink mixed 55% into Sheet (3.65:1)      | `oklch(0.648 0.018 263)` (5.67:1)       |
| `--margin` (ledger margin rule) | Blue at 38%                            | Blue at 40%                            |

Notes. (a) The receivable and credit hues are close to, but not identical to, the v2 tokens; their meaning is unchanged. The v2 credit colour fails AA on tinted chips (4.18 to 4.48 measured), the ledger credit colour passes. (b) Convert the dark spine hex with the same method when implementing, then update `scripts/contrast-audit.cjs` tables and re-run it with `scripts/check-token-sync.cjs`. (c) "Parker blue" is only a description; there is no trademark use.

### 4.2 Type

| Role                | Family                                                                      | Use                                                                                                |
| ------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Display and figures | **Bricolage Grotesque** (variable, optical size 12 to 96; weights 500, 700) | Page titles, hero balances, section headings                                                       |
| Text and UI         | **Public Sans** (already in the app)                                        | Everything read or typed; all tables; every money column uses `font-variant-numeric: tabular-nums` |

Scale: 15 px body (1.45), 13 px secondary, 14 to 15 px table, 20 px section heading, 34 to 40 px hero figure, 36 to 38 px page title. Letter-spacing `-0.02em` on display only. Lines under 80 characters. No all-caps labels and no tracked eyebrows.

**Decision (verified):** the first draft paired Bricolage Grotesque with Instrument Sans. Inspecting the font files showed Instrument Sans has **no rupee sign in any subset**, so every ₹ in a money column would have fallen back to another font. Public Sans and Bricolage Grotesque both contain the rupee sign and tabular figures. So Public Sans stays for text and money, and only Bricolage Grotesque is added (story L-02, one new dependency). Add `"Noto Sans Bengali"` to the font stack now so a later Bangla translation does not need a redesign.

### 4.3 Shape, depth, motion

- **Radius** `--radius: 0.1875rem` (3 px) everywhere. Square-cornered monograms. No pills.
- **No shadows.** Separation comes from rules and the Paper/Sheet difference. Menus and dialogs use a 1 px border and a 2 px ink rule on top (like a page header line).
- **Rules** are information: hairline between rows; margin rule between Date and Particulars; the totals rule (single above, double below) only on totals.
- **Motion:** one moment only. When an entry is saved, the new row reveals left to right in 200 ms (`clip-path`). Everything else is instant. Disabled under `prefers-reduced-motion`.

### 4.4 Signature components (new)

| Component     | Purpose                                                                                                     | Notes                                                                                                                                                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LeaderRow`   | Name and amount joined by a dotted leader                                                                   | Used on dashboard, customers list, mobile. Amount `tabular-nums`; leader is decorative (`aria-hidden`), so give the row `role="listitem"` and put label and amount in reading order. |
| `TotalsRule`  | Wraps a total with the single and double rules                                                              | Net position, ledger totals, customer balance.                                                                                                                                       |
| `Monogram`    | Square 32 px initials tile; green tint if the person owes you, red tint if you owe them, neutral if settled | Replaces round `Avatar` in lists. Keep `Avatar` with the image fallback for signed-in user and member photos.                                                                        |
| `AgeFlag`     | "30+ days" or "40+ days" chip                                                                               | Warning colour with text; never colour alone.                                                                                                                                        |
| `LedgerTable` | CSS-grid table: Date, Particulars, Charged, Paid, Balance, actions; margin rule; header tint; totals row    | Real `<table>` semantics (`role` attributes on grid) must be kept for screen readers. Scrolls horizontally inside its box under 860 px.                                              |
| `EntryRow`    | The inline form at the top of `LedgerTable`                                                                 | See 4.5.                                                                                                                                                                             |
| `SpineNav`    | Ink sidebar with the current item as a Paper-coloured tab                                                   | Replaces the tinted sidebar item.                                                                                                                                                    |
| `TallyMark`   | Four strokes and a diagonal, as logo and empty-state mark                                                   | Inline SVG.                                                                                                                                                                          |

### 4.5 The entry row (the signature interaction)

```gherkin
Feature: Record an entry in the column you mean

  Scenario: Charge
    Given I am an Editor on Rahim's ledger and his balance is ₹2,37,439.00
    When I type 15000 in the Charged column
    Then the row shows "after: ₹2,52,439.00" and Save is enabled

  Scenario: Payment
    When I type 8500 in the Paid column instead
    Then the Charged column is cleared, and the preview shows the balance reduced by 8,500

  Scenario: Both columns filled
    When Charged and Paid both contain an amount
    Then Save is disabled and the message "Enter either Charged or Paid" is shown (after the fields are touched)

  Scenario: Fast keyboard flow
    When I press Enter with a valid amount
    Then the entry is saved dated today, the row reveals into the ledger, the entry row clears and focus returns to the Charged column

  Scenario: Phone
    Given a screen under 640 px
    Then Charged and Paid are two large choices above one large amount field, and Save reads "Add charge" or "Add payment"

  Scenario: No write access
    Given I am a Viewer, or the customer is archived
    Then there is no entry row
```

Validation, limits and the `created_by` rules are those of v2 and PRD v3 (positive amount, at most 2 decimals, note up to 500 characters). The global "Add transaction" dialog stays for recording from any page.

### 4.6 Screen by screen

| Screen                            | Change                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**                     | Replace the four stat tiles and lists with: _Where you stand_ (Owed to you, You owe, **Net position** in a `TotalsRule`); _Who to chase_; _Day book_ (recent entries in Charged and Paid columns); _This week_ chart with a ruled baseline. Keep "Today's activity" as a link in the position block. |
| **Customers list**                | One summary `TotalsRule` block instead of three tiles. Rows become `LeaderRow` with `Monogram`, phone and last-activity beneath. Filters are plain text tabs with an ink underline.                                                                                                                  |
| **Customer detail**               | The signature page: header with the balance in a `TotalsRule`; `LedgerTable` with `EntryRow`; voided rows struck through and kept; totals.                                                                                                                                                           |
| **Transactions**                  | Day-book table with **Charged** and **Paid** columns (instead of Type and Amount), totals row with the double rule. CSV export unchanged.                                                                                                                                                            |
| **Add / edit transaction dialog** | Same two-column idea in compact form (customer, then Charged / Paid fields), balance preview, one primary button.                                                                                                                                                                                    |
| **Members, Settings, Import**     | Ruled tables and sections; Danger zone set off by a double rule; import steps keep their numbering (that content really is a sequence).                                                                                                                                                              |
| **Login and empty states**        | `TallyMark`, one sentence, a faint ruled-paper background. Empty list: a blank ruled page with one sentence and one action.                                                                                                                                                                          |
| **Delete and void**               | Strike-through is the shared visual language for "no longer counted"; Recently deleted lists struck-through names.                                                                                                                                                                                   |
| **Mobile**                        | Bottom tabs (44 px or larger), Net position as the hero figure, entry panel as a bottom sheet.                                                                                                                                                                                                       |

---

## 5. What is styling and what is a product bet

| Item                                                                        | Type                   | Needs                                                                                            |
| --------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| Palette, type, shape, rules, spine navigation, `TallyMark`, Slate theme     | **Look only**          | Front-end work                                                                                   |
| Dashboard recomposition, ledger table, Charged/Paid columns on Transactions | **Layout, same data**  | Front-end work                                                                                   |
| **Entry row (typing into columns)**                                         | **Behaviour bet** (A2) | Front-end work; test with users                                                                  |
| **Who to chase** (largest balances flagged by days since last payment)      | **Feature bet** (A1)   | One database change below; a 30-day threshold (default; make it a setting only if research asks) |
| Square monograms instead of round avatars in lists                          | Look, but loses faces  | Test recognition (A4)                                                                            |
| Newest-first ordering retained                                              | No change              | —                                                                                                |

**Database change for "Who to chase"** (tested on a scratch Postgres: a voided payment is ignored; a customer who never paid gets NULL; the customers-to-balances embed still works):

```sql
drop function if exists public.customer_balances(public.customers);
drop view     if exists public.customer_balances;
create view public.customer_balances with (security_invoker = true) as
select c.id, c.business_id,
  coalesce(sum(case when t.type = 'charge' then t.amount else -t.amount end)
    filter (where t.status in ('active','edited')), 0) as balance,
  c.archived_at,
  max(t.occurred_at) filter (where t.status in ('active','edited')) as last_activity_at,
  max(t.occurred_at) filter (where t.type = 'payment' and t.status in ('active','edited')) as last_payment_at
from public.customers c
left join public.transactions t on t.customer_id = c.id and t.business_id = c.business_id
where c.deleted_at is null
group by c.id;

create or replace function public.customer_balances(p_customer public.customers)
returns setof public.customer_balances rows 1 language sql stable security invoker
set search_path = public as $$
  select cb.id, cb.business_id, cb.balance, cb.archived_at, cb.last_activity_at, cb.last_payment_at
  from public.customer_balances cb where cb.id = p_customer.id; $$;

revoke execute on function public.customer_balances(public.customers) from public, anon;
grant  execute on function public.customer_balances(public.customers) to authenticated;
```

It ships as `supabase/migrations/20261108000000_v31_last_payment_at.sql` with section 19 of the SQL test suite (voided payments ignored, NULL when never paid, embed intact, RLS scoping). The column is added whichever way gate G-A1 is decided.

---

## 6. Effect on PRD v3

**Proceed unchanged now** (no dependency on the look): S-44 to S-56 (foundations, database, delete and recovery) and S-53 (customers list payload).

**Replaced:** S-57 to S-66 (tokens, primitives, shell and the page restyles). They specify the soft-card direction and should not be built if the Ledger Page is chosen.

**Keep from the held stories regardless of look** (they are fixes, not styling):

1. Money formatting: the 11 hand-formatted sites and the `noRawMoney` guard test (S-58 step 10 and 11).
2. Route-title map, one visible page title, one primary "Add transaction" (S-59 steps 1 to 3).
3. The contrast audit and token-sync scripts, retargeted at the ledger palette (S-46, S-57).
4. Image fallback on `Avatar` (still used for members and the signed-in user).
5. The StatCard clipping cause: do not pass fixed large sizes into a four-column grid (moot if the tile row is replaced, but keep the lesson for the Customers summary if tiles remain).

**New story set (now written).** The build is specified in `PRD-v3.1.md` as stories **L-00 to L-14** with full Given/When/Then, tests and commands. Two stories are gated on research: **L-12** (entry row, gate G-A2) and **L-13** (Who to chase, gate G-A1). The look itself is gate G-A3, approved by the owner on 19 Oct 2026 before research; the gates are recorded in `RESEARCH-DECISIONS.md`.

---

## 7. Research plan (`/investigate`)

### 7.1 Research objective

Decide whether to adopt the Ledger Page, and refine it, by learning:

| #   | Question                                                                                                                  | Tests assumption |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| RQ1 | How do shop owners and their staff record credit and chase payment today: when, where, on which device, with what errors? | A1, A5           |
| RQ2 | Is recording faster and less error-prone when you type into the Charged or Paid column than with today's dialog?          | A2               |
| RQ3 | Do owners need to know who has not paid for a long time, and what do they do with that knowledge?                         | A1               |
| RQ4 | Does the ledger look build trust, or read as dated, childish or cramped?                                                  | A3               |
| RQ5 | Are dotted-leader rows, double-rule totals and Indian-grouped figures easy to read on a phone in daylight?                | A4               |
| RQ6 | What language and numeral expectations exist (English, Bangla, Hindi; Latin or native digits)?                            | scope            |

### 7.2 Method and rationale

Mixed, in two rounds of one week each. Qualitative first because we do not yet know _how_ the work happens; a small comparison second because the main question is about two specific designs.

| Round    | Method                                                                                                       | Why this method                                                                          | n                              |
| -------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------ |
| 1        | Semi-structured **contextual interviews at the shop**, including watching a real recording                   | Behaviour and context (device, interruptions, disputes) cannot be inferred from a survey | 6 to 8                         |
| 2a       | **Moderated usability test**, within-subject: current dialog flow vs Ledger entry row, order counterbalanced | Compares speed, errors and confusion on the same tasks                                   | 6                              |
| 2b       | **Five-second impression test** and first-click test of three dashboards (current, v3 soft cards, Ledger)    | Cheap read on trust and first impression (RQ4); not a substitute for 2a                  | 15 to 20 (remote)              |
| Optional | **Short survey** to existing users, to size A1 and A5                                                        | Sizing, not discovery; run only if a user list exists                                    | 50 or more for descriptive use |

Qualitative samples of 5 to 8 find the common problems; they cannot give percentages. Report counts ("5 of 6"), never "users want".

### 7.3 Participants

- **Target:** owners or staff who record credit sales in a small shop or service business; 5 or more regular credit customers; use a smartphone daily.
- **Mix (round 1 and 2a):** paper-notebook users, spreadsheet users, users of another credit-ledger app, and current BahiKhata users; at least two staff who record on the owner's behalf; mix of age and of reading comfort in English.
- **Screener questions:** (1) Do you sell on credit to regular customers? (2) About how many are owed money right now? (3) How do you record it today (notebook, spreadsheet, an app, memory, other)? (4) Do you or an employee do the recording? (5) Which language do you read most easily? Exclude anyone who works for a software company or a competitor.
- **Recruitment caution:** the business in your screenshots is a test business, so the current user base may be only the team. Do not treat the team as the user. Recruit through shop owners in a market, and plan for an interpreter and for sessions in Bangla or Hindi.
- **Consent and privacy:** written or recorded verbal consent; no real customer names or balances shown (use the mock data on the canvas); say recordings are for research only; offer a small incentive.

### 7.4 Instruments

**Round 1 interview guide (45 minutes).**

1. _Warm-up (5 min)._ Tell me about your shop. How long have you run it? Who helps you?
2. _Recent instance (10 min)._ Think of the last time someone took goods on credit. Walk me through what happened, from the moment they asked. Where was the notebook or phone? What did you write, and when? (Probe: what happened if you were interrupted? who else could see it?)
3. _Recording (8 min)._ Show me how you record one now (observe, do not correct). Which part is slowest? Have you ever recorded the wrong amount or the wrong person? What did you do?
4. _Following up (10 min)._ How do you decide whom to remind? How do you do it (in person, call, message)? How long until you consider a balance a problem? Tell me about the last difficult one.
5. _Disputes and trust (5 min)._ Has a customer disagreed with a balance? How did you settle it? What would make a record believable to them?
6. _Tools (4 min)._ What have you tried besides the notebook? What did you stop using, and why? Which device do you use at the counter?
7. _Close (3 min)._ If you could change one thing about how you keep credit, what would it be? Anything I did not ask that I should have?

Rules: ask about specific past events, not opinions; do not mention the concepts until the end; do not explain the product; probe silence.

**Round 2a usability tasks** (mock data; think-aloud; Seven-point "how easy was that" after each task; System Usability Scale at the end). Observers use a template: timestamp, task, observation, severity.

| Task       | Scenario wording                                                          | Success                        | Measures                              |
| ---------- | ------------------------------------------------------------------------- | ------------------------------ | ------------------------------------- |
| T1         | "Rahim Uddin took fabric worth 15,000 rupees on credit today. Record it." | Correct customer, amount, type | Time, taps, errors                    |
| T2         | "Later, Rahim paid 8,500 through bKash. Record it."                       | Recorded as a payment          | Time; any wrong-type attempt          |
| T3         | "You see an entry of 36,608 entered twice by mistake. Cancel one."        | Voided, not edited             | Time; found without help?             |
| T4         | "It is Monday. Which two customers would you call first?"                 | Names two with a reason        | Time; reasoning aloud (RQ3)           |
| T5         | "How much is owed to you in total?"                                       | Correct figure                 | Time; confusion over Owed / Owe / Net |
| T6 (Owner) | "Remove the test customer, then bring them back."                         | Deleted and restored           | Time; errors; confidence              |

**Impression test (2b).** Show each dashboard for 5 seconds, then ask: (1) What is this app for? (2) Would you trust it with your customers' balances? 1 to 5. (3) Pick up to three words: _clear, old-fashioned, professional, childish, cramped, trustworthy, modern, busy_. (4) First-click: "Where would you tap to record a payment?" Randomise order; do not reveal which is which.

**Optional survey (about 12 questions, 5 to 8 minutes).** Screener (3); easy questions first: how often do you record credit per week (choose a range), device used most (choose one); how do you decide whom to chase (choose all that apply plus Other); the most recent time a balance went unpaid for over a month (Yes/No, then one open question); one seven-point item each on "I know at a glance who owes me the most" and (reverse-worded) "I often lose track of how long a balance has been unpaid"; language preference; demographics last. Randomise option order; no double-barrelled items; pilot with 5 to 10 people first.

### 7.5 Baseline, analysis and decision rules

**Baseline.** In round 2a, time and error counts on T1 to T3 with _today's_ flow are the baseline for goal 1. Set numeric targets only after seeing them.

**Synthesis.** Round 1: affinity map bottom-up (one observation per note, no pre-made categories), then Braun and Clarke thematic analysis. Round 2: task tables plus counts. Write each insight as **observation + inference + implication**, tag evidence strength (strong: three or more sources; moderate: two or a clear majority in one; weak: single), and always state n.

**Decision rules (proposed thresholds; adjust before starting, not after).**

| Result                                                                                                                                      | Decision                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| T1 and T2 both complete with no wrong-type error for at least 5 of 6, **and** median time no worse than today's flow                        | Adopt `EntryRow` (A2 supported)                                                                   |
| 2 or more of 6 record a payment in the wrong column, or need help                                                                           | Keep the dialog as primary; use the ledger table read-only; revisit the entry row                 |
| At least 4 of 6 name one or more customers to chase by _age of debt_ in T4 and in round 1 describe doing it                                 | Build "Who to chase" (A1 supported)                                                               |
| Fewer than 3 of 6 describe chasing by age                                                                                                   | Defer "Who to chase"; keep the dashboard without it                                               |
| Impression test: Ledger rated at least as trustworthy as the current design, and "old-fashioned" or "childish" chosen by fewer than a third | Adopt the Ledger look (A3 supported)                                                              |
| Otherwise                                                                                                                                   | Keep the structural ideas (rules, totals, columns, leaders) and drop the paper and tally identity |
| Phone legibility: 2 or more of 6 cannot read a leader row or total without prompting                                                        | Simplify leaders on small screens                                                                 |

**Risks to the research.** Small samples; recruiting only technical users; prototype fidelity (the canvas boards are static and must become clickable, about 2 to 3 days of work, for round 2a); interpreter effects; Hawthorne effect in observed recording.

### 7.6 Timeline and handoffs

| Week | Work                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0    | Recruit and screen; build a clickable prototype of T1 to T3 for both flows; interpreter and consent forms; pilot one session |
| 1    | Round 1 interviews; synthesis notes after every session                                                                      |
| 2    | Round 2a usability sessions; round 2b impression test runs in parallel                                                       |
| 3    | Synthesis, insight statements with evidence strength, decision readout against the rules above                               |

Hand the readout to `/strategize` to update the brief, then to `/journey` (entry and chase flows), `/articulate` (copy for Charged, Paid, age flags, empty states), `/fortify` (states and errors for the entry row) and `/specify` (the L-series stories).

---

## 8. Risks and honest caveats

| Risk                                                           | Mitigation                                                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| The paper-ledger look reads as old-fashioned or skeuomorphic   | It is restrained (no textures, no handwriting, no faux binding); impression test decides (A3); fallback keeps structure and drops the identity |
| Dotted leaders break on narrow screens or with very long names | Leaders collapse below 360 px; test on real phones; names truncate with the full name in the accessible label (amounts never truncate)         |
| Square monograms lose the recognition that photos give         | Photos were never shown for customers (only initials), so little is lost; test recognition in 2a                                               |
| Fonts lack tabular figures or render Indian grouping unevenly  | Verify in L-02; fall back to Public Sans for money columns                                                                                     |
| Bangla and Hindi text                                          | Font stack ready; copy and layout tested later; out of scope now                                                                               |
| Typing into the "right column" is slower for some people       | Mobile uses an explicit Charged/Paid choice; research decides desktop (rule in 7.5)                                                            |
| Entry row at the top versus paper-style at the bottom          | Newest-first retained (A6); can be tested                                                                                                      |
| Dark "Slate" theme legibility in bright shops                  | Both themes audited; test outdoors in 2a if possible                                                                                           |

---

## 9. What was and was not verified

| Item                                                                      | Status                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette contrast, both themes                                             | **Verified**: 36 text and tint pairs plus control-border checks, 0 failures, computed on the hex values                                                                                                                                                                                              |
| OKLCH tokens                                                              | Computed from the hex values for all 29 colour tokens per theme, applied to a pristine clone, and audited (82 checks)                                                                                                                                                                                |
| `last_payment_at` SQL                                                     | **Verified** on a scratch Postgres 16 (voided payments ignored, NULL when never paid, embed function intact)                                                                                                                                                                                         |
| Canvas boards                                                             | Rendered in a headless browser and reviewed; this found and fixed unreadable sidebar links, a crushed language-board column, a missing Save button and tiny chart labels. Rendered with fallback fonts (the font CDN is not reachable from the review sandbox), so exact type spacing is unconfirmed |
| Font behaviour                                                            | **Verified in the font files**: Public Sans and Bricolage Grotesque both contain the rupee sign and the `tnum` feature; Instrument Sans has no rupee sign (rejected). Visual evenness of Indian-grouped figures in the real app is not yet checked                                                   |
| Any statement about what shop owners want, or how quickly they can record | **Assumption**; nothing has been tested with users                                                                                                                                                                                                                                                   |
| Competitors                                                               | I know of other credit-ledger apps and the paper notebook from general knowledge; I have not studied their current designs, so this document makes no claims about them                                                                                                                             
| --- | --- |
| Palette contrast, both themes | **Verified**: 36 text and tint pairs plus control-border checks, 0 failures, computed on the hex values |
| OKLCH tokens | Computed from the hex values for all 29 colour tokens per theme, applied to a pristine clone, and audited (82 checks) |
| `last_payment_at` SQL | **Verified** on a scratch Postgres 16 (voided payments ignored, NULL when never paid, embed function intact) |
| Canvas boards | Rendered in a headless browser and reviewed; this found and fixed unreadable sidebar links, a crushed language-board column, a missing Save button and tiny chart labels. Rendered with fallback fonts (the font CDN is not reachable from the review sandbox), so exact type spacing is unconfirmed |
| Font behaviour | **Verified in the font files**: Public Sans and Bricolage Grotesque both contain the rupee sign and the `tnum` feature; Instrument Sans has no rupee sign (rejected). Visual evenness of Indian-grouped figures in the real app is not yet checked |
| Any statement about what shop owners want, or how quickly they can record | **Assumption**; nothing has been tested with users |
| Competitors | I know of other credit-ledger apps and the paper notebook from general knowledge; I have not studied their current designs, so this document makes no claims about them |
