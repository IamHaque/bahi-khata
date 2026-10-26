# Research decisions (gates for the Ledger Page build)

This file is the **single source of truth** for three product bets in `PRD-v3.1.md`. The implementing agent reads it in story **L-00** and again before **L-12** and **L-13**. A human edits it; the agent never changes a status.

## Allowed statuses

| Status                  | Meaning for the agent                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `approved`              | Build the full version of the bet                                                                     |
| `approved-with-changes` | Build it, and follow the "Changes" text in the notes column exactly                                   |
| `pending`               | Build the **baseline** variant named in the row and skip the gated story                              |
| `rejected`              | Build the **baseline** variant, skip the gated story, and never build it later without a new decision |

## The gates

| Gate     | Bet                                                                                                                                                               | Evidence that would approve it (from `RESEARCH-PLAN.md`)                                                                                | Baseline when not approved                                                                                   | Status     | Decided by and date | Notes and changes                                                                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **G-A3** | **Adopt the Ledger Page look** (palette, type, square rules, spine navigation, tally mark, Slate dark theme). Needed by L-01 to L-11, L-14                        | Impression test: Ledger rated at least as trustworthy as today's design, and "old-fashioned" or "childish" chosen by fewer than a third | None. If this is not `approved` or `approved-with-changes`, **STOP** at L-00 and report                      | `approved` | Owner, 19 Oct 2026  | Approved by instruction ("I like the plan, move ahead") **before any user research**. Research can reverse it: if the readout rejects it, set `rejected` and stop the L-series |
| **G-A2** | **Entry row**: record a charge or payment by typing into the Charged or Paid column on the customer page (story **L-12**)                                         | Round 2a: T1 and T2 completed with no wrong-type error for at least 5 of 6, and median time no worse than today's flow                  | `CustomerQuickAdd` card (built in L-07): segmented Charged/Payment, amount, note, Save, live balance preview | `pending`  |                     |                                                                                                                                                                                |
| **G-A1** | **Who to chase**: dashboard list of customers flagged by days since their last payment (story **L-13**, needs migration `20261108000000_v31_last_payment_at.sql`) | Round 1: at least 4 of 6 describe chasing by age of debt, and Round 2a T4 names customers by that reasoning                             | "Top outstanding balances" (existing component, restyled as leader rows) in the same slot                    | `pending`  |                     |                                                                                                                                                                                |

## How to record a result

1. Edit the row: set the status, write who decided and the date, and in Notes cite the research evidence (counts, for example "5 of 6 completed T1 and T2 without error").
2. Commit that change on its own: `docs: record research decision G-A2`.
3. Tell the agent to continue; it re-reads this file before L-12 and L-13.

## If you decide without research

That is allowed. Use `approved` and write in Notes: "decided without research". The record matters more than the choice; it lets the team see later which bets were evidence-based.
