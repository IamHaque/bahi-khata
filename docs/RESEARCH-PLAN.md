# Research plan: validating the Ledger Page

Companion to `PRD-v3.1.md` and `UI-RETHINK-LedgerPage.md`. Run in parallel with the build; results update `RESEARCH-DECISIONS.md`. Everything here is a plan: **no research has been done yet**, and no number below is a finding.

## 1. Purpose and decisions it informs

| Gate | Question                                                                                                   | Assumption | Decision it unlocks                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------- |
| G-A3 | Does the ledger look build trust, or read as dated, childish or cramped?                                   | A3         | Keep the identity (palette, tally mark, spine) or keep only its structure (rules, columns, totals) |
| G-A2 | Is recording faster and less error-prone by typing into the Charged or Paid column than with today's flow? | A2         | Build `EntryRow` (L-12) or keep the quick-add card                                                 |
| G-A1 | Do owners need to know who has not paid for a long time, and do they act on it?                            | A1         | Build "Who to chase" (L-13) or keep the top-balances list                                          |
| none | How, where and on what device is credit recorded and chased today?                                         | A5         | Shapes mobile priorities and the backlog                                                           |
| none | Can people read leader rows, double-rule totals and Indian-grouped figures on a phone in daylight?         | A4         | Simplify leaders on small screens if not                                                           |
| none | Language and numeral expectations (English, Bangla, Hindi; Latin or native digits)                         | scope      | Order of the next localisation work                                                                |

## 2. Overview

| Round    | Method                                                                                                            | n                | Duration    | Output                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ---------------- | ----------- | --------------------------------------------- |
| 1        | Contextual interviews at the participant's shop, including watching a real recording                              | 6 to 8           | 45 min each | Themes; evidence for G-A1; baseline behaviour |
| 2a       | Moderated usability test, within-subject: today's dialog flow versus the ledger entry row (order counterbalanced) | 6                | 45 min each | Time, errors, SEQ and SUS; evidence for G-A2  |
| 2b       | Five-second impression test and first-click test of three dashboards (today, v3 soft cards, Ledger)               | 15 to 20, remote | 5 min each  | Evidence for G-A3                             |
| Optional | Short survey to existing users                                                                                    | 50 or more       | 6 min       | Sizing of A1 and A5 only                      |

Qualitative samples of 5 to 8 find the common problems; they cannot give percentages. Report counts ("5 of 6") with n, never "users want".

## 3. Timeline

| Week | Work                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0    | Recruit and screen; build the clickable prototype (section 8); interpreter; consent forms; pilot one session with a colleague |
| 1    | Round 1 interviews; write a 5-line debrief after each                                                                         |
| 2    | Round 2a sessions; round 2b runs in parallel                                                                                  |
| 3    | Synthesis, readout against section 9, update `RESEARCH-DECISIONS.md`                                                          |

## 4. Participants

**Target.** Owners or staff who record credit sales in a small shop or service business; 5 or more regular credit customers; use a smartphone daily.

**Mix for rounds 1 and 2a.** Paper-notebook users, spreadsheet users, users of another credit-ledger app, current BahiKhata users; at least two staff who record on the owner's behalf; a spread of age and of English reading comfort.

**Exclude.** Anyone who works at a software company or a competitor.

**Recruiting caution.** The business in the product screenshots is a test business, so the current user base may be only the team. Do not treat the team as the user. Recruit shop owners at a market or through introductions, and plan for an interpreter and sessions in Bangla or Hindi.

**Screener (read aloud; record answers):**

1. Do you sell to regular customers on credit (udhar)? _(Must be yes.)_
2. Roughly how many customers owe you money right now? _(Must be 5 or more.)_
3. How do you keep that record today: notebook, spreadsheet, an app, memory, other?
4. Do you do the recording yourself, or does someone else?
5. Which language do you read most easily?
6. Do you work in software, or for a company that makes record-keeping apps? _(Must be no.)_

**Incentive and logistics.** A modest, locally appropriate thank-you; sessions at the shop in a quiet hour; a second person taking notes; permission to record audio.

## 5. Consent (read aloud before every session)

"I am helping improve a record-keeping app. I will ask how you keep track of what customers owe, and I may ask you to try a few screens. You are not being tested; if something is confusing, that is the app's problem, not yours. I will use made-up names and amounts, not your real customers. With your permission I will record audio so I can remember what you said; the recording is for our team only and I will delete it after we finish. You can stop at any time or skip any question. Do you agree to take part? Do you agree to be recorded?" Record both answers on the note sheet.

## 6. Round 1: interview guide (45 minutes)

Rules: ask about specific past events, not opinions; do not mention the concepts until the very end; do not explain the product; wait through silences; never correct what a participant does.

1. **Warm-up (5 min).** Tell me about your shop. How long have you run it? Who helps you?
2. **A recent instance (10 min).** Think of the last time someone took goods on credit. Walk me through what happened, from the moment they asked. Where was the notebook or phone? What did you write, and when? _(Probes: What if you were interrupted? Who else could see the record?)_
3. **Recording (8 min).** Show me how you record one now. _(Observe. Note device, taps, hesitations, corrections.)_ Which part is slowest? Have you ever recorded the wrong amount or the wrong person? What did you do?
4. **Following up (10 min).** How do you decide whom to remind? How do you remind them: in person, a call, a message? How long before you treat a balance as a problem? Tell me about the last difficult one. _(G-A1: listen for age of debt versus size of debt versus relationship.)_
5. **Disputes and trust (5 min).** Has a customer ever disagreed with a balance? How did you settle it? What would make a record believable to them?
6. **Tools (4 min).** What have you tried besides the notebook? What did you stop using, and why? Which device do you use at the counter?
7. **Close (3 min).** If you could change one thing about how you keep credit, what would it be? Is there anything I should have asked and did not?

