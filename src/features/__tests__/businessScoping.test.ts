import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listCustomers,
  getCustomer,
  createCustomer,
} from "@/features/customers/api";
import {
  createTransaction,
  getAllCustomerBalances,
  getCustomerBalance,
  getCustomerLedger,
  getDashboardSummary,
  queryTransactions,
  restoreTransaction,
  transactionRollup,
  updateTransaction,
  voidTransaction,
} from "@/features/transactions/api";
import {
  getActivityFeed,
  getDailyActivity,
} from "@/features/dashboard/api";
import {
  getImportCustomers,
  importHistory,
} from "@/features/import-export/api";

interface Call {
  method: string;
  args: unknown[];
}

const state = vi.hoisted(() => ({
  chains: [] as Call[][],
  resolveValue: null as unknown,
  // S-33: successive resolves for multi-query api functions (the
  // ledger read followed by its profiles lookup).
  resolveQueue: [] as unknown[],
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  // S-31: override for the customer_ledger RPC's rows (null = the
  // dashboard_summary shape the dashboard tests assert on).
  rpcValue: null as unknown,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return {
        data:
          state.rpcValue ?? {
            total_receivable: 500,
            total_credit: 0,
            open_accounts: 1,
            today_count: 1,
            today_net: 500,
            customer_count: 1,
            top_debtors: [],
          },
        error: null,
      };
    }),
    from: vi.fn((table: string) => {
      const calls: Call[] = [];
      // S-33: record which table each chain touches so the profiles
      // lookup can be asserted.
      calls.push({ method: "from", args: [table] });
      state.chains.push(calls);
      const chain = {
        select: (...args: unknown[]) => {
          calls.push({ method: "select", args });
          return chain;
        },
        eq: (...args: unknown[]) => {
          calls.push({ method: "eq", args });
          return chain;
        },
        // S-33 chain method (the scoping assertions below are unchanged).
        in: (...args: unknown[]) => {
          calls.push({ method: "in", args });
          return chain;
        },
        // S-34 chain method: the voided-row guard on edits.
        neq: (...args: unknown[]) => {
          calls.push({ method: "neq", args });
          return chain;
        },
        // S-30 chain methods (the scoping assertions below are unchanged).
        is: (...args: unknown[]) => {
          calls.push({ method: "is", args });
          return chain;
        },
        not: (...args: unknown[]) => {
          calls.push({ method: "not", args });
          return chain;
        },
        order: (...args: unknown[]) => {
          calls.push({ method: "order", args });
          return chain;
        },
        // S-35 chain methods: the detailed list's half-open date
        // window, its text search and server-side paging.
        gte: (...args: unknown[]) => {
          calls.push({ method: "gte", args });
          return chain;
        },
        lt: (...args: unknown[]) => {
          calls.push({ method: "lt", args });
          return chain;
        },
        or: (...args: unknown[]) => {
          calls.push({ method: "or", args });
          return chain;
        },
        range: (...args: unknown[]) => {
          calls.push({ method: "range", args });
          return chain;
        },
        // S-37 chain method: the activity feed's "last 10" cap.
        limit: (...args: unknown[]) => {
          calls.push({ method: "limit", args });
          return chain;
        },
        insert: (...args: unknown[]) => {
          calls.push({ method: "insert", args });
          return chain;
        },
        update: (...args: unknown[]) => {
          calls.push({ method: "update", args });
          return chain;
        },
        single: async () => {
          calls.push({ method: "single", args: [] });
          return { data: state.resolveValue, error: null };
        },
        maybeSingle: async () => {
          calls.push({ method: "maybeSingle", args: [] });
          return { data: state.resolveValue, error: null };
        },
        // Awaitable chain: `await from(...).select(...)` resolves like a
        // PostgREST builder (used by the balance-view reads and the S-33
        // two-step ledger read).
        then: (
          onFulfilled?: (value: { data: unknown; error: null }) => unknown,
        ) =>
          Promise.resolve({
            data:
              state.resolveQueue.length > 0
                ? state.resolveQueue.shift()
                : state.resolveValue,
            error: null,
          }).then(onFulfilled),
      };
      return chain;
    }),
  },
}));

