#!/usr/bin/env node
/**
 * S-41 responsive audit — real-browser layout evidence.
 * ==========================================================
 * Loads the REAL app in headless Chrome over the REAL Vite dev server and
 * measures, per route × viewport width:
 *   - no horizontal page scroll  (documentElement.scrollWidth <= innerWidth + 1)
 *   - no truncated amount        (₹-amount elements clipped by overflow-x)
 *   - a per-route content marker is present (catches redirects/error pages)
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
 * OUTPUT: a markdown evidence table + an unmatched-request list on stdout,
 * plus a full JSON report and 360px/FAIL screenshots under a temp dir
 * (never inside the repository).
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
// AUDIT_ROUTES="/businesses" AUDIT_WIDTHS=360 narrows the matrix.
const WIDTHS = [360, 768, 1024, 1440];
if (process.env.AUDIT_WIDTHS) {
  WIDTHS.length = 0;
  WIDTHS.push(...process.env.AUDIT_WIDTHS.split(",").map((w) => Number(w.trim())));
}
const VIEWPORT_HEIGHT = 900;
const ROOT = path.resolve(__dirname, "..");

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

/**
 * Every audited route with an honest content marker (unique text that only
 * renders when the page itself — not an error or redirect — is on screen).
 */
const ROUTES = [
  { path: "/__ui", marker: "UI Gallery" },  { path: "/businesses", marker: "Businesses you own and share with you." },
  { path: "/onboarding/business", marker: "Create your business" },
  { path: "/b/b1", marker: "Top outstanding balances" },
  { path: "/b/b1/customers", marker: "Everyone in this business" },
  { path: "/b/b1/customers/c1", marker: "Current Balance" },
  { path: "/b/b1/customers/import", marker: "Download template" },
  { path: "/b/b1/customers/c1/statement", marker: "Statement for" },
  { path: "/b/b1/transactions", marker: "Every entry across customers" },
  { path: "/b/b1/transactions/t1", marker: "Transaction Detail" },
  { path: "/b/b1/members", marker: "Who can see and change this business's data." },
  { path: "/b/b1/settings", marker: "Backup" },
  // /login goes last on purpose: a seeded session on /login redirects away,
  // so the key is cleared right before this navigation.
  { path: "/login", marker: "Continue with Google", noSession: true },
];

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
    switch (rpc) {
      case "dashboard_summary":
        return jsonResult(DASHBOARD_SUMMARY);
      case "customer_ledger":
        return jsonResult(LEDGER_C1);
      case "daily_activity":
        return jsonResult(DAILY_ACTIVITY);
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
      if (select.includes("business:businesses")) {
        return jsonResult(MEMBERSHIP_ROWS);
      }
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
      outside.push({ el, tag: el.tagName, cls: String(el.className || "").slice(0, 160), right: Math.round(rect.right), left: Math.round(rect.left), text: (el.textContent || "").trim().slice(0, 60) });
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
  };
})()`;

const MARKER_SOURCE = (marker) =>
  `(() => ({ found: !!(document.body && document.body.innerText.indexOf(${JSON.stringify(marker)}) !== -1) }))()`;

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
    const activeRoutes = process.env.AUDIT_ROUTES
      ? ROUTES.filter((r) =>
          process.env.AUDIT_ROUTES.split(",").includes(r.path),
        )
      : ROUTES;

    for (const route of activeRoutes) {
      const row = { route: route.path, marker: route.marker, widths: {} };
      for (const width of WIDTHS) {
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width,
          height: VIEWPORT_HEIGHT,
          deviceScaleFactor: 1,
          mobile: width === 360,
        });

        if (route.noSession) {
          // A leftover seeded session would bounce /login to "/", so clear
          // it right before this navigation.
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
        await cdp.send("Page.navigate", { url: DEV_ORIGIN + route.path });
        try {
          await loadWait;
        } catch (err) {
          row.widths[width] = {
            status: "NOT VERIFIED",
            detail: `navigation failed: ${err.message}`,
          };
          continue;
        }
        firstLoad = false;

        const markerFound = await waitFor(
          cdp,
          MARKER_SOURCE(route.marker),
          30000,
        );
        // Let transitions/animations settle (S-41: no animation waits).
        await sleep(700);

        const measurement = await evaluate(cdp, MEASURE_SOURCE(width));
        if (process.env.AUDIT_PROBE) {
          const probe = await evaluate(
            cdp,
            `(() => {
              const out = [];
              const limit = ${width};
              for (const el of document.querySelectorAll("*")) {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.right <= limit + 1) continue;
                const cs = getComputedStyle(el);
                if (cs.visibility === "hidden" || cs.display === "none") continue;
                out.push(
                  el.tagName +
                    ' cls="' + String(el.className || "").slice(0, 90) + '"' +
                    " w=" + Math.round(r.width) +
                    " right=" + Math.round(r.right) +
                    " ovf=" + cs.overflowX +
                    " txt=" + (el.textContent || "").trim().slice(0, 30),
                );
                let p = el.parentElement;
                let depth = 0;
                while (p && depth < 4) {
                  const pr = p.getBoundingClientRect();
                  out.push(
                    "  ^ " + p.tagName + ' cls="' + String(p.className || "").slice(0, 90) + '"' +
                      " right=" + Math.round(pr.right) +
                      (p.classList && p.classList.contains("flex-wrap") ? " [WRAPS]" : ""),
                  );
                  p = p.parentElement;
                  depth++;
                }
                if (out.length > 40) break;
              }
              return out.length ? out.join("\\n") : "(no overflowing elements)";
            })()`,
          );
          console.log("--- PROBE overflowing @ " + width + "px / " + route.path + " ---");
          console.log(probe);
          console.log("---");
        }
        const finalMarker = markerFound
          ? true
          : await waitFor(cdp, MARKER_SOURCE(route.marker), 8000);

        const screenshot = async (label) => {
          try {
            const shot = await cdp.send("Page.captureScreenshot", {
              format: "jpeg",
              quality: 60,
            });
            const file = path.join(
              shotsDir,
              `${routeSlug(route.path)}-${width}${label ? `-${label}` : ""}.jpg`,
            );
            fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
            return file;
          } catch {
            return null;
          }
        };

        let status;
        let detail = "";
        if (!finalMarker) {
          status = "REDIRECTED/BLANK";
          let bodyText = "";
          try {
            bodyText = (
              await evaluate(
                cdp,
                `(() => (document.body ? document.body.innerText.slice(0, 200) : ""))()`,
              )
            ) || "";
          } catch {
            /* ignore */
          }
          detail = `content marker not found ("${route.marker.slice(0, 40)}…"), landed on ${measurement.pathname}; body: ${JSON.stringify(bodyText.slice(0, 120))}`;
        } else if (
          measurement.scrollWidth <= measurement.innerWidth + 1 &&
          !measurement.viewportExpanded
        ) {
          if (measurement.truncatedAmounts.length === 0) {
            status = "PASS";
          } else {
            status = "FAIL";
            detail =
              measurement.truncatedAmounts
                .map((t) => `truncated amount <${t.tag.toLowerCase()} class="${t.cls}"> "${t.text}"`)
                .join("; ");
          }
        } else {
          status = "FAIL";
          const overflowDetail =
            measurement.overflowing.length > 0
              ? measurement.overflowing
                  .map((o) => `<${o.tag.toLowerCase()} class="${o.cls}"> right=${o.right}`)
                  .join("; ")
              : "no single offender found";
          detail = measurement.viewportExpanded
            ? `content wider than ${width}px: layout viewport expanded to ${measurement.innerWidth}; ${overflowDetail}`
            : `scrollWidth ${measurement.scrollWidth} > innerWidth ${measurement.innerWidth}; ${overflowDetail}`;
          if (measurement.truncatedAmounts.length > 0) {
            detail += `; truncated: ${measurement.truncatedAmounts.map((t) => `"${t.text}"`).join(", ")}`;
          }
        }

        let shotFile = null;
        if (width === 360 || status !== "PASS") {
          shotFile = await screenshot(
            status === "PASS" ? "" : status.toLowerCase().replace(/[^a-z]+/g, "-"),
          );
        }
        row.widths[width] = {
          status,
          detail,
          innerWidth: measurement.innerWidth,
          scrollWidth: measurement.scrollWidth,
          truncatedAmounts: measurement.truncatedAmounts,
          overflowing: measurement.overflowing,
          pathname: measurement.pathname,
          screenshot: shotFile,
        };
      }
      results.push(row);
    }

    // ---- Report ----------------------------------------------------------
    const widthsHeader = WIDTHS.map((w) => `${w} px`).join(" | ");
    const divider = ["---", ...WIDTHS.map(() => "---")].join(" | ");
    const lines = [];
    lines.push(`| Route | ${widthsHeader} |`);
    lines.push(`| ${divider} |`);
    for (const row of results) {
      const cells = WIDTHS.map((w) => {
        const cell = row.widths[w];
        if (!cell) return "NOT VERIFIED";
        if (cell.status === "PASS") return "PASS";
        if (cell.status === "NOT VERIFIED") return "NOT VERIFIED";
        return `${cell.status} (${cell.detail})`;
      });
      lines.push(`| \`${row.route}\` | ${cells.join(" | ")} |`);
    }

    console.log("");
    console.log("=== S-41 RESPONSIVE AUDIT — EVIDENCE TABLE ===");
    console.log("");
    console.log(lines.join("\n"));
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
          height: VIEWPORT_HEIGHT,
          results,
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
    console.log(`Screenshots:  ${shotsDir}`);
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