## 7. Round 2a: usability test

**Set-up.** Same clickable prototype of both flows (section 8). Counterbalance order across participants. Think aloud. After each task ask the Single Ease Question: "Overall, how easy was that? 1 (very difficult) to 7 (very easy)". At the end of each flow, the System Usability Scale. One facilitator, one note-taker.

**Tasks (mock data):**

| Task       | Scenario wording                                                            | Success                           | Measures                                  |
| ---------- | --------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------- |
| T1         | "Rahim Uddin took fabric worth 15,000 rupees on credit today. Record it."   | Correct customer, amount and type | Time, taps, errors, SEQ                   |
| T2         | "Later, Rahim paid 8,500 rupees through bKash. Record it."                  | Recorded as a payment             | Time, any wrong-type attempt, SEQ         |
| T3         | "You see an entry of 36,608 that was entered twice by mistake. Cancel one." | Voided, not edited                | Time, found without help?, SEQ            |
| T4         | "It is Monday morning. Which two customers would you call first, and why?"  | Names two and gives a reason      | Time, the reasoning aloud (G-A1)          |
| T5         | "How much are you owed in total?"                                           | States the correct figure         | Time, confusion between Owed, Owe and Net |
| T6 (Owner) | "Remove the test customer, then bring them back."                           | Deleted and restored              | Time, errors, confidence                  |

**Observer note template (one row per observation):** time stamp, task, what happened, quote if any, severity (0 none, 1 cosmetic, 2 minor, 3 major, 4 blocker).

## 8. Prototype requirement

The concept canvas is static. For round 2a build a clickable prototype (about 2 to 3 days) covering: customer ledger with the entry row; the same with today's dialog flow; dashboard with and without "Who to chase"; mobile entry panel. Use only mock names and amounts. The standalone HTML boards in `design/ledger-boards/` are the visual reference.

## 9. Round 2b: impression test (remote)

Show each of three dashboards for 5 seconds (today, v3 soft cards, Ledger), in random order, then ask:

1. What is this app for? (free text)
2. Would you trust it with your customers' balances? 1 (not at all) to 5 (completely).
3. Pick up to three words: clear, old-fashioned, professional, childish, cramped, trustworthy, modern, busy.
4. First-click: "Where would you tap to record a payment?"

## 10. Optional survey (6 minutes, about 12 questions)

Screener (3 questions as in section 4). Then, easy first: how often you record credit per week (choose a range); device you use most (choose one); how you decide whom to chase (choose all that apply, plus Other); whether a balance went unpaid for over a month in the last three months (Yes or No, then one open question); two seven-point agreement items: "I know at a glance who owes me the most" and (reverse-worded) "I often lose track of how long a balance has been unpaid"; language preference; demographics last. Randomise option order. No double-barrelled items. Pilot with 5 to 10 people first.

## 11. Analysis and decision rules

**Synthesis.** Round 1: affinity map bottom-up (one observation per note, no pre-made categories), then thematic analysis. Round 2: task tables and counts. Write each insight as **observation, inference, implication**; tag evidence strength (strong: three or more independent sources; moderate: two sources or a clear majority in one; weak: a single source); always state n.

**Decision rules.** These are proposed thresholds. Agree them before the first session and do not change them afterwards.

| Result                                                                                                                       | Set in `RESEARCH-DECISIONS.md`                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| G-A2: T1 and T2 completed with no wrong-type error for at least 5 of 6, and median time no worse than today's flow           | `approved`                                                                                                                                   |
| G-A2: 2 or more of 6 record a payment in the wrong column or need help                                                       | `rejected` (keep the quick-add card; the ledger table stays read-only)                                                                       |
| G-A1: at least 4 of 6 describe chasing by age of debt in round 1 and in T4                                                   | `approved`                                                                                                                                   |
| G-A1: fewer than 3 of 6 describe chasing by age                                                                              | `rejected`                                                                                                                                   |
| G-A3: Ledger rated at least as trustworthy as today's design, and "old-fashioned" or "childish" chosen by fewer than a third | confirm `approved`                                                                                                                           |
| G-A3: otherwise                                                                                                              | `approved-with-changes`: keep structure (rules, columns, totals, leaders) and drop the tally mark and paper identity; list the exact changes |
| Phone legibility: 2 or more of 6 cannot read a leader row or total without prompting                                         | add the finding to Notes of G-A3; simplify leaders under 400 px                                                                              |
| Anything between the thresholds                                                                                              | `pending`; run a further round of 3 to 5 sessions leaders) and drop the tally mark and paper identity; list the exact changes                |
| Phone legibility: 2 or more of 6 cannot read a leader row or total without prompting                                         | add the finding to Notes of G-A3; simplify leaders under 400 px                                                                              |
| Anything between the thresholds                                                                                              | `pending`; run a further round of 3 to 5 sessions                                                                                            |

## 12. Risks

Small samples; recruiting only technical users; prototype fidelity; interpreter effects; the Hawthorne effect when recording is observed; bias from a facilitator who built the concept (so have someone other than the designer run sessions if possible).

## 13. Measuring after launch (optional, needs a privacy decision)

Time from opening a customer page to a saved entry; the share of entries made by the entry row versus the global dialog; the share of customers flagged 30 or more days; whether the flagged customers are paid within 14 days. Do not collect customer names or amounts.
