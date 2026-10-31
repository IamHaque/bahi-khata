#!/usr/bin/env node
/**
 * S-41 / L-14 responsive + touch + focus audit — real-browser evidence.
 * ====================================================================
 * Loads the REAL app in headless Chrome over the REAL Vite dev server and
 * MEASURES (never infers from class names), per route × viewport width ×
 * colour theme:
 *   - no horizontal page scroll  (documentElement.scrollWidth <= innerWidth + 1,
 *     and the layout viewport must not expand to absorb overflow)
 *   - the widest offending descendant when it fails (so the fix is locatable)
 *   - no truncated amount        (₹-amount elements clipped by overflow-x)
 *   - a per-route content marker is present (catches redirects/error pages)
 *
 * L-14 additions (the "measured, not inferred" requirement):
 *   - viewports 360, 390, 768, 1024, 1440; light AND dark
 *   - at 360 and 390 TOUCH emulation is enabled and the script ASSERTS
 *     matchMedia('(pointer: coarse)').matches === true, otherwise every
 *     touch-target number would be meaningless. Result is printed.
 *   - every visible interactive element (button, link outside running text,
 *     input, select, textarea, [role=tab|radio|switch|menuitem|option|button])
 *     is hit-tested at the CENTRE and the FOUR CORNERS of a 44x44 box centred
 *     on it via document.elementFromPoint. A CSS `::after` overlay counts,
 *     because pseudo-elements hit-test as their originating element (which
 *     getBoundingClientRect would miss). Exempt: disabled, sr-only, inline
 *     links inside a sentence, off-screen, and anything under an intentional
 *     fixed overlay (modal backdrop / sticky chrome).
 *   - SECTION 4 (keyboard, focus, motion): real Tab-key traversal reading
 *     document.activeElement + its computed outline/box-shadow; dialog focus
 *     TRAP + Escape + focus-RETURN-to-trigger; prefers-reduced-motion emulation
 *     asserting the `.entry-reveal` rule resolves to `animation-name: none`.
 *
 * States covered (not only happy paths): dashboard with data / empty / loading,
 * customers (data / empty), customer detail with entries / with none,
 * transactions detailed / summarized, transaction detail, statement, import,
 * Recently deleted, members, settings, businesses, onboarding, login, UI
 * gallery — plus dialogs and sheets OPENED BY CLICKING THEIR TRIGGER
 * (add transaction, add customer, delete transaction, delete customer, invite).
 *
 * REQUIREMENT: the Vite dev server must ALREADY be running at
 * http://localhost:5173 (`npm run dev` in another terminal). This script
 * probes it first and fails fast with a clear message; it never starts or
 * stops the server itself.
 *
 * Zero npm dependencies: Node 22 built-ins only (global WebSocket + fetch,
 * node:child_process, node:fs, node:os, node:path, node:crypto).
 *
 * AUTH: protected routes need a session. A fake-but-well-formed supabase-js
 * v2 session is seeded into localStorage before any page script runs
 * (Page.addScriptToEvaluateOnNewDocument, origin-guarded) so getSession()
 * resolves; /auth/v1/user + /auth/v1/token are intercepted as a fallback.
 * The session is NOT seeded on /login (a session there would redirect away).
 *
 * DATA: every supabase REST call (other origin) is intercepted via
 * CDP Fetch.requestPaused and answered with fixture JSON matching the
 * shapes the src/features api modules parse. Requests that cannot be
 * matched are answered with an empty array (never a 500) and LISTED in
 * the report so nothing silently renders wrong.
 *
 * SECRETS: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are read from .env
 * silently to derive the `sb-<ref>-auth-token` storage key. No env value,
 * token or key is ever printed, logged, written to the report or committed.
 *
 * OUTPUT: a markdown evidence table + an unmatched-request list + the touch
 * and focus summaries on stdout, plus a full JSON report and screenshots
 * under a temp dir (never inside the repository). Set AUDIT_SHOTS_DIR to
 * also copy the 390/1440 light+dark screenshots somewhere reviewable
 * (e.g. .local/ui-checks, which is git-ignored).
 */

"use strict";

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEV_ORIGIN = "http://localhost:5173";
const DEBUG_PORT = 9333;
// Debug subset support (used during development of this script):
// AUDIT_ROUTES="/businesses" AUDIT_WIDTHS=360 AUDIT_THEMES=light narrows the
// matrix; AUDIT_IDS="dashboard-data,dashboard-empty" picks scenarios by id.
const WIDTHS = [360, 390, 768, 1024, 1440];
if (process.env.AUDIT_WIDTHS) {
  WIDTHS.length = 0;
  WIDTHS.push(...process.env.AUDIT_WIDTHS.split(",").map((w) => Number(w.trim())));
}
const THEMES = ["light", "dark"];
if (process.env.AUDIT_THEMES) {
  THEMES.length = 0;
  THEMES.push(...process.env.AUDIT_THEMES.split(",").map((t) => t.trim()));
}
// Widths at which touch emulation is switched on and 44x44 targets are
// enforced. The addendum names 360 and 390.
const TOUCH_WIDTHS = [360, 390];
const VIEWPORT_HEIGHT = 900;
const ROOT = path.resolve(__dirname, "..");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

/**
 * Every audited route AND STATE, with an honest content marker (unique text
 * that only renders when the page itself — not an error or redirect — is on
 * screen), or a `markerSelector` for states where the marker is structural
 * (a loading skeleton has no settled text).
 *
 * Options:
 *   mode:           "normal" | "empty" (fixture lists emptied, dashboard
 *                   zeroed to a first-run business) | "hold" (supabase
 *                   requests left pending so loading skeletons stay put)
 *   role:           "owner" makes the signed-in user the b1 OWNER for this
 *                   scenario (unlocks Invite, Delete transaction/customer)
 *   markerSelector: CSS selector that must exist when the marker text cannot
 *   open:           steps clicked after load to reach a dialog/sheet/tab
 *   dialog:         the opened surface is a modal — run trap/Escape/return
 *   focus:          run the keyboard tab-order + focus-ring traversal
 */
const SCENARIOS = [
  { id: "login", path: "/login", marker: "Continue with Google", noSession: true },
  { id: "businesses", path: "/businesses", marker: "Businesses you own and share with you." },
  { id: "onboarding", path: "/onboarding/business", marker: "Create your business" },

  // Dashboard: with data, empty (first-run) and loading (skeleton) states.
  { id: "dashboard-data", path: "/b/b1", marker: "Top outstanding balances", focus: true },
  {
    id: "dashboard-chart-30",
    path: "/b/b1",
    marker: "Top outstanding balances",
    open: [{ role: "button", name: /^30 days$/ }],
  },
  {
    id: "dashboard-chart-90",
    path: "/b/b1",
    marker: "Top outstanding balances",
    open: [{ role: "button", name: /^90 days$/ }],
  },
  { id: "dashboard-empty", path: "/b/b1", marker: "Getting started", mode: "empty" },
  {
    id: "dashboard-loading",
    path: "/b/b1",
    marker: null,
    markerSelector: '[aria-label="Loading dashboard"]',
    mode: "hold",
  },

  // Customers: with results and with none.
  { id: "customers", path: "/b/b1/customers", marker: "Everyone in this business" },
  { id: "customers-empty", path: "/b/b1/customers", marker: "Add your first customer", mode: "empty" },

  // Customer detail: with ledger entries and with none. ("Current Balance"
  // was L-07-renamed to "Owes you / You owe / Settled" — the marker tracks
  // the rendered text, not the stale S-41 wording.)
  { id: "customer-detail", path: "/b/b1/customers/c1", marker: "Owes you", focus: true },
  {
    id: "customer-detail-empty",
    path: "/b/b1/customers/c1",
    marker: "Owes you",
    mode: "empty",
  },
  { id: "statement", path: "/b/b1/customers/c1/statement", marker: "Statement for" },
  { id: "import", path: "/b/b1/customers/import", marker: "Download template" },

  // Transactions: detailed and summarized views.
  { id: "transactions-detailed", path: "/b/b1/transactions", marker: "Every entry across customers" },
  {
    id: "transactions-summarized",
    path: "/b/b1/transactions",
    marker: "Every entry across customers",
    open: [{ role: "tab", name: /Summarized/ }],
  },
  { id: "transaction-detail", path: "/b/b1/transactions/t1", marker: "Transaction Detail" },

  { id: "deleted-items", path: "/b/b1/deleted", marker: "Recently deleted", role: "owner" },
  { id: "members", path: "/b/b1/members", marker: "Who can see and change this business's data." },
  { id: "settings", path: "/b/b1/settings", marker: "Backup", focus: true },
  { id: "ui-gallery", path: "/__ui", marker: "UI Gallery" },

  // Dialogs and sheets OPENED BY CLICKING THEIR TRIGGER (L-14: the touch
  // audit must see the controls that only exist inside them).
  {
    id: "sheet-add-transaction",
    path: "/b/b1",
    marker: "Top outstanding balances",
    open: [{ role: "button", name: /^Add transaction$/ }],
    dialog: true,
    focus: true,
  },
  {
    id: "dialog-add-customer",
    path: "/b/b1",
    marker: "Top outstanding balances",
    open: [{ role: "button", name: /^Add customer$/ }],
    dialog: true,
  },
  {
    id: "dialog-delete-transaction",
    path: "/b/b1/transactions",
    marker: "Every entry across customers",
    role: "owner",
    open: [{ role: "button", name: /^Delete (charge|payment)/ }],
    dialog: true,
  },
  {
    id: "dialog-delete-customer",
    path: "/b/b1/customers/c1",
    marker: "Owes you",
    role: "owner",
    open: [
      { role: "button", name: /Customer actions/ },
      { role: "menuitem", name: /^Delete customer$/ },
    ],
    dialog: true,
  },
  {
    id: "dialog-invite",
    path: "/b/b1/members",
    marker: "Who can see and change this business's data.",
    role: "owner",
    open: [{ role: "button", name: /^Invite$/ }],
    dialog: true,
  },
];

