# Agent prompt: implement BahiKhata v3.1

Copy everything below the line into the implementing agent as its task.

---

You are implementing **BahiKhata v3.1** in the repository `IamHaque/bahi-khata`. A complete, verified specification exists. Your job is to **execute it exactly**, not to redesign it. Do not make product decisions. Do not add features. Do not "improve" anything the specification does not mention.

## 1. What you have

- The repository at commit `506cc0d` or later on `master`.
- `docs/PRD-v3.1.md`: the specification. 30 stories in this order: **S-44 to S-56** (foundations, database, delete and recovery), **L-00 to L-14** (the "Ledger Page" interface), **S-67 and S-68** (release). Each story gives the files, exact steps, Given/When/Then scenarios, tests, verification commands and the commit message. It supersedes any earlier PRD v3.
- A **handoff bundle** (a zip next to this prompt) with tested SQL, a SQL test suite, design tokens, scripts, a CI workflow, the research documents and four standalone design boards. Section 0.2 of the PRD maps every file to a story. Everything in it was executed and verified. **Copy these files; never rewrite them.**
- `docs/PRD-v2.md` and `docs/UI-CONTRACT.md`, which stay in force except where PRD section 2.3 overrides them.
- `docs/RESEARCH-DECISIONS.md` (from the bundle): a file a **human** edits to approve or defer three product bets. You read it; you **never edit it**.

## 2. Setup (do exactly this, once)

```bash
git checkout master && git pull
unzip -o <path-to-bundle>.zip -d /tmp/v3-bundle
mkdir -p docs
cp /tmp/v3-bundle/docs/PRD-v3.1.md /tmp/v3-bundle/docs/AGENT-PROMPT-v3.1.md docs/
git checkout -b feat/v3
```

Keep the unzipped bundle at `/tmp/v3-bundle`. When a story says **copy from the Bundle**, copy from there into the path the story names, byte for byte. Then read `docs/PRD-v3.1.md` completely once, plus `docs/PRD-v2.md` sections 4.5, 5 and 7 and `docs/UI-CONTRACT.md`, before writing any code. Open the four boards in `/tmp/v3-bundle/design/ledger-boards/` in a browser; they are the visual reference for the L stories.

## 3. The loop (repeat for each story, in the order of PRD section 7)

1. Open `docs/PROGRESS.md`. Find the first story whose status is not `done` and not `skipped`. That is your story. (After S-44 creates the table, this file is your memory. Never redo a finished story.)
2. Read that story card in the PRD again, fully. **Gated stories (L-00, L-12, L-13) start with their gate step: do it first.**
3. Write the tests the story lists, then implement exactly the steps under **Do**.
4. Run the story's **Verify** commands. Always also run `npm run verify` (lint, typecheck, unit tests, build). For database stories also run `bash scripts/run-sql-tests.sh`.
5. For UI stories run `npm run dev` and check every **Behaviour** scenario by hand, in light and dark mode, at 390 px and 1440 px wide. Record what you checked in `docs/PROGRESS.md`.
6. Update `docs/PROGRESS.md`: status `done` (or `skipped (gate G-xx: <status>)`), the commit hash, any deviation.
7. Commit with the story's commit message. One commit per story. Then go to step 1.

If a Verify command fails: read the error, fix the cause, run it again. After **two** honest failed attempts, follow section 6.

## 4. Rules that are never broken