describe("business scoping (required — S-20)", () => {
  beforeEach(() => {
    state.chains.length = 0;
    state.rpcCalls.length = 0;
    state.resolveValue = null;
    state.resolveQueue.length = 0;
    state.rpcValue = null;
  });

  it("scopes listCustomers by businessId", async () => {
    await listCustomers("b1");
    const calls = state.chains[0]!;
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
  });

  it("always filters by business_id — omitting businessId is a TypeScript error", async () => {
    // @ts-expect-error S-20: businessId is required; this directive fails
    // typecheck if the parameter ever becomes optional again.
    await listCustomers();
    const calls = state.chains[0]!;
    // No unscoped fallback exists: the filter is unconditional.
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", undefined] });
    expect(calls.some((c) => c.method === "eq" && c.args[0] === "business_id")).toBe(
      true,
    );
  });

  it("scopes getCustomer by businessId", async () => {
    state.resolveValue = { id: "c1" };
    await getCustomer("c1", "b1");
    const eqCalls = state.chains[0]!.filter((c) => c.method === "eq");
    expect(eqCalls).toEqual([
      { method: "eq", args: ["id", "c1"] },
      { method: "eq", args: ["business_id", "b1"] },
    ]);
  });

  it("stores business_id and created_by on createCustomer", async () => {
    await createCustomer({ name: "Asha" }, "b1");
    const insert = state.chains[0]!.find((c) => c.method === "insert")!;
    expect(insert.args[0]).toMatchObject({
      name: "Asha",
      business_id: "b1",
      created_by: "user-1",
    });
  });

  it("stores business_id verbatim — there is no null fallback (S-20)", async () => {
    // @ts-expect-error S-20: businessId is required; this directive fails
    // typecheck if the parameter ever becomes optional again.
    await createCustomer({ name: "Asha" });
    const insert = state.chains[0]!.find((c) => c.method === "insert")!;
    expect(insert.args[0]).toMatchObject({ business_id: undefined });
    expect(insert.args[0]).not.toHaveProperty("business_id", null);
  });

  it("stores business_id on createTransaction", async () => {
    await createTransaction(
      {
        customer_id: "c1",
        type: "charge",
        amount: 100,
        occurred_at: "2026-01-01T00:00:00.000Z",
      },
      "b1",
    );
    const insert = state.chains[0]!.find((c) => c.method === "insert")!;
    // S-32's provenance scenario: manual source, me as creator, the
    // business that scopes it.
    expect(insert.args[0]).toMatchObject({
      business_id: "b1",
      created_by: "user-1",
      source: "manual",
    });
  });

  it("updateTransaction stamps the editor and never carries provenance fields (S-33)", async () => {
    state.resolveValue = { id: "t1" };

    await updateTransaction("t1", { amount: 450 }, "b1");

    const calls = state.chains[0]!;
    const update = calls.find((c) => c.method === "update")!;
    // Audit marker: status flips to edited, who and when are stamped.
    expect(update.args[0]).toMatchObject({
      amount: 450,
      status: "edited",
      updated_by: "user-1",
    });
    // An imported row keeps its provenance: these keys are not in the
    // payload at all, so an edit can never rewrite them.
    expect(update.args[0]).not.toHaveProperty("source");
    expect(update.args[0]).not.toHaveProperty("created_by");
    expect(update.args[0]).not.toHaveProperty("customer_id");
    // Still business-scoped like every write.
    expect(calls).toContainEqual({ method: "eq", args: ["id", "t1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
    // S-34 hardening: a voided row can only come back through restore.
    expect(calls).toContainEqual({ method: "neq", args: ["status", "voided"] });
  });

  it("resolves the ledger's editor names in one profiles lookup (S-31)", async () => {
    // customer_ledger RPC first, profiles lookup second.
    state.rpcValue = [
      { id: "t1", updated_by: "u-eli", status: "active" },
      { id: "t2", updated_by: "u-gone", status: "edited" },
      { id: "t3", updated_by: null, status: "active" },
      { id: "t4", updated_by: "u-eli", status: "voided" },
    ];
    state.resolveQueue = [
      [{ id: "u-eli", full_name: "Eli", email: "eli@example.com" }],
    ];

    const rows = await getCustomerLedger("c1", "b1");

    // The ledger read is scoped to this customer AND this business.
    expect(state.rpcCalls).toEqual([
      {
        fn: "customer_ledger",
        args: { p_customer_id: "c1", p_business_id: "b1" },
      },
    ]);
    // Voided rows stay on the ledger (S-34).
    expect(rows.some((row) => row.status === "voided")).toBe(true);
    // One profiles query for the distinct editors (excluding the null
    // of a never-edited row).
    expect(state.chains[0]![0]).toEqual({ method: "from", args: ["profiles"] });
    expect(state.chains[0]).toContainEqual({
      method: "in",
      args: ["id", ["u-eli", "u-gone"]],
    });
    // The readable editor resolves by name; an unreadable one (left the
    // business) falls back to null → "Former member" in the badge.
    expect(rows.map((row) => row.updated_by_name)).toEqual([
      "Eli",
      null,
      null,
      "Eli",
    ]);
  });

  it("voidTransaction stamps the voider and the reason, never updated_by (S-34)", async () => {
    state.resolveValue = { id: "t1" };

    await voidTransaction("t1", "Duplicate entry", "b1");

    const calls = state.chains[0]!;
    const update = calls.find((c) => c.method === "update")!;
    expect(update.args[0]).toMatchObject({
      status: "voided",
      void_reason: "Duplicate entry",
      voided_by: "user-1",
    });
    // The restore marker: updated_by still means "content-edited at
    // least once", so voiding must never touch it.
    expect(update.args[0]).not.toHaveProperty("updated_by");
    expect(calls).toContainEqual({ method: "eq", args: ["id", "t1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
  });

  it("restoreTransaction defers the restored status to the row (S-34)", async () => {
    await restoreTransaction("t1", "b1");

    // "Edited if it had been edited before, otherwise active" is the
    // row's to decide — the security-invoker RPC decides it.
    expect(state.rpcCalls).toEqual([
      {
        fn: "restore_transaction",
        args: { p_transaction_id: "t1", p_business_id: "b1" },
      },
    ]);
  });

  it("queryTransactions is scoped, excludes archived customers and voided rows, and pages server-side (S-35)", async () => {
    // The transactions chain resolves first, the profiles lookup second.
    state.resolveQueue = [
      [
        {
          id: "t1",
          business_id: "b1",
          customer_id: "c9",
          type: "charge",
          amount: 5000,
          status: "active",
          occurred_at: "2026-10-12T10:00:00+00:00",
          note: null,
          source: "manual",
          created_by: "u1",
          created_at: "2026-10-12T10:00:00+00:00",
          updated_at: "2026-10-12T10:00:00+00:00",
          updated_by: null,
          customer: { id: "c9", name: "Asha Verma", phone: "01711 111111" },
        },
      ],
      [{ id: "u1", full_name: "Eli Hassan", email: "eli@example.com" }],
    ];

    const result = await queryTransactions("b1", {
      range: {
        start: "2026-10-01T00:00:00.000Z",
        end: "2026-11-01T00:00:00.000Z",
      },
      type: "charge",
      customerId: "c9",
      search: "asha",
      includeVoided: false,
      page: 2,
      pageSize: 25,
    });

    const calls = state.chains[0]!;
    expect(calls[0]).toEqual({ method: "from", args: ["transactions"] });
    expect(calls).toContainEqual({
      method: "eq",
      args: ["business_id", "b1"],
    });
    // The archived-customer exclusion rides the inner join (the scenario
    // "Archived customers": their money leaves this page entirely).
    expect(calls).toContainEqual({
      method: "select",
      args: ["*, customer:customers!inner(id, name, phone)", { count: "exact" }],
    });
    expect(calls).toContainEqual({
      method: "is",
      args: ["customers.archived_at", null],
    });
    // Voided rows stay out unless explicitly included.
    expect(calls).toContainEqual({ method: "neq", args: ["status", "voided"] });
    expect(calls).toContainEqual({ method: "eq", args: ["type", "charge"] });
    expect(calls).toContainEqual({ method: "eq", args: ["customer_id", "c9"] });
    // The half-open date window [start, end).
    expect(calls).toContainEqual({
      method: "gte",
      args: ["occurred_at", "2026-10-01T00:00:00.000Z"],
    });
    expect(calls).toContainEqual({
      method: "lt",
      args: ["occurred_at", "2026-11-01T00:00:00.000Z"],
    });
    // One OR across the customer columns and the note, filtered through
    // the !inner join.
    expect(calls.find((c) => c.method === "or")).toEqual({
      method: "or",
      args: [
        "customers.name.ilike.%asha%,customers.phone.ilike.%asha%,note.ilike.%asha%",
      ],
    });
    // Paged server-side: page 2 of 25 → rows 25..49.
    expect(calls).toContainEqual({ method: "range", args: [25, 49] });

    // "Recorded by" resolves through one profiles lookup (the S-25
    // "Former member" fallback covers the missing side).
    expect(state.chains[1]![0]).toEqual({ method: "from", args: ["profiles"] });
    expect(state.chains[1]).toContainEqual({
      method: "in",
      args: ["id", ["u1"]],
    });
    expect(result.rows[0]).toMatchObject({
      created_by_name: "Eli Hassan",
      updated_by_name: null,
    });
    expect(result.rows[0]!.customer.name).toBe("Asha Verma");
  });

  it("transaction_rollup carries the business scope, filter set and browser timezone (S-35)", async () => {
    state.rpcValue = [
      {
        period_start: "2026-10-12T00:00:00",
        entries: "2",
        total_charged: "5000",
        total_paid: "500",
        net: "4500",
      },
    ];

    const rows = await transactionRollup("b1", {
      range: {
        start: "2026-10-01T00:00:00.000Z",
        end: "2026-11-01T00:00:00.000Z",
      },
      type: "charge",
      customerId: "c1",
      search: "sha",
      includeVoided: false,
      granularity: "day",
    });

    // Everything the SQL needs travels in one RPC call; the scope is
    // mandatory and the caller's timezone decides the period cuts.
    expect(state.rpcCalls).toEqual([
      {
        fn: "transaction_rollup",
        args: {
          p_business_id: "b1",
          p_from: "2026-10-01T00:00:00.000Z",
          p_to: "2026-11-01T00:00:00.000Z",
          p_type: "charge",
          p_customer_id: "c1",
          p_search: "sha",
          p_include_voided: false,
          p_granularity: "day",
          p_timezone: expect.any(String),
        },
      },
    ]);
    // NUMERIC/ BIGINT columns come back numeric — no strings leak into
    // the table or the totals footer.
    expect(rows).toEqual([
      {
        period_start: "2026-10-12T00:00:00",
        entries: 2,
        total_charged: 5000,
        total_paid: 500,
        net: 4500,
      },
    ]);
  });

  it("dashboard totals come from dashboard_summary(businessId)", async () => {
    await getDashboardSummary("b1");
    expect(state.rpcCalls).toEqual([
      { fn: "dashboard_summary", args: { p_business_id: "b1" } },
    ]);
  });

  it("unwraps dashboard_summary's set-of response (one-row array)", async () => {
    // The SQL function is declared `returns table (...)`, so real
    // PostgREST responds with an ARRAY of one row — the parser must
    // not read properties off the array (they'd all fall back to 0).
    state.rpcValue = [
      {
        total_receivable: 900,
        total_credit: 100,
        open_accounts: 2,
        today_count: 3,
        today_net: 300,
        customer_count: 7,
        top_debtors: [{ id: "c9", name: "Top Debtor", balance: 900 }],
      },
    ];

    const summary = await getDashboardSummary("b1");

    expect(summary).toEqual({
      total_receivable: 900,
      total_credit: 100,
      open_accounts: 2,
      today_count: 3,
      today_net: 300,
      customer_count: 7,
      top_debtors: [{ id: "c9", name: "Top Debtor", balance: 900 }],
    });
  });

  it("reads getDailyActivity from the scoped daily_activity RPC (S-37)", async () => {
    state.rpcValue = [];

    await getDailyActivity("b1", 30);

    expect(state.rpcCalls).toEqual([
      {
        fn: "daily_activity",
        args: {
          p_business_id: "b1",
          p_days: 30,
          p_timezone: expect.any(String),
        },
      },
    ]);
  });

  it("reads getActivityFeed from the scoped transactions table (S-37)", async () => {
    state.resolveValue = [];

    const feed = await getActivityFeed("b1");

    expect(feed).toEqual([]);
    const calls = state.chains[0]!;
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
    expect(calls).toContainEqual({
      method: "is",
      args: ["customers.archived_at", null],
    });
    expect(calls).toContainEqual({ method: "neq", args: ["status", "voided"] });
    expect(calls).toContainEqual({ method: "limit", args: [10] });
    // The feed is a plain read — no unscoped RPC anywhere near it.
    expect(state.rpcCalls).toEqual([]);
  });

  it("reads getCustomerBalance from the scoped customer_balances view (S-20)", async () => {
    state.resolveValue = { id: "c1", business_id: "b1", balance: 250 };

    const balance = await getCustomerBalance("c1", "b1");

    expect(balance).toBe(250);
    const calls = state.chains[0]!;
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
    // The view exposes the customers PK under its real name (`id`) so
    // PostgREST can infer the customers ↔ customer_balances embed.
    expect(calls).toContainEqual({ method: "eq", args: ["id", "c1"] });
    // The unscoped v1 RPCs are gone for good (DEV-8 resolved).
    expect(state.rpcCalls).toEqual([]);
  });

  it("reads getAllCustomerBalances from the same scoped view (S-20)", async () => {
    state.resolveValue = [
      { id: "c1", business_id: "b1", balance: 100 },
      { id: "c2", business_id: "b1", balance: -40 },
    ];

    const balances = await getAllCustomerBalances("b1");

    expect(balances).toEqual({ c1: 100, c2: -40 });
    const calls = state.chains[0]!;
    expect(calls).toContainEqual({ method: "select", args: ["id, balance"] });
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
    expect(state.rpcCalls).toEqual([]);
  });

  it("reads getImportCustomers from the scoped customers table (S-38)", async () => {
    state.resolveValue = [];

    await getImportCustomers("b1");

    const calls = state.chains[0]!;
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
    // Deleted rows are gone for good; archived rows stay IN the read so
    // the preview can report their matches as errors.
    expect(calls).toContainEqual({ method: "is", args: ["deleted_at", null] });
    expect(state.rpcCalls).toEqual([]);
  });

  it("commits the import through the scoped import_history RPC (S-38)", async () => {
    state.rpcValue = { customers_created: 1, transactions_created: 2 };

    const plan = {
      customers: [{ name: "Newcomer", phone: "018" }],
      transactions: [
        {
          customer_name: "Newcomer",
          customer_phone: "018",
          type: "charge" as const,
          amount: 500,
          occurred_at: "2024-01-15T00:00:00.000Z",
          note: "",
        },
      ],
    };

    const result = await importHistory("b1", plan);

    expect(state.rpcCalls).toEqual([
      {
        fn: "import_history",
        args: {
          p_business_id: "b1",
          p_customers: plan.customers,
          p_transactions: plan.transactions,
        },
      },
    ]);
    // BIGINT columns come back numeric — the Done step counts, not
    // strings.
    expect(result).toEqual({ customers_created: 1, transactions_created: 2 });
  });
});