const ACTIVE_SCENARIOS = process.env.AUDIT_IDS
  ? SCENARIOS.filter((s) => process.env.AUDIT_IDS.split(",").map((x) => x.trim()).includes(s.id))
  : SCENARIOS;

// ---------------------------------------------------------------------------
// .env (read silently — values are NEVER printed or written anywhere)
// ---------------------------------------------------------------------------

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match) out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = loadEnvFile();
if (!env.VITE_SUPABASE_URL) {
  console.error(
    "FATAL: VITE_SUPABASE_URL is missing from .env (name only — no values are printed).",
  );
  process.exit(1);
}
let supabaseOrigin;
let storageKey;
try {
  supabaseOrigin = new URL(env.VITE_SUPABASE_URL).origin;
  storageKey = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
} catch {
  console.error("FATAL: VITE_SUPABASE_URL in .env is not a valid URL.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Fixtures — shapes mirror the features' api modules (auth, business,
// customers, transactions, dashboard, members, import-export).
// ---------------------------------------------------------------------------

const FAKE_USER = {
  id: "u1",
  aud: "authenticated",
  role: "authenticated",
  email: "omar@example.com",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  phone: "",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  identities: [],
  is_anonymous: false,
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
};

// Well-known, obviously-fake tokens (never real credentials) with an expiry
// far in the future so no refresh round trip is ever triggered.
const FAKE_SESSION = {
  access_token: "audit-fake-access-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: 4102444800, // 2100-01-01T00:00:00Z
  refresh_token: "audit-fake-refresh-token",
  user: FAKE_USER,
};

const PROFILES = [
  { id: "u1", email: "omar@example.com", full_name: "Omar Siddiqui", avatar_url: null },
  { id: "u2", email: "nadia@example.com", full_name: "Nadia Rahman", avatar_url: null },
  { id: "u3", email: "rahim@example.com", full_name: "Rahim Uddin", avatar_url: null },
];

const BUSINESSES = {
  b1: {
    id: "b1",
    owner_id: "u3",
    name: "Rahim Traders and Sons Wholesale Emporium",
    business_type: "Wholesale",
    phone: "01711-111 2233",
    email: "rahim@example.com",
    address: "42 Old Bazaar Road, Dhaka 1211",
    notes: "Family wholesale house — open accounts only.",
    created_at: "2026-01-02T08:00:00.000Z",
  },
  b2: {
    id: "b2",
    owner_id: "u2",
    name: "Karim Store",
    business_type: "Retail",
    phone: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-02-11T08:00:00.000Z",
  },
};

// The signed-in user (u1) is an EDITOR on both businesses — deliberately
// not an owner, so /onboarding/business renders its real form instead of
// bouncing owners to their dashboard (CreateBusinessPage redirects owners).
const MEMBERSHIP_ROWS = [
  {
    business_id: "b1",
    role: "editor",
    business: { id: "b1", name: BUSINESSES.b1.name, business_type: "Wholesale", owner_id: "u3" },
  },
  {
    business_id: "b2",
    role: "editor",
    business: { id: "b2", name: BUSINESSES.b2.name, business_type: "Retail", owner_id: "u2" },
  },
];

const MEMBER_ROWS_B1 = [
  { user_id: "u3", role: "owner", joined_at: "2026-01-02T08:00:00.000Z" },
  { user_id: "u1", role: "editor", joined_at: "2026-02-01T09:00:00.000Z" },
  { user_id: "u2", role: "editor", joined_at: "2026-03-15T10:30:00.000Z" },
];

// Pending invitation addressed to the signed-in user (memberships query) …
const MEMBERSHIPS_INVITATIONS = [
  {
    id: "i1",
    business_id: "b3",
    role: "viewer",
    created_at: "2026-10-01T09:00:00.000Z",
  },
];

// … and the ones visible on b1's Members page (needs email).
const BUSINESS_INVITATIONS_B1 = [
  {
    id: "i2",
    email: "friend.awaiting.reply@example.com",
    role: "editor",
    created_at: "2026-10-10T16:45:00.000Z",
  },
];

const MY_INVITATIONS = [
  {
    id: "i1",
    business_id: "b3",
    business_name: "Sattar Bakery and Confectionery House",
    inviter_name: "Masud Rana",
    role: "viewer",
    created_at: "2026-10-01T09:00:00.000Z",
  },
];

const CUSTOMERS = [
  {
    id: "c1",
    business_id: "b1",
    name: "Rahim Traders and Sons Wholesale Emporium",
    phone: "01711-111 2233",
    email: "rahim@example.com",
    address: "42 Old Bazaar Road, Dhaka",
    alternate_contact_name: "Jahanara Begum (accounts)",
    alternate_contact_phone: "01819-445 566",
    tags: ["wholesale", "regular", "priority"],
    notes: "Settles on the 1st of every month; long overdue once.",
    created_at: "2026-01-05T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    archived_at: null,
    deleted_at: null,
  },
  {
    id: "c2",
    business_id: "b1",
    name: "Asha Verma",
    phone: "01712-222 222",
    email: null,
    address: null,
    alternate_contact_name: null,
    alternate_contact_phone: null,
    tags: null,
    notes: null,
    created_at: "2026-01-10T00:00:00.000Z",
    updated_at: "2026-01-10T00:00:00.000Z",
    archived_at: null,
    deleted_at: null,
  },
  {
    id: "c3",
    business_id: "b1",
    name: "Chand Mia General Store and Electronics Repair Centre",
    phone: null,
    email: "chandmia@example.com",
    address: "Plot 7, Mirpur-10",
    alternate_contact_name: null,
    alternate_contact_phone: null,
    tags: ["retail"],
    notes: null,
    created_at: "2026-02-20T00:00:00.000Z",
    updated_at: "2026-02-20T00:00:00.000Z",
    archived_at: null,
    deleted_at: null,
  },
  {
    id: "c4",
    business_id: "b1",
    name: "Nadia Rahman",
    phone: "01913-333 444",
    email: "nadia@example.com",
    address: null,
    alternate_contact_name: null,
    alternate_contact_phone: null,
    tags: null,
    notes: "Prefers WhatsApp reminders.",
    created_at: "2026-03-01T00:00:00.000Z",
    updated_at: "2026-09-28T00:00:00.000Z",
    archived_at: null,
    deleted_at: null,
  },
  {
    id: "c5",
    business_id: "b1",
    name: "Abdul Karim (Wholesale Hardware & Sanitary Ware)",
    phone: "01521-445 566",
    email: null,
    address: "Steel Gate Market, 2nd floor",
    alternate_contact_name: "Sohel Rana",
    alternate_contact_phone: "01611-000 999",
    tags: ["wholesale", "seasonal"],
    notes: null,
    created_at: "2026-04-12T00:00:00.000Z",
    updated_at: "2026-04-12T00:00:00.000Z",
    archived_at: null,
    deleted_at: null,
  },
  {
    id: "c6",
    business_id: "b1",
    name: "Sattar Bakery and Confectionery House",
    phone: "01677-889 900",
    email: "sattar.bakery@example.com",
    address: null,
    alternate_contact_name: null,
    alternate_contact_phone: null,
    tags: ["retail", "morning deliveries"],
    notes: "Orders before 7am; statement printed monthly.",
    created_at: "2026-05-30T00:00:00.000Z",
    updated_at: "2026-10-05T00:00:00.000Z",
    archived_at: null,
    deleted_at: null,
  },
];

const CUSTOMER_BALANCES = {
  c1: 125000.5,
  c2: -3200.75,
  c3: 0,
  c4: 45000,
  c5: -1250.4,
  c6: 88000.15,
};

const LAST_ACTIVITY = {
  c1: "2026-10-12T10:00:00.000Z",
  c2: "2026-10-08T11:30:00.000Z",
  c3: null,
  c4: "2026-10-12T09:15:00.000Z",
  c5: "2026-09-30T17:00:00.000Z",
  c6: "2026-10-14T06:45:00.000Z",
};

function transactionRow(i, overrides) {
  const base = {
    id: `t${i}`,
    business_id: "b1",
    customer_id: "c1",
    type: i % 3 === 0 ? "payment" : "charge",
    amount: [5000, 1250, 300, 125000.5, 880, 45000.25, 700, 15000.9, 250, 6000][i - 1] ?? 100,
    status: "active",
    occurred_at: `2026-10-${String(4 + i).padStart(2, "0")}T1${i % 10}:00:00.000Z`,
    note:
      i === 1
        ? "Monsoon stock — 40 cartons of premium basmati rice and assorted lentils delivered to the Old Bazaar godown"
        : i === 4
          ? "Advance against the festive order (largest line item of the quarter)"
          : null,
    source: "manual",
    created_by: "u1",
    created_at: `2026-10-${String(4 + i).padStart(2, "0")}T1${i % 10}:05:00.000Z`,
    updated_at: `2026-10-${String(4 + i).padStart(2, "0")}T1${i % 10}:05:00.000Z`,
    updated_by: null,
    void_reason: null,
    voided_at: null,
    voided_by: null,
    ...overrides,
  };
  return base;
}

const TRANSACTIONS = [
  transactionRow(1, { customer_id: "c1", type: "charge", amount: 5000 }),
  transactionRow(2, { customer_id: "c2", type: "payment", amount: 1250 }),
  transactionRow(3, { customer_id: "c4", type: "charge", amount: 300 }),
  transactionRow(4, { customer_id: "c1", type: "charge", amount: 125000.5 }),
  transactionRow(5, { customer_id: "c6", type: "payment", amount: 880 }),
  transactionRow(6, { customer_id: "c6", type: "charge", amount: 45000.25 }),
  transactionRow(7, { customer_id: "c5", type: "payment", amount: 700 }),
  transactionRow(8, { customer_id: "c4", type: "charge", amount: 15000.9, updated_by: "u2" }),
  transactionRow(9, { customer_id: "c2", type: "charge", amount: 250 }),
  transactionRow(10, { customer_id: "c1", type: "payment", amount: 6000 }),
];

const CUSTOMER_BY_ID = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c]));

