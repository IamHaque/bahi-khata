import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  listCustomers,
  getCustomer,
  createCustomer,
} from "@/features/customers/api";
import {
  createTransaction,
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
      };
      return chain;
    }),
  },
}));

describe("business scoping (transitional)", () => {
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

  it("leaves listCustomers unscoped when businessId is omitted", async () => {
    await listCustomers();
    const calls = state.chains[0]!;
    const businessEq = calls.some(
      (c) => c.method === "eq" && c.args[0] === "business_id",
    );
    expect(businessEq).toBe(false);
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

  it("stores null business_id on createCustomer when omitted", async () => {
    await createCustomer({ name: "Asha" });
    const insert = state.chains[0]!.find((c) => c.method === "insert")!;
    expect(insert.args[0]).toMatchObject({ business_id: null });
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
});
