import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteTransaction } from "@/features/transactions/api";
import { deleteCustomerPermanently } from "@/features/customers/api";
import { listDeletionLog, restoreDeleted } from "../api";
import { AppError } from "@/lib/AppError";

// v3 (S-52) — the deletion API layer: the delete RPCs return the
// deletion_log id, the log read is scoped/filtered/name-resolved, and
// restore maps its errors through toAppError. Same supabase chain mock
// as businessScoping.test.ts.

interface Call {
  method: string;
  args: unknown[];
}

const state = vi.hoisted(() => ({
  chains: [] as Call[][],
  resolveValue: null as unknown,
  // Successive resolves: the log rows first, the profiles lookup second.
  resolveQueue: [] as unknown[],
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcValue: null as unknown,
  rpcError: null as { code: string; message: string } | null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      if (state.rpcError) return { data: null, error: state.rpcError };
      return { data: state.rpcValue, error: null };
    }),
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
        in: (...args: unknown[]) => {
          calls.push({ method: "in", args });
          return chain;
        },
        order: (...args: unknown[]) => {
          calls.push({ method: "order", args });
          return chain;
        },
        // Awaitable chain, resolving one queued value per query.
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

const logRow = {
  id: "log-1",
  business_id: "b1",
  entity_type: "transaction",
  entity_id: "t1",
  label: "Charge ₹500.00 · Rahim Uddin",
  summary: { amount: 50000, type: "charge", customer_name: "Rahim Uddin" },
  reason: "duplicate",
  deleted_by: "u1",
  deleted_at: "2026-10-20T10:00:00+00:00",
  restored_at: null,
  restored_by: null,
};

describe("deletion API (S-52)", () => {
  beforeEach(() => {
    state.chains.length = 0;
    state.resolveValue = null;
    state.resolveQueue.length = 0;
    state.rpcCalls.length = 0;
    state.rpcValue = null;
    state.rpcError = null;
  });

  it("deleteTransaction calls the v3 RPC with the reason and resolves the log id", async () => {
    state.rpcValue = "log-1";
    const logId = await deleteTransaction("t1", "b1", "duplicate");
    expect(state.rpcCalls).toEqual([
      {
        fn: "delete_transaction",
        args: {
          p_transaction_id: "t1",
          p_business_id: "b1",
          p_reason: "duplicate",
        },
      },
    ]);
    expect(logId).toBe("log-1");
  });

  it("deleteCustomerPermanently resolves the log id for Undo", async () => {
    state.rpcValue = "log-9";
    const logId = await deleteCustomerPermanently("c1", "b1");
    expect(state.rpcCalls).toEqual([
      {
        fn: "delete_customer_permanently",
        args: { p_customer_id: "c1", p_business_id: "b1" },
      },
    ]);
    expect(logId).toBe("log-9");
  });

  it("restoreDeleted passes the log id and returns the database report", async () => {
    state.rpcValue = { status: "ok", restored: 3 };
    const report = await restoreDeleted("log-1");
    expect(state.rpcCalls).toEqual([
      { fn: "restore_deleted", args: { p_log_id: "log-1" } },
    ]);
    expect(report).toEqual({ status: "ok", restored: 3 });
  });

  it("restoreDeleted maps SQLSTATE 55000 to a conflict AppError with the database message", async () => {
    state.rpcError = { code: "55000", message: "Restore the customer first." };
    const err = await restoreDeleted("log-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("conflict");
    expect((err as AppError).message).toBe("Restore the customer first.");
  });

  it("listDeletionLog is business-scoped and hides restored rows by default", async () => {
    state.resolveQueue = [[], []];
    await listDeletionLog("b1");
    const calls = state.chains[0]!;
    expect(calls).toContainEqual({ method: "eq", args: ["business_id", "b1"] });
    expect(calls).toContainEqual({ method: "is", args: ["restored_at", null] });
    expect(calls).toContainEqual({
      method: "order",
      args: ["deleted_at", { ascending: false }],
    });
  });

  it("listDeletionLog filters by entity type and can include restored rows", async () => {
    state.resolveQueue = [[], []];
    await listDeletionLog("b1", { entityType: "customer", restored: "include" });
    const calls = state.chains[0]!;
    expect(calls).toContainEqual({ method: "eq", args: ["entity_type", "customer"] });
    expect(calls.some((c) => c.method === "is")).toBe(false);
  });

  it("listDeletionLog resolves actor names in one profiles lookup and never ships the snapshot", async () => {
    state.resolveQueue = [
      [logRow, { ...logRow, id: "log-2", entity_type: "customer", restored_by: "u2", restored_at: "2026-10-21T09:00:00+00:00" }],
      [
        { id: "u1", full_name: "Asha Verma", email: "asha@example.com" },
        { id: "u2", full_name: null, email: "editor@example.com" },
      ],
    ];
    const entries = await listDeletionLog("b1");

    expect(state.chains).toHaveLength(2);
    expect(state.chains[1]).toContainEqual({ method: "from", args: ["profiles"] });
    expect(state.chains[1]).toContainEqual({ method: "in", args: ["id", ["u1", "u2"]] });

    expect(entries[0]?.deleted_by_name).toBe("Asha Verma");
    expect(entries[0]?.restored_by_name).toBeNull();
    // full_name missing → the email fallback, same as the ledger badge.
    expect(entries[1]?.restored_by_name).toBe("editor@example.com");
    // The full rows stay in the database.
    expect(entries[0]).not.toHaveProperty("snapshot");
  });

  it("listDeletionLog skips the profiles lookup entirely when no actor ids exist", async () => {
    state.resolveQueue = [[{ ...logRow, deleted_by: null }]];
    const entries = await listDeletionLog("b1");
    expect(state.chains).toHaveLength(1);
    expect(entries[0]?.deleted_by_name).toBeNull();
  });
});