// customer_ledger RPC rows for c1 (with balance_after running totals).
const LEDGER_C1 = [
  {
    id: "t1",
    customer_id: "c1",
    occurred_at: "2026-10-05T10:00:00.000Z",
    type: "charge",
    amount: 5000,
    note: "Monsoon stock — 40 cartons of premium basmati rice and assorted lentils delivered to the Old Bazaar godown",
    status: "active",
    source: "manual",
    created_by: "u1",
    created_at: "2026-10-05T10:05:00.000Z",
    updated_by: null,
    updated_at: "2026-10-05T10:05:00.000Z",
    balance_after: 5000,
  },
  {
    id: "t4",
    customer_id: "c1",
    occurred_at: "2026-10-08T14:00:00.000Z",
    type: "charge",
    amount: 125000.5,
    note: "Advance against the festive order (largest line item of the quarter)",
    status: "active",
    source: "manual",
    created_by: "u1",
    created_at: "2026-10-08T14:05:00.000Z",
    updated_by: "u2",
    updated_at: "2026-10-09T09:00:00.000Z",
    balance_after: 130000.5,
  },
  {
    id: "t10",
    customer_id: "c1",
    occurred_at: "2026-10-12T10:00:00.000Z",
    type: "payment",
    amount: 6000,
    note: null,
    status: "active",
    source: "manual",
    created_by: "u1",
    created_at: "2026-10-12T10:05:00.000Z",
    updated_by: null,
    updated_at: "2026-10-12T10:05:00.000Z",
    balance_after: 124000.5,
  },
];

// Real PostgREST returns a `returns table (...)` function's rows as a
// one-element ARRAY — the dashboard api layer unwraps it.
const DASHBOARD_SUMMARY = [
  {
    total_receivable: 258000.65,
    total_credit: 4451.15,
    open_accounts: 5,
    today_count: 2,
    today_net: 4120.9,
    customer_count: 6,
    top_debtors: [
      { id: "c1", name: "Rahim Traders and Sons Wholesale Emporium", balance: 125000.5 },
      { id: "c6", name: "Sattar Bakery and Confectionery House", balance: 88000.15 },
      { id: "c4", name: "Nadia Rahman", balance: 45000 },
    ],
  },
];

// L-14: the first-run dashboard summary a brand-new business returns —
// zeroed figures and customer_count 0 so FirstRunCard renders.
const ZERO_SUMMARY = [
  {
    total_receivable: 0,
    total_credit: 0,
    open_accounts: 0,
    today_count: 0,
    today_net: 0,
    customer_count: 0,
    top_debtors: [],
  },
];

const DAILY_ACTIVITY = [
  { activity_date: "2026-10-09", charges: 126200.5, payments: 700 },
  { activity_date: "2026-10-10", charges: 0, payments: 0 },
  { activity_date: "2026-10-11", charges: 0, payments: 0 },
  { activity_date: "2026-10-12", charges: 250, payments: 6000 },
  { activity_date: "2026-10-13", charges: 0, payments: 0 },
  { activity_date: "2026-10-14", charges: 15000.9, payments: 0 },
  { activity_date: "2026-10-15", charges: 0, payments: 45000.25 },
];

// ---------------------------------------------------------------------------
// Fake REST layer
// ---------------------------------------------------------------------------

const unmatchedRequests = new Set();
// Diagnostics: every paused request + how it was answered, and any page
// console errors — both go into the JSON report to debug missed fixtures.
const interceptionLog = [];
let interceptionCount = 0;
function logInterception(entry) {
  interceptionCount += 1;
  if (interceptionLog.length < 400) interceptionLog.push(entry);
}
const pageErrors = [];

// L-14: per-scenario fixture state, set from the Node side before each
// navigation. "empty" returns empty lists (and a zeroed, first-run dashboard
// summary) so the EMPTY states are audited; "hold" leaves supabase requests
// pending so the LOADING skeletons stay on screen; `roleOverride` makes the
// signed-in user the business owner so owner-only controls (Invite, Delete
// transaction, Delete customer) can be opened and measured.
let fixtureMode = "normal";
let roleOverride = null;
// Request ids left pending while a "hold" (loading-skeleton) scenario runs;
// released with an empty body before the next navigation so nothing leaks.
const heldRequests = [];

function jsonResult(body, extraHeaders) {
  return {
    status: 200,
    headers: { "content-type": "application/json", ...(extraHeaders || {}) },
    body: JSON.stringify(body),
  };
}

function countHeaders(total) {
  return { "content-range": `0-${Math.max(total - 1, 0)}/${total}` };
}

function headCount(total) {
  return { status: 200, headers: countHeaders(total), body: "" };
}

function single(row, selectHint) {
  if (row === undefined || row === null) {
    // PostgREST 406 for Accept: application/vnd.pgrst.object+json, which
    // supabase-js maps to a PGRST116 error (maybeSingle → null).
    return {
      status: 406,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "PGRST116",
        details: `The result contains 0 rows`,
        hint: null,
        message: "JSON object requested, multiple (or no) rows returned",
      }),
    };
  }
  return jsonResult(row);
}

function customerListRow(customer) {
  return {
    ...customer,
    customer_balances: { balance: CUSTOMER_BALANCES[customer.id] ?? 0 },
    transactions: LAST_ACTIVITY[customer.id]
      ? [{ occurred_at: LAST_ACTIVITY[customer.id] }]
      : [],
  };
}

function transactionListRow(row) {
  const customer = CUSTOMER_BY_ID[row.customer_id];
  return {
    ...row,
    customer: {
      id: row.customer_id,
      name: customer ? customer.name : "Unknown customer",
      phone: customer ? customer.phone : null,
    },
  };
}

