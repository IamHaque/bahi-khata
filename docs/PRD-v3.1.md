# BahiKhata: Product Requirements Document, Version 3.1

**Title:** Complete CRUD, Recovery, the Ledger Page interface, and a Hardened Foundation
**Status:** Ready for implementation
**Date:** 19 October 2026
**Supersedes:** `PRD-v3.md` (this document replaces it; do not use v3)
**Extends:** `docs/PRD-v2.md` (all of v2 stays in force unless section 2.3 overrides it)
**Baseline reviewed:** repository `IamHaque/bahi-khata`, commit `506cc0d` (17 Oct 2026)
**Story numbering:** **S-44 to S-56** (foundations, database, delete and recovery; unchanged from v3), then **L-00 to L-14** (the Ledger Page; replaces v3's S-57 to S-66), then **S-67 and S-68** (release)
**Delivered with this PRD:** a handoff bundle (section 0.2) with tested SQL, tokens, scripts, CI, the research plan and standalone design boards. The SQL, scripts and tokens were executed and verified; copy them, do not re-derive them.

### What changed from PRD v3

| Area | v3 | v3.1 |
|---|---|---|
| Visual direction | Soft tonal cards, shadows, tinted washes (generic "SaaS card kit") | **The Ledger Page**: the screen is a ruled ledger; columns, rules and totals carry meaning (section 5) |
| Design stories | S-57 to S-66 | **L-00 to L-14** (new) |
| Fonts | Public Sans only | Public Sans for text and money; **Bricolage Grotesque** for headings and figures (one new dependency, L-02) |
| Database | Two migrations, 18-section test suite | **Three** migrations (adds `last_payment_at`), **19** sections |
| Contrast audit | 100 checks | **82** checks on the real ledger tokens (41 per theme) |
| Unvalidated bets | not separated | **Gates** in `docs/RESEARCH-DECISIONS.md`: entry row (G-A2), Who to chase (G-A1), the look itself (G-A3) |
| Research | not planned | `docs/RESEARCH-PLAN.md`, run in parallel with the build |

Phases A to D (S-44 to S-56) are the same as in v3 apart from the cross-references and the three-migration database story (S-50).

---

## 0. How to use this document

### 0.1 If you are the implementing agent

Read `docs/AGENT-PROMPT-v3.1.md` first, then section 6 here (Agent operating contract), then do the stories in the order of section 7. Every story states exactly which files to touch, what to write, what the behaviour must be (Given, When, Then), which tests to add, which commands must pass, and the commit message. Where a story says **copy**, copy the file from the bundle byte for byte. Where it says **grep**, run that exact command and handle what it finds. Do not make product decisions: if something is not specified, section 10 gives the default. Three stories depend on `docs/RESEARCH-DECISIONS.md` (L-00, L-12, L-13): read it, never edit it. If you hit a **STOP** condition (section 6.4), stop and report instead of improvising.

### 0.2 The handoff bundle

Unzip it somewhere (for example `/tmp/v3-bundle`) and copy files into the repository as each story says. Everything in it was verified before delivery.

| Bundle path | What it is | Used by |
|---|---|---|
| `docs/PRD-v3.1.md`, `docs/AGENT-PROMPT-v3.1.md` | This specification and the agent prompt | setup |
| `docs/RESEARCH-DECISIONS.md` | The gate file (statuses for the three bets) | L-00, L-12, L-13 |
| `docs/RESEARCH-PLAN.md` | The research plan for humans (interviews, tests, decision rules) | humans |
| `docs/UI-RETHINK-LedgerPage.md` | Rationale, strategy and risks for the design direction | reference |
| `supabase/migrations/20261017000000_bahikhata_consolidated_schema.sql` | v2 schema in one idempotent file, in dependency order, plus hardening | S-50 |
| `supabase/migrations/20261101000000_v3_deletion_log_and_integrity.sql` | Delete, log, restore, actor stamping, timezone | S-50 |
| `supabase/migrations/20261108000000_v31_last_payment_at.sql` | `customer_balances.last_payment_at` | S-50 (used by L-13) |
| `supabase/tests/bahikhata_consolidated_tests.sql` | One SQL test file, 19 sections | S-50 |
| `supabase/tests/ci/supabase_stub.sql` | CI-only stand-in for Supabase's `auth` schema and roles | S-46 |
| `scripts/run-sql-tests.sh` | Runs migrations then the SQL tests on a scratch Postgres | S-46 |
| `scripts/contrast-audit.cjs` | WCAG AA audit of the ledger tokens in both themes (82 checks) | S-46, L-01 |
| `scripts/apply-tokens.cjs`, `scripts/check-token-sync.cjs` | Apply the token file to `src/index.css`; fail if the two drift | S-46, L-01 |
| `scripts/check-bundle-size.cjs` | Fails if any JS chunk exceeds 500 kB | S-46, S-48 |
| `design/design-tokens.ledger.css` | The exact tokens and structural utilities | L-01 |
| `design/ledger-boards/*.html` | Four standalone design boards (dashboard, customer ledger, mobile dark, design language); open in a browser | L-04 to L-13 (visual reference) |
| `.github/workflows/ci.yml` | The CI workflow | S-46 |

**The boards are a visual reference, not a source of code.** Where a board and this PRD differ, **this PRD wins**.

### 0.3 Reading the story cards

Each story has: **Why**, **Touches** (files), **Do** (numbered steps), **Behaviour** (Gherkin), **Tests**, **Verify** (commands that must pass), and **Commit**. A story is done only when its **Verify** commands pass and its **Behaviour** scenarios are covered by tests (or, for layout that a unit test cannot judge, by a manual check recorded in `docs/PROGRESS.md`).

---

## 1. Context and review findings

### 1.1 Where the product stands

v2 delivered a multi-business, role-based credit ledger: businesses, members and invitations, customers (create, edit, archive, restore, delete permanently), transactions (create, edit, void, restore), a dashboard, a customer ledger, a statement, transaction rollups, CSV import and export, and an accessibility-conscious design contract. It is well engineered: strict TypeScript, almost no `any`, no `TODO`, no stray `console` calls, one `api.ts` per feature as the only place that talks to Supabase, and 469 passing tests.

v3 finishes what v2 left open and fixes what a full review found.

### 1.2 What the review verified

Every row below was checked by running code or reading the source, not assumed. "Evidence" says how.

| # | Finding | Evidence | Addressed by |
|---|---|---|---|
| F-01 | **Transactions cannot be deleted.** The database has no DELETE policy for them; the UI offers only Void. | `supabase/` RLS and `features/transactions` actions | S-50, S-54 |
| F-02 | **Customers can be deleted only when already archived, and only from the list row menu.** Not from the customer detail page; active customers need a two-step detour. | `CustomersPage.tsx` row actions; no delete in `CustomerDetailPage.tsx` | S-55 |
| F-03 | **Deletion is unrecoverable.** `delete_customer_permanently` destroys the customer and all transactions with no record. | Migration `0004` | S-50, S-56 |
| F-04 | **Audit fields are forgeable.** An Editor could write `created_by` as the Owner. `business_id` could be changed by an editor of two businesses, stranding a customer's transactions in another tenant. | Reproduced against the schema | S-50 |
| F-05 | **The migration chain cannot build a fresh database.** Files sort by name, so `0001…0010` run before the baseline that creates `customers`; `supabase db reset` fails at `0001`. Version prefixes are duplicated (`0009` twice, `0010` twice) and `0002b/0003b/0006b` are not numeric, which the CLI cannot track. | Reproduced: fresh apply fails with "relation customers does not exist" | S-50 |
| F-06 | **Signed-out users can execute 13 database functions** (10 are `SECURITY DEFINER`). Harmless today, not a position to leave. | `has_function_privilege('anon', …)` | S-50 |
| F-07 | **Production dependency audit: 12 vulnerabilities (1 critical, 9 high, 2 moderate).** All come from dev tooling listed under `dependencies`: `shadcn`, `jsdom`, `@testing-library/*`. After moving them to `devDependencies` and running `npm audit fix`: **0**. | `npm audit --omit=dev`, before and after | S-45 |
| F-08 | **One 1,397 kB JavaScript file (421 kB gzipped).** No route-level code splitting; Vite warns. Measured with lazy routes plus vendor chunks: largest chunk 353 kB, `/login` first load about 300 kB gzipped. | `npm run build` before and after | S-48 |
| F-09 | **CI is thin.** Runs on `push` only, not on pull requests. No SQL tests, no dependency audit, no contrast check, no bundle guard. | `.github/workflows/ci.yml` | S-46 |
| F-10 | **The unit-test suite takes 169 s** (54 files, 469 tests, all passing). | `npm test` | S-49 |
| F-11 | **No environment validation.** A missing `VITE_SUPABASE_URL` fails with a cryptic runtime error. No `.nvmrc` or `engines`. | `src/lib/supabase.ts`, `package.json` | S-44, S-47 |
| F-12 | **Dashboard "today" is cut in UTC**, but the Transactions page uses the user's timezone, so "today" disagrees for users outside UTC (backlog B-09). | `dashboard_summary` source | S-50, S-52 |
| F-13 | **The customers list downloads every transaction date for every customer** just to find the latest one, and counts voided entries as activity (backlog B-01). | `queryCustomers`: `select("*, customer_balances!inner(balance), transactions(occurred_at)")` | S-50, S-53 |
| F-14 | **The "You owe" badge fails WCAG AA** (contrast 4.18 to 4.48 against the 4.5 minimum) in both themes. The v2 audit tested only solid backgrounds, so the claim "all pass" missed tinted badges (`bg-credit/10 text-credit`). | New audit, `scripts/contrast-audit.cjs` | L-01, L-03 |
| F-15 | **The interface reads as flat outlines.** `--border` and `--input` are the same value (lightness 0.62 light, 0.52 dark), chosen so form controls reach 3:1, and every card, divider and table inherits it. `muted`, `secondary` and `accent` are identical, and background and card differ by about 0.03 lightness. There is no tonal hierarchy and no elevation. | `src/index.css` | L-01 to L-11 |
| F-16 | **The dashboard's total clips** when four tiles share a row: `DashboardPage` passes `valueClassName="text-4xl …"` into a four-column grid and `StatCard` has no `min-w-0`. | `DashboardPage.tsx`, `StatCard.tsx` | L-06 |
| F-17 | **The Import page is titled "Customers".** The route is `/b/:id/customers/import` and the top-bar title comes from `startsWith(customers)`. | `AppShell.tsx` | L-05 |
| F-18 | **Money is formatted by hand in 11 places across four files** instead of through `formatMoney`/`Money` (for example `row.amount.toLocaleString("en-IN")` on the Transactions page), producing "₹249.5" next to "₹249.50" and violating UI-CONTRACT. The grep in L-03 lists them all. | `grep` over `src` | L-03 |
| F-19 | **Avatars have no image-error fallback**, so a failed Google photo renders a black circle (seen on Members). | `Avatar.tsx` | L-03 |
| F-20 | **Two "Add transaction" buttons and two page titles** appear on Dashboard and Transactions (top bar plus page header). | Screens | L-05 |
| F-21 | **The Transactions table scrolls off the right edge** and its filter bar wraps to two rows. | Screens | L-09 |
| F-22 | **`TransactionsPage.tsx` is 1,024 lines and `CustomerDetailPage.tsx` 654.** Hard to change safely. | `wc -l` | L-07, L-09 |
| F-23 | **The interface looks plain and generic.** One hue family, identical bordered boxes on every screen, stock components, money no bigger than labels, no brand mark and nothing of the domain (ledger, khata) anywhere; the login page is a title and a button. The v3 direction (soft cards, shadows, washes) would have fixed the borders but kept the genericness. | Owner's judgement; screenshots; frontend-design review in `UI-RETHINK-LedgerPage.md` | L-01 to L-11 |
| F-24 | **No user evidence exists for the new direction.** Three product bets (the look, recording by column, a "who to chase" list) are untested. | `docs/RESEARCH-PLAN.md` | gates in `docs/RESEARCH-DECISIONS.md` |

### 1.3 What v2 got right and v3 must not disturb

Keep: one `api.ts` per feature, the `guard()` wrapper, `usePermissions().assertCan` before the network, `queryKeys` factories, `paths` constants, `Money`/`formatMoney` for all currency, the `EntityDialog` / `ConfirmDialog` pattern, soft "void" as the default way to cancel an entry, archive as the default way to hide a customer, the colour meaning `receivable` = green and `credit` = red-orange (v2 section 4.5, decisions D-10 and D-11), the 44-pixel minimum touch target per UI-CONTRACT, the rule "one primary button per screen", and the documented copy glossary.

---

## 2. Goals, non-goals and decisions

### 2.1 Goals

| ID | Goal | Measured by |
|---|---|---|
| G-1 | Full CRUD: every entity can be created, read, updated and deleted by the roles that should be able to. | CRUD matrix (section 4) fully "Yes" |
| G-2 | Deleting is safe: nothing is destroyed without a recoverable record. | `deletion_log` tests; Undo works; Recently deleted works |
| G-3 | The interface is distinctive and legible: a ledger-based visual language that passes WCAG AA in both themes. | Contrast audit passes (82 checks); axe passes on every page; the research readout (`docs/RESEARCH-PLAN.md`) is recorded |
| G-4 | A fresh clone builds, migrates, and passes all checks with one command each. | `npm ci && npm run verify`; `bash scripts/run-sql-tests.sh` |
| G-5 | Production dependencies are clean and the app loads fast. | `npm audit --omit=dev` = 0; no chunk over 500 kB |
| G-6 | Audit data can be trusted. | Stamp-trigger tests; forged authors are replaced |

### 2.2 Non-goals (v3)

Email delivery of invitations, i18n/RTL, multi-currency, offline/PWA, ownership transfer, edit-history table (backlog B-08 stays deferred), bulk select-and-act, automatic purge of the deletion log, a light/dark redesign beyond tokens (both themes get the same treatment), end-to-end browser tests. Each is recorded in the backlog (S-67).

### 2.3 Decisions

| ID | Decision | Rationale | Overrides |
|---|---|---|---|
| D-12 | **Transactions can be deleted, by the Owner only.** Editors keep Void. Void stays the default way to cancel an entry. | Void is reversible and visible; delete removes from the ledger, so it needs the higher role, same as customers. | v2 **D-05** (transactions part: "Void and Restore" only) and the audit-trail rule FR-9a |
| D-13 | **Every delete writes a full snapshot to `deletion_log` first.** Only the Owner can read it; only SECURITY DEFINER functions can write it. | Makes delete recoverable without a trash table per entity. | v2 "permanent" delete semantics |
| D-14 | **"Delete" is the user-facing word for removing a customer or a transaction from the ledger.** "Delete permanently" is retired from the UI because deleted items can be restored from **Recently deleted**. "Void" keeps its own meaning (cancel but keep visible). | Honest copy: it is recoverable, and Delete and Void remain distinct. | v2 UI-CONTRACT glossary rows "Remove a customer forever" and "Cancel a transaction" (see section 5.6) |
| D-15 | **Customer delete is allowed from the list row menu (active or archived) and from the customer detail page.** It still requires typing the customer's name. | Closes F-02 while keeping the strongest guard on the most destructive action. | v2 **D-05** (customers part: "from the archive") and S-30 |
| D-16 | **Single-transaction delete uses a plain destructive confirm, not typed confirmation**, with an optional reason (max 200 characters). | One entry is low blast radius, and Undo is available. | — |
| D-17 | **Every delete shows an Undo toast for 10 seconds**, which calls `restore_deleted`. | Fast recovery without leaving the page. | — |
| D-18 | **Restore is Owner-only, has no time limit, and restores exactly what was deleted** (same ids, authors, timestamps, archive state). A transaction cannot be restored before its customer. | Predictable and testable. | — |
| D-19 | **Colour meaning is unchanged** (`receivable` green, `credit` red-orange, per v2 D-10). v3 adds direction icons and text so colour is never the only signal. | Avoids reopening a decision that was verified; fixes the legibility concern differently. | — |
| D-20 | **Border tokens are split.** `--border` is a decorative hairline (ink at 16 percent); `--input` keeps 3:1 for form controls. Rules, not boxes. | Structure without losing form-control accessibility. | v2 token table |
| D-21 | **`created_by`, `updated_by`, `voided_by` are stamped by the database**, not trusted from the client. | Closes F-04. | — |
| D-22 | **Migrations are adopted as two files with timestamp names** (`consolidated` baseline, then `v3`). The 17 old files are archived, not deleted. All future migrations use `YYYYMMDDHHMMSS_name.sql`. | Closes F-05. | v2 migration naming |
| D-23 | **`dashboard_summary` takes `p_timezone`** (default `'UTC'`); the client always sends the browser's IANA zone. The one-argument call keeps working. | Closes F-12 with no breaking change. | backlog B-09 |
| D-24 | **The visual direction is "The Ledger Page"** (section 5), approved by the owner on 19 Oct 2026 as gate G-A3, before research; research may reverse it. | Built on the product's own artefact; the generic card kit was rejected. | PRD v3 section 5 |
| D-25 | **Two fonts:** Public Sans for all text and every money figure, Bricolage Grotesque for headings and hero figures. One new runtime dependency (`@fontsource-variable/bricolage-grotesque`). Instrument Sans was rejected: it has no rupee sign. | Verified in the font files. | v2 rule "one UI font" (the theme test is updated in L-02) |
| D-26 | **Shape and depth:** 3 px radius, no shadows on panels, tables or cards, hairline rules; overlays keep their existing shadow. | Rules carry structure. | v3 D-20 shadow tokens |
| D-27 | **Ledger vocabulary:** table columns are Date, Particulars, Charged, Paid, Balance. Forms keep the label Note. No Debit, Credit, Dr or Cr. | Plain words; traditional ledger structure. | v2 glossary (extended) |
| D-28 | **Customer page:** a `LedgerTable` plus the quick-add card by default; the **entry row** (typing in the Charged or Paid column) only when gate G-A2 is approved. | The entry row is an unvalidated bet. | - |
| D-29 | **Dashboard slot:** Top outstanding balances by default; **Who to chase** (flagged after 30 days without a payment) only when gate G-A1 is approved. | An unvalidated bet; the database column ships either way. | - |
| D-30 | **Gates live in `docs/RESEARCH-DECISIONS.md`**, edited only by a human; statuses `approved`, `approved-with-changes`, `pending`, `rejected`. | One auditable place. | - |

---

## 3. Roles and permissions (delta from v2 section 3)

| Action key | Owner | Editor | Viewer | Status |
|---|---|---|---|---|
| `deleteTransaction` | Yes | No | No | **new** |
| `viewDeletedItems` | Yes | No | No | **new** |
| `restoreDeleted` | Yes | No | No | **new** |
| `deleteCustomer` | Yes | No | No | unchanged key; entry points widen (D-15) |

All other actions are unchanged. The database is the source of truth; the UI matrix only shapes what is shown (v2 rule). Each new key must have a matching SQL test (already in `bahikhata_consolidated_tests.sql`, sections 15 and 16).

---

## 4. CRUD completeness matrix

| Entity | Create | Read | Update | Delete | After v3 |
|---|---|---|---|---|---|
| Business | Owner (one per user) | Members | Owner | Owner (typed confirm) | Complete (v2) |
| Member | via invitation | Members | Owner changes role | Owner removes; member leaves | Complete (v2) |
| Invitation | Owner | Owner and invitee | Owner revokes; invitee responds | Owner (revoke) | Complete (v2) |
| Customer | Editor, Owner | Members | Editor, Owner; archive and restore | **Owner, from list and detail (new entry points)** | **Complete; recoverable** |
| Transaction | Editor, Owner | Members | Editor, Owner (edit); void and restore | **Owner (new)** | **Complete; recoverable** |
| Deleted item (log) | system only | Owner | — | — | **New: Owner reads and restores** |

---

## 5. Design direction: "The Ledger Page"

**Why this replaces the v3 direction.** PRD v3 specified soft tonal cards with a light shadow under each and tinted gradient washes. That is the generic "SaaS card kit": it would have made the app smoother but not distinctive, and you (the owner) judged the current look plain. v3.1 builds the interface around the thing the product replaces, the paper account ledger. The full rationale, strategy and research plan are in `docs/UI-RETHINK-LedgerPage.md` and `docs/RESEARCH-PLAN.md`; this section is the specification.

The visual reference is the four standalone boards in `design/ledger-boards/` (open them in a browser): `dashboard.html`, `customer-ledger.html`, `mobile-dark.html`, `design-language.html`. They use mock data. **Where a board and this section differ, this section wins.** Known differences: the boards show "Who to chase" (built only if gate G-A1 is approved, story L-13) and the entry row (gate G-A2, story L-12); the boards were drawn with static CSS, not the real components.

### 5.1 Principles

1. **The ledger is the interface.** Columns, rules and totals carry meaning; nothing is decoration.
2. **Money is the hero.** Balances are the largest type on their screen.
3. **One memorable thing.** The customer page. Everything else stays disciplined.
4. **Never colour alone.** A label, icon or rule accompanies every colour.
5. **Phone first, counter second.** Recording must work one-handed on a phone.

### 5.2 Tokens, fonts and class rules

Tokens come from `design/design-tokens.ledger.css` (applied by L-01, verified by 82 automated contrast checks). Fonts: **Public Sans** for all text and every money figure (it contains the rupee sign and tabular figures); **Bricolage Grotesque** for page titles, section headings and hero figures (it also contains the rupee sign and tabular figures). Instrument Sans was evaluated and rejected: it has **no rupee sign** in any subset, so every ₹ would fall back to a different font.

Use these classes and no others for surfaces, borders and structure:

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

Shape and depth: radius is 3 px everywhere (`--radius: 0.1875rem`); no pills. **No shadows on panels, tables or cards.** Overlays (menus, popovers, dialogs) keep their existing shadow class; do not add new shadows. Motion: one moment only, `entry-reveal` when a new ledger row is saved (200 ms; the CSS already disables it under reduced motion); everything else is instant.

### 5.3 Component specifications

Existing components keep their names and props unless stated.

| Component | Specification |
|---|---|
| `Card` (`components/ui/card.tsx`) | Root classes become `rounded-lg border border-border bg-card text-card-foreground`. Remove any `ring-*` and `shadow-*`. |
| `PageHeader` | Title is an `h1` (`font-heading text-3xl font-bold tracking-tight`); description `text-sm text-muted-foreground`; exactly one primary action; wraps under the title below 640 px. |
| `LeaderRow` (new) | `{ label, sub?, amount, tone?, leading?, trailing? }`: a `leader` row with `leading` (usually `Monogram`), label and optional sub-line, `leader-dots`, then the amount (`Money`, `font-semibold`, tone colour). The row is a `div role="listitem"` inside a `role="list"`. |
| `TotalsRule` (new) | A wrapper `div` with `totals-rule py-3`. |
| `Monogram` (new) | 32 px square (`rounded-sm`), initials `text-xs font-bold`; tone `receivable` (customer owes you), `credit` (you owe them) or `neutral`; tint per 5.2. `aria-hidden`. |
| `AgeFlag` (new) | `{ days }`: renders nothing under 30; otherwise `{floor(days/10)*10}+ days` in a `warning`-tinted chip. |
| `TallyMark` (new) | Inline SVG: four vertical strokes and a diagonal (path in L-04). `aria-hidden`. |
| `TypeBadge` (new) | Charge (`ArrowUpRight`, receivable tint) and Payment (`ArrowDownLeft`, credit tint), icon plus word. Used where a single Type column remains (detail page, Transactions detail view). |
| `BalanceBadge`, `StatusBadge` | Tinted classes per 5.2; `BalanceBadge` gains a leading icon. |
| `Avatar` | Keep for the signed-in user and member photos; adds an image-error fallback (L-03). Lists of customers use `Monogram`. |
| `DataTable` | Wrapper `border border-border bg-card`, no shadow, `overflow-hidden`. Header strip per 5.2, sticky. Rows `border-t border-border`, hover `hover:bg-muted/60`, height 56 px (48 px compact). Numeric columns right-aligned, `tabular-nums`. Sorting, paging, the five states and the mobile card layout unchanged. |
| `LedgerTable` (new) | See L-07. |
| `EmptyState` | A blank ruled page: `TallyMark` at 32 px, one sentence, optional action; background of three faint rules (`repeating-linear-gradient` on `--border`). |
| `Skeleton` | `bg-muted`, 1.2 s pulse, `motion-reduce:animate-none`. |
| Filter tabs (All, Owes you, and so on) | Text tabs: `border-b-2` ink underline on the active item, `text-muted-foreground` otherwise. Uses the existing `Tabs`. |
| Segmented control (7/30/90 days) | Text tabs as above. |
| Spine (sidebar) | `bg-sidebar text-sidebar-foreground`, 212 px wide, brand row (`TallyMark` and "BahiKhata") then the business name and role; items `flex items-center gap-3 px-3 py-2.5 rounded-l-sm`; the active item is the "tab" (`bg-background text-foreground font-semibold`) and extends to the edge of the main area so it joins the page. |
| Top bar | `border-b border-border bg-background`; shows the page title below `lg` only (as a `p`, not an `h1`); the global **Add transaction** button is hidden on routes whose page header already has it. |
| Dialogs and sheets | `bg-popover border border-border border-t-2 border-t-foreground rounded-sm`; sheet `rounded-t-sm`; header and footer separated by `border-border`. |

### 5.4 Icons (lucide-react, already installed)

Charge `ArrowUpRight`; Payment `ArrowDownLeft`; Owes you `ArrowDownLeft`; You owe `ArrowUpRight`; Settled `Check`; Delete `Trash2`; Restore and Undo `Undo2`; Recently deleted (nav) `Trash2`; Void `Ban`; Archive `Archive`.

### 5.5 Page specifications

Order of regions top to bottom. Each page handles the five list states where relevant.

**Dashboard** — `PageHeader` (title `Dashboard`, description `Welcome, {name}` as today; secondary **Add customer**, primary **Add transaction**). Row 1, two sheets: **Where you stand** (`LeaderRow`s *Owed to you* in receivable colour and *You owe* in credit colour, each with a muted sub-line (`{n} open accounts` and `Business owes customers`); then a `TotalsRule` containing *Net position* (`font-display`); then the line `Today: {n} entries, net {₹}. Open today`, a link to Transactions filtered to today exactly as the v2 "Today's activity" card did) and a second sheet whose content depends on gate **G-A1**: if `approved`, **Who to chase** (L-13); otherwise **Top outstanding balances** (L-06). Row 2: **Day book** (the last 10 entries in Charged and Paid columns, with the customer and note) and **This week** (7/30/90 text tabs, legend sentence, bar chart: charged bars `--receivable`, paid bars `--credit`, square tops, a ruled baseline).

**Customers list** — `PageHeader` (primary **Add customer**; secondary **Export CSV**, **Import CSV**). One summary sheet: `Customers {n}`, then `LeaderRow`s *Owes you* and *You owe* (no tiles). Search input and the status filter as text tabs. Desktop: the ruled `DataTable` with columns Customer (`Monogram`, name, phone beneath), Balance (right-aligned, amount in tone colour with the words "owes you" or "you owe" beneath), Last activity, Added (hidden below `lg`), row menu. Below 768 px the card layout renders each customer as a `LeaderRow`. Row menu: Edit, Archive or Restore, **Delete** (Owner, S-55).

**Customer detail** — back link; header: `Monogram` (large), name (`font-display`), phone and "customer since", actions Statement, Edit and the overflow menu (Archive, **Delete customer**); on the right the balance in a `TotalsRule` with the words "Owes you" or "You owe". Then the existing Ledger and Details tabs. **Ledger** tab: a `LedgerTable` (Date, Particulars, Charged, Paid, Balance, row menu) with a quick-add control above or inside it: if gate **G-A2** is `approved`, the **entry row** (L-12); otherwise the **quick-add card** (L-07). Voided rows are muted with a struck-through amount and a "Voided" chip; the totals row uses `totals-rule`.

**Transactions** — `PageHeader` (primary **Add transaction**; secondary **Export CSV**). One filter row that wraps cleanly: Range select, type text tabs (All, Charge, Payment), search, customer select, an "Include voided" switch with a visible label; below it the Detailed and Summarized text tabs. Detailed view: a day-book `DataTable` with columns Date, Customer (`Monogram`, name), Particulars (note), **Charged**, **Paid**, Recorded by, row menu; both amount headers sort by amount; under `xl` "Recorded by" moves under the note. Totals row inside the table (`totals-rule`).

**Add / edit transaction** (dialog on desktop, bottom sheet on mobile) — Customer (searchable, shows their balance); **Charged | Paid** as two equal large choices; a very large amount field (`font-display`, `inputmode="decimal"`, ₹ prefix); `New balance for {customer}: ₹X` line (`aria-live="polite"`); When (Today, Yesterday, Pick date); Note; submit label states the action (`Add charge`, `Add payment`, `Save changes`). Validation timing unchanged (`onTouched`).

**Add / edit customer** — Name (required), Phone, then the "Additional details" disclosure.

**Recently deleted** (Owner only, S-56) — as specified there; item labels in `line-through` muted style; Restore button `variant="outline"`.

**Login** — page background `bg-background` with faint ruled lines; a centred sheet: `TallyMark` (36 px), `BahiKhata` (`font-display`), `Your business ledger`, the Google button (full width), one line `We only read your name and email.`

**My businesses** — `PageHeader`; "My business" sheet with name, `You own this business`, Owner chip, **Open**; "Shared with me" and "Invitations" sections each an `EmptyState` that says what to do next.

**Members** — ruled `DataTable`: Member (`Avatar` with fallback), Email, Role chip, Joined, row menu (not on the Owner row); pending invitations below; the "Owners cannot leave" sentence as muted text.

**Settings** — sections separated by `border-t border-border`, two columns at `lg` (title and description left, form right, `max-w-xl`); Backup; **Delete business** in a sheet topped with a `totals-rule` and credit-coloured title; typed confirmation unchanged.

**Import** — steps numbered 1 to 4 (the content really is a sequence); upload area `border border-dashed border-input bg-card`; the review step shows `LeaderRow`s (valid transactions, customers, problems) above the summary table, then `Nothing is saved until you click Import. It is all-or-nothing.`

### 5.6 Copy: glossary and strings

Update `docs/UI-CONTRACT.md` glossary to exactly:

| Concept | Use | Never |
|---|---|---|
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

The note field keeps the label **Note** in forms; its ledger column header is **Particulars**. (Decision D-27; research may change it.)

New strings, verbatim:

| Where | Text |
|---|---|
| Dashboard sections | `Where you stand`, `Who to chase`, `Top outstanding balances`, `Day book`, `This week` |
| Dashboard lines | `{n} open accounts`, `Business owes customers`, `Today: {n} entries, net {₹}.`, link `Open today` |
| Chase sub-lines | `paid today`, `paid yesterday`, `last paid {n} days ago`, `no payments yet` |
| Age flag | `30+ days`, `40+ days`, and so on in steps of 10 |
| Chase help | `Largest balances first. Flagged when nothing was paid for 30 days.` |
| Ledger | headers `Date`, `Particulars`, `Charged`, `Paid`, `Balance`; footer `{n} entries · Voided entries stay visible but do not count.`; chip `Voided`; totals label `Totals` |
| Entry row | placeholder `What was it for?`; preview `after: {₹}`; error `Enter either Charged or Paid`; button `Save` |
| Quick add card | title `New entry`; choices `Charged`, `Paid`; preview `New balance: {₹}`; button `Add charge` or `Add payment`; link `Change date` |
| Empty list | `Nothing written yet.` plus a sentence naming the next action |
| Delete flows | exactly the strings of v3 section 5.6, kept below |

Delete and restore strings (unchanged from PRD v3):

| Where | Text |
|---|---|
| Delete transaction dialog title | `Delete this transaction?` |
| Delete transaction body | `{Charge or Payment} of {amount} for {customer} on {date} will be removed, and {customer}'s balance will change from {before} to {after}. You can restore it from Recently deleted.` |
| Delete transaction hint | `Not sure? Void it instead. A voided entry stays visible, crossed out.` (link `Void instead`) |
| Reason field | label `Reason (optional)`, placeholder `Why is this being deleted?`, max 200 characters |
| Delete transaction button | `Delete transaction` |
| Delete customer title | `Delete {name}?` |
| Delete customer body | `This removes {name} and {n} transactions from your ledger. You can restore them from Recently deleted.` (singular `1 transaction`) |
| Delete customer typed prompt | `Type {name} to confirm` |
| Delete customer buttons | `Delete customer`, `Archive instead`, link `Download statement first` |
| Success toasts | `Transaction deleted`, `Customer deleted`, action `Undo` (10 seconds); after Undo `Restored` |
| Recently deleted | nav `Recently deleted`; empty title `Nothing deleted`, body `Deleted customers and transactions appear here so you can restore them.`; button `Restore`; success `{label} restored` |
| Restore errors | `That item is no longer in the log.`, `This item was already restored.`, `Restore the customer first.`, `Something with the same ID already exists, so this can't be restored.` |

---

## 6. Agent operating contract (v3.1)

These rules extend v2 section 5. Where they conflict, v3 wins.

1. **Read first.** Read this whole document, `docs/PRD-v2.md` sections 4.5, 5 and 7, and `docs/UI-CONTRACT.md`. Then start with S-44. Read `docs/RESEARCH-DECISIONS.md` only when a story tells you to, and never edit it.
2. **Branch.** Create `feat/v3` from `master`. Never commit to `master`, never force-push, never rewrite history.
3. **One story at a time, in the order of section 7.** Commit before starting the next. If a story is blocked after two honest attempts, record the blocker in `docs/PROGRESS.md` and continue with the next story that does not depend on it.
4. **Per-story loop.**
   1. Copy the story's Behaviour scenarios into `docs/PROGRESS.md` as a checklist.
   2. Write the tests the story lists, before or with the implementation.
   3. Implement only what the story says.
   4. Run `npm run verify` (added in S-44: lint, typecheck, test, build). For database stories also run `bash scripts/run-sql-tests.sh` against a scratch Postgres.
   5. For UI stories, run the app (`npm run dev`) and check the scenarios by hand in **both themes** and at **390 px and 1440 px**. Record what you checked.
   6. Update `docs/PROGRESS.md` (status, commit hash, deviations) in the same commit.
   7. Commit: `type(S-NN): short imperative summary`; the body lists scenarios verified.
5. **Dependencies.** The only `package.json` changes are S-44 (scripts, engines), S-45 (moving five packages to `devDependencies`, `npm audit fix`) and L-02 (adding `@fontsource-variable/bricolage-grotesque`). Add nothing else.
6. **Database.** Never edit an applied migration. The three migrations in the bundle are final; copy them, do not rewrite them. New SQL later goes in a new `YYYYMMDDHHMMSS_name.sql` file. You do not have production access: anything a human must run goes in `docs/MANUAL_STEPS.md` with the exact order, the exact file and how to verify it.
7. **UI rules.** Use only the shadcn components in `src/components/ui`, the app components in `src/components/app` (including those L-04 adds) and the classes in section 5.2. No hard-coded colours, no inline `style`, no new CSS file (the token file of L-01 is applied to `src/index.css` by script). No `shadow-*`, `ring-*` or large radii on panels, tables or cards. All currency goes through `formatMoney`/`Money`, all dates through `formatDate`/`formatRelative`, all links from `paths.ts`, all query keys from `queryKeys.ts`.
8. **Permissions.** Every new write control is wrapped in `Can` and every new mutation hook calls `assertCan` first. The database is still the source of truth.
9. **Scope discipline.** Extra work you discover goes in `docs/BACKLOG.md`, not into the current story. If the real code contradicts something here, make the smallest adaptation and log it under Deviations in `docs/PROGRESS.md`.
10. **The repository forbids one literal string.** The v2 test `src/lib/__tests__/clientHygiene.test.tsx` fails if any file in the repository, including docs and SQL, contains the privileged Supabase server-side role's name written as two words joined by an underscore (the test builds that string from fragments so that it does not match itself). The bundle files were written to comply. Never type that string in any file you create or edit; say "the server-side role" instead. Do not weaken or edit that test.
11. **No regressions.** After every story re-run the smoke checklist in section 9.4. Existing tests must keep passing unmodified, except tests whose expected text this PRD changes (glossary, labels); update exactly those.

### 6.1 Definition of done (every story)

- All **Verify** commands in the story pass.
- Every Behaviour scenario is covered by an automated test, or (UI only, where jsdom cannot judge layout) by a manual check recorded in `docs/PROGRESS.md`.
- `npm run lint` shows no new warnings.
- Both themes and both widths checked for UI stories.
- `docs/PROGRESS.md` updated; one commit.

### 6.2 Testing conventions

Tests live beside the code in `__tests__/`. Follow the style of the neighbouring tests (they mock `@/lib/supabase`; reuse the same helper and render wrapper you find there). Accessibility: every new page or dialog gets an axe test using `src/test/a11y.ts`, as existing pages do. Do not use `any`; do not skip tests.

### 6.3 What "grep" means in this document

Commands are given for the repository root. If a grep finds fewer or more places than the story says, handle every place it finds and note the difference in `docs/PROGRESS.md`. The grep result, not the story's count, is the truth.

### 6.4 STOP conditions

Stop and report (write the question in `docs/PROGRESS.md` and tell the human) if:

- a verification command that passed at baseline fails and you cannot find the cause in two attempts;
- a story would require a new runtime dependency;
- a story would require editing an already-applied migration;
- you find a security problem not covered here;
- the bundle files do not match the paths in section 0.2;
- `docs/RESEARCH-DECISIONS.md` shows G-A3 as `pending` or `rejected` when you reach L-00.

---

## 7. Delivery plan

Phases are strictly ordered; stories inside a phase are ordered unless marked parallel. **Research runs in parallel with phases A to D** (`docs/RESEARCH-PLAN.md`), so that by the time the build reaches L-12 and L-13 a human has had the chance to record decisions in `docs/RESEARCH-DECISIONS.md`.

| Phase | Stories | Purpose | Depends on |
|---|---|---|---|
| A. Foundations | S-44 to S-49 | Toolchain, dependency hygiene, CI, env validation, code splitting, faster tests | none |
| B. Database | S-50 | Adopt the three tested migrations and the SQL tests | A (S-46 for CI) |
| C. Data layer | S-51 to S-53 | Permissions, errors, paths, nav, API and hooks, customers list query | B |
| D. Delete and recovery UI | S-54 to S-56 | Delete transaction, delete customer, Recently deleted | C |
| E. Ledger design system and shell | L-00 to L-05 | Gate check, tokens, font, look-independent fixes, primitives, shell | A (L-03 and L-04 can start after S-46) |
| F. Screens | L-06 to L-14 | Dashboard, customer ledger, lists, forms, remaining screens, entry row (gated), Who to chase (gated), sweep | D and E |
| G. Release | S-67, S-68 | Documentation, final verification | all |

The database can be deployed to the live project **before** the new client: every v3 and v3.1 database change is backward compatible with the v2 client (the one-argument `dashboard_summary` call still resolves; `delete_customer_permanently` returning an id is ignored by the old client; the extra view columns are ignored).

| Story | Title | Size | Gate |
|---|---|---|---|
| S-44 | Branch, baseline and toolchain pins | S | |
| S-45 | Dependency hygiene | S | |
| S-46 | CI and SQL test runner | M | |
| S-47 | Environment validation | S | |
| S-48 | Route-level code splitting and bundle guard | M | |
| S-49 | Faster unit tests | M | |
| S-50 | Adopt the tested migrations and SQL tests | M | |
| S-51 | Permissions, errors, paths, nav, query keys | S | |
| S-52 | API layer and hooks for delete, restore, log, timezone (with tests) | M | |
| S-53 | Customers list query uses `last_activity_at` | S | |
| S-54 | Delete a transaction | M | |
| S-55 | Delete a customer | M | |
| S-56 | Recently deleted page | M | |
| L-00 | Gate check and decisions file | S | G-A3 |
| L-01 | Ledger tokens and contrast gate | S | |
| L-02 | Heading font | S | |
| L-03 | Fixes that do not depend on the look | M | |
| L-04 | Primitives | L | |
| L-05 | App shell: spine navigation, top bar, titles | M | |
| L-06 | Dashboard | M | G-A1 variant |
| L-07 | Customer detail as a ledger, with quick add | L | G-A2 variant |
| L-08 | Customers list | M | |
| L-09 | Transactions as a day book | L | |
| L-10 | Dialogs, forms and the mobile entry sheet | M | |
| L-11 | Members, Settings, Import, Login, Businesses, Recently deleted | M | |
| L-12 | Entry row | M | **G-A2** |
| L-13 | Who to chase | M | **G-A1** |
| L-14 | Mobile and accessibility sweep | M | |
| S-67 | Documentation and backlog | S | |
| S-68 | Final verification and release | S | |

If a gated story is skipped, mark it `skipped (gate ...)` in `docs/PROGRESS.md`; that counts as done for ordering purposes.

---

## 8. Stories

Format per story: **Why**, **Touches**, **Do**, **Behaviour**, **Tests**, **Verify**, **Commit**. Paths are from the repository root. "Bundle" means the handoff bundle (section 0.2).

---

### Phase A — Foundations

#### S-44 · Branch, baseline and toolchain pins  (size S)

**Why.** Everything after this is measured against a recorded baseline, and the toolchain must be reproducible (F-11).

**Touches.** `package.json`, `.nvmrc` (new), `docs/PROGRESS.md`.

**Do.**
1. `git checkout master && git pull && git checkout -b feat/v3`.
2. Create `.nvmrc` containing exactly `22`.
3. In `package.json` add `"engines": { "node": ">=22" }` and, under `scripts`, `"verify": "npm run lint && npm run typecheck && npm test && npm run build"`.
4. Run `npm ci` then `npm run verify`. In `docs/PROGRESS.md` add a section `## v3 baseline` recording: lint errors/warnings, number of test files/tests and duration, build chunk sizes, and the output of `npm audit --omit=dev`. Reference values from the review: lint 0 errors / 7 warnings; 54 files, 469 tests (1 skipped), about 169 s; one JS chunk of 1,397 kB; 12 production vulnerabilities (1 critical, 9 high, 2 moderate). Differences are fine, but record the real numbers.
5. In `docs/PROGRESS.md` add a `## v3 stories` table with one row per story S-44 to S-56, L-00 to L-14, S-67 and S-68 (columns: story, status, commit, notes), all `todo` except S-44.

**Behaviour.**
```gherkin
Scenario: A fresh clone verifies with one command
  Given a clean checkout of feat/v3 and Node 22
  When I run "npm ci && npm run verify"
  Then lint, typecheck, tests and build all succeed

Scenario: The Node version is pinned
  Given the repository
  Then ".nvmrc" contains "22" and package.json "engines.node" is ">=22"
```
**Tests.** None (configuration).
**Verify.** `npm ci && npm run verify`.
**Commit.** `chore(S-44): pin Node 22, add verify script, record v3 baseline`

---

#### S-45 · Dependency hygiene  (size S)

**Why.** F-07: 12 production vulnerabilities, all from dev tooling in `dependencies`. Verified fix: move five packages, then `npm audit fix` leaves 0.

**Touches.** `package.json`, `package-lock.json`.

**Do.**
1. Run this script once from the repository root (it keeps every version string exactly as it is and only moves entries):
```bash
node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));
for(const k of ['shadcn','jsdom','@testing-library/dom','@testing-library/react','@testing-library/user-event']){
  if(p.dependencies[k]){p.devDependencies[k]=p.dependencies[k];delete p.dependencies[k];}
}
p.devDependencies=Object.fromEntries(Object.entries(p.devDependencies).sort());
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"
```
2. `npm install --package-lock-only`
3. `npm audit fix --package-lock-only --omit=dev` (this updates the transitive `fast-uri` to a patched version).
4. `npm ci`
5. Leave `tw-animate-css` and `cn` in `dependencies` (the build imports them).

**Behaviour.**
```gherkin
Scenario: Production dependencies are clean
  When I run "npm audit --omit=dev"
  Then it reports 0 vulnerabilities

Scenario: Nothing broke
  When I run "npm run verify"
  Then it passes
```
**Tests.** None. **Verify.** `npm audit --omit=dev` ends with "found 0 vulnerabilities"; `npm run verify`.
**Commit.** `chore(S-45): move dev-only packages to devDependencies, fix audit findings`
**Note for the deploy.** Vercel installs `devDependencies` during the build by default, so the build still works. If the Vercel project sets `NODE_ENV=production` at install time, tell the human in `docs/MANUAL_STEPS.md`.

---

#### S-46 · CI and SQL test runner  (size M)

**Why.** F-09: CI ignores pull requests and checks neither SQL, dependencies, contrast nor bundle size.

**Touches.** `.github/workflows/ci.yml`, `scripts/` (new files), `supabase/tests/ci/` (new), `package.json`.

**Do.**
1. **Copy** from the Bundle: `.github/workflows/ci.yml` (replace the existing file), `scripts/run-sql-tests.sh`, `scripts/contrast-audit.cjs` (replace the v2 script of the same name), `scripts/check-bundle-size.cjs`, `scripts/apply-tokens.cjs`, `scripts/check-token-sync.cjs`, `supabase/tests/ci/supabase_stub.sql`.
2. Add to `package.json` scripts: `"audit:contrast": "node scripts/contrast-audit.cjs"`, `"audit:bundle": "node scripts/check-bundle-size.cjs"`, `"audit:tokens": "node scripts/check-token-sync.cjs"`, `"test:sql": "bash scripts/run-sql-tests.sh"`.
3. In `ci.yml`, in the `verify` job add two steps after the contrast audit: `npm run audit:tokens` (leave it commented with the text `# enabled in L-01` until L-01, because index.css does not yet match) and, after Build, `npm run audit:bundle` (commented `# enabled in S-48`). Uncomment each in its own story.
4. Make `scripts/run-sql-tests.sh` executable: `chmod +x scripts/run-sql-tests.sh`.
5. The `sql` job cannot pass until S-50 puts the migrations and test file in place; in this story mark that job `if: false` with the comment `# enabled in S-50` and remove it in S-50.

**Behaviour.**
```gherkin
Scenario: CI runs on pull requests
  Given a pull request is opened
  Then the "verify" job runs lint, typecheck, contrast audit, production dependency audit, tests and build

Scenario: The contrast audit gates colours
  When I run "node scripts/contrast-audit.cjs"
  Then it prints "All required pairs pass AA in both themes." and exits 0
```
**Tests.** None (infrastructure). **Verify.** `node scripts/contrast-audit.cjs`; `npm run verify`; push the branch and confirm the `verify` job is green on GitHub.
**Commit.** `ci(S-46): run on pull requests; add SQL runner, contrast, token-sync and bundle guards`

---

#### S-47 · Environment validation  (size S)

**Why.** F-11: a missing environment variable crashes the app with an unreadable error.

**Touches.** `src/lib/env.ts` (new), `src/components/app/ConfigError.tsx` (new), `src/main.tsx`, `.env.example`, tests.

**Do.**
1. Create `src/lib/env.ts`:
```ts
import { z } from "zod";

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url("VITE_SUPABASE_URL must be a full URL, for example https://abc.supabase.co"),
  VITE_SUPABASE_ANON_KEY: z.string().min(20, "VITE_SUPABASE_ANON_KEY is missing or too short"),
});

export type Env = z.infer<typeof schema>;
export type EnvResult = { ok: true; env: Env } | { ok: false; problems: string[] };

export function readEnv(raw: Record<string, unknown> = import.meta.env): EnvResult {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { ok: true, env: parsed.data };
  return { ok: false, problems: parsed.error.issues.map((i) => i.message) };
}
```
2. Create `ConfigError.tsx`: a full-page centered `Card` (section 5.2 classes), title `This app is not configured`, a `<ul>` of the problems, and one sentence `Copy .env.example to .env and fill in your Supabase project URL and anon key, then restart.` Use `role="alert"`.
3. Read `src/main.tsx` first. Keep every existing wrapper. Change it so it calls `readEnv()` **before** importing the app: if `!ok` render `<ConfigError problems={...} />` and stop; if ok, `const { default: App } = await import("./App")` and render it exactly as before. (The dynamic import matters: `supabase.ts` throws at import time when the URL is missing.)
4. In `.env.example` add a one-line comment above each variable saying where to find it in the Supabase dashboard (Project Settings, API).

**Behaviour.**
```gherkin
Scenario: Missing configuration is explained
  Given VITE_SUPABASE_URL is not set
  When the app starts
  Then the page shows "This app is not configured" and names the missing variable
  And no uncaught exception appears in the console

Scenario: Valid configuration starts the app normally
  Given both variables are valid
  When the app starts
  Then the login page or the business list renders as before
```
**Tests.** `src/lib/__tests__/env.test.ts`: valid; missing URL; non-URL; short key; both missing (two problems). `src/components/app/__tests__/ConfigError.test.tsx`: renders problems; axe passes.
**Verify.** `npm run verify`; also run `npm run dev` once with `.env` temporarily renamed and confirm the page.
**Commit.** `feat(S-47): validate environment at startup with a readable error`

---

#### S-48 · Route-level code splitting and bundle guard  (size M)

**Why.** F-08. Measured on the baseline with exactly this change: largest chunk 353 kB (was 1,397 kB); `/login` first load about 300 kB gzipped (was 421 kB); recharts (93 kB gzipped) loads only on pages that draw charts.

**Touches.** `src/App.tsx`, `vite.config.ts`, `src/components/app/RouteFallback.tsx` (new), `.github/workflows/ci.yml`.

**Do.**
1. `RouteFallback.tsx`: `<div role="status" aria-live="polite" className="p-6"><span className="sr-only">Loading</span>` plus two existing `Skeleton` blocks (grep `export function Skeleton` for the import) `</div>`.
2. In `src/App.tsx` replace the static page imports with lazy ones. For each of these twelve page components, remove its `import { X } from "…"` line and add, below the imports, `const X = lazy(() => import("<same path>").then((m) => ({ default: m.X })));`: `BusinessesPage, SettingsPage, MembersPage, LoginPage, DashboardPage, CustomersPage, CustomerDetailPage, ImportPage, StatementPage, TransactionsPage, TransactionDetailPage, CreateBusinessPage`. Add `import { lazy, Suspense } from "react";`. Wrap the existing `<Routes>…</Routes>` in `<Suspense fallback={<RouteFallback />}>…</Suspense>`. Leave the dev-only `UiGallery` route and every route element untouched.
3. In `vite.config.ts` add inside the config object:
```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        recharts: ["recharts"],
        supabase: ["@supabase/supabase-js"],
        react: ["react", "react-dom", "react-router-dom"],
        zod: ["zod"],
        baseui: ["@base-ui/react"],
        lucide: ["lucide-react"],
        query: ["@tanstack/react-query"],
        forms: ["react-hook-form", "@hookform/resolvers"],
      },
    },
  },
},
```
4. Uncomment the `audit:bundle` step in `ci.yml`.

**Behaviour.**
```gherkin
Scenario: No oversized chunk
  When I run "npm run build && npm run audit:bundle"
  Then no JS chunk exceeds 500 kB and the build prints no chunk-size warning

Scenario: Routes still work
  Given a signed-in user
  When I open /b/:id, /b/:id/customers and /b/:id/transactions
  Then each page renders after a brief loading state

Scenario: Loading is announced
  When a lazy route is loading
  Then a status region with the text "Loading" is present
```
**Tests.** `src/__tests__/App.lazy.test.tsx`: render `<App />` at the login route with a signed-out session mock and `await screen.findByRole(...)` for the login button; assert the fallback has `role="status"`. Existing page tests are unaffected (they import pages directly).
**Verify.** `npm run build && npm run audit:bundle`; `npm run verify`. Expected: largest chunk about 350 kB, total about 1.37 MB.
**Commit.** `perf(S-48): lazy routes and vendor chunks; add bundle size guard`

---

#### S-49 · Faster unit tests  (size M)

**Why.** F-10: 169 s per run slows every story and CI. The lever that works depends on the machine, so this story is a measured procedure, not a guess.

**Touches.** `vitest.config.ts`, possibly test files that assume global state.

**Do.** Record the baseline (`time npm test`, three runs, take the median). Then try the levers **in this order**; after each, run the full suite three times. **Keep a lever only if all tests pass all three times and the median improves by at least 15 %.** Stop when the median is at or under 100 s or the levers are exhausted.
1. `test: { css: false }` (components under test do not need real CSS).
2. `test: { pool: "threads" }`. **Warning:** a trial of exactly this setting on the review machine produced no output and had to be abandoned. Run it with a hard time limit (`timeout 400 npx vitest run`); if it exceeds the baseline time or hangs, revert this lever immediately and note it in `docs/PROGRESS.md`.
3. Split environments: a second project for pure-logic tests under `src/lib/**` and `src/features/**/api*.test.ts` with `environment: "node"`; keep jsdom for everything else.
4. `test: { isolate: false }` **only** for the node project from lever 3.
Record each lever's median time and the decision in `docs/PROGRESS.md`.

**Behaviour.**
```gherkin
Scenario: Same tests, same results, faster
  Given the baseline of 469 passing tests and 1 skipped
  When I run "npm test" with the kept levers
  Then the same number of tests pass and 1 is skipped
  And the median duration is lower than the baseline
```
**Tests.** None new. **Verify.** `npm test` three times, all green; numbers recorded.
**Commit.** `perf(S-49): speed up the unit test suite (see PROGRESS for measurements)`

---

### Phase B — Database

#### S-50 · Adopt the tested migrations and SQL tests  (size M)

**Why.** F-04, F-05, F-06 and F-13 (view), plus every database change v3 needs. The three bundle migrations and the 19-section test suite were executed on a scratch Postgres 16 with these results: both migrations apply to an empty database and to a copy of the live schema (identical resulting schemas); re-applying changes nothing; all 19 sections pass; the ten v2 test files also pass unmodified; mutation checks (18 deliberate breakages of the schema) were each caught.

**Touches.** `supabase/migrations/`, `supabase/tests/`, `docs/MANUAL_STEPS.md`, `.github/workflows/ci.yml`.

**Do.**
1. Archive, do not delete: `mkdir -p supabase/migrations_archive supabase/tests_archive && git mv supabase/migrations/*.sql supabase/migrations_archive/ && git mv supabase/tests/*.sql supabase/tests_archive/`. Keep `supabase/tests/README.md` for step 5.
2. **Copy** from the Bundle into `supabase/migrations/`: `20261017000000_bahikhata_consolidated_schema.sql`, `20261101000000_v3_deletion_log_and_integrity.sql` and `20261108000000_v31_last_payment_at.sql`. **Copy** `supabase/tests/bahikhata_consolidated_tests.sql` into `supabase/tests/`. Do not edit any of the four files.
3. Remove the `if: false` line from the `sql` job in `ci.yml`.
4. Run, against a scratch Postgres (for example `docker run -d -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16`): `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bash scripts/run-sql-tests.sh`. It must end with `==> SQL tests passed`.
5. Replace `supabase/tests/README.md` with: how to run (`npm run test:sql`), the structure (one transaction, rolled back; each section in its own savepoint; shared helpers at the top), the section list from the header of `bahikhata_consolidated_tests.sql`, and "add a new section for every new migration".
6. Append to `docs/MANUAL_STEPS.md` a section **"v3 database rollout"** containing, in order: (a) take a backup (the app's Settings, Download backup, and the Supabase dashboard backup); (b) in the Supabase SQL editor run the consolidated migration (safe to run on the live database: idempotent, and it refuses to proceed if any customer or transaction still has no business); (c) run the v3 migration, then the v3.1 migration `20261108000000_v31_last_payment_at.sql`; (d) verify with these queries and expected results: `select count(*) from pg_policies where schemaname='public';` returns 19; `select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('delete_transaction','restore_deleted');` returns 2; `select has_function_privilege('anon','public.restore_deleted(uuid)','execute');` returns false; `select count(*) from information_schema.columns where table_schema='public' and table_name='customer_balances' and column_name='last_payment_at';` returns 1; (e) **only if the project uses the Supabase CLI migration history**: run `supabase migration list`, then mark each version shown in the REMOTE column that belongs to the old chain as reverted and the two new versions as applied: `supabase migration repair --status reverted <old versions>` and `supabase migration repair --status applied 20261017000000 20261101000000 20261108000000`; (f) deploy the new client afterwards (the old client keeps working in the meantime).

**Behaviour.**
```gherkin
Scenario: An empty database builds from the migrations alone
  Given an empty Postgres database with the CI stub installed
  When the three migrations are applied in filename order
  Then no error occurs

Scenario: All database behaviour is verified
  When the SQL test suite runs
  Then all 19 sections pass and the transaction is rolled back

Scenario: Re-running is safe
  Given both migrations are already applied
  When they are applied again
  Then no error occurs and the schema is unchanged
```
**Tests.** The Bundle test suite is the test. **Verify.** `bash scripts/run-sql-tests.sh` passes locally and the `sql` job is green in CI.
**Commit.** `feat(S-50): adopt consolidated schema and v3 migration with 19-section SQL suite`

---

### Phase C — Data layer

#### S-51 · Permissions, errors, paths, navigation, query keys  (size S)

**Why.** Everything in phases D and F needs these small shared pieces first. Doing them once, with tests, keeps later stories short.

**Touches.** `src/lib/permissions.ts`, `src/lib/AppError.ts`, `src/lib/paths.ts`, `src/lib/queryKeys.ts`, `src/components/layout/navConfig.ts`, and their tests.

**Do.**
1. **Permissions.** In `permissionActions` add `"deleteTransaction"`, `"viewDeletedItems"`, `"restoreDeleted"`. In `permissionMatrix` add, for each of the three, `{ owner: true, editor: false, viewer: false }`. Update the existing permissions test so its expectation table includes the three rows.
2. **Errors.** Run `grep -rn "P0002" src` first and note every existing use. In `src/lib/AppError.ts` change `AppErrorCode` to `"forbidden" | "network" | "validation" | "notFound" | "conflict" | "unknown"`. In the function that converts a Supabase error (the one that reads `sqlstate`), add these branches **before** the final unknown fallback, in the same style as the existing branches. `message` is the database message, which the v3 functions author as user-safe text:
   - `P0002` → `new AppError("notFound", message || "That item no longer exists.")`
   - `55000` → `new AppError("conflict", message)`
   - `22001` → `new AppError("validation", message)`
   If an existing test or caller relied on `P0002` being something else, keep that behaviour for that caller and note it in `docs/PROGRESS.md`.
3. **Paths.** In `src/lib/paths.ts` add `deletedItems: (businessId: string) => \`/b/${businessId}/deleted\`` to the path builders, and `deletedItems: "/b/:businessId/deleted"` to the route-pattern object that holds `importCustomers: "/b/:businessId/customers/import"`.
4. **Query keys.** In `src/lib/queryKeys.ts` add, using the file's own `scope` helper:
```ts
export const deletionLogKeys = {
  all: (businessId?: string) => [...scope(businessId), "deletion-log"],
  list: (businessId?: string, filter?: string) => [...deletionLogKeys.all(businessId), "list", filter ?? "all"],
};
```
5. **Navigation.** Read `src/components/layout/navConfig.ts`. Add an item labelled `Recently deleted`, icon `Trash2` (lucide-react), path `paths.deletedItems`, placed after `Import` and before `Settings`, and gated by `viewDeletedItems` using whatever mechanism the existing `Members` item uses for `manageMembers`. A non-owner must not see it.

**Behaviour.**
```gherkin
Scenario: Only owners get the new permissions
  Given roles owner, editor and viewer
  Then can(role, "deleteTransaction"), can(role, "viewDeletedItems") and can(role, "restoreDeleted") are true only for owner

Scenario: Database errors become friendly errors
  Given the database raises SQLSTATE 55000 with message "Restore the customer first."
  Then the app error has code "conflict" and that message
  And SQLSTATE P0002 gives code "notFound", and 22001 gives code "validation"

Scenario: The navigation item respects the role
  Given I am an Editor
  Then the sidebar does not show "Recently deleted"
  Given I am the Owner
  Then it shows between "Import" and "Settings"
```
**Tests.** Extend the existing tests for permissions, AppError, paths and navConfig; add a `queryKeys` test asserting the business prefix.
**Verify.** `npm run verify`. **Commit.** `feat(S-51): permissions, error codes, paths, keys and nav entry for delete and restore`

---

#### S-52 · API layer and hooks for delete, restore, log, timezone (with tests)  (size M)

**Why.** The UI stories call these; the database functions already exist (S-50).

**Touches.** `src/features/transactions/api.ts`, `.../hooks.ts`, `src/features/customers/api.ts`, `.../hooks.ts`, new `src/features/deleted-items/` (`api.ts`, `hooks.ts`), `src/types`, tests.

**Do.**
1. **Transactions API** — add to `src/features/transactions/api.ts`, following the file's `guard()` style:
```ts
/** v3 (S-52) — Owner-only hard delete. Returns the deletion_log id so the UI can offer Undo. */
export async function deleteTransaction(id: string, businessId: string, reason: string | null): Promise<string> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("delete_transaction", {
      p_transaction_id: id,
      p_business_id: businessId,
      p_reason: reason,
    });
    if (error) throw error;
    return data as string;
  });
}
```
2. **Transactions hook** — add to `hooks.ts`:
```ts
export function useDeleteTransaction(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) => {
      assertCan("deleteTransaction");
      return deleteTransaction(id, businessId, reason);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business", businessId] }),
  });
}
```
   (`useQueryClient` and `usePermissions` are already used in this file; import what is missing.)
3. **Customers API** — change `deleteCustomerPermanently` so it returns `Promise<string>` (the log id): read `data` from the `rpc("delete_customer_permanently", { p_customer_id, p_business_id })` call and return it as `string`. Update its doc comment: it now snapshots to the deletion log. **Keep the function and hook names** (`deleteCustomerPermanently`, `useDeleteCustomerPermanently`); only user-visible copy changes (D-14). In `useDeleteCustomerPermanently` keep `assertCan("deleteCustomer")` and widen `onSuccess` to `queryClient.invalidateQueries({ queryKey: ["business", businessId] })` so the dashboard, balances and Recently deleted refresh too.
4. **Deleted-items feature** — create `src/features/deleted-items/`:
   - `api.ts` exports `DeletionLogEntry` (`id`, `entity_type: "customer" | "transaction"`, `entity_id`, `label`, `summary: Record<string, unknown>`, `reason: string | null`, `deleted_by: string | null`, `deleted_at: string`, `restored_at: string | null`, `restored_by: string | null`), `listDeletionLog(businessId, { entityType, includeRestored })` and `restoreDeleted(logId)`:
```ts
export async function listDeletionLog(
  businessId: string,
  opts: { entityType?: "customer" | "transaction"; includeRestored?: boolean } = {},
): Promise<DeletionLogEntry[]> {
  return guard(async () => {
    let q = supabase
      .from("deletion_log")
      .select("id, entity_type, entity_id, label, summary, reason, deleted_by, deleted_at, restored_at, restored_by")
      .eq("business_id", businessId)
      .order("deleted_at", { ascending: false })
      .limit(200);
    if (opts.entityType) q = q.eq("entity_type", opts.entityType);
    if (!opts.includeRestored) q = q.is("restored_at", null);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DeletionLogEntry[];
  });
}

export async function restoreDeleted(logId: string): Promise<{ entity_type: string; entity_id: string; transactions_restored: number }> {
  return guard(async () => {
    const { data, error } = await supabase.rpc("restore_deleted", { p_log_id: logId });
    if (error) throw error;
    return data as { entity_type: string; entity_id: string; transactions_restored: number };
  });
}
```
   - Do **not** embed profile names (the foreign keys point at `auth.users`, not `profiles`). Resolve names exactly as `queryTransactions` does for `updated_by` (`src/features/transactions/api.ts`, around lines 120 to 140): collect the distinct non-null `deleted_by` and `restored_by` ids, query `profiles` with `.select("id, full_name, email").in("id", ids)`, build a `Map` of `full_name ?? email ?? null`, and return entries typed `DeletionLogEntry & { deleted_by_name: string | null; restored_by_name: string | null }`.
   - `hooks.ts` exports `useDeletionLog(businessId, opts)` (`useQuery`, key `deletionLogKeys.list(businessId, JSON.stringify(opts))`, guarded by `assertCan("viewDeletedItems")` via the `enabled` flag: `enabled: can(role, "viewDeletedItems")` using the same `usePermissions` pattern as other queries) and `useRestoreDeleted(businessId)`:
```ts
export function useRestoreDeleted(businessId: string) {
  const queryClient = useQueryClient();
  const { assertCan } = usePermissions();
  return useMutation({
    mutationFn: ({ logId }: { logId: string }) => {
      assertCan("restoreDeleted");
      return restoreDeleted(logId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["business", businessId] }),
  });
}
```
5. **Dashboard timezone.** Run `grep -rn "p_timezone" src` to find the helper the Transactions rollup and daily activity use to get the browser's zone; reuse it. In the dashboard summary api function add `p_timezone: <that helper>()` to the `rpc("dashboard_summary", …)` call and add the zone to the query key so a cached value never mixes zones. If the helper can return an empty string, fall back to `"UTC"`.
6. **Types.** Export `DeletionLogEntry` from `src/types` if other feature types live there; otherwise from the feature `api.ts` only.

**Behaviour.**
```gherkin
Scenario: Deleting a transaction calls the right function
  When useDeleteTransaction runs for transaction T with reason "Entered twice"
  Then supabase.rpc is called with "delete_transaction" and p_transaction_id T, p_business_id B, p_reason "Entered twice"
  And the resolved value is the log id the database returned

Scenario: A viewer is stopped before the network
  Given I am a viewer
  When I call the delete mutation
  Then it rejects with a forbidden error and supabase.rpc is not called

Scenario: A successful delete refreshes everything
  When a delete or restore succeeds
  Then queries under ["business", B] are invalidated

Scenario: Restore errors are mapped
  Given the database raises 55000 "Restore the customer first."
  Then the mutation rejects with an AppError of code "conflict" and that message

Scenario: The dashboard sends the browser timezone
  When the dashboard summary loads
  Then dashboard_summary receives p_timezone equal to the browser's IANA zone
```
**Tests.** Follow the neighbouring `api.test.ts` / `hooks.test.tsx` mocking style: one test per scenario above, plus `listDeletionLog` filters (entity type; restored hidden by default; restored included when asked).
**Verify.** `npm run verify`. **Commit.** `feat(S-52): delete, restore and deletion-log data layer; dashboard sends timezone`

---

#### S-53 · Customers list query uses `last_activity_at`  (size S)

**Why.** F-13: the list downloads every transaction date for every customer just to compute the latest, and counts voided entries.

**Touches.** `src/features/customers/api.ts` (`queryCustomers` and its row type), tests.

**Do.**
1. In `queryCustomers` change the select string from `"*, customer_balances!inner(balance), transactions(occurred_at)"` to `"*, customer_balances!inner(balance, last_activity_at)"`.
2. Change `CustomerListQueryRow` so `customer_balances` is `{ balance: number; last_activity_at: string | null } | null` and delete its `transactions` field.
3. In the row mapper delete the loop over `transactions`; set `last_activity: customer_balances?.last_activity_at ?? null` and drop `transactions` from the destructuring.
4. Update the doc comment above `queryCustomers`: "Last activity comes from the view (voided entries excluded)."
5. Keep every other behaviour (search, status filters, sort, paging, counts) exactly as is.

**Behaviour.**
```gherkin
Scenario: The list no longer downloads transactions
  When the customers list loads
  Then the request selects customer_balances(balance, last_activity_at) and does not select transactions

Scenario: Voided entries do not count as activity
  Given a customer whose newest entry is voided
  Then "Last activity" shows the date of the newest non-voided entry

Scenario: A customer with no entries has no last activity
  Then "Last activity" shows an em dash
```
**Tests.** Update the existing `queryCustomers` tests to the new mocked shape; add the three scenarios.
**Verify.** `npm run verify`. **Commit.** `perf(S-53): customer list reads last_activity_at from the balance view`

---

### Phase D — Delete and recovery UI

#### S-54 · Delete a transaction  (size M)

**Why.** F-01, goal G-1. The Owner can remove a transaction, with Undo, while Void stays the default for Editors.

**Touches.** new `src/features/transactions/components/DeleteTransactionDialog.tsx`; `TransactionsPage.tsx`, `CustomerDetailPage.tsx`, `src/pages/TransactionDetailPage.tsx` (entry points); `src/features/dev/UiGallery.tsx`; tests.

**Do.**
1. Create `DeleteTransactionDialog.tsx` modelled on `VoidTransactionDialog.tsx` (same `ConfirmDialog` + reason `Input` + Undo-toast pattern). Props:
```ts
export interface DeletableTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  occurred_at: string;
  customer_name: string;
  /** The customer's balance before and after, for the sentence in the dialog. */
  balance_before: number | null;
  balance_after: number | null;
}
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  transaction: DeletableTransaction | null;
  /** Shown as a "Void instead" link; omit to hide it. */
  onVoidInstead?: (id: string) => void;
}
```
2. Dialog content (strings in section 5.6, money via `formatMoney`, date via `formatDate`): title `Delete this transaction?`; description built from the new-strings table, with the before/after sentence only when both balances are known; `tone="destructive"`; `confirmLabel="Delete transaction"`; the reason field (`Label` "Reason (optional)", `Input` with `maxLength={200}`, placeholder `Why is this being deleted?`, state reset every time the dialog opens, exactly as the Void dialog does); below it, when `onVoidInstead` is given, a text button `Void instead` that closes this dialog and calls it.
3. `onConfirm`: call `useDeleteTransaction(businessId).mutate({ id, reason: reason.trim() || null })`. On success show `toast.success("Transaction deleted", { duration: 10000, action: { label: "Undo", onClick: () => restore.mutate({ logId }) } })` where `restore` is `useRestoreDeleted(businessId)` and `logId` is the mutation result; on restore success show `toast.success("Restored")`; on any error `toast.error` with the AppError message (use the same helper other dialogs use, falling back to `Could not delete the transaction. Try again.`).
4. **Entry points** (each wrapped in `<Can action="deleteTransaction">`, a `Trash2` item in the existing row action menu, labelled `Delete`, placed **after** Void and separated by a divider, with `aria-label` `Delete {type} of {formatMoney(amount)}`):
   - Transactions page row menu (find where `Void` is defined: `grep -n "Void" src/features/transactions/pages/TransactionsPage.tsx`).
   - Customer detail ledger row menu (`grep -n "Void" src/features/customers/pages/CustomerDetailPage.tsx`).
   - Transaction detail page actions (`grep -n "Void" src/pages/TransactionDetailPage.tsx`).
   Each page owns one `DeleteTransactionDialog` instance and a `deleting` state, as it already does for Void. For `balance_before`/`balance_after` use the customer balance the page already has when available (customer detail page: the displayed balance; for a charge the after-balance is `before - amount`, for a payment `before + amount`; if the transaction is voided the balance does not change, so before equals after). Where a page does not know the balance, pass `null`.
5. Add the dialog to `UiGallery` in its open state.

**Behaviour.**
```gherkin
Feature: Delete a transaction

  Scenario: The Owner deletes a transaction
    Given I am the Owner and a customer has a 500 payment
    When I open the row menu, choose "Delete" and confirm "Delete transaction"
    Then the row disappears, the customer's balance rises by 500
    And a toast says "Transaction deleted" with an "Undo" action for 10 seconds

  Scenario: Undo restores it
    Given I just deleted a transaction
    When I press "Undo"
    Then the transaction returns with its original date, note and author
    And a toast says "Restored"

  Scenario: A reason is optional and capped
    When I type 201 characters into the reason field
    Then only 200 are accepted
    And leaving it empty is allowed

  Scenario: Editors and viewers never see Delete
    Given I am an Editor
    Then the row menu offers Edit and Void but not Delete
    Given I am a Viewer
    Then the row menu offers no write actions

  Scenario: Void is offered as the gentler option
    When the delete dialog opens
    Then a "Void instead" link is present
    And pressing it opens the Void dialog for the same row

  Scenario: The dialog reads clearly
    Then it names the type, amount, customer and date
    And states the balance before and after when known
    And says it can be restored from Recently deleted
```
**Tests.** `DeleteTransactionDialog.test.tsx` (copy and adapt `VoidTransactionDialog.test.tsx`: renders text with `formatMoney`, reason cap, confirm calls the mutation with trimmed reason, Void-instead link, axe); page tests: Delete present for Owner and absent for Editor and Viewer on each of the three pages; Undo calls restore with the returned log id.
**Verify.** `npm run verify`; manual: delete then Undo a real row in both themes at 390 px and 1440 px.
**Commit.** `feat(S-54): delete a transaction with reason, Undo and Owner-only entry points`

---

#### S-55 · Delete a customer  (size M)

**Why.** F-02, F-03, D-15. Delete is available from the list and the detail page, for active and archived customers, always with typed confirmation and a recovery path.

**Touches.** `src/features/customers/components/DeleteCustomerDialog.tsx`, `CustomersPage.tsx`, `CustomerDetailPage.tsx`, tests, `UiGallery`.

**Do.**
1. Read `DeleteCustomerDialog.tsx` (about 90 lines; it already uses `ConfirmDialog`'s `typingConfirmation`). Change its copy to the new strings (section 5.6): title `Delete {name}?`; description `This removes {name} and {n} transactions from your ledger. You can restore them from Recently deleted.` (use `1 transaction` when n is 1; n comes from the existing transaction-count hook the dialog already uses); `typingConfirmation={customer.name}`; `confirmLabel="Delete customer"`. Remove every use of the words "permanently" and "forever" from user-visible text in this file.
2. Below the description add two secondary controls inside the dialog body: a link `Download statement first` (navigates to `paths.statement(businessId, customer.id)` in a new tab) and a button `Archive instead` that closes this dialog and runs the existing archive mutation for that customer (the same hook the row menu uses for Archive).
3. On confirm call `useDeleteCustomerPermanently(businessId)` and, on success, `toast.success("Customer deleted", { duration: 10000, action: { label: "Undo", onClick: () => restore.mutate({ logId }) } })` (the result of the mutation is the log id after S-52). On restore success: `toast.success("Restored")`.
4. **Entry points.**
   - Customers list: the row menu currently offers Delete only for archived rows. Run `grep -n "Delete permanently" src/features/customers/pages/CustomersPage.tsx`, rename the label to `Delete`, and show it for **every** row (active and archived), still wrapped in `Can action="deleteCustomer"`, placed last and separated by a divider.
   - Customer detail page: add a `Delete customer` item to the page's overflow/action menu (next to Archive), wrapped in `Can action="deleteCustomer"`, and a `DeleteCustomerDialog` instance. After a successful delete navigate to `paths.customers(businessId)`.
5. Update `UiGallery`.

**Behaviour.**
```gherkin
Feature: Delete a customer

  Scenario: The Owner deletes an active customer from the list
    Given customer "Asha" has 3 transactions and is not archived
    When I choose "Delete" in her row menu
    Then the dialog says "Delete Asha?" and "removes Asha and 3 transactions"
    And the "Delete customer" button is disabled until I type "Asha"

  Scenario: Typing the exact name enables the button
    When I type "Asha"
    Then "Delete customer" is enabled
    When I type "asha" instead
    Then it stays disabled

  Scenario: Deleting from the detail page returns to the list
    Given I am on Asha's detail page as the Owner
    When I choose "Delete customer" and confirm
    Then I am taken to the customers list and Asha is gone
    And a toast offers "Undo"

  Scenario: Undo restores the customer with all transactions
    When I press "Undo"
    Then Asha and her 3 transactions return and her balance is unchanged

  Scenario: Gentler options are offered
    Then the dialog has "Archive instead" and "Download statement first"

  Scenario: Editors and viewers cannot delete
    Given I am an Editor
    Then neither the list nor the detail page offers Delete
```
**Tests.** Update the existing `DeleteCustomerDialog` tests to the new strings; add: Delete shown for active rows (Owner), hidden for Editor/Viewer; typed-name gating (exact, case-sensitive); singular/plural; Archive-instead calls the archive mutation; detail page navigates after success; Undo calls restore with the log id; axe.
**Verify.** `npm run verify`; manual in both themes. **Commit.** `feat(S-55): delete customers from list and detail with typed confirmation and Undo`

---

#### S-56 · Recently deleted page  (size M)

**Why.** F-03, D-13, D-18. Gives the Owner a place to see what was deleted and bring it back.

**Touches.** new `src/features/deleted-items/pages/DeletedItemsPage.tsx`, `src/App.tsx` (route), tests, `UiGallery` not needed.

**Do.**
1. Create `DeletedItemsPage.tsx` using the standard page frame: `PageHeader` title `Recently deleted`, description `Items you deleted. Only owners can see and restore them.`, no primary action.
2. Filter row: segmented control `All | Customers | Transactions` (use the existing `Tabs`), and a `Switch` labelled `Show restored` (off by default). Filter state lives in the query string like other lists (follow `CustomersPage` for the pattern).
3. Data: `useDeletionLog(businessId, { entityType, includeRestored })`.
4. `DataTable` columns: **Item** (icon: `User` for customers, `ArrowLeftRight` for transactions; then `label`), **Type** (`Customer` or `Transaction`), **Deleted by** (`deleted_by_name`; `Unknown` if null), **Deleted** (`formatRelative(deleted_at)`), **Reason** (text or an em dash), and a last column with a `Restore` button (`variant="outline" size="sm"`, `Undo2` icon). A restored row (visible only when "Show restored" is on) is muted, shows `Restored {formatRelative(restored_at)}` (with `restored_by_name`) in the last column and has no button. For customer rows add a secondary line under the label: `{summary.transaction_count} transactions`.
5. Restore: on press call `useRestoreDeleted(businessId).mutate({ logId })`; show a spinner on that row's button only; success → `toast.success(\`${label} restored\`)`; error → `toast.error(error.message)` (the AppError messages from S-51 are the final copy).
6. States: loading (skeleton rows), empty (`EmptyState` title `Nothing deleted`, body `Deleted customers and transactions appear here so you can restore them.`), error (`ErrorState` with retry), data. If exactly 200 rows are returned add a note under the table: `Showing the 200 most recent.`
7. Route: in `src/App.tsx` add a lazy route for `routePatterns.deletedItems` (the pattern added in S-51) inside the same business layout as `Settings`, wrapped so a non-owner who types the URL sees the standard "You don't have access" state (reuse whatever guard `Settings` or `Members` uses for `manageBusiness`/`manageMembers`; check with `grep -n "manageMembers" src`).
8. Add `DeletedItemsPage` to the lazy imports from S-48 in the same style.

**Behaviour.**
```gherkin
Feature: Recently deleted

  Scenario: The Owner sees what was deleted
    Given a customer and a transaction were deleted
    When I open "Recently deleted"
    Then both appear newest first with who deleted them and when

  Scenario: Restore a customer
    When I press "Restore" on the customer row
    Then the customer and its transactions return to the ledger
    And the row leaves the list and a toast says "{name} restored"

  Scenario: A transaction cannot come back before its customer
    Given a transaction was deleted and then its customer was deleted
    When I press "Restore" on the transaction
    Then a toast says "Restore the customer first."
    And the row stays

  Scenario: Restored items are hidden unless asked
    When I turn on "Show restored"
    Then restored rows appear muted with "Restored {when}" and no button

  Scenario: Editors and viewers have no access
    Given I am an Editor
    Then "Recently deleted" is not in the sidebar
    And opening /b/:id/deleted shows the no-access state

  Scenario: Empty
    Given nothing was ever deleted
    Then the page shows "Nothing deleted" with its explanation
```
**Tests.** Page tests for each scenario with the data hooks mocked as other page tests do; filter changes update the query string; per-row spinner; axe in empty and data states.
**Verify.** `npm run verify`; manual: delete a customer, find it, restore it, check its balance. **Commit.** `feat(S-56): Recently deleted page with restore`

---

### Phase E — The Ledger Page: design system and shell

Every story in phases E and F changes layout and styling only, and must leave existing behaviour and copy intact unless the story says otherwise. Existing tests that assert unchanged behaviour must keep passing unmodified; tests that assert the **structure or wording this PRD replaces** (named in each story) are updated, and each update is listed in `docs/PROGRESS.md`.

#### L-00 · Gate check and decisions file  (size S)

**Why.** Three product bets are not validated (D-24, D-28, D-29). The build must know, from a human-edited file, which variant to build, and must stop if the look itself has been rejected.

**Touches.** `docs/RESEARCH-DECISIONS.md`, `docs/PROGRESS.md`.

**Do.**
1. **Copy** `docs/RESEARCH-DECISIONS.md` and `docs/RESEARCH-PLAN.md` and `docs/UI-RETHINK-LedgerPage.md` from the Bundle into `docs/` if they are not already there. Do not edit `RESEARCH-DECISIONS.md`.
2. Read the table in `docs/RESEARCH-DECISIONS.md`. In `docs/PROGRESS.md` add a section `## Research gates` recording the status of **G-A3**, **G-A2** and **G-A1** exactly as written, and the date you read them.
3. Apply this rule and write the outcome in the same section:
   - **G-A3** is `approved` or `approved-with-changes` → continue. If `approved-with-changes`, copy the "Changes" text into `docs/PROGRESS.md` and apply it wherever it conflicts with this PRD.
   - **G-A3** is `pending` or `rejected` → **STOP** and tell the human (section 6.4). Do not build any L story.
4. Gates **G-A2** and **G-A1** decide variants later (L-07, L-12, L-06, L-13). Record them now; re-read the file again immediately before L-12 and L-13 because a human may have changed it meanwhile.

**Behaviour.**
```gherkin
Scenario: The look is approved
  Given G-A3 is "approved"
  Then the agent continues to L-01 and records the gate statuses in PROGRESS.md

Scenario: The look is not approved
  Given G-A3 is "pending" or "rejected"
  Then the agent stops, reports, and builds no L story

Scenario: Unvalidated bets default to the baseline
  Given G-A2 and G-A1 are "pending"
  Then L-07 builds the quick-add card, L-06 keeps "Top outstanding balances", and L-12 and L-13 are skipped
```
**Tests.** None. **Verify.** The `Research gates` section exists in `docs/PROGRESS.md`. **Commit.** `docs(L-00): record research gates before the Ledger Page build`

---

#### L-01 · Ledger tokens and contrast gate  (size S)

**Why.** F-14, F-15, D-24, D-26. The tokens carry the whole visual identity; the audit proves it stays accessible. Verified on a pristine clone of the repository: the patch changed 60 values and added 13 items; a second run changed nothing; the result builds; every ledger utility compiles; the full unit suite passed (469 tests) with the tokens applied.

**Touches.** `src/index.css` (by script), `design/design-tokens.ledger.css` (copy), `scripts/`, `.github/workflows/ci.yml`, `docs/UI-CONTRACT.md`.

**Do.**
1. **Copy** from the Bundle: `design/design-tokens.ledger.css`, `scripts/apply-tokens.cjs`, `scripts/check-token-sync.cjs`, `scripts/contrast-audit.cjs` (replace the file S-46 installed).
2. Run `node scripts/apply-tokens.cjs`. Expected: `src/index.css updated: 60 value(s) changed, 13 item(s) added.` Run it again; expected `0 value(s) changed, 0 item(s) added.`
3. Run `node scripts/check-token-sync.cjs` (expected `OK: 58 audited tokens match src/index.css`) and `node scripts/contrast-audit.cjs` (expected `All required pairs pass AA in both themes.`, 41 checks per theme).
4. In `ci.yml` uncomment the `npm run audit:tokens` step added in S-46.
5. Controls keep a clear boundary. Run `grep -rn "border-border" src/components/ui`. For every match that is a **form control or outline button** (input, textarea, select trigger, checkbox, radio, switch track, outline `Button` variant) change `border-border` to `border-input`. Leave cards, tables, separators, popovers, dialogs and sheets on `border-border`. List each changed file in `docs/PROGRESS.md`.
6. In `docs/UI-CONTRACT.md` replace the token section with the table of section 5.2 of this PRD, and replace any sentence claiming the contrast audit passes with: "`scripts/contrast-audit.cjs` audits text, tinted chips and control borders in both themes (82 checks); `scripts/check-token-sync.cjs` keeps it in step with `src/index.css`. Both run in CI."
7. Do not touch fonts here (L-02).

**Behaviour.**
```gherkin
Scenario: Paper and Sheet
  Given the app in light mode
  Then the page is pale green-grey (Paper) and panels are a lighter tone (Sheet) separated by a hairline, with no shadow

Scenario: Slate
  Given the app in dark mode
  Then the page is a deep green-black and panels a slightly lighter green-black, with chalk-coloured text

Scenario: Controls keep a visible boundary
  Then every input, select and textarea has a border that meets 3:1 against its surface in both themes

Scenario: Colours cannot drift
  When someone edits a colour in src/index.css without updating the audit
  Then "npm run audit:tokens" fails in CI
```
**Tests.** None beyond the scripts; existing unit tests must pass unmodified. **Verify.** the three commands above; `npm run verify`; `npm run dev` and look at Dashboard, Customers and a dialog in both themes (layout is unchanged; tone and radius differ).
**Commit.** `feat(L-01): ledger tokens (Paper, Sheet, Ink, Slate) with AA-verified audit and sync check`

---

#### L-02 · Heading font  (size S)

**Why.** D-25. Bricolage Grotesque gives titles and figures a distinct voice. It contains the rupee sign and tabular figures (verified in the font files). Public Sans stays for all text and money columns. The only dependency change in v3.1.

**Touches.** `package.json`, `package-lock.json`, `src/index.css`, `src/test/theme.test.ts`.

**Do.**
1. `npm install --save @fontsource-variable/bricolage-grotesque@^5.3.0`
2. In `src/index.css`, directly after the line `@import "@fontsource-variable/public-sans";` add `@import "@fontsource-variable/bricolage-grotesque/wght.css";`. (`--font-heading` and `--font-display` already point at `"Bricolage Grotesque Variable"` after L-01.)
3. In `src/test/theme.test.ts` replace the test named "loads exactly one UI font" with:
```ts
it("loads exactly two fonts: Public Sans for text and Bricolage Grotesque for headings and figures", () => {
  const fontImports = css.match(/@fontsource-variable\//g) ?? [];
  expect(fontImports).toHaveLength(2);
  expect(css).toContain("@fontsource-variable/public-sans");
  expect(css).toContain("@fontsource-variable/bricolage-grotesque");
});
```
4. Apply the font where the specification says: every `h1`, `h2`, `h3` and `CardTitle`-style heading uses the `font-heading` utility (grep for the heading components and add the class once, in the shared component, not on each page); hero figures use `font-display tabular-nums` (applied in L-06, L-07).
5. Confirm in the browser (Network tab, Fonts) that a `bricolage-grotesque-latin-wght` file loads and that the ₹ sign in a heading is drawn by the same face (no visibly different glyph).

**Behaviour.**
```gherkin
Scenario: Headings use the heading font
  Then page titles and section headings are drawn in Bricolage Grotesque

Scenario: Text and money columns stay in Public Sans
  Then body text, table cells and every money column are drawn in Public Sans with tabular figures

Scenario: The rupee sign is never a fallback glyph
  Then ₹ appears in the same face as the digits next to it, in headings and in tables
```
**Tests.** The updated theme test. **Verify.** `npm run verify`; the manual check in step 5. **Commit.** `feat(L-02): add Bricolage Grotesque for headings and figures`

---

#### L-03 · Fixes that do not depend on the look  (size M)

**Why.** F-14, F-16 (root cause), F-18, F-19. These are defects, independent of the visual direction, and are worth fixing first so the restyle starts from a correct base.

**Touches.** the four money files below, `src/components/app/{Avatar,BalanceBadge,StatusBadge}.tsx`, new `src/__tests__/noRawMoney.test.ts`, tests.

**Do.**
1. **Money hygiene (11 sites in four files).** Run:
```bash
grep -rn -E '₹\$\{|toLocaleString\("en-IN"' src --include=*.ts --include=*.tsx | grep -v __tests__ | grep -v 'lib/format.ts' | grep -v 'components/app/Money.tsx' | grep -v 'MAX_DATA_ROWS'
```
   Replace each match, importing `formatMoney` from `@/lib/format` or using `<Money>`:
   - `aria-label={\`Restore ${row.type} of ₹${row.amount}\`}` and the Edit, Void and Delete variants → `` `Restore ${row.type} of ${formatMoney(row.amount)}` `` (and likewise).
   - `VoidTransactionDialog.tsx` title → `` `Void this ${transaction.type} of ${formatMoney(transaction.amount)}?` ``.
   - The amount cells in `TransactionsPage.tsx` and `CustomerDetailPage.tsx` → `<Money amount={row.type === "charge" ? row.amount : -row.amount} signed />`.
   - The balance in `CustomerDetailPage.tsx` (`₹{Math.abs(balance).toLocaleString("en-IN")}`) → `<Money amount={Math.abs(balance)} />`.
   - `TransactionDetailPage.tsx` amount → `<Money amount={transaction.amount} />`.
   - Leave the two `MAX_DATA_ROWS.toLocaleString` lines (a row count, not money). Update any test that expected the old text.
2. **Guard test** — `src/__tests__/noRawMoney.test.ts` (verified: against the baseline it fails on exactly these four files):
```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ALLOWED = ["lib/format.ts", "components/app/Money.tsx"];
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "__tests__" ? [] : files(p);
    return /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}
describe("money formatting", () => {
  it("is done only by formatMoney and Money", () => {
    const bad = files("src")
      .filter((p) => !ALLOWED.some((a) => p.replace(/\\/g, "/").endsWith(a)))
      .filter((p) => /₹\$\{|toLocaleString\("en-IN"/.test(readFileSync(p, "utf8")) && !/MAX_DATA_ROWS/.test(readFileSync(p, "utf8")));
    expect(bad).toEqual([]);
  });
});
```
3. **Tinted chips meet AA.** In `BalanceBadge.tsx` and `StatusBadge.tsx` change each tint from `bg-TONE/10 text-TONE` to `bg-TONE/10 dark:bg-TONE/8 text-TONE` (tones `receivable`, `credit`, `warning`; in `StatusBadge` also `success` if present).
4. **Avatar fallback and tints.** In `Avatar.tsx` set the palette to `"bg-receivable/10 dark:bg-receivable/8 text-receivable"`, `"bg-credit/10 dark:bg-credit/8 text-credit"`, `"bg-primary/10 dark:bg-primary/8 text-primary"`, `"bg-success/10 dark:bg-success/8 text-success"`, `"bg-warning/10 dark:bg-warning/8 text-warning"` and add the image-error fallback:
```tsx
import { useState } from "react";
// inside Avatar():
const [failed, setFailed] = useState(false);
if (src && !failed) {
  return <img src={src} alt={name} onError={() => setFailed(true)} className={cn(/* unchanged */)} />;
}
// ...fall through to the initials <span> exactly as today
```

**Behaviour.**
```gherkin
Scenario: Money looks the same everywhere
  Then every amount shows two decimals, for example "₹249.50", in tables, dialogs, labels and detail pages

Scenario: A broken profile photo falls back to initials
  Given an Avatar whose image URL fails to load
  Then the initials are shown on a tinted circle, never a black one

Scenario: Chips meet contrast
  Then the "You owe" chip has contrast of at least 4.5:1 in both themes
```
**Tests.** `noRawMoney.test.ts`; `Avatar.test.tsx` (fire `error` on the img, expect initials); update tests that expected unformatted money text. **Verify.** `npm run verify`; `node scripts/contrast-audit.cjs`. **Commit.** `fix(L-03): one money formatter, avatar image fallback, AA-safe chips`

---

#### L-04 · Primitives  (size L)

**Why.** D-24, D-26, D-27. Every page restyle assumes these exist.

**Touches.** `src/components/ui/card.tsx`, new `src/components/app/{LeaderRow,TotalsRule,Monogram,AgeFlag,TallyMark,TypeBadge}.tsx`, `EmptyState.tsx`, `DataTable.tsx`, `Skeleton`, filter `Tabs` usage, `src/features/dev/UiGallery.tsx`, tests.

**Do.**
1. **Card.** Set the root class string to `rounded-lg border border-border bg-card text-card-foreground`, removing any `ring-*` and `shadow-*`. Keep props and sub-components.
2. **`LeaderRow.tsx`**
```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Money } from "@/components/app/Money";

type Tone = "receivable" | "credit" | "neutral";
const toneClass: Record<Tone, string> = { receivable: "text-receivable", credit: "text-credit", neutral: "text-foreground" };

interface LeaderRowProps {
  label: ReactNode;
  sub?: ReactNode;
  amount: number;
  tone?: Tone;
  leading?: ReactNode;      // usually a <Monogram />
  trailing?: ReactNode;     // for example an <AgeFlag />
  size?: "md" | "lg";
  className?: string;
}

// The leader dots are decorative; reading order is label, sub-line, amount.
export function LeaderRow({ label, sub, amount, tone = "neutral", leading, trailing, size = "md", className }: LeaderRowProps) {
  return (
    <div role="listitem" className={cn("leader items-center py-3", className)}>
      {leading}
      <div className="min-w-0">
        <div className={cn("truncate", size === "lg" ? "font-heading text-xl font-bold" : "font-semibold")}>{label}</div>
        {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
      </div>
      {trailing}
      <i className="leader-dots" aria-hidden="true" />
      <Money amount={amount} className={cn("font-semibold", size === "lg" && "font-display text-xl", toneClass[tone])} />
    </div>
  );
}
```
   (Names truncate; amounts never do: `Money` already uses `tabular-nums` and `whitespace-nowrap` via `inline-block`.) Wrap lists of rows in `<div role="list">`.
3. **`TotalsRule.tsx`**: `export function TotalsRule({ children, className }) { return <div className={cn("totals-rule py-3", className)}>{children}</div>; }`
4. **`Monogram.tsx`**
```tsx
import { cn } from "@/lib/utils";

type Tone = "receivable" | "credit" | "neutral";
const toneClass: Record<Tone, string> = {
  receivable: "bg-receivable/10 dark:bg-receivable/8 text-receivable",
  credit: "bg-credit/10 dark:bg-credit/8 text-credit",
  neutral: "bg-muted text-muted-foreground",
};
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}
export function Monogram({ name, tone = "neutral", size = "md", className }: { name: string; tone?: Tone; size?: "md" | "lg"; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-sm font-bold", size === "lg" ? "size-14 text-lg" : "size-8 text-xs", toneClass[tone], className)}>
      {initials(name)}
    </span>
  );
}
```
   Tone rule used by callers: balance greater than zero → `receivable`; less than zero → `credit`; zero → `neutral`.
5. **`AgeFlag.tsx`**
```tsx
export function AgeFlag({ days }: { days: number | null }) {
  if (days === null || days < 30) return null;
  return (
    <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning dark:bg-warning/8">
      {Math.floor(days / 10) * 10}+ days
    </span>
  );
}
```
6. **`TallyMark.tsx`**
```tsx
export function TallyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4v16M9.5 4v16M14 4v16M18.5 4v16M2.5 16.5l19-9" />
    </svg>
  );
}
```
7. **`TypeBadge.tsx`**
```tsx
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TransactionType } from "@/types";

// Colour meaning is unchanged from v2 (D-10): charge = receivable (green), payment = credit (red-orange).
const styles = {
  charge: { label: "Charge", tone: "bg-receivable/10 dark:bg-receivable/8 text-receivable", Icon: ArrowUpRight },
  payment: { label: "Payment", tone: "bg-credit/10 dark:bg-credit/8 text-credit", Icon: ArrowDownLeft },
} as const;

export function TypeBadge({ type, className }: { type: TransactionType; className?: string }) {
  const { label, tone, Icon } = styles[type];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium", tone, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}
```
   Replace the hand-made Charge and Payment badges where a single Type column remains (customer ledger detail view if kept, Transactions detail view if it keeps a type cell): `grep -rn '"Charge"\|"Payment"\|>Charge<\|>Payment<' src --include=*.tsx | grep -v __tests__`.
8. **`BalanceBadge`**: add a leading 14 px icon: Owes you `ArrowDownLeft`, You owe `ArrowUpRight`, Settled `Check` (`className="size-3.5" aria-hidden="true"`); the words stay.
9. **`EmptyState`**: render `<TallyMark className="mb-3 size-8 text-muted-foreground" />` above the title; title `text-base font-semibold font-heading`; description `text-sm text-muted-foreground max-w-sm`; keep the action slot; the container gets a faint ruled background: `bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,var(--border)_31px,var(--border)_32px)]` (the only permitted use of an arbitrary background).
10. **`DataTable`**: read it. Wrap the table in `<div className="overflow-hidden rounded-lg border border-border bg-card">`; remove any other outer border and any shadow. Header cells `bg-muted/60 text-xs font-medium text-muted-foreground` (remove upper-casing and tracking), sticky top. Rows `border-t border-border` (not the first), hover `hover:bg-muted/60`. Keep the mobile card layout, sorting, paging and the five states exactly.
11. **Skeleton**: add `motion-reduce:animate-none`.
12. **Filter and range tabs** (Customers status filter, Transactions type filter, 7/30/90 days): style the existing `Tabs` as text tabs: active `border-b-2 border-foreground text-foreground font-semibold`, inactive `border-b-2 border-transparent text-muted-foreground hover:text-foreground`. Keep labels, state, `aria-pressed` or `role="tab"` semantics and query-string behaviour exactly.
13. **UiGallery**: show every new primitive in both themes: `LeaderRow` (three tones, with `Monogram` and `AgeFlag`), `TotalsRule`, `TallyMark`, `TypeBadge`, `BalanceBadge`, `Avatar` with a broken image, `EmptyState`.

**Behaviour.**
```gherkin
Scenario: A leader row reads in order
  Given a LeaderRow with label "Rahim Uddin", sub "paid today" and amount 237439
  Then a screen reader reads "Rahim Uddin", "paid today", then "₹2,37,439.00", and the dotted leader is not announced

Scenario: A long name never hides the amount
  Given a very long customer name
  Then the name is truncated and the full amount is visible

Scenario: A total is set like an accountant's
  Then a TotalsRule has a single line above and a double line below its content

Scenario: Age flags
  Given 12 days, 30 days, 41 days and null
  Then no flag, "30+ days", "40+ days" and no flag are shown

Scenario: Flat panels
  Then Card and DataTable have a hairline border and no shadow in both themes
```
**Tests.** One test file per new component (render, tones, roles, no truncation of the amount, `AgeFlag` thresholds, `Monogram` initials for one-word and two-word names); `DataTable` existing tests must pass unmodified; axe on the gallery in both themes. **Verify.** `npm run verify`; visual check of the gallery in both themes. **Commit.** `feat(L-04): ledger primitives (LeaderRow, TotalsRule, Monogram, AgeFlag, TallyMark, TypeBadge), flat Card and ruled DataTable`

---

#### L-05 · App shell: spine navigation, top bar, titles  (size M)

**Why.** F-17, F-20, and the shell sets the look of every page.

**Touches.** `src/components/layout/{AppShell,Topbar,Sidebar,BusinessSwitcher}.tsx`, `PageHeader.tsx`, tests.

**Do.**
1. **Titles.** In `AppShell.tsx` replace the `useMemo` that builds `title` with an ordered lookup, **most specific first**, using `matchPath` from `react-router-dom` against the route-pattern object in `paths.ts`: import customers → `Import`; customer statement → `Statement`; customer detail → `Customer`; customers list → `Customers`; transaction detail → `Transaction`; transactions list → `Transactions`; deleted items → `Recently deleted`; members → `Members`; settings → `Settings`; business root → `Dashboard`; `paths.businesses` → `My businesses`; anything else `""`. Use `end: true` for every pattern.
2. **One page title.** `PageHeader` renders its title as `<h1 className="font-heading text-3xl font-bold tracking-tight">`. In `Topbar.tsx` change the title element from `<h1>` to `<p className="min-w-0 flex-1 truncate text-base font-semibold lg:hidden">` and keep a flexible spacer (`<div className="hidden flex-1 lg:block" />`) so the right-hand buttons stay right-aligned at `lg` and above. Update tests that look for the top bar's level-1 heading.
3. **Top bar.** Header classes: `sticky top-0 z-10 border-b border-border bg-background print:hidden`. The search trigger and the Add transaction button use `border-input bg-card` (they are controls). Add a prop `showAddTransaction?: boolean` (default `true`); render the button only when true and the user can manage transactions.
4. In `AppShell.tsx` compute `showAddTransaction` as false when the current path is the business root (Dashboard) or the transactions list, true otherwise, and pass it. Those pages already have the primary **Add transaction** in their `PageHeader` (one primary action per screen).
5. **Spine.** In `Sidebar.tsx`: root `flex h-full w-[212px] flex-col bg-sidebar py-5 pl-3 text-sidebar-foreground` (no right border). Brand row at the top: `<TallyMark className="size-7 text-sidebar-foreground" />` and `BahiKhata` (`font-heading text-xl font-bold`). Under it the business name and role (`text-sm opacity-80`; the existing `BusinessSwitcher` trigger, restyled with no border, `rounded-sm px-2 py-1 hover:bg-white/10`). Nav items: base `flex items-center gap-3 rounded-l-sm px-3 py-2.5 font-medium text-sidebar-foreground/80 hover:text-sidebar-foreground`; **active** `bg-background text-foreground font-semibold` (the tab). The item container must have no right padding so the active tab touches the main area. Keep the most-specific-match logic, the skip link, collapse behaviour and the mobile drawer (the drawer uses the same classes).
6. The main area background is `bg-background` so the active tab visibly joins the page.

**Behaviour.**
```gherkin
Scenario: Every page has the right title
  When I open Import, a customer's Statement, a customer, a transaction, Recently deleted
  Then the mobile top bar shows "Import", "Statement", "Customer", "Transaction", "Recently deleted"
  And it never shows "Customers" on the Import page

Scenario: One page title on desktop
  Given a viewport of 1280 px or wider
  Then the title appears once, as the page's h1, and the top bar shows no title

Scenario: One heading level 1
  Then every page has exactly one h1

Scenario: One primary Add transaction
  Given I am an Editor on the Dashboard or Transactions page
  Then there is exactly one "Add transaction" button, in the page header
  Given I am on the Customers page
  Then the top bar shows "Add transaction"

Scenario: The current page is a tab that joins the page
  Then the current nav item has the page colour and bold text and touches the main area, while the others are muted ink-on-ink text

Scenario: The spine is readable
  Then every nav item meets 4.5:1 contrast in both themes
```
**Tests.** `AppShell` title tests for the eleven routes; `Topbar` tests (no title at `lg` via the `lg:hidden` class; button hidden when `showAddTransaction` is false); an `h1` count assertion in page tests where cheap; axe on the shell. **Verify.** `npm run verify`; manual at 390 px and 1440 px in both themes. **Commit.** `feat(L-05): spine navigation, one page title, correct route titles, single Add transaction`

---

### Phase F — The Ledger Page: screens

#### L-06 · Dashboard  (size M)

**Why.** F-16, F-20, D-24, D-29. The first screen should show where the business stands in one glance, with the largest figure legible and no clipping.

**Touches.** `src/features/dashboard/pages/DashboardPage.tsx`, `components/{TopOutstanding,TrendChart,ActivityFeed,FirstRunCard}.tsx`, new `components/{PositionSheet,DayBook}.tsx`, tests (`dashboardPage.test.tsx` and the component tests).

**Do.**
1. `DashboardPage.tsx`: (a) change the button label `Add Transaction` to `Add transaction`; (b) remove the four `StatCard`s and their grid (this also removes the `text-4xl` that clipped the total); (c) render, in order, `<PositionSheet … />` and the second sheet (step 3), then a row with `<DayBook … />` and the week chart; (d) the page grid is `grid gap-6 lg:grid-cols-2` for the two rows (second row `lg:grid-cols-[1.5fr_1fr]`); (e) keep the loading, error and first-run states, restyled (step 6).
2. **`PositionSheet.tsx`** (new): a `Card` (`p-6`) containing `<h2 className="font-heading text-xl font-bold">Where you stand</h2>` and a `role="list"`:
```tsx
<LeaderRow size="lg" tone="receivable" label="Owed to you" sub={`${openAccounts} open accounts`} amount={totalReceivable} />
<LeaderRow size="lg" tone="credit" label="You owe" sub="Business owes customers" amount={totalCredit} />
<TotalsRule className="my-3"><LeaderRow size="lg" label="Net position" amount={totalReceivable - totalCredit} /></TotalsRule>
<p className="text-sm text-muted-foreground">Today: {todayCount} entries, net <Money amount={todayNet} />. <Link to={todayHref} className="font-semibold text-primary underline-offset-4 hover:underline">Open today</Link></p>
```
   `todayHref` is exactly what the v2 "Today's activity" card linked to (copy it from the existing code before deleting that card). `Money` for the net position comes from `LeaderRow`. Singular: `1 entry`, `1 open account`.
3. **Second sheet, by gate G-A1** (read `docs/RESEARCH-DECISIONS.md`): if G-A1 is `approved` or `approved-with-changes`, leave a clearly marked slot `{/* L-13 mounts Who to chase here */}` and render **Top outstanding balances** for now; L-13 swaps it. Otherwise this story's Top outstanding balances is the final content.
4. **`TopOutstanding.tsx`**: a `Card` (`p-6`) with `<h2 className="font-heading text-xl font-bold">Top outstanding balances</h2>` (keep the existing "View all" link to the customers list filtered as today), then a `role="list"` of `LeaderRow` for each debtor: `leading={<Monogram name={d.name} tone="receivable" />}`, `label` = a `Link` to the customer, `sub` = `` `${share}% of the total` `` where `share = Math.round(d.balance / Math.max(total, 1) * 100)` (pass `total={data.total_receivable}`), `amount={d.balance}`, `tone="receivable"`. Remove any bar element. Keep the empty text `All settled — no outstanding balances.` on a `bg-muted/50` block. Show at most 5 rows.
5. **`DayBook.tsx`** (new, replaces `ActivityFeed.tsx`): a `Card` with `<h2>Day book</h2>` and a table of the last 10 entries, newest first, from the **same hook and data** `ActivityFeed` uses (read it; it already carries the customer, creator name, type, amount and a timestamp). Columns: Date (`formatDate` of `occurred_at` if the item has it, otherwise `created_at`), Customer and note (customer name as a `Link`; the note in muted text; `by {creator}` muted on `md` and up), **Charged** (`<Money className="text-receivable">` when type is charge), **Paid** (`text-credit` when type is payment). Keep the loading, error and empty states and their text. Delete `ActivityFeed.tsx` and its test after moving the data-hook tests.
6. **`TrendChart.tsx`**: charged bars `fill="var(--receivable)"`, paid bars `fill="var(--credit)"` (they were `--chart-1` and `--chart-2`); `radius={0}`; baseline `stroke="var(--foreground)"` 1.5 px; gridlines `stroke="var(--border)"` dashed `2 5`; axis tick labels `fill="var(--muted-foreground)"`, 12 px; keep the aria labels and the visible text summary. Put two decorative swatches before "charged" and "paid" in that summary line (`<i aria-hidden className="mr-1.5 inline-block size-2.5 bg-receivable" />` and `bg-credit`). The 7, 30, 90 day control becomes the text tabs of L-04 (labels and `aria-pressed` unchanged). Wrap in a `Card`.
7. **`FirstRunCard.tsx`**: render the blank ruled page of `EmptyState`; keep its text and buttons.

**Behaviour.**
```gherkin
Scenario: Where you stand
  Given the business is owed ₹3,09,188.56 and owes ₹3,202.33
  Then the sheet shows "Owed to you ₹3,09,188.56" in the receivable colour, "You owe ₹3,202.33" in the credit colour
  And below a single line and a double line "Net position ₹3,05,986.23"

Scenario: A very large total never clips
  Given the business is owed ₹99,99,99,999.99
  Then the whole amount is visible at 390 px, 768 px and 1440 px, joined to its label by a dotted leader

Scenario: Today still opens Transactions
  When I press "Open today"
  Then I land on Transactions filtered to today, exactly as the old Today's activity card did

Scenario: Top outstanding balances show share
  Given Rahim owes 237439 of a 309188.56 total
  Then his row reads "77% of the total" and links to his page

Scenario: Day book columns
  Then a charge appears in the Charged column and a payment in the Paid column of its row

Scenario: One primary action
  Then the page header has one primary button, labelled "Add transaction"
```
**Tests.** Update `dashboardPage.test.tsx` for the new structure (labels `Where you stand`, `Owed to you`, `You owe`, `Net position`; no stat tiles; `Add transaction` casing); keep the "today link", loading, error and first-run tests (adapt selectors only); new tests for `PositionSheet` (arithmetic, singular forms), `TopOutstanding` share text, `DayBook` column placement, chart fills; axe in loading, error, first-run and data states. **Verify.** `npm run verify`; manual in both themes at 390, 768 and 1440 px. **Commit.** `feat(L-06): dashboard as a ledger page (Where you stand, top balances, day book, week chart)`

---

#### L-07 · Customer detail as a ledger, with quick add  (size L)

**Why.** F-22, D-24, D-28. The signature page. It ships with the **baseline** quick-add card; the column entry row is L-12 (gate G-A2).

**Touches.** `src/features/customers/pages/CustomerDetailPage.tsx` (654 lines), new `src/features/customers/components/{CustomerHeader,CustomerQuickAdd,LedgerTable}.tsx`, tests.

**Do.**
1. **Split the page** without changing behaviour: extract (a) the header block (title, balance, page menu: roughly lines 370 to 500 at baseline) into `CustomerHeader.tsx`, taking the customer, balance and the handlers it already uses as props; (b) the ledger row actions (Edit, Void or Restore, Delete) into a function `renderLedgerActions(entry)` kept in the page or a small hook. After the change the page must be under 450 lines.
2. **Header** (`CustomerHeader`): `Monogram size="lg"` (tone from the balance), name `font-display text-3xl font-bold`, a muted line `{phone} · last activity {formatRelative}`. On the right a `TotalsRule` block: a muted label `Owes you` (or `You owe`, or `Settled`) and the balance in `font-display text-4xl` in the tone colour (`Money`). Actions under the name: **Statement** (link), **Edit**, and an overflow menu with **Archive** (when not archived) and **Delete customer** (`Can action="deleteCustomer"`, S-55). Remove the three `StatCard`s (Total charged, Total paid, Last activity): the ledger's totals row replaces the first two and the header line the third. Update the tests that asserted them.
3. **`LedgerTable.tsx`** (new). Props:
```ts
export interface LedgerEntry {
  id: string; occurred_at: string; note: string | null;
  type: TransactionType; amount: number; status: TransactionStatus;
  balance_after: number | null;
}
interface LedgerTableProps {
  entries: LedgerEntry[];                         // newest first, as customer_ledger returns them
  renderActions?: (entry: LedgerEntry) => ReactNode;
  topRow?: ReactNode;                             // an entry row (L-12), rendered first in tbody
}
```
   Render a `Card` (`overflow-hidden`) containing a horizontally scrollable wrapper and a real `<table>` with a `<caption className="sr-only">Ledger</caption>`. `<thead>` row: `bg-muted/60 text-xs font-medium text-muted-foreground`; columns **Date** (w-24), **Particulars** (the `margin-rule` on every body cell of this column, `pl-3`), **Charged** and **Paid** and **Balance** (right-aligned, `w-36`), and a last column with `<span className="sr-only">Actions</span>`. Body rows `border-t border-border`, height 56 px: Date `text-sm text-muted-foreground` (`formatDate`); Particulars `entry.note ?? "—"` plus, for voided entries, `<span className="ml-2 rounded-sm bg-warning/10 px-1.5 py-0.5 text-xs font-semibold text-warning dark:bg-warning/8">Voided</span>`; Charged `<Money className="text-receivable">` only when `type === "charge"`; Paid `<Money className="text-credit">` only when `type === "payment"`; Balance `<Money className="font-medium">` of `balance_after`. Voided rows: the row `text-muted-foreground`, and the amount `line-through`. **Paging by "earlier entries"**: render the newest 50; if more exist show a full-width row button `Show earlier entries ({n})` that reveals the next 50. **Totals** (`<tfoot>`): one row whose cells carry `border-t border-foreground border-b-[6px] border-double` with the words `Totals`, charged total, paid total and the final balance, all computed from **every** entry that is not voided (not only those shown). Footer line under the table: `{n} entries · Voided entries stay visible but do not count.` (singular `1 entry`).
   Under 768 px render a list instead of the table: each entry is two lines: line 1 the note (or an em dash) and the amount in its tone colour with its column word (`Charged` or `Paid`) as a small label; line 2 the date and `balance {Money}`; the actions menu at the end; voided styling as above.
4. **Quick-add card** `CustomerQuickAdd.tsx`, rendered above the ledger inside `<Can action="manageTransactions">` and only when the customer is not archived and **only when G-A2 is not `approved`** (if it is approved, L-12 provides the entry row instead; build this component anyway, it is also the mobile control in L-12):
   - Built on the same pieces as `TransactionSheet.tsx` (read its imports): `useForm` with `zodResolver(transactionSchema)`, `mode: "onTouched"`, `defaultValues: { customer_id, type: "charge", amount: "", occurred_on: <today as the schema computes it>, occurred_at_time: "", note: "" }`, the `MoneyField` and `TextField` components, and `useCreateTransaction(businessId)`. Submit maps to `occurred_at` exactly as the sheet does (`new Date(\`${occurred_on}T${occurred_at_time || "00:00"}\`).toISOString()`).
   - Layout: a `Card` (`p-4`) titled `New entry`; a two-choice control **Charged | Paid** (`role="radiogroup"`; selected `bg-primary text-primary-foreground`, unselected `bg-card border border-input`; height 44 px); a row with the amount field (`flex-1`), the note field (`flex-[2]`, placeholder `What was it for?`) and a button (`Add charge` or `Add payment`, matching the choice); below, a muted line `New balance: ₹X` from `useCustomerBalance(customerId, businessId)` (charge adds, payment subtracts), shown only when the amount is valid, `aria-live="polite"`; a text button `Change date` that reveals the date and time fields.
   - On success: reset the amount and note, keep the choice, focus the amount, `toastSuccess("Charge added")` or `"Payment added"`. Errors: `toast.error(error.message)`.
5. Keep the existing Ledger and Details tabs (restyled by L-04) and the Details content as is. The ledger data comes from the same `customer_ledger` hook as before.
6. The header balance and the quick-add preview both come from `useCustomerBalance`, so they agree.

**Behaviour.**
```gherkin
Feature: The customer page is a ledger

  Scenario: Reading the ledger
    Given Rahim has seven entries
    Then the page shows Date, Particulars, Charged, Paid and Balance columns, newest first, a margin rule beside Particulars, and a Totals row with a double rule

  Scenario: Voided entries stay visible
    Given one entry is voided
    Then it is muted with a struck-through amount and a "Voided" chip, and the totals and running balance do not include it

  Scenario: Totals cover every entry
    Given a customer with 120 entries
    Then the Totals row sums all non-voided entries, while only the newest 50 rows are shown with "Show earlier entries (70)"

  Scenario: Record a charge with the quick-add card
    Given I am an Editor on Rahim's page and his balance is ₹2,37,439.00
    When I type 15000 in Amount and press "Add charge"
    Then a charge of ₹15,000.00 dated today is added, the balance becomes ₹2,52,439.00, and the amount field is empty and focused

  Scenario: The new balance is previewed
    When I type 15000 with "Charged" selected
    Then the line reads "New balance: ₹2,52,439.00"
    When I choose "Paid"
    Then it reads "New balance: ₹2,22,439.00"

  Scenario: Invalid input is explained after the field is touched
    When I type 0 and move away
    Then "Amount must be above zero" appears and the button does not submit

  Scenario: No write access
    Given I am a Viewer, or the customer is archived
    Then there is no quick add

  Scenario: Phone
    Given a 390 px screen
    Then entries are listed as two-line rows with their column word, and the quick-add choices are at least 44 px tall
```
**Tests.** `LedgerTable.test.tsx` (columns, margin rule class, voided styling, totals over all entries, "Show earlier entries", mobile list, axe); `CustomerQuickAdd.test.tsx` for each scenario (mock `useCreateTransaction` and `useCustomerBalance` as neighbouring tests do); update `CustomerDetailPage` tests that asserted the removed stat cards or the old table; keep every behavioural test (void, restore, edit, delete entry points, archive). **Verify.** `npm run verify`; `wc -l src/features/customers/pages/CustomerDetailPage.tsx` is under 450; manual in both themes at 390 and 1440 px. **Commit.** `feat(L-07): customer page as a ledger with totals and quick-add card`

---

#### L-08 · Customers list  (size M)

**Why.** D-24. The most-used list should be scannable and consistent.

**Touches.** `src/features/customers/pages/CustomersPage.tsx`, tests.

**Do.**
1. **Summary sheet**: replace the three `StatCard`s with one `Card` (`p-6`): a muted `Customers {n}` line, then `role="list"` of `LeaderRow size="lg"` for *Owes you* (receivable) and *You owe* (credit) with the existing totals. Delete any `valueClassName` colour overrides.
2. **Search**: the placeholder is cut off ("Search by name or phon"). Change it to `Search name or phone` and make the input `min-w-0 flex-1 sm:max-w-sm`.
3. **Status filter** (All, Owes you, You owe, Settled, Archived): the text tabs of L-04; labels, query string and `aria-pressed` unchanged.
4. **Columns** (read the existing `columns`; change only the cell renderers and header classes): Customer = `Monogram` (tone from the balance) plus name and the phone beneath in `text-xs text-muted-foreground`; remove the separate Phone column below `md`. Balance = right-aligned amount in the tone colour with the words `owes you` or `you owe` beneath in `text-xs text-muted-foreground` (a settled customer shows `Settled`); keep the `BalanceBadge` only where the mobile card needs it. Last activity = relative time, em dash when null. Added = hidden below `lg`; when Last activity and Added are on the same calendar day show only Last activity. Row menu: Edit, Archive or Restore, **Delete** (S-55).
5. **Mobile cards** (under 768 px): read how `DataTable` builds its card layout. If its API lets a page supply the card renderer, render each customer as a `LeaderRow` (`leading` `Monogram`, `label` name, `sub` phone, amount in tone colour); otherwise keep the existing card layout, restyled by the tokens, and record the deviation in `docs/PROGRESS.md`.
6. `PageHeader` actions: primary **Add customer**; secondary **Export CSV** and **Import CSV** (outline). No other primary button.

**Behaviour.**
```gherkin
Scenario: Scanning the list
  Then each row shows a square monogram, the name with the phone beneath, the balance with "owes you" or "you owe" beneath, and last activity

Scenario: Search is legible
  Then the search placeholder reads "Search name or phone" in full at 390 px and 1440 px

Scenario: Filters, sorting and paging behave as before
  When I choose "Owes you" and sort by Balance
  Then only customers with a positive balance are listed, sorted, and the URL records both

Scenario: Position
  Then "Owes you" and "You owe" totals appear as two leader rows in one sheet
```
**Tests.** Update the page test for the placeholder, summary and cell content; keep every filter, sort, paging and row-menu test unmodified (adapt selectors only where the DOM necessarily changed). **Verify.** `npm run verify`; manual, both themes. **Commit.** `feat(L-08): customers list with monograms, position sheet and legible search`

---

#### L-09 · Transactions as a day book  (size L)

**Why.** F-21, F-22. The busiest table must not scroll sideways, the filter bar must not wrap into disorder, and the file must be maintainable.

**Touches.** `src/features/transactions/pages/TransactionsPage.tsx` (1,024 lines), new `components/{TransactionFilters,TransactionTotals}.tsx` and `transactionColumns.tsx`, tests.

**Do.**
1. **Split** without changing behaviour: (a) `transactionColumns.tsx` exports `buildDetailColumns(...)` and `buildSummaryColumns(...)` holding the column definitions and their row actions (baseline lines roughly 300 to 640), taking `{ can, businessId, onEdit, onVoid, onRestore, onDelete, navigate }`; (b) `TransactionFilters.tsx` holds the whole `FilterBar` block (roughly lines 675 to 905) and receives the filter state and setters as props; (c) `TransactionTotals.tsx` holds the totals footer (roughly lines 981 to 1024). `TransactionsPage.tsx` keeps state, queries, URL handling and composition and must end under 450 lines.
2. **Filter row** (`TransactionFilters`): one flex row that wraps cleanly: Range select (`w-40`), type text tabs (All, Charge, Payment), search (`min-w-[12rem] flex-1`), customer select (`w-48`), and "Include voided" as a `Switch` with a visible label. Below it the Detailed and Summarized text tabs. Selected-filter chips (the existing `FilterBar` chips) stay.
3. **Detailed columns**: Date; Customer (`Monogram` and name); Particulars (note, em dash when empty); **Charged** (`<Money className="text-receivable">` when type is charge); **Paid** (`<Money className="text-credit">` when type is payment); Recorded by; row menu. Both amount headers sort by amount (give them the same sort key the old Amount column used). Voided rows (when included) are muted with a struck-through amount and a `Voided` chip in Particulars. Below `xl` hide Recorded by and show it under the note (`text-xs text-muted-foreground`: `by {name}`). The table must not scroll horizontally at 1024 px and wider.
4. **Summarized columns**: keep their data and sorting; only restyle (ruled table, `Money` for every figure, labels `Charged`, `Paid`, `Net` where they are currently "Total charged", "Total paid" or "Net").
5. **Row menu**: Edit, Void or Restore, and last after a divider **Delete** (Owner, S-54).
6. **Totals** (`TransactionTotals`): inside the same bordered container, a row with `totals-rule` styling: `Totals for this filter · {n} entries`, then Charged (receivable), Paid (credit) and Net, each a `Money`.
7. `PageHeader`: primary **Add transaction**; secondary **Export CSV**. CSV export content is unchanged.

**Behaviour.**
```gherkin
Scenario: No sideways scrolling
  Given the detailed view at 1024, 1280 and 1440 px
  Then the table fits its container, and "Recorded by" is visible or shown under the note

Scenario: Charged and Paid columns
  Then a charge of ₹249.50 shows "₹249.50" in Charged and a payment of ₹1,016.90 shows "₹1,016.90" in Paid

Scenario: The filter row is tidy
  Given a 1280 px window
  Then Range, type, search, customer and "Include voided" sit on one row and wrap in order below that

Scenario: Everything still works
  Then range, type, search, customer filters, voided toggle, detailed or summarized, paging, sorting, export and totals behave exactly as before
```
**Tests.** Keep every existing `TransactionsPage` test passing (adapt only selectors that necessarily changed because Type and Amount became Charged and Paid); add unit tests for `buildDetailColumns` (Delete only with `can("deleteTransaction")`; the right cell filled per type) and `TransactionTotals`; axe on the page. **Verify.** `npm run verify`; `wc -l` of the page under 450; manual at 390, 1024 and 1440 px in both themes. **Commit.** `feat(L-09): transactions page split into parts, one-row filters, Charged and Paid columns`

---

#### L-10 · Dialogs, forms and the mobile entry sheet  (size M)

**Why.** The two forms used every day deserve a clear hierarchy and a safety net against a wrong extra zero.

**Touches.** `src/components/ui/{dialog,sheet}.tsx`, `src/features/transactions/components/TransactionSheet.tsx`, `src/features/customers/components/CustomerFormDialog.tsx`, tests.

**Do.**
1. **Dialog and sheet shells**: dialog content `bg-popover border border-border border-t-2 border-t-foreground rounded-sm`; sheet `rounded-t-sm` with the same top rule; header and footer separated by `border-border`; backdrop unchanged. `ConfirmDialog` and every other dialog inherit.
2. **TransactionSheet**: (a) replace the Charge and Payment chips with a two-choice control **Charged | Paid** (`h-11`, equal width, `role="radiogroup"`; selected `bg-primary text-primary-foreground`, unselected `border border-input bg-card`); (b) make the amount input large: `font-display text-3xl font-bold tabular-nums` with the existing `₹` prefix and `inputmode="decimal"`; (c) under the amount show `New balance for {customer name}: ₹X` (charge adds, payment subtracts; from `useCustomerBalance`), only when a customer and a valid amount exist, `aria-live="polite"`; in edit mode compute `current - oldEffect + newEffect`; (d) show `Today`, `Yesterday` and `Pick date` chips above the date field, which still holds the value and validation; (e) footer buttons `Cancel` (ghost) and a submit labelled `Add charge`, `Add payment` or `Save changes`.
3. **CustomerFormDialog**: Name first and required; Phone second; the remaining fields inside the existing "Additional details" disclosure. Validation timing unchanged (`onTouched`).
4. Under 640 px the sheet is a bottom sheet (`rounded-t-sm`, safe-area padding already used by the app).

**Behaviour.**
```gherkin
Scenario: The amount is the hero
  Then the amount field is the largest text in the form

Scenario: A mistaken extra zero is caught
  Given a customer whose balance is ₹2,37,439.00
  When I type 150000 instead of 15000 as a charge
  Then "New balance for Rahim Uddin" shows ₹3,87,439.00 before I save

Scenario: Editing recomputes the preview
  Given I am editing a ₹500 payment and change it to ₹800
  Then the preview reflects the net change of ₹300

Scenario: Labels state the action
  Then the submit reads "Add charge", "Add payment" or "Save changes" as appropriate

Scenario: Validation behaves as in v2
  Then errors appear after the field is touched or on submit, with the existing messages
```
**Tests.** Update the `TransactionSheet` tests for the new control and the preview; keep every validation test unmodified; `CustomerFormDialog` field-order test; axe in add and edit modes. **Verify.** `npm run verify`; manual: add and edit on mobile and desktop in both themes. **Commit.** `feat(L-10): amount-first transaction form with live balance preview; ledger dialog shells`

---

#### L-11 · Members, Settings, Import, Login, Businesses, Recently deleted  (size M)

**Why.** The remaining screens share the language and fix the defects seen.

**Touches.** the page files (`grep -rln "LoginPage\|BusinessesPage\|MembersPage\|SettingsPage\|ImportPage\|DeletedItemsPage" src`), tests.

**Do.** Apply section 5.5 to each page; preserve all behaviour and copy except where listed.
1. **Login**: `bg-background` page with faint ruled lines (the repeating gradient of L-04 step 9); a centred `Card` (`max-w-sm p-8 text-center`): `TallyMark` (`size-9`), `BahiKhata` (`font-display text-3xl font-bold`), `Your business ledger`, the existing Google button (full width), and `We only read your name and email.`
2. **My businesses**: `PageHeader`; "My business" `Card` (name, `You own this business`, Owner chip, **Open** primary); "Shared with me" and "Invitations" each an `EmptyState` with a next step: `No businesses shared with you yet. Ask an owner to invite your Google email.` and `No pending invitations.`
3. **Members**: ruled `DataTable`; `Avatar` (now with the image fallback) for people; role as a `StatusBadge` (Owner `receivable`, Editor `neutral`, Viewer `muted`); no row menu on the Owner row; `Owners cannot leave. Delete the business instead.` as a muted paragraph under the table.
4. **Settings**: sections separated by `border-t border-border`, two columns at `lg` (`grid lg:grid-cols-[16rem_1fr] gap-8 py-6`): left a `font-heading` title and one-line description, right the form (`max-w-xl`). Sections: Business details, Backup. **Delete business**: a `Card` whose first child is a `totals-rule` divider, title `Delete business` in `text-credit`, the existing button opening the existing typed-confirmation dialog (unchanged behaviour). Placeholder values stay visibly placeholders.
5. **Import**: numbered steps 1 to 4 (current `bg-primary text-primary-foreground`, done `bg-success/10 dark:bg-success/8 text-success` with a check, upcoming `bg-muted text-muted-foreground`); the upload area `rounded-sm border border-dashed border-input bg-card` with an `Upload` icon; the review step: three `LeaderRow`s (valid transactions, customers, problems) above the summary table (`StatusBadge` for Existing and New), then the sentence `Nothing is saved until you click Import. It is all-or-nothing.`
6. **Recently deleted**: item labels `line-through text-muted-foreground`; Restore `variant="outline"`; otherwise as S-56.

**Behaviour.**
```gherkin
Scenario: Login is branded and calm
  Then the page shows the tally mark, the name, the tagline, one Google button and the privacy line

Scenario: Empty sections say what to do next
  Given I have no shared businesses and no invitations
  Then each section shows a sentence saying what to do next

Scenario: No broken avatars
  Given a member's photo URL fails to load
  Then initials on a tinted circle are shown

Scenario: Settings read as sections
  Given a 1280 px window
  Then each section has its title on the left and its form on the right

Scenario: Import explains what happens
  Then the review step shows the three leader rows and the sentence "Nothing is saved until you click Import. It is all-or-nothing."
```
**Tests.** Update only assertions whose text or structure this story changes; add: Members avatar fallback, Import review rows and sentence, Login privacy line; axe on every page. **Verify.** `npm run verify`; manual in both themes at 390 and 1440 px. **Commit.** `feat(L-11): login, businesses, members, settings, import and deleted items in the ledger language`

---

#### L-12 · Entry row: record in the column you mean  (size M, **gate G-A2**)

**Gate.** Before starting, re-read `docs/RESEARCH-DECISIONS.md`. If **G-A2** is not `approved` or `approved-with-changes`, mark this story `skipped (gate G-A2: <status>)` in `docs/PROGRESS.md`, make no change, and continue with the next story. If `approved-with-changes`, apply the "Changes" text.

**Why.** D-28. The signature interaction of the concept: choosing Charge or Payment by choosing where to type.

**Touches.** new `src/features/customers/components/LedgerEntryRow.tsx`, `LedgerTable.tsx` (the `topRow` prop from L-07), `CustomerDetailPage.tsx`, `src/features/transactions/schemas.ts` (export only), tests.

**Do.**
1. Read `schemas.ts`. If the amount validator of `transactionSchema` is not exported, export it as `amountField` without changing behaviour.
2. `LedgerEntryRow.tsx` renders a `<tr className="bg-primary/5 border-b border-input">` with the same six cells as the table: Date (`Today`, with a button to change the date), Particulars (an input, placeholder `What was it for?`, `margin-rule` cell), **Charged** (an input), **Paid** (an input), Balance (muted `after: ₹X`), and a **Save** button (`size="sm"`). Every input has a visually hidden `<label>` (`Particulars`, `Charged amount`, `Paid amount`). Amount inputs are `text-right tabular-nums font-semibold`, `inputmode="decimal"`, 3 px radius, `border-input`; the one being typed in gets `ring-2 ring-primary`.
3. Form state with `react-hook-form` and `zodResolver`: fields `note` (max 500), `charged`, `paid`, `occurred_on`. Schema built from `amountField`, plus:
```ts
.refine((v) => Boolean(v.charged) !== Boolean(v.paid), { message: "Enter either Charged or Paid", path: ["charged"] })
```
   Typing a value in one amount column **clears the other**. Submit calls `useCreateTransaction(businessId)` with `type: v.charged ? "charge" : "payment"` and the amount from whichever column is filled, converted exactly as `TransactionSheet`'s submit does, date as in `CustomerQuickAdd` (step 4 of L-07).
4. The `after: ₹X` preview uses `useCustomerBalance`; it is `aria-live="polite"`.
5. **Keyboard**: Tab order Particulars, Charged, Paid, Save; Enter in any field saves when valid; Escape clears the row.
6. **On success** the new row is inserted at the top of the ledger with the `entry-reveal` class (the CSS disables it for reduced motion), the row clears, and focus returns to the Charged input; `toastSuccess("Charge added")` or `"Payment added"`.
7. In `CustomerDetailPage`/`LedgerTable` mount `<LedgerEntryRow … />` as `topRow` at `md` and up when the user can manage transactions and the customer is not archived; **below 768 px mount `CustomerQuickAdd`** (L-07) instead. Never both.

**Behaviour.**
```gherkin
Feature: Record an entry in the column you mean

  Scenario: Charge
    Given I am an Editor on Rahim's ledger and his balance is ₹2,37,439.00
    When I type 15000 in the Charged column
    Then the row shows "after: ₹2,52,439.00" and Save is enabled

  Scenario: Payment
    When I type 8500 in the Paid column instead
    Then the Charged column is cleared and the preview shows the balance reduced by 8,500

  Scenario: Both columns filled
    When Charged and Paid both contain an amount and I have touched them
    Then Save is disabled and "Enter either Charged or Paid" is shown

  Scenario: Fast keyboard flow
    When I press Enter with a valid amount
    Then the entry is saved dated today, the row reveals into the ledger, the entry row clears and focus returns to the Charged column

  Scenario: Phone
    Given a screen under 640 px
    Then the quick-add card is shown instead of the entry row

  Scenario: No write access
    Given I am a Viewer, or the customer is archived
    Then there is no entry row
```
**Tests.** `LedgerEntryRow.test.tsx` for each scenario (mock the hooks as neighbouring tests do), including that typing in one column clears the other, label association, and axe; `CustomerDetailPage` test that exactly one of entry row and quick-add card renders per width. **Verify.** `npm run verify`; manual: record a charge and a payment by keyboard only. **Commit.** `feat(L-12): entry row on the customer ledger`

---

#### L-13 · Who to chase  (size M, **gate G-A1**)

**Gate.** Before starting, re-read `docs/RESEARCH-DECISIONS.md`. If **G-A1** is not `approved` or `approved-with-changes`, mark this story `skipped (gate G-A1: <status>)`, make no change, and continue. If `approved-with-changes`, apply the "Changes" text (for example a different threshold).

**Why.** D-29. Tells the owner, in one glance, whom to follow up. The database column (`last_payment_at`) already exists after S-50, whichever way the gate is decided.

**Touches.** `src/features/dashboard/api.ts`, `hooks.ts`, new `components/ChaseList.tsx`, `constants.ts`, `DashboardPage.tsx`, `src/lib/queryKeys.ts`, tests.

**Do.**
1. `constants.ts`: `export const CHASE_AFTER_DAYS = 30;` (the `AgeFlag` threshold is also 30; keep them equal; if a different value is approved, change both).
2. `api.ts`, in the file's `guard()` style:
```ts
export async function getLastPayments(ids: string[]): Promise<Record<string, string | null>> {
  if (ids.length === 0) return {};
  return guard(async () => {
    const { data, error } = await supabase.from("customer_balances").select("id, last_payment_at").in("id", ids);
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.id as string, (r.last_payment_at as string | null) ?? null]));
  });
}
```
3. `hooks.ts`: `useLastPayments(businessId, ids)` (`useQuery`; key from a new factory beside the existing dashboard keys in `queryKeys.ts`, including the ids; `enabled` when `ids.length > 0`).
4. `ChaseList.tsx`: a `Card` (`p-6`) with `<h2 className="font-heading text-xl font-bold">Who to chase</h2>`, the help line `Largest balances first. Flagged when nothing was paid for 30 days.`, and a `role="list"` of up to 5 debtors from the dashboard summary's `top_debtors`, each a `LeaderRow` (`leading` `Monogram tone="receivable"`, `label` a `Link` to the customer, `sub` per the rule below, `trailing` `<AgeFlag days={days} />`, `amount`, `tone="receivable"`). `days = Math.floor((Date.now() - Date.parse(last_payment_at)) / 86400000)`. Sub-line: `paid today` (0 days), `paid yesterday` (1), `last paid {n} days ago`, or `no payments yet` when `last_payment_at` is null (no flag for null).
5. In `DashboardPage.tsx` replace the L-06 slot: when G-A1 is approved, render `ChaseList` in place of `TopOutstanding`; keep the empty text `All settled — no outstanding balances.`

**Behaviour.**
```gherkin
Feature: Who to chase

  Scenario: Flag customers who have not paid for a month
    Given Mizanur owes ₹19,531.00 and last paid 41 days ago
    Then his row reads "last paid 41 days ago" with a "40+ days" flag

  Scenario: Recent payers are not flagged
    Given Fatema last paid yesterday
    Then her row reads "paid yesterday" with no flag

  Scenario: Never paid
    Given a customer with charges and no payments
    Then the row reads "no payments yet" with no flag

  Scenario: A voided payment does not count
    Given a customer's only recent payment was voided
    Then the days are counted from the last active payment

  Scenario: Largest first
    Then rows are ordered by balance, largest first, at most five
```
**Tests.** `ChaseList.test.tsx` (the five scenarios; day arithmetic with a fixed clock via `vi.useFakeTimers()`); api test for `getLastPayments`; dashboard test that the slot swaps by the gate; axe. **Verify.** `npm run verify`; manual with seeded data. **Commit.** `feat(L-13): Who to chase on the dashboard, flagged by days since last payment`

---

#### L-14 · Mobile and accessibility sweep  (size M)

**Why.** v2 set the standard (44 px targets, axe on every page). v3.1 changed most of the markup; this story proves the standard still holds and fixes what slipped.

**Touches.** whatever the sweep finds; `docs/PROGRESS.md`.

**Do.**
1. Run `npm run dev` and for **every** route (login, businesses, dashboard, customers, customer detail with each dialog and the quick add or entry row, transactions detailed and summarized, add and edit transaction, add customer, delete transaction, delete customer, Recently deleted, members, invite dialog, settings, import steps) check at **390 px and 1440 px in both themes**:
   - no horizontal scroll (except inside a table designed to scroll);
   - every tappable control is at least 44 by 44 px on touch widths (spine items, tabs, row menus, the Charged | Paid choices);
   - keyboard: tab order matches reading order, the focus ring is visible on every control (including inside the spine), dialogs trap and restore focus, Escape closes;
   - nothing clipped; amounts never truncated; leader rows still show a leader and the full amount at 360 px;
   - reduced motion: set the OS setting and confirm the `entry-reveal` animation does not run.
2. Ensure every new page, dialog and component from S-54 to L-13 has an axe test (`src/test/a11y.ts`). Add the missing ones.
3. Fix every defect found in this story and list each (what, where, how fixed) in `docs/PROGRESS.md`.

**Behaviour.**
```gherkin
Scenario: The whole app passes the automated accessibility checks
  When "npm test" runs
  Then every page and dialog axe test passes in loading, empty, error and data states where applicable

Scenario: Touch targets
  Given a 390 px viewport
  Then no interactive element is smaller than 44 by 44 px

Scenario: Contrast
  When "node scripts/contrast-audit.cjs" runs
  Then every required pair passes in both themes
```
**Tests.** The axe tests above. **Verify.** `npm run verify`; `npm run audit:contrast`; the manual checklist recorded. **Commit.** `fix(L-14): mobile and accessibility sweep after the Ledger Page redesign`

---

### Phase G — Release

#### S-67 · Documentation and backlog  (size S)

**Why.** The repository documents itself (v2 convention); v3.1 must too.

**Touches.** `docs/UI-CONTRACT.md`, `docs/RLS.md`, `docs/SECURITY.md`, `docs/BACKLOG.md`, `docs/MANUAL_STEPS.md`, `docs/RELEASE-NOTES-v3.md` (new), `README.md`, `docs/PROGRESS.md`.

**Do.**
1. `docs/UI-CONTRACT.md`: replace the glossary with the table in section 5.6; replace the token section (L-01) and the component list (add `LeaderRow`, `TotalsRule`, `Monogram`, `AgeFlag`, `TallyMark`, `TypeBadge`, `LedgerTable`); state the rules "all money through `formatMoney`/`Money`, enforced by `src/__tests__/noRawMoney.test.ts`" and "no shadows on panels, tables or cards"; change "Undo is offered for archive and void" to include delete; replace the "one UI font" rule with "two fonts: Public Sans for text and money, Bricolage Grotesque for headings and figures".
2. `docs/RLS.md`: add `deletion_log` (Owner reads; no client writes), the functions `delete_transaction`, `restore_deleted`, the changed `delete_customer_permanently` and `dashboard_summary(uuid, text)`, the actor-stamping triggers, `customer_balances.last_activity_at` and `last_payment_at`, and the EXECUTE revocation from `anon` and `PUBLIC`. Update the permission table with the three new actions.
3. `docs/SECURITY.md`: add "Audit fields are written by the database", "Deletion is recoverable and logged", "No function is executable by signed-out users", "Production dependencies are audited in CI".
4. `docs/BACKLOG.md`: mark B-01 and B-09 done; add the deferred items from section 2.2 and: automatic purge or export of the deletion log; bulk select and act; ownership transfer; edit-history table (B-08); a Playwright smoke suite; Bangla and Hindi translation (the font stack needs `Noto Sans Bengali` and numerals decisions); printable statement in the ledger style; WhatsApp reminder from Who to chase (only if research asks for it).
5. `docs/MANUAL_STEPS.md`: confirm the S-50 section is complete (three migrations) and add the verification queries again at the end as a post-deploy checklist, including `select count(*) from information_schema.columns where table_schema='public' and table_name='customer_balances' and column_name='last_payment_at';` returning 1.
6. `docs/RELEASE-NOTES-v3.md`: a human summary (what is new: Delete and Recently deleted; the Ledger Page look; the customer ledger with quick add (and the entry row or Who to chase if their gates were approved); faster load; fixes), the database rollout order, which gates were approved, and the known limitations from section 10.
7. `README.md`: scripts list (`verify`, `test:sql`, `audit:*`), Node version, migration instructions (three files), and a pointer to `docs/RESEARCH-DECISIONS.md`.
8. `docs/PROGRESS.md`: every story `done` or `skipped (gate)` with its commit.

**Behaviour.**
```gherkin
Scenario: The docs describe what shipped
  Then no document presents "Delete permanently" as UI copy, the old 17-file migration chain as current, or the v2 token values as current
```
**Tests.** None. **Verify.** `grep -rn "Delete permanently" docs src | grep -v PRD-v2 | grep -v PRD-v3`: no UI-copy hits (history in PROGRESS is fine). **Commit.** `docs(S-67): v3.1 documentation, backlog and release notes`

---

#### S-68 · Final verification and release  (size S)

**Why.** Prove v3.1 works together before a human deploys it.

**Touches.** `docs/PROGRESS.md` only (plus the pull request).

**Do.**
1. On a clean clone of `feat/v3` run: `npm ci && npm run verify && npm run audit:contrast && npm run audit:tokens && npm run audit:bundle && npm audit --omit=dev`, and `npm run test:sql` against a scratch Postgres. Everything must pass; record outputs and the final numbers (tests, duration, largest chunk, vulnerabilities) next to the baseline in `docs/PROGRESS.md`.
2. Walk the smoke checklist in section 9.4 on a preview deployment with the v3.1 database applied; record the result.
3. Open the pull request `feat/v3` into `master` with the release notes as its description. **Do not merge and do not deploy**: a human performs the database rollout in `docs/MANUAL_STEPS.md` first.

**Behaviour.**
```gherkin
Scenario: Release candidate
  Given feat/v3 on a clean clone
  Then every verification command passes
  And the smoke checklist passes on a preview deployment
```
**Verify.** The commands in step 1 and the checklist in step 2. **Commit.** `chore(S-68): v3.1 release candidate verified`

---

## 9. Cross-cutting requirements

### 9.1 Accessibility (extends v2)
Colour is never the only signal (every status has a label, icon or rule as well); every interactive element has a visible focus ring that meets 3:1 (`--ring`); touch targets are at least 44 px; dialogs trap focus and return it; `aria-live="polite"` on the balance previews; dotted leaders are decorative and hidden from assistive technology while label and amount stay in reading order; the ledger is a real table with a caption and header cells; every new page or dialog has an axe test; `prefers-reduced-motion` is respected; contrast is enforced in CI by `scripts/contrast-audit.cjs` and `scripts/check-token-sync.cjs`.

### 9.2 Performance budgets
No JS chunk over 500 kB (`audit:bundle`); `/login` first load about 300 kB gzipped or less; the customers list request carries no transaction rows (S-53); the heading font adds only the Latin file (plus Latin-extended for the rupee sign) on pages that use it; unit tests no slower than the S-49 result.

### 9.3 Security
Defence in depth is unchanged: the database enforces everything (RLS, role checks inside `SECURITY DEFINER` functions, actor stamping, immutable `business_id`); the UI only shapes what is shown. No new client secrets. The deletion log is Owner-readable and written only by functions. All new functions have `EXECUTE` revoked from `PUBLIC` and `anon`.

### 9.4 Smoke checklist (run after every phase and at S-68)

Run as each of Owner, Editor and Viewer where it applies.
1. Sign in; the business list opens; open the business.
2. **Dashboard:** "Where you stand" shows Owed to you, You owe and Net position without clipping; "Open today" opens Transactions for today; the second sheet is Top outstanding balances or, if G-A1 was approved, Who to chase with age flags; Day book and This week render.
3. **Customers:** search, each filter, add, edit, archive, restore; rows show monograms and "owes you" or "you owe".
4. **Customer detail:** the ledger shows Date, Particulars, Charged, Paid, Balance and a Totals row; record a charge and a payment (by the quick-add card, or by the entry row if G-A2 was approved) and confirm the balance and the preview agree; edit one, void one, restore it; "Show earlier entries" works on a long ledger.
5. **Owner:** delete a transaction and press Undo; delete it again; delete a customer with transactions (typed name) and press Undo; balances equal the originals.
6. **Owner:** Recently deleted: restore a customer; a transaction whose customer is deleted shows "Restore the customer first."
7. **Editor and Viewer:** no Delete anywhere; no Recently deleted in the spine and no access by URL.
8. **Transactions:** filters, detailed and summarized, no sideways scroll at 1024 px, Charged and Paid columns, totals, export.
9. Members: invite, change role, remove. Settings: save details; backup downloads. Import: upload, review, import.
10. Light and dark themes; 390 px and 1440 px; keyboard only through one full flow (record an entry, void it, restore it).

### 9.5 Rollback
The database changes are additive except for replacements of `delete_customer_permanently` (return type), `dashboard_summary` (signature) and `customer_balances` (view and relationship function, twice); they also add one table, two functions and two triggers. To roll back the **client** only, redeploy the previous Vercel build: it keeps working against the v3.1 database. To roll back the **database**, restore the backup taken in S-50 step 6(a); do not reverse individual statements.

### 9.6 Research alignment
Nothing in this PRD depends on research results except the three gates. A human records decisions in `docs/RESEARCH-DECISIONS.md` using the rules in `docs/RESEARCH-PLAN.md`. The agent must never change that file, and must never infer a decision from silence.

---

## 10. Open questions and defaults

The implementing agent uses the **default** unless a human answers otherwise. None blocks a story.

| # | Question | Default used in this PRD |
|---|---|---|
| Q-1 | Adopt the Ledger Page look before research reports? | Yes (G-A3 `approved` by the owner on 19 Oct 2026); research can reverse it |
| Q-2 | Entry row (type into Charged or Paid) or quick-add card on the customer page? | Quick-add card until G-A2 is approved |
| Q-3 | "Who to chase" or top balances on the dashboard? | Top outstanding balances until G-A1 is approved |
| Q-4 | Should chart colours follow the badge colours (charged green, paid red-orange)? | Yes (consistency with v2 D-10) |
| Q-5 | May Editors delete transactions they created? | No: Owner only (D-12) |
| Q-6 | Should the deletion log ever expire? | No; kept until the business is deleted (D-18); a purge tool is in the backlog |
| Q-7 | Revisit the colour meaning (green receivable, red-orange credit)? | No (D-19); a product decision for a later version |
| Q-8 | Ledger column header: "Particulars" or "Note"? | **Particulars** in ledger tables; the form field stays **Note** (D-27); research may change it |
| Q-9 | The age flag threshold | 30 days (D-29); a setting only if research asks |
| Q-10 | Ledger ordering | Newest first with the entry control at the top (as v2 S-31); paper-style bottom entry is not built |
| Q-11 | Bangla and Hindi | Out of scope; the font stack and numeral choices are backlog |
| Q-12 | A numeric keypad sheet on phones | Not in v3.1 |

---

## 11. Verification evidence (what was actually run before this PRD was written)

| Claim | How it was verified |
|---|---|
| Baseline: typecheck passes; lint 0 errors and 7 warnings; 54 test files and 469 tests pass in about 169 s; the build makes one 1,397 kB chunk | `npm ci`, `typecheck`, `lint`, `npm test`, `build` on commit `506cc0d` |
| Production audit: 12 findings (1 critical, 9 high, 2 moderate), reduced to 0 | `npm audit --omit=dev` before; moved the five packages and ran `npm audit fix` on a copy; after |
| Code splitting numbers | Built a copy with the change in S-48: largest chunk 353 kB, total 1,371 kB, 37 chunks; the bundle guard passes on it |
| Migrations | All three applied to an empty Postgres 16 with a Supabase stub and to a copy of the old schema: identical schemas; re-applying is a no-op |
| SQL behaviour | 19-section suite passes on both; the ten v2 test files also pass unmodified; deliberate schema breakages (18 across the review) were each caught by the intended section |
| Fresh-database failure of the old chain | Applied the old files in name order: fails at `0001` |
| Ledger tokens | `apply-tokens.cjs` on a pristine clone of the repository: 60 values changed, 13 added; second run 0; `check-token-sync` OK for 58 audited tokens; the contrast audit passes (82 checks, both themes); the build succeeds and every ledger utility compiles |
| Fonts | The font files were inspected with fontTools: Public Sans and Bricolage Grotesque both contain the rupee sign and tabular figures; Instrument Sans contains **no rupee sign** in any subset (so it was rejected) |
| Existing tests with the ledger tokens, the new font and the updated theme test applied | Full unit suite in a clean clone: 54 files, 469 passed, 1 skipped |
| The bundle passes the repository's own hygiene test | A first dry run failed `clientHygiene.test.tsx` because SQL files named the privileged server-side role; removed; all database checks re-run |
| `last_payment_at` | Section 19 of the SQL suite; three mutations (counting voided payments, ignoring type, exposing the function to `anon`) each failed the suite |
| Design boards | Rendered in a headless browser at 1360 px (dashboard, ledger, design language) and 900 px (mobile): this found and fixed unreadable sidebar links, a crushed language-board column, a missing Save button in the entry row and tiny chart labels |
| Money guard test | Run against the baseline: fails on exactly the four files listed in L-03 |
| Not verified | The unit-test speed levers in S-49 (a `pool: "threads"` trial produced no output and had to be abandoned); how the real React components look (the boards are static HTML, not the app); screen-reader behaviour of the dotted leaders and the ledger; Bangla and Hindi rendering; Supabase's real auth service and PostgREST (the SQL is verified on stock Postgres with a stub); any claim about what shop owners want or how fast they record (no user research has been done) |
