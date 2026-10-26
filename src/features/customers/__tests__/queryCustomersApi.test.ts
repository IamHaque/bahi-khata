import { describe, it, expect, vi, beforeEach } from "vitest";
import { queryCustomers } from "../api";

// S-53 — the list no longer downloads every transaction date: last
// activity comes from the customer_balances view (voided entries
// already excluded there). The api contract is the request shape and
// the row mapping; the em dash for "no activity" is a page concern,
// covered in customersList.test.tsx.

interface Call {
  method: string;
  args: unknown[];
}

const state = vi.hoisted(() => ({
  chains: [] as Call[][],
  resolveQueue: [] as unknown[],
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const calls: Call[] = [];
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
        is: (...args: unknown[]) => {
          calls.push({ method: "is", args });
          return chain;
        },
        not: (...args: unknown[]) => {
          calls.push({ method: "not", args });
          return chain;
        },
        or: (...args: unknown[]) => {
          calls.push({ method: "or", args });
          return chain;
        },
        gt: (...args: unknown[]) => {
          calls.push({ method: "gt", args });
          return chain;
        },
        lt: (...args: unknown[]) => {
          calls.push({ method: "lt", args });
          return chain;
        },
        order: (...args: unknown[]) => {
          calls.push({ method: "order", args });
          return chain;
        },
        range: (...args: unknown[]) => {
          calls.push({ method: "range", args });
          return chain;
        },
        then: (
          onFulfilled?: (value: { data: unknown; error: null }) => unknown,
        ) =>
          Promise.resolve({
            data: state.resolveQueue.shift(),
            error: null,
          }).then(onFulfilled),
      };
      return chain;
    }),
  },
}));

function seedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    name: "Rahim Uddin",
    phone: null,
    email: null,
    address: null,
    alternate_contact_name: null,
    alternate_contact_phone: null,
    tags: null,
    notes: null,
    created_at: "2026-01-01T00:00:00+00:00",
    updated_at: "2026-01-01T00:00:00+00:00",
    business_id: "b1",
    archived_at: null,
    created_by: "u1",
    deleted_at: null,
    deleted_by: null,
    ...overrides,
  };
}

describe("queryCustomers (S-53: last activity from the balance view)", () => {
  beforeEach(() => {
    state.chains.length = 0;
    state.resolveQueue.length = 0;
  });

  it("selects customer_balances(balance, last_activity_at) and no longer selects transactions", async () => {
    state.resolveQueue = [[], null];
    await queryCustomers("b1");
    const select = state.chains[0]!.find((c) => c.method === "select")!;
    expect(select.args[0]).toBe(
      "*, customer_balances!inner(balance, last_activity_at)",
    );
    // The old join is gone: nothing downloads every transaction date.
    expect(String(select.args[0])).not.toContain("transactions");
  });

  it("maps last_activity verbatim from the view (the view excludes voided entries)", async () => {
    // The newest entry is voided, so the view's last_activity_at is the
    // newest NON-voided one — the client just reads the field.
    state.resolveQueue = [
      [
        seedRow({
          customer_balances: {
            balance: 45000,
            last_activity_at: "2026-10-01T00:00:00+00:00",
          },
        }),
      ],
      null,
    ];
    const { items } = await queryCustomers("b1");
    expect(items[0]?.last_activity).toBe("2026-10-01T00:00:00+00:00");
    expect(items[0]?.balance).toBe(45000);
  });

  it("a customer with no entries has no last activity (page shows an em dash)", async () => {
    state.resolveQueue = [
      [seedRow({ customer_balances: { balance: 0, last_activity_at: null } })],
      null,
    ];
    const { items } = await queryCustomers("b1");
    expect(items[0]?.last_activity).toBeNull();
  });

  it("keeps the business scope, the deleted guard and the exact count", async () => {
    state.resolveQueue = [[], null];
    await queryCustomers("b1");
    const calls = state.chains[0]!;
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
    expect(calls).toContainEqual({ method: "is", args: ["deleted_at", null] });
    const select = calls.find((c) => c.method === "select")!;
    expect(select.args[1]).toEqual({ count: "exact" });
  });
});