function routeRest(urlObj, method, headers, postData) {
  const pathname = urlObj.pathname.replace(/^\/rest\/v1/, "");
  const accept = headers["accept"] || "";
  const wantsObject = accept.includes("pgrst.object");
  const q = urlObj.searchParams;
  const select = q.get("select") || "";
  // head:true count probes use HTTP HEAD; GET + Prefer:count=exact still
  // carries a body and must be answered with rows plus Content-Range.
  const isCountHead = method === "HEAD";

  // --- rpc endpoints -------------------------------------------------------
  if (pathname.startsWith("/rpc/")) {
    const rpc = pathname.slice("/rpc/".length);
    // L-14 empty state: a brand-new business has no activity at all, and its
    // dashboard summary is a zeroed first-run payload (customer_count 0).
    if (fixtureMode === "empty") {
      if (rpc === "dashboard_summary") return jsonResult([ZERO_SUMMARY]);
      return jsonResult([]);
    }
    switch (rpc) {
      case "dashboard_summary":
        return jsonResult(DASHBOARD_SUMMARY);
      case "customer_ledger":
        return jsonResult(LEDGER_C1);
      case "daily_activity": {
        let pDays = 7;
        try {
          pDays = JSON.parse(postData || "{}").p_days ?? 7;
        } catch {}
        if (pDays > 7) {
          const rows = [];
          for (let i = pDays - 1; i >= 0; i--) {
            const d = new Date(2026, 9, 15 - i);
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            rows.push({
              activity_date: iso,
              charges: (i % 3 === 0) ? 1200 : 0,
              payments: (i % 5 === 0) ? 800 : 0,
            });
          }
          return jsonResult(rows);
        }
        return jsonResult(DAILY_ACTIVITY);
      }
      case "my_invitations":
        return jsonResult(MY_INVITATIONS);
      case "business_exists":
        return jsonResult(true);
      case "transaction_rollup": {
        let granularity = null;
        try {
          granularity = JSON.parse(postData || "{}").p_granularity ?? null;
        } catch {
          granularity = null;
        }
        if (granularity) {
          return jsonResult([
            { period_start: "2026-10-08", entries: 1, total_charged: 125000.5, total_paid: 0, net: 125000.5 },
            { period_start: "2026-10-12", entries: 1, total_charged: 0, total_paid: 6000, net: -6000 },
            { period_start: "2026-10-14", entries: 2, total_charged: 15000.9, total_paid: 45000.25, net: -30000.35 },
          ]);
        }
        return jsonResult([
          { period_start: null, entries: 10, total_charged: 192351.65, total_paid: 53830.25, net: 138521.4 },
        ]);
      }
      default:
        unmatchedRequests.add(`POST ${pathname} (rpc) — served []`);
        return jsonResult([]);
    }
  }

  // --- tables --------------------------------------------------------------
  switch (pathname) {
    case "/auth-user":
      return jsonResult(FAKE_USER);

    case "/business_members": {
      // L-14: `roleOverride` makes the signed-in user the b1 owner so the
      // owner-only surfaces (Invite, Delete transaction/customer) render.
      const withRole = (rows) =>
        roleOverride
          ? rows.map((r) => (r.business_id === "b1" ? { ...r, role: roleOverride } : r))
          : rows;
      if (select.includes("business:businesses")) {
        // The shell reads this to place the active business — always kept.
        return jsonResult(withRole(MEMBERSHIP_ROWS));
      }
      if (fixtureMode === "empty") return jsonResult([]);
      if (select.includes("user_id")) {
        return jsonResult(MEMBER_ROWS_B1);
      }
      if (isCountHead) return headCount(MEMBER_ROWS_B1.length);
      unmatchedRequests.add(`GET ${pathname} (business_members, select="${select}") — served []`);
      return jsonResult([]);
    }

    case "/profiles":
      return jsonResult(PROFILES);

    case "/business_invitations": {
      if (fixtureMode === "empty") return isCountHead ? headCount(0) : jsonResult([]);
      if (isCountHead) return headCount(MEMBERSHIPS_INVITATIONS.length);
      if (select.includes("email")) {
        return jsonResult(BUSINESS_INVITATIONS_B1);
      }
      return jsonResult(MEMBERSHIPS_INVITATIONS);
    }

    case "/businesses": {
      const idEq = q.get("id");
      if (idEq && wantsObject) return single(BUSINESSES[idEq.replace("eq.", "")] ?? null);
      if (idEq === "eq.b1") {
        return jsonResult(BUSINESSES.b1);
      }
      return jsonResult([BUSINESSES.b1, BUSINESSES.b2]);
    }

    case "/customers": {
      // L-14 empty: no customers in the lists, but a detail page's
      // single-object read still resolves — so the empty LEDGER state is
      // audited rather than a 404.
      if (fixtureMode === "empty" && !wantsObject) {
        return isCountHead ? headCount(0) : jsonResult([]);
      }
      if (isCountHead && (select === "id" || select === "id,name,phone,archived_at")) {
        return headCount(CUSTOMERS.length);
      }
      if (select.includes("customer_balances!inner")) {
        return jsonResult(
          CUSTOMERS.map(customerListRow),
          countHeaders(CUSTOMERS.length),
        );
      }
      // supabase-js strips spaces from the final select; match both forms.
      if (select === "id,name,phone,archived_at" || select === "id, name, phone, archived_at") {
        return jsonResult(
          CUSTOMERS.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            archived_at: c.archived_at,
          })),
        );
      }
      const idEq = q.get("id");
      if (idEq && wantsObject) {
        return single(CUSTOMER_BY_ID[idEq.replace("eq.", "")] ?? null);
      }
      if (select === "*") return jsonResult(CUSTOMERS);
      unmatchedRequests.add(`GET ${pathname} (customers, select="${select}") — served []`);
      return jsonResult([]);
    }

    case "/customer_balances": {
      if (select.includes("customer_id")) {
        if (fixtureMode === "empty") return jsonResult([]);
        return jsonResult(
          CUSTOMERS.map((c) => ({
            customer_id: c.id,
            business_id: "b1",
            balance: CUSTOMER_BALANCES[c.id] ?? 0,
            archived_at: c.archived_at,
          })),
        );
      }
      return single({ customer_id: "c1", business_id: "b1", balance: CUSTOMER_BALANCES.c1, archived_at: null });
    }

    case "/transactions": {
      // L-14 empty: lists are empty; the transaction-detail single read
      // still resolves so that page renders.
      if (fixtureMode === "empty" && !wantsObject) {
        return isCountHead ? headCount(0) : jsonResult([]);
      }
      if (isCountHead) return headCount(TRANSACTIONS.length);
      if (select.includes("customers(name")) {
        // getTransactionById: "*, customers(name, phone)" + .single()
        const idEq = (q.get("id") || "").replace("eq.", "");
        const row = TRANSACTIONS.find((t) => t.id === idEq);
        if (!row) return single(null);
        const customer = CUSTOMER_BY_ID[row.customer_id];
        return single({
          ...row,
          customers: customer
            ? { name: customer.name, phone: customer.phone }
            : null,
          void_reason: row.void_reason,
        });
      }
      // supabase-js strips spaces from the final select; match both forms.
      if (
        select.includes("customer:customers!inner(id,name)") ||
        select.includes("customer:customers!inner(id, name)")
      ) {
        // Dashboard activity feed.
        return jsonResult(
          [...TRANSACTIONS]
            .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
            .slice(0, 10)
            .map((row) => {
              const customer = CUSTOMER_BY_ID[row.customer_id];
              return {
                id: row.id,
                type: row.type,
                amount: row.amount,
                occurred_at: row.occurred_at,
                customer_id: row.customer_id,
                customer: {
                  id: row.customer_id,
                  name: customer ? customer.name : "Unknown customer",
                },
                created_by: row.created_by,
              };
            }),
        );
      }
      if (
        select.includes("customer:customers!inner(id,name,phone)") ||
        select.includes("customer:customers!inner(id, name, phone)")
      ) {
        return jsonResult(
          TRANSACTIONS.map(transactionListRow),
          countHeaders(TRANSACTIONS.length),
        );
      }
      unmatchedRequests.add(`GET ${pathname} (transactions, select="${select}") — served []`);
      return jsonResult([]);
    }

    default:
      unmatchedRequests.add(`GET ${pathname} — served []`);
      return jsonResult([]);
  }
}

function fixtureFor(urlString, method, headers, postData) {
  const urlObj = new URL(urlString);
  if (urlObj.origin === supabaseOrigin) {
    // CORS preflight — answer it properly or the browser never sends the
    // real request (and never accepts its response).
    if (method === "OPTIONS") {
      logInterception(`OPTIONS ${urlObj.pathname} → 204 (cors)`);
      return {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
          "access-control-allow-headers":
            headers["access-control-request-headers"] ||
            "authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile, range",
          "access-control-max-age": "600",
        },
        body: "",
      };
    }
    let fixture = null;
    if (urlObj.pathname.startsWith("/auth/v1/")) {
      if (urlObj.pathname === "/auth/v1/user") {
        fixture = jsonResult(FAKE_USER);
      } else if (urlObj.pathname.startsWith("/auth/v1/token")) {
        // Fallback only — the seeded session's far-future expiry means no
        // refresh should ever happen.
        fixture = jsonResult(FAKE_SESSION);
      } else {
        unmatchedRequests.add(`POST ${urlObj.pathname} (auth) — served {}`);
        fixture = jsonResult({});
      }
    } else if (urlObj.pathname.startsWith("/rest/v1/")) {
      // L-14 loading state: hold ONLY the dashboard's data (the RPCs) so the
      // shell, boot gate and page chrome render and only the summary/activity
      // skeleton stays on screen. Everything else passes through.
      if (fixtureMode === "hold" && urlObj.pathname.startsWith("/rest/v1/rpc/")) {
        return { hold: true };
      }
      fixture = routeRest(urlObj, method, headers, postData);
    } else {
      unmatchedRequests.add(`${method} ${urlObj.pathname} (unknown supabase path) — served []`);
      fixture = jsonResult([]);
    }
    logInterception(`${method} ${urlObj.pathname.replace(/^\/(rest|auth)\/v1/, "")} → ${fixture.status}`);
    return fixture;
  }
  return null; // not ours — continue the request
}