1. **The only allowed `package.json` changes** are S-44 (scripts, engines), S-45 (moving five packages to `devDependencies`, `npm audit fix`) and L-02 (adding `@fontsource-variable/bricolage-grotesque`). Add nothing else.
2. **Never edit an applied migration**, and never edit the three migrations or the SQL test file from the bundle. They are final.
3. **Never push to `master`, never force-push, never rewrite history, never merge, never deploy.** Work only on `feat/v3`. A human merges and deploys.
4. **You have no access to the production database or to Vercel.** Anything a human must run goes in `docs/MANUAL_STEPS.md`, in order, with the exact file and a verification query.
5. **Use only existing building blocks plus the ones the PRD adds**: components in `src/components/ui` and `src/components/app`, the per-feature `api.ts` and hooks, `paths`, `queryKeys`, `formatMoney` and `Money`, `formatDate` and `formatRelative`, `Can`, `usePermissions().assertCan`. No hard-coded colours, no new CSS files, no inline `style`.
6. **Surfaces, borders and structure use only the classes in PRD section 5.2.** Panels: `bg-card border border-border`, no shadow, no ring, small radius. Form controls: `border-input`. Never use `border-input` on a panel.
7. **Every write control is wrapped in `Can`, and every new mutation calls `assertCan` first.**
8. **Existing tests must keep passing unmodified**, except tests whose expected text or structure the PRD explicitly changes (each story names them). Never delete or skip a test to make a command pass. Never weaken an assertion.
9. **Where the PRD says `grep`, run the exact command and handle every match it finds**, even if the count differs from the story. Note any difference in `docs/PROGRESS.md`.
10. **Never type the privileged Supabase server-side role's name** (the two words joined by an underscore) in any file. The test `src/lib/__tests__/clientHygiene.test.tsx` scans the whole repository for it. Write "the server-side role" in prose. Do not edit or weaken that test.
11. **Never edit `docs/RESEARCH-DECISIONS.md`.** Never infer a decision from silence: `pending` means build the baseline.
12. **Do not do extra work.** If you notice something else worth fixing, add one line to `docs/BACKLOG.md` and move on.

## 5. When the PRD and the code disagree

The PRD was written from a verified review, but the code can have moved, and some story steps say "read the file first". If a file, function or line number in a story does not match reality:

- Make the **smallest adaptation** that achieves the story's stated behaviour.
- Record it in `docs/PROGRESS.md` under "Deviations" (story, what the PRD said, what you did, why).
- Continue. Do not stop for this.

If the PRD does not specify something, use the **default in PRD section 10** (Open questions). If it is not there either, choose the option closest to existing behaviour and PRD v2, and record it.

When a design board and the PRD differ, **the PRD wins**.

## 6. STOP conditions (the only times you stop and ask)

Stop, write the problem in `docs/PROGRESS.md` under "Blocked", and tell the human, if:

- a command that passed at baseline fails and you cannot find the cause after two attempts;
- a story seems to need a new runtime dependency or an edit to an applied migration;
- you find a security problem the PRD does not cover;
- the bundle's files are missing or differ from the paths in PRD section 0.2;
- **L-00 finds gate G-A3 `pending` or `rejected`** (do not build any L story);
- you have no way to run Postgres. In that case **continue with every story that does not need it**, mark S-50 as `blocked: no Postgres`, and ask the human to run `npm run test:sql` and report.

When blocked on one story, continue with later stories that do not depend on it. Do not guess your way past a blocker.

## 7. If you run out of context

Your memory is `docs/PROGRESS.md` and git history. Before you stop for any reason, make sure the current story is either committed and marked `done`, or left as uncommitted work with a note under "In progress" saying exactly what is finished and what is next. A fresh agent resumes by reading `docs/PROGRESS.md`, the PRD, `docs/RESEARCH-DECISIONS.md` and `git log --oneline`, then continuing at the first story that is not finished.

## 8. Reporting

After **each phase** (A to G in the PRD), post a short report: stories finished or skipped, commit hashes, the numbers from `npm run verify` (tests passed and duration), anything blocked, anything deviated. At the very end (after S-68), post the final report: baseline numbers versus final numbers (tests, duration, largest JS chunk, production vulnerabilities, contrast checks), the gate statuses you saw, the deviations, the manual steps the human must perform, and the pull-request link. Be factual. Do not claim something was verified unless you ran the command and saw it pass.

## 9. Command cheat sheet

```bash
npm ci                                  # install exactly what the lockfile says
npm run verify                          # lint + typecheck + unit tests + build (added in S-44)
npm run audit:contrast                  # WCAG AA audit of the ledger tokens (82 checks)
npm run audit:tokens                    # src/index.css matches the audited values
npm run audit:bundle                    # no JS chunk over 500 kB (after a build)
npm audit --omit=dev                    # production dependency audit
node scripts/apply-tokens.cjs           # applies design/design-tokens.ledger.css (L-01); idempotent
npm run test:sql                        # needs DATABASE_URL to a SCRATCH Postgres
docker run -d --name bk-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres bash scripts/run-sql-tests.sh
```

Never run `scripts/run-sql-tests.sh` against a real Supabase project: it installs a stub `auth` schema and roles.

## 10. Begin

Do the setup in section 2, then start the loop at **S-44**.
