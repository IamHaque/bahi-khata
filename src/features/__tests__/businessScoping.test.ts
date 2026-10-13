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
  getDashboardSummary,
} from "@/features/transactions/api";

interface Call {
  method: string;
  args: unknown[];
}

const state = vi.hoisted(() => ({
  chains: [] as Call[][],
  resolveValue: null as unknown,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return {
        data: {
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
    from: vi.fn(() => {
      const calls: Call[] = [];
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
        // PostgREST builder (used by the balance-view reads).
        then: (
          onFulfilled?: (value: { data: unknown; error: null }) => unknown,
        ) =>
          Promise.resolve({ data: state.resolveValue, error: null }).then(
            onFulfilled,
          ),
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
    expect(insert.args[0]).toMatchObject({
      business_id: "b1",
      created_by: "user-1",
    });
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