// ---------------------------------------------------------------------------
// CDP client (Node 22 global WebSocket, zero deps)
// ---------------------------------------------------------------------------

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.persistentHandlers = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", (err) => reject(err), { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (typeof msg.id === "number" && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        const persistent = this.persistentHandlers.get(msg.method);
        if (persistent) {
          for (const handler of persistent) handler(msg.params);
        }
        const waiters = this.eventWaiters.get(msg.method);
        if (waiters && waiters.length > 0) waiters.shift()(msg.params);
      }
    });
  }

  /** Persistent listener — invoked for every event with this method. */
  onEvent(method, handler) {
    const list = this.persistentHandlers.get(method) || [];
    list.push(handler);
    this.persistentHandlers.set(method, list);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 60000);
    });
  }

  waitEvent(method, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const list = this.eventWaiters.get(method) || [];
      const timer = setTimeout(() => {
        const idx = list.indexOf(handler);
        if (idx >= 0) list.splice(idx, 1);
        reject(new Error(`CDP event timeout: ${method}`));
      }, timeoutMs);
      const handler = (params) => {
        clearTimeout(timer);
        resolve(params);
      };
      list.push(handler);
      this.eventWaiters.set(method, list);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already gone */
    }
  }
}

// ---------------------------------------------------------------------------
// Browser plumbing
// ---------------------------------------------------------------------------

