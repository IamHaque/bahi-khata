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
  restoreTransaction,
  updateTransaction,
  voidTransaction,
} from "@/features/transactions/api";

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

  it("dashboard totals come from dashboard_summary(businessId)", async () => {
    await getDashboardSummary("b1");
    expect(state.rpcCalls).toEqual([
      { fn: "dashboard_summary", args: { p_business_id: "b1" } },
    ]);
  });

  it("reads getCustomerBalance from the scoped customer_balances view (S-20)", async () => {
    state.resolveValue = { customer_id: "c1", business_id: "b1", balance: 250 };

    const balance = await getCustomerBalance("c1", "b1");

    expect(balance).toBe(250);
    const calls = state.chains[0]!;
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
    expect(calls).toContainEqual({ method: "eq", args: ["customer_id", "c1"] });
    // The unscoped v1 RPCs are gone for good (DEV-8 resolved).
    expect(state.rpcCalls).toEqual([]);
  });

  it("reads getAllCustomerBalances from the same scoped view (S-20)", async () => {
    state.resolveValue = [
      { customer_id: "c1", business_id: "b1", balance: 100 },
      { customer_id: "c2", business_id: "b1", balance: -40 },
    ];

    const balances = await getAllCustomerBalances("b1");

    expect(balances).toEqual({ c1: 100, c2: -40 });
    const calls = state.chains[0]!;
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
    expect(state.rpcCalls).toEqual([]);
  });
});
