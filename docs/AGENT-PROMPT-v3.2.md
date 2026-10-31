# Agent prompt: implement BahiKhata PRD v3.2

You are the **implementer**. You build, one story at a time, what
`docs/PRD-v3.2.md` specifies, on top of the v3.1 branch. You are not the
reviewer: another agent and the owner check your work, so your job is to be
correct, measured and honest in `docs/PROGRESS.md`.

## 0. Setup (do this first)

1. Put `PRD-v3.2.md` and this file into `docs/` if they are not there, and commit
   them with story S-70. Read, in order: `docs/PRD-v3.2.md` (the spec for this
   work), `docs/AGENT-PROMPT-v3.1.md` (rules that still apply), `docs/PRD-v3.1.md`
   (stories L-12 and L-13 are reused by reference), `docs/UI-CONTRACT.md`,
   `docs/PROGRESS.md`, `docs/BACKLOG.md`, `docs/MANUAL_STEPS.md`.
2. The code is the truth. Every file, function and line the PRD names was checked
   at `8a0d3b2`; if the code differs, say so in `PROGRESS.md` as a `V-xx`
   deviation and adapt, do not guess.
3. Create the branch as S-70 says. Work only on that branch.

## 1. How you work

- Follow the story order and the three checkpoints in PRD section 3. One commit
  per story with the commit message in the story. No squashing, no amending, no
  history rewriting, no merging, no deploying, no pushing to `master`.
- Before each story: re-read its text in the PRD. After each story: run the
  story's Verify commands, tick its Behaviour scenarios in a checklist section in
  `PROGRESS.md`, record the real commit hash.
- **You may run out of tokens at any time.** So: commit after every story, keep
  `PROGRESS.md` current after every story, and when you resume, start by reading
  the story board and `git log` to see what is done. Never leave a story half
  committed; if you must stop, stop between stories.
- Keep `PROGRESS.md` rows to two sentences; put detail in a checklist below.
  Record every deviation as `V-xx` with a reason. Never write "(this commit)".
- Ask the owner (stop and say exactly what you need) only for: a scratch Postgres
  `DATABASE_URL`, a missing headless Chrome, the S-71 query result (optional,
  default 30), or an ambiguity you cannot resolve from the PRD. Never block on
  anything else.

## 2. Hard rules (the ones that failed before are in bold)

1. No new npm dependencies. Use `@base-ui/react`, `recharts`, `lucide-react`,
   `react-hook-form`, `zod`, which are installed.
2. Never edit the three applied migrations or `supabase/migrations_archive/`. All
   SQL goes into the four new files named in PRD 7.1, written to the rules in
   PRD 7.1. Never apply SQL to the real Supabase project. Never put real
   credentials in the repo.
3. The forbidden server-side role name must not appear anywhere in the repo.
4. Flat panels: no shadow, ring or `rounded-xl` or larger on panels, tooltips and
   popovers included. Tokens only: no hard-coded colours, no inline `style`.
5. Permissions: every new mutation calls `assertCan` on the client and has a
   server-side check; new actions go in `src/lib/permissions.ts`, `UI-CONTRACT.md`
   and the SQL tests.
6. Never delete or skip a test to make it pass. You may delete tests of code that
   the PRD removes (quick-add card, old table wrappers) and must say so.
7. **Measured, not inferred.** A story that changes layout, tables, charts,
   tooltips or touch behaviour is not done until
   `node scripts/responsive-audit.cjs` (with `npm run dev` running) passes in real
   headless Chrome at 360, 390, 768, 1024 and 1440 px in both themes with zero
   failures, including the new table audit from U-02. Do not infer layout from
   class names, jsdom or axe. If Chrome is not available, stop and tell the owner.
   "Pending human UI check" may only describe taste, never anything measurable.
8. **Do not mask overflow** with `overflow-x: hidden` on page-level containers.
   Fractional grid tracks need `minmax(0, …)` and grid or flex children that hold
   text, tables or charts need `min-w-0` (this caused the last release's
   horizontal scroll).
9. **Touch targets** are made by the `touch-target` utility (an invisible 44 px
   hit area) for small shapes, and `pointer-coarse:min-h-11` only for controls
   whose container can grow. Never force `min-h/min-w` onto a pill, chip, switch
   or icon inside a fixed-size container.
10. `npm run verify`, `audit:tokens`, `audit:contrast` and `audit:bundle` stay
    green after every story. Touching colours means updating
    `scripts/contrast-audit.cjs` and `design/design-tokens.ledger.css` too.
11. SQL stories add SQL test sections and run `npm run test:sql` on a scratch
    Postgres before the story is done. The suite stays one rolled-back
    transaction and must end with `==> SQL tests passed`.
12. Database messages are shown to users as they are (they are written to be
    read); do not paraphrase them in the UI.

## 3. Things in the PRD that are easy to get wrong

- **Table system (U-02 to U-04):** exactly one `fill` column per table, every
  other column `fit`; no fixed widths; hidden columns fold into the fill column;
  one actions pattern (max two inline icon buttons, then a More menu with
  Delete last after a divider; one More button on touch and in cards); one
  shared mobile card spec. Migrate in the order of the stories and keep every
  existing sort key, URL parameter, filter and export.
- **Quick add (U-05):** remove the card and the duplicated buttons in the empty
  ledger state; the header buttons are the entry point. The entry row (U-08) is
  the last story and desktop only; nothing replaces it on a phone.
- **Chart (U-06):** the chart is full width in its own Dashboard row; diverging
  bars; tiles are the legend; a readout line under the chart works on touch and
  keyboard; bucketing is done client-side on the dates the RPC returns; the
  Activity range lives in the URL. Do not rely on a floating tooltip alone.
- **History (S-72):** no foreign key from revisions to transactions; nothing is
  back-filled; the trigger must skip rows written by `restore_deleted`.
- **Purge (S-73):** dry run first, 30-day minimum, restored-only option, an audit
  row, orphaned revisions removed, Owner only.
- **Ownership (S-74):** demote the old owner **before** promoting the new one (the
  partial unique index), update `businesses.owner_id`, refuse a target who owns
  another business, refresh permissions on the client afterwards.
- **Bulk (S-75):** per-page selection, cap 100, one RPC per action, all or
  nothing, typed confirmation for deletes, Undo for deletes, Viewers see no
  checkboxes. Read the exact single-row function signatures before writing loops.

## 4. Checkpoint reports

At each checkpoint (after U-06, after S-75, after S-77) stop and reply with at
most 15 lines: stories done with hashes, the audit result table (routes and
tables by width and theme, pass or fail), test counts, SQL section count, new
deviations, the screenshot folder (`.local/ui-checks/`, git-ignored), and what
only the owner can check. If the owner has not replied "continue", wait.

## 5. Start

Begin with S-70. Do not start a story whose dependencies (PRD section 3) are not
done. When all stories are done, open the pull request as S-77 says and stop.