function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function devServerUp() {
  try {
    const res = await fetch(DEV_ORIGIN, { redirect: "manual" });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function pollForTarget(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* browser not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`No CDP target on port ${DEBUG_PORT} within ${timeoutMs}ms`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Measurement snippet: horizontal scroll, truncated ₹ amounts, and the
// outermost elements sticking out of the viewport. `requestedWidth` is the
// emulated width — on mobile the layout viewport can EXPAND to absorb
// overflow (like a real phone), so innerWidth alone would hide it.
const MEASURE_SOURCE = (requestedWidth) => `(() => {
  const REQUESTED = ${requestedWidth};
  const LIMIT = Math.max(REQUESTED, window.innerWidth);
  const AMOUNT_RE = /₹\\s?[\\d,]/;
  const truncated = [];
  const outside = [];
  let widestWidth = 0;
  let widest = null;
  const all = Array.from(document.querySelectorAll("body *"));
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent || "")
      .join("");
    if (
      AMOUNT_RE.test(ownText) &&
      el.scrollWidth > el.clientWidth + 1 &&
      (cs.overflowX === "hidden" || cs.overflowX === "clip")
    ) {
      truncated.push({
        tag: el.tagName,
        cls: String(el.className || "").slice(0, 160),
        text: ownText.trim().slice(0, 80),
      });
    }
    if (rect.width > 0 && (rect.right > REQUESTED + 1 || rect.left < -1)) {
      outside.push({ el, tag: el.tagName, cls: String(el.className || "").slice(0, 160), right: Math.round(rect.right), left: Math.round(rect.left), width: Math.round(rect.width), text: (el.textContent || "").trim().slice(0, 60) });
      if (rect.width > widestWidth) {
        widestWidth = rect.width;
        widest = { tag: el.tagName, cls: String(el.className || "").slice(0, 160), width: Math.round(rect.width), text: (el.textContent || "").trim().slice(0, 60) };
      }
    }
  }
  // Keep only outermost offenders (skip elements whose parent is also listed).
  const outsideSet = new Set(outside.map((o) => o.el));
  const outermost = outside
    .filter((o) => !o.el.parentElement || !outsideSet.has(o.el.parentElement))
    .map(({ el, ...rest }) => rest)
    .slice(0, 8);
  return {
    requestedWidth: REQUESTED,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    viewportExpanded: window.innerWidth > REQUESTED + 1,
    pathname: location.pathname,
    truncatedAmounts: truncated.slice(0, 10),
    overflowing: outermost,
    widest,
  };
})()`;

const MARKER_SOURCE = (marker) =>
  `(() => ({ found: !!(document.body && document.body.innerText.indexOf(${JSON.stringify(marker)}) !== -1) }))()`;

const SELECTOR_SOURCE = (selector) =>
  `(() => ({ found: !!document.querySelector(${JSON.stringify(selector)}) }))()`;

/** Click the first visible element whose role + accessible name matches a
 *  scenario's `open` step (regex source). Used to reach dialogs, sheets and
 *  tabs that only exist after an interaction. */
const CLICK_SOURCE = (step) => {
  const selByRole = {
    menuitem: '[role="menuitem"]',
    tab: '[role="tab"]',
    option: '[role="option"]',
    button: 'button, [role="button"], a[href], [role="tab"]',
  }[step.role] || 'button, [role="button"], a[href]';
  return `(() => {
    const nameRe = new RegExp(${JSON.stringify(step.name.source)}, ${JSON.stringify(step.name.flags || "")});
    const cands = Array.from(document.querySelectorAll(${JSON.stringify(selByRole)}));
    const el = cands.find((c) => {
      if (c.disabled || c.getAttribute("aria-disabled") === "true") return false;
      const r = c.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return false;
      const label = (c.getAttribute("aria-label") || c.textContent || "").trim();
      return nameRe.test(label);
    });
    if (!el) return { found: false };
    el.scrollIntoView({ block: "center" });
    el.click();
    return { found: true, label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60) };
  })()`;
};

/** L-14 touch-target proof: hit-test the CENTRE and FOUR CORNERS of a 44x44
 *  box centred on every visible interactive element. A `::after` overlay
 *  counts, because pseudo-elements hit-test as their originating element.
 *  Runs only when the pointer is actually coarse (asserted upstream). */
const HITTEST_SOURCE = `(() => {
  const MIN = 44;
  const vw = window.innerWidth, vh = window.innerHeight;
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;
  if (!isCoarse) return { enforced: false, reason: "pointer is not coarse", checked: 0, failures: [] };
  // When a modal/sheet is open, only the surface itself is interactive —
  // everything behind it is exempt as "covered by an intentional overlay".
  const modalRoot =
    document.querySelector("[data-slot$='-content'][data-open], [data-slot='sheet-content'][data-open], [role='dialog']:not([hidden])") ||
    null;
  const SEL = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="radio"], [role="switch"], [role="menuitem"], [role="option"], [role="menuitemcheckbox"], [role="menuitemradio"]';
  const els = Array.from(document.querySelectorAll(SEL));
  const failures = [];
  let checked = 0;
  for (const el of els) {
    if (el.disabled || el.getAttribute("aria-disabled") === "true") continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (parseFloat(cs.opacity || "1") < 0.1) continue;
    let rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    // sr-only / visually hidden
    if (rect.width <= 2 && rect.height <= 2) continue;
    if (rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw) continue;
    if (modalRoot && !modalRoot.contains(el)) continue;
    // Content inside a COLLAPSED <details> is hidden by Chrome via
    // content-visibility: hidden — it keeps a synthesized layout box but is
    // neither rendered nor hit-testable (a real finger can never meet it).
    // Such fields are not touch targets; only the open disclosure's fields
    // are. checkVisibility() also reports false for content-visibility:hidden.
    const details = el.closest("details");
    if (details && !details.open && !details.querySelector("summary")?.contains(el)) continue;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) continue;
    // Inline link embedded in a sentence: exempt (WCAG target size has an
    // inline exception).
    if (el.tagName === "A" && cs.display === "inline") {
      const parent = el.parentElement;
      if (parent) {
        const own = (parent.textContent || "").length;
        const mine = (el.textContent || "").length;
        if (own > mine + 2) continue;
      }
    }
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Inset the corner sample by 1px: an exact 44x44 target's outer edge is
    // exclusive to it, so sampling at precisely ±22 would resolve to the
    // parent and produce a false failure. ±21 keeps sub-44 targets failing
    // while letting a true 44px target pass.
    const H = MIN / 2 - 1;
    const points = [
      [cx, cy],
      [cx - H, cy - H],
      [cx + H, cy - H],
      [cx - H, cy + H],
      [cx + H, cy + H],
    ];
    checked++;
    const misses = [];
    let tested = 0;
    let covered = 0;
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue; // corner off-screen
      tested++;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit))) continue; // self / child / ::after
      // The element's own rect is authoritative for coverage. If the point is
      // strictly INSIDE the element's box yet elementFromPoint walked up to an
      // ancestor (paint/rounding anomaly), the element does occupy that pixel —
      // count it as covered. This rescues exact-44px targets while a sub-44
      // target still misses (its corners fall on/over its own edges).
      const insideOwn =
        x > rect.left && x < rect.right && y > rect.top && y < rect.bottom;
      if (hit && insideOwn && hit.contains(el)) continue;
      if (hit && insideOwn === false && getComputedStyle(hit).position === "fixed") {
        covered++; // sticky/fixed chrome overlaying it
        continue;
      }
      if (!hit) { misses.push({ x: Math.round(x), y: Math.round(y), hit: null }); continue; }
      misses.push({ x: Math.round(x), y: Math.round(y), hit: hit.tagName + "." + String(hit.className || "").slice(0, 50) });
    }
    if (tested - covered <= 0) { checked--; continue; } // fully covered/off-screen
    if (misses.length > 0) {
      failures.push({
        tag: el.tagName,
        role: el.getAttribute("role") || "",
        cls: String(el.className || "").slice(0, 120),
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 50),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        rect: {
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        },
        misses,
      });
    }
  }
  return { enforced: true, isCoarse, checked, totalFailures: failures.length, failures: failures.slice(0, 40) };
})()`;

/** Section 4 — read the focused element and whether a focus ring is visible. */
const FOCUS_SOURCE = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) {
    return { tag: el ? el.tagName : "NONE", name: "", focusRing: false, ringDetail: "no element focused" };
  }
  const cs = getComputedStyle(el);
  const outlineWidth = parseFloat(cs.outlineWidth) || 0;
  const outlineVisible = cs.outlineStyle !== "none" && outlineWidth > 0;
  const shadow = cs.boxShadow || "none";
  const ringVisible = shadow !== "none";
  let focusVisible = false;
  try { focusVisible = el.matches(":focus-visible"); } catch {}
  let focusMatched = false;
  try { focusMatched = el.matches(":focus"); } catch {}
  return {
    tag: el.tagName,
    role: el.getAttribute("role") || "",
    name: (el.getAttribute("aria-label") || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 44),
    id: el.id || "",
    type: el.getAttribute("type") || "",
    isActive: document.activeElement === el,
    focusMatched,
    cls: String(el.className || "").slice(0, 70),
    focusRing: outlineVisible || ringVisible,
    focusVisible,
    ringVar: (cs.getPropertyValue("--tw-ring-shadow") || "").slice(0, 40),
    borderColor: cs.borderColor,
    outline: outlineVisible ? cs.outline.slice(0, 40) : "none",
    boxShadow: ringVisible ? shadow.slice(0, 50) : "none",
    insideDialog: !!el.closest("[data-slot$='-content'], [data-slot='sheet-content'], [role='dialog']"),
  };
})()`;

const DIALOG_PRESENT_SOURCE = `(() => {
  const d = document.querySelector("[data-slot$='-content'][data-open], [data-slot='sheet-content'][data-open], [role='dialog']:not([hidden])");
  return { present: !!d };
})()`;

/** Focus the first focusable element inside the open dialog/sheet so the
 *  Escape key deterministically targets it (Escape is scoped to the focused
 *  surface). Returns whether anything was focused. */
const FOCUS_FIRST_IN_DIALOG_SOURCE = `(() => {
  const d = document.querySelector("[data-slot$='-content'][data-open], [data-slot='sheet-content'][data-open], [role='dialog']:not([hidden])");
  if (!d) return { focused: false };
  const sel = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const el = d.querySelector(sel);
  if (el) { el.focus(); return { focused: true, tag: el.tagName }; }
  d.focus && d.focus();
  return { focused: false };
})()`;

/** Section 4 — reduced motion. Injects a probe carrying `.entry-reveal` so
 *  the real computed value of the rule can be asserted in the browser (no
 *  component currently renders the class: L-12's LedgerEntryRow is gated). */
const MOTION_SOURCE = `(() => {
  const probe = document.createElement("div");
  probe.className = "entry-reveal";
  probe.style.cssText = "position:absolute;top:-9999px;left:-9999px;width:8px;height:8px;";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const name = cs.animationName;
  const dur = cs.animationDuration;
  probe.remove();
  return {
    reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    animationName: name,
    animationDuration: dur,
  };
})()`;

/** Press a real Tab key through CDP and read back the focused element. */
async function tabOnce(cdp) {
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9, text: "\t" });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await sleep(70);
  return evaluate(cdp, FOCUS_SOURCE);
}

async function pressEscape(cdp) {
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await sleep(150);
}

async function pressEnter(cdp) {
  await cdp.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
  await sleep(150);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return result.result ? result.result.value : undefined;
}

async function waitFor(cdp, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(cdp, expression);
      if (value && (value === true || value.found === true)) return true;
    } catch {
      /* page still loading */
    }
    await sleep(250);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function routeSlug(routePath) {
  return routePath.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
}

async function main() {
  if (!(await devServerUp())) {
    console.error(
      `FATAL: the Vite dev server is not reachable at ${DEV_ORIGIN}.\n` +
        "Start it first in another terminal with `npm run dev`, then re-run\n" +
        "`node scripts/responsive-audit.cjs`. (This script never starts or\n" +
        "stops the server itself.)",
    );
    process.exit(1);
  }

  const chromePath = findChrome();
  if (!chromePath) {
    console.error("FATAL: no Chrome or Edge installation found in the usual paths.");
    process.exit(1);
  }

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "responsive-audit-"));
  const shotsDir = path.join(outDir, "shots");
  fs.mkdirSync(shotsDir, { recursive: true });

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-chrome-profile-"));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDir}`,
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-client-side-phishing-detection",
      "--remote-allow-origins=*",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let cdp = null;
  try {
    const wsUrl = await pollForTarget(20000);
    cdp = new CdpClient(wsUrl);
    await cdp.open();

    // Intercept only the supabase origin's REST + auth paths; everything
    // else (the dev server itself) continues untouched.
    const fetchHandler = async (params) => {
      const { requestId, request } = params;
      try {
        const headers = {};
        for (const [k, v] of Object.entries(request.headers || {})) {
          headers[k.toLowerCase()] = v;
        }
        const fixture = fixtureFor(request.url, request.method, headers, request.postData);
        if (!fixture) {
          await cdp.send("Fetch.continueRequest", { requestId });
          return;
        }
        if (fixture.hold) {
          // L-14 loading state: leave the request pending (never continue it
          // to the real network) so the skeleton stays on screen.
          heldRequests.push(requestId);
          return;
        }
        // Every intercepted response needs CORS headers — the supabase
        // origin differs from the dev server origin, so without them the
        // browser discards the (fixture) answer.
        const responseHeaders = {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "content-range, range",
          ...fixture.headers,
        };
        await cdp.send("Fetch.fulfillRequest", {
          requestId,
          responseCode: fixture.status,
          responseHeaders: Object.entries(responseHeaders).map(([name, value]) => ({
            name,
            value,
          })),
          body: Buffer.from(fixture.body, "utf8").toString("base64"),
        });
      } catch {
        try {
          await cdp.send("Fetch.continueRequest", { requestId });
        } catch {
          /* target gone */
        }
      }
    };
    cdp.onEvent("Fetch.requestPaused", fetchHandler);
    cdp.onEvent("Runtime.exceptionThrown", (params) => {
      pageErrors.push(
        `exception: ${params && params.exceptionDetails ? params.exceptionDetails.text : "unknown"}`,
      );
    });
    cdp.onEvent("Runtime.consoleAPICalled", (params) => {
      if (params && params.type === "error") {
        const text = (params.args || [])
          .map((a) => (a.value !== undefined ? String(a.value) : a.description || ""))
          .join(" ")
          .slice(0, 300);
        pageErrors.push(`console.error: ${text}`);
      }
    });

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Fetch.enable", {
      patterns: [
        { urlPattern: "*/rest/v1/*", requestStage: "Request" },
        { urlPattern: "*/auth/v1/*", requestStage: "Request" },
      ],
    });

    // Seed a well-formed fake session before any page script runs. Guarded
    // to the dev origin; skipped on /login so the login page renders.
    const seedSource = `(() => {
      if (location.origin !== ${JSON.stringify(DEV_ORIGIN)}) return;
      if (location.pathname === "/login") return;
      try {
        localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(FAKE_SESSION))});
      } catch (e) { /* private mode etc. */ }
    })()`;
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: seedSource });

    const results = [];
    let firstLoad = true;
    const touchTotals = { controlsChecked: 0, controlsFailing: 0, cellsWithFailures: 0, pointerAssertions: [] };
    const focusFindings = [];
    const motionFindings = [];

    // Screenshots the owner asked for: one per scenario at 390 and 1440 in
    // both themes, into a git-ignored review folder when AUDIT_SHOTS_DIR is
    // set (e.g. .local/ui-checks). Never committed.
    const reviewDir = process.env.AUDIT_SHOTS_DIR
      ? path.resolve(ROOT, process.env.AUDIT_SHOTS_DIR)
      : null;
    if (reviewDir) fs.mkdirSync(reviewDir, { recursive: true });

    // Fulfil anything a previous "hold" (loading) scenario left pending so
    // requests never leak to the real network or to the next page.
    const releaseHeld = async () => {
      for (const id of heldRequests) {
        try {
          await cdp.send("Fetch.fulfillRequest", {
            requestId: id,
            responseCode: 200,
            responseHeaders: [
              { name: "content-type", value: "application/json" },
              { name: "access-control-allow-origin", value: "*" },
            ],
            body: Buffer.from("[]", "utf8").toString("base64"),
          });
        } catch {
          /* target gone */
        }
      }
      heldRequests.length = 0;
    };

    const navigateAndSettle = async (scenario, width, theme) => {
      if (scenario.noSession) {
        try {
          await evaluate(
            cdp,
            `(() => { try { localStorage.removeItem(${JSON.stringify(storageKey)}); } catch (e) {} return true; })()`,
          );
        } catch {
          /* about:blank */
        }
      }
      const loadWait = cdp.waitEvent("Page.loadEventFired", firstLoad ? 90000 : 45000);
      await cdp.send("Page.navigate", { url: DEV_ORIGIN + scenario.path });
      let ok = true;
      try {
        await loadWait;
      } catch {
        ok = false;
      }
      firstLoad = false;
      if (!ok) return false;

      const markerWait = scenario.markerSelector
        ? SELECTOR_SOURCE(scenario.markerSelector)
        : MARKER_SOURCE(scenario.marker);
      let found = await waitFor(cdp, markerWait, 30000);
      await sleep(700); // settle transitions (S-41: no animation waits)

      // Colour theme: next-themes follows the emulated prefers-color-scheme;
      // record honestly and force the class only as a fallback.
      let themeApplied = "next-themes";
      const darkNow = await evaluate(cdp, `(() => document.documentElement.classList.contains("dark"))()`);
      if (theme === "dark" && !darkNow) {
        await evaluate(cdp, `(() => { document.documentElement.classList.add("dark"); return true; })()`);
        themeApplied = "forced-class";
      } else if (theme === "light" && darkNow) {
        await evaluate(cdp, `(() => { document.documentElement.classList.remove("dark"); return true; })()`);
        themeApplied = "forced-class";
      }

      // Reach tabs / menus / dialogs / sheets listed in `open`.
      if (scenario.open) {
        for (const step of scenario.open) {
          await evaluate(cdp, CLICK_SOURCE(step));
          await sleep(500);
        }
        if (!found) found = await waitFor(cdp, markerWait, 8000);
        await sleep(400);
      }
      if (!found) found = await waitFor(cdp, markerWait, 8000);
      return { ok: true, found, themeApplied };
    };

    for (const scenario of ACTIVE_SCENARIOS) {
      const row = { id: scenario.id, route: scenario.path, mode: scenario.mode || "normal", cells: {} };
      for (const width of WIDTHS) {
        await releaseHeld();
        const touch = TOUCH_WIDTHS.includes(width);
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width,
          height: VIEWPORT_HEIGHT,
          deviceScaleFactor: 1,
          mobile: touch,
          ...(touch ? { screenWidth: width, screenHeight: VIEWPORT_HEIGHT } : {}),
        });
        await cdp.send("Emulation.setTouchEmulationEnabled", {
          enabled: touch,
          maxTouchPoints: touch ? 5 : 1,
        });

        for (const theme of THEMES) {
          fixtureMode = scenario.mode || "normal";
          roleOverride = scenario.role || null;
          await cdp.send("Emulation.setEmulatedMedia", {
            features: [
              { name: "prefers-color-scheme", value: theme },
              { name: "prefers-reduced-motion", value: "no-preference" },
            ],
          });

          const cellKey = `${width}/${theme}`;
          const nav = await navigateAndSettle(scenario, width, theme);
          if (nav === false) {
            row.cells[cellKey] = { status: "NOT VERIFIED", detail: "navigation failed" };
            continue;
          }

          let pointerCoarse = null;
          if (touch) {
            pointerCoarse = await evaluate(cdp, `(() => window.matchMedia("(pointer: coarse)").matches)()`);
            touchTotals.pointerAssertions.push({ scenario: scenario.id, width, coarse: pointerCoarse });
          }

          const measurement = await evaluate(cdp, MEASURE_SOURCE(width));

          // ---- Overflow / truncation status ----
          let status;
          let detail = "";
          if (!nav.found) {
            status = "REDIRECTED/BLANK";
            const bodyText = (await evaluate(cdp, `(() => (document.body ? document.body.innerText.slice(0, 160) : ""))()`)) || "";
            detail = `content marker not found, landed on ${measurement.pathname}; body: ${JSON.stringify(bodyText.slice(0, 120))}`;
          } else if (measurement.scrollWidth <= measurement.innerWidth + 1 && !measurement.viewportExpanded) {
            if (measurement.truncatedAmounts.length === 0) {
              status = "PASS";
            } else {
              status = "FAIL";
              detail = measurement.truncatedAmounts
                .map((t) => `truncated amount <${t.tag.toLowerCase()} class="${t.cls}"> "${t.text}"`)
                .join("; ");
            }
          } else {
            status = "FAIL";
            const overflowDetail = measurement.overflowing.length > 0
              ? measurement.overflowing.map((o) => `<${o.tag.toLowerCase()} class="${o.cls}"> right=${o.right}`).join("; ")
              : "no outermost offender found";
            detail = measurement.viewportExpanded
              ? `content wider than ${width}px: layout viewport expanded to ${measurement.innerWidth}; ${overflowDetail}`
              : `scrollWidth ${measurement.scrollWidth} > innerWidth ${measurement.innerWidth}; ${overflowDetail}`;
            if (measurement.widest) {
              detail += `; widest: <${measurement.widest.tag.toLowerCase()} class="${measurement.widest.cls}"> w=${measurement.widest.width} "${measurement.widest.text}"`;
            }
            if (measurement.truncatedAmounts.length > 0) {
              detail += `; truncated: ${measurement.truncatedAmounts.map((t) => `"${t.text}"`).join(", ")}`;
            }
          }

          // ---- Touch-target hit test (touch widths only) ----
          let hit = null;
          if (touch) {
            // A dialog/sheet slides in; let it fully settle so the hit test
            // measures the resting geometry, not a mid-transition frame.
            if (scenario.dialog) await sleep(400);
            hit = await evaluate(cdp, HITTEST_SOURCE);
            if (hit && hit.enforced) {
              touchTotals.controlsChecked += hit.checked;
              touchTotals.controlsFailing += hit.totalFailures;
              if (hit.totalFailures > 0) {
                touchTotals.cellsWithFailures += 1;
                if (status === "PASS") status = "FAIL";
                detail = (detail ? detail + "; " : "") +
                  `${hit.totalFailures} touch target(s) < 44x44: ` +
                  hit.failures.slice(0, 4)
                    .map((f) => `<${f.tag.toLowerCase()}${f.role ? `[${f.role}]` : ""} ${Math.round(f.w)}x${Math.round(f.h)} "${f.label}"> misses ${f.misses.length}/5`)
                    .join(", ");
              }
            }
          }

          // ---- Screenshot (390 + 1440 both themes for the owner, plus any FAIL) ----
          let shotFile = null;
          const wantShot = (width === 390 || width === 1440) || status !== "PASS";
          if (wantShot) {
            try {
              const shot = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 60 });
              const name = `${scenario.id}-${width}-${theme}.jpg`;
              shotFile = path.join(shotsDir, name);
              fs.writeFileSync(shotFile, Buffer.from(shot.data, "base64"));
              if (reviewDir && (width === 390 || width === 1440)) {
                fs.writeFileSync(path.join(reviewDir, name), Buffer.from(shot.data, "base64"));
              }
            } catch {
              shotFile = null;
            }
          }

          row.cells[cellKey] = {
            status,
            detail,
            theme,
            themeApplied: nav.themeApplied,
            pointerCoarse,
            innerWidth: measurement.innerWidth,
            scrollWidth: measurement.scrollWidth,
            truncatedAmounts: measurement.truncatedAmounts,
            overflowing: measurement.overflowing,
            widest: measurement.widest,
            touch: hit,
            pathname: measurement.pathname,
            screenshot: shotFile,
          };
        }
      }
      results.push(row);
    }

    // ---- Section 4: keyboard, focus, dialog trap/Escape/return, motion ----
    await releaseHeld();
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false, maxTouchPoints: 1 });
    for (const scenario of ACTIVE_SCENARIOS.filter((s) => s.focus || s.dialog)) {
      for (const width of [1440, 390]) {
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: width < 768,
        });
        await cdp.send("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-color-scheme", value: "light" },
            { name: "prefers-reduced-motion", value: "no-preference" },
          ],
        });
        fixtureMode = scenario.mode || "normal";
        roleOverride = scenario.role || null;
        const nav = await navigateAndSettle(scenario, width, "light");
        if (nav === false || !nav.found) continue;

        if (scenario.focus) {
          const steps = [];
          for (let i = 0; i < 14; i++) steps.push(await tabOnce(cdp));
          focusFindings.push({ scenario: scenario.id, kind: "tab-order", width, steps });
        }

        if (scenario.dialog) {
          const present = await evaluate(cdp, DIALOG_PRESENT_SOURCE);
          const trapSteps = [];
          for (let i = 0; i < 12; i++) trapSteps.push(await tabOnce(cdp));
          const allInside = trapSteps.every((s) => s && s.insideDialog);
          const anyOutside = trapSteps.find((s) => s && !s.insideDialog);
          // Deterministic Escape: focus inside the dialog, then press it.
          await evaluate(cdp, FOCUS_FIRST_IN_DIALOG_SOURCE);
          await sleep(80);
          await pressEscape(cdp);
          let afterEscape = await evaluate(cdp, DIALOG_PRESENT_SOURCE);
          let escapeOn = 1;
          if (afterEscape.present) {
            // A nested popup (combobox etc.) may swallow the first Escape —
            // focus the surface again and retry once, recording which press
            // actually closed it (a defect only if NEITHER does).
            await evaluate(cdp, FOCUS_FIRST_IN_DIALOG_SOURCE);
            await sleep(80);
            await pressEscape(cdp);
            afterEscape = await evaluate(cdp, DIALOG_PRESENT_SOURCE);
            escapeOn = afterEscape.present ? "none" : 2;
          }
          const focusAfter = await evaluate(cdp, FOCUS_SOURCE);
          focusFindings.push({
            scenario: scenario.id, kind: "dialog", width,
            opened: present.present,
            trapHeld: allInside,
            trapEscapee: anyOutside ? { tag: anyOutside.tag, name: anyOutside.name, cls: anyOutside.cls } : null,
            escapeClosed: !afterEscape.present,
            escapeOn,
            focusAfterEscape: focusAfter,
          });
        }
      }
    }

    // Reduced motion: prove the `.entry-reveal` rule resolves to `none` under
    // `prefers-reduced-motion: reduce` (and animates otherwise) in the browser.
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: VIEWPORT_HEIGHT, deviceScaleFactor: 1, mobile: false });
    fixtureMode = "normal";
    roleOverride = null;
    await navigateAndSettle({ path: "/b/b1", marker: "Top outstanding balances" }, 1440, "light");
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: "light" },
        { name: "prefers-reduced-motion", value: "reduce" },
      ],
    });
    await sleep(200);
    const underReduce = await evaluate(cdp, MOTION_SOURCE);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-color-scheme", value: "light" },
        { name: "prefers-reduced-motion", value: "no-preference" },
      ],
    });
    await sleep(200);
    const underNormal = await evaluate(cdp, MOTION_SOURCE);
    motionFindings.push({ underReduce, underNormal });

    // ---- Report ----------------------------------------------------------
    const widthsHeader = WIDTHS.map((w) => `${w} px${TOUCH_WIDTHS.includes(w) ? " (touch)" : ""}`).join(" | ");
    const divider = ["---", ...WIDTHS.map(() => "---")].join(" | ");
    const lines = [];
    lines.push(`| Route/state | ${widthsHeader} |`);
    lines.push(`| ${divider} |`);
    for (const row of results) {
      const cells = WIDTHS.map((w) => {
        // Aggregate the themes: PASS only if every audited theme passes.
        const parts = THEMES.map((t) => row.cells[`${w}/${t}`]).filter(Boolean);
        if (parts.length === 0) return "NOT VERIFIED";
        const failing = parts.filter((p) => p.status !== "PASS");
        if (failing.length === 0) return "PASS";
        const worst = failing[0];
        return `${worst.status} (${worst.detail.slice(0, 90)})`;
      });
      lines.push(`| \`${row.id}\` (${row.mode}) | ${cells.join(" | ")} |`);
    }

    console.log("");
    console.log("=== L-14 RESPONSIVE + TOUCH + FOCUS AUDIT — EVIDENCE TABLE ===");
    console.log("");
    console.log(lines.join("\n"));
    console.log("");

    // Touch summary.
    const coarseResults = touchTotals.pointerAssertions;
    const coarseTrue = coarseResults.filter((r) => r.coarse).length;
    console.log("--- TOUCH-TARGET SUMMARY (44x44, measured via elementFromPoint) ---");
    console.log(`Pointer coarse asserted: ${coarseTrue}/${coarseResults.length} touch-width cells (360/390).`);
    if (coarseTrue < coarseResults.length) {
      console.log("  WARNING: pointer was NOT coarse somewhere — those cells' touch numbers are meaningless.");
    }
    console.log(`Controls checked: ${touchTotals.controlsChecked}; failing (< 44x44 hit area): ${touchTotals.controlsFailing}; cells with failures: ${touchTotals.cellsWithFailures}`);
    for (const row of results) {
      for (const key of Object.keys(row.cells)) {
        const cell = row.cells[key];
        if (cell.touch && cell.touch.enforced && cell.touch.totalFailures > 0) {
          console.log(`  - ${row.id} @ ${key}:`);
          for (const f of cell.touch.failures.slice(0, 8)) {
            console.log(`      <${f.tag.toLowerCase()}${f.role ? `[${f.role}]` : ""} ${f.w}x${f.h} "${f.label}"> misses ${f.misses.map((m) => `${m.x},${m.y}→${m.hit}`).join(" ")}`);
          }
        }
      }
    }
    console.log("");

    // Focus / dialog summary.
    console.log("--- SECTION 4: KEYBOARD, FOCUS, DIALOG TRAP, REDUCED MOTION ---");
    for (const f of focusFindings) {
      if (f.kind === "tab-order") {
        const noRing = f.steps.filter((s) => s && s.focusRing === false && s.tag !== "BODY" && s.tag !== "NONE");
        console.log(`  [tab-order] ${f.scenario} @ ${f.width}px: ${f.steps.length} stops; ${noRing.length} without a visible focus ring.`);
        for (const s of noRing.slice(0, 6)) console.log(`      no ring: <${s.tag.toLowerCase()}${s.role ? `[${s.role}]` : ""} "${s.name}"${s.id ? ` #${s.id}` : ""}${s.type ? ` type=${s.type}` : ""}> outline=${s.outline} shadow=${s.boxShadow} active=${s.isActive} :focus=${s.focusMatched} :focus-visible=${s.focusVisible} ringVar=${JSON.stringify(s.ringVar)}`);
        console.log(`      order: ${f.steps.map((s) => `${s.tag.toLowerCase()}:"${s.name}"${s.focusRing ? "" : "(!)"}`).join(" → ")}`);
      } else {
        console.log(`  [dialog]    ${f.scenario} @ ${f.width}px: opened=${f.opened} trapHeld=${f.trapHeld} escapeClosed=${f.escapeClosed} (escape#${f.escapeOn}) focusAfterEscape=<${(f.focusAfterEscape && f.focusAfterEscape.tag || "").toLowerCase()} "${(f.focusAfterEscape && f.focusAfterEscape.name) || ""}">`);
        if (f.trapEscapee) console.log(`      focus escaped the dialog onto: <${f.trapEscapee.tag.toLowerCase()} "${f.trapEscapee.name}">`);
      }
    }
    const m = motionFindings[0];
    if (m) {
      const ok = m.underReduce && m.underReduce.animationName === "none" && m.underNormal && m.underNormal.animationName !== "none";
      console.log(`  [motion]    .entry-reveal under reduce: animation-name=${m.underReduce && m.underReduce.animationName} (reduced=${m.underReduce && m.underReduce.reduced}); under no-preference: animation-name=${m.underNormal && m.underNormal.animationName} → ${ok ? "PASS" : "CHECK"}`);
    }
    console.log("");

    const unmatched = [...unmatchedRequests].sort();
    if (unmatched.length > 0) {
      console.log("Unmatched supabase requests (each was served an empty [] or {} fixture):");
      for (const entry of unmatched) console.log(`  - ${entry}`);
    } else {
      console.log("Unmatched supabase requests: none — every REST call was fixture-matched.");
    }
    console.log(`Intercepted supabase requests this run: ${interceptionCount}`);
    const errors = [...new Set(pageErrors)];
    if (errors.length > 0) {
      console.log("Page errors seen:");
      for (const entry of errors.slice(0, 20)) console.log(`  - ${entry}`);
    }
    console.log("");

    const reportPath = path.join(outDir, "report.json");
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          widths: WIDTHS,
          themes: THEMES,
          touchWidths: TOUCH_WIDTHS,
          height: VIEWPORT_HEIGHT,
          results,
          touchTotals,
          focusFindings,
          motionFindings,
          unmatchedRequests: unmatched,
          interceptionCount,
          interceptionLog,
          pageErrors: [...new Set(pageErrors)].slice(0, 40),
        },
        null,
        2,
      ),
    );
    console.log(`JSON report:  ${reportPath}`);
    console.log(`Screenshots:  ${shotsDir}${reviewDir ? `  (390/1440 review copies: ${reviewDir})` : ""}`);
    console.log("");
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`FATAL: ${err && err.message ? err.message : err}`);
    process.exit(1);
  });
