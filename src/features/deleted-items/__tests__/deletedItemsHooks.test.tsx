import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { useDeleteTransaction, useTransactionList } from "@/features/transactions/hooks";
import { useDeletionLog, useRestoreDeleted } from "../hooks";
import { AppError } from "@/lib/AppError";
import type { Memberships } from "@/features/business/api";
import type { TransactionListParams } from "@/features/transactions/api";

// v3 (S-52) — the hook contract: a viewer is stopped before the
// network, an owner's delete invalidates the transaction caches and
// the deletion log, and a restore refreshes the business.

const businessApi = vi.hoisted(() => ({ getMemberships: vi.fn() }));
const transactionsApi = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  createTransactionsBatch: vi.fn(),
  currentTimeZone: vi.fn(() => "Asia/Dhaka"),
  deleteTransaction: vi.fn(),
  getAllCustomerBalances: vi.fn(async () => ({})),
  getCustomerBalance: vi.fn(),
  getCustomerLedger: vi.fn(),
  getDashboardSummary: vi.fn(),
  getTransactionById: vi.fn(),
  queryTransactions: vi.fn(async () => ({ rows: [], total: 0 })),
  restoreTransaction: vi.fn(),
  transactionRollup: vi.fn(async () => []),
  updateTransaction: vi.fn(),
  voidTransaction: vi.fn(),
}));
const deletedApi = vi.hoisted(() => ({
  listDeletionLog: vi.fn(),
  restoreDeleted: vi.fn(),
}));

vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
}));
vi.mock("@/features/transactions/api", () => transactionsApi);
vi.mock("@/features/deleted-items/api", () => deletedApi);

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

function membershipsFor(role: "owner" | "editor" | "viewer"): Memberships {
  return {
    businesses: [
      {
        id: "b1",
        name: "Bahi Khata",
        businessType: null,
        ownerId: "u1",
        ownerName: "Asha Verma",
        ownerEmail: "asha@example.com",
        role,
        isOwner: role === "owner",
      },
    ],
    invitations: [],
  };
}

function Probe() {
  const deleteTx = useDeleteTransaction("b1");
  const restore = useRestoreDeleted("b1");
  const log = useDeletionLog("b1");
  const list = useTransactionList("b1", {} as TransactionListParams);
  return (
    <div>
      <p>entries: {log.data === undefined ? "loading" : String(log.data.length)}</p>
      <p>rows: {list.data === undefined ? "loading" : String(list.data.total)}</p>
      <p>delete-error: {(deleteTx.error as AppError | null)?.code ?? "none"}</p>
      <p>restore-error: {(restore.error as AppError | null)?.code ?? "none"}</p>
      <button onClick={() => deleteTx.mutate({ id: "t1", reason: "dup" })}>
        delete
      </button>
      <button onClick={() => restore.mutate("log-1")}>restore</button>
    </div>
  );
}

function renderProbe() {
  return renderApp(
    <Routes>
      <Route path="/b/:businessId/deleted" element={<Probe />} />
    </Routes>,
    { session, route: "/b/b1/deleted" },
  );
}

describe("deleted-items hooks (S-52)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionsApi.queryTransactions.mockResolvedValue({ rows: [], total: 0 });
    transactionsApi.getAllCustomerBalances.mockResolvedValue({});
  });

  it("a viewer is stopped before the network and never fetches the log", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );

    renderProbe();
    // The (ungated) list query finishing proves memberships have loaded,
    // so the role below is a known "viewer", not an unknown one.
    await screen.findByText("rows: 0");

    await userEvent.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() =>
      expect(screen.getByText("delete-error: forbidden")).toBeTruthy(),
    );
    expect(transactionsApi.deleteTransaction).not.toHaveBeenCalled();
    // Reading is as sensitive as writing: no log fetch for a viewer.
    expect(deletedApi.listDeletionLog).not.toHaveBeenCalled();
  });

  it("an owner's delete calls the RPC and invalidates the transaction caches and the log", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("owner"),
    );
    deletedApi.listDeletionLog.mockResolvedValue([{ id: "log-1" }]);
    transactionsApi.deleteTransaction.mockResolvedValue("log-1");

    renderProbe();
    await screen.findByText("entries: 1");
    await screen.findByText("rows: 0");

    await userEvent.click(screen.getByRole("button", { name: "delete" }));

    await waitFor(() =>
      expect(transactionsApi.deleteTransaction).toHaveBeenCalledWith(
        "t1",
        "b1",
        "dup",
      ),
    );
    // The row is gone: transaction caches refetch...
    await waitFor(() =>
      expect(transactionsApi.queryTransactions).toHaveBeenCalledTimes(2),
    );
    // ...and the Recently deleted page shows the new entry at once.
    await waitFor(() =>
      expect(deletedApi.listDeletionLog).toHaveBeenCalledTimes(2),
    );
  });

  it("an owner's restore calls restore_deleted and refreshes the business", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("owner"),
    );
    deletedApi.listDeletionLog.mockResolvedValue([]);
    deletedApi.restoreDeleted.mockResolvedValue({ status: "ok", restored: 1 });

    renderProbe();
    await screen.findByText("entries: 0");

    await userEvent.click(screen.getByRole("button", { name: "restore" }));

    await waitFor(() =>
      expect(deletedApi.restoreDeleted).toHaveBeenCalledWith("log-1"),
    );
    // The business-wide invalidation refetches the log view too.
    await waitFor(() =>
      expect(deletedApi.listDeletionLog).toHaveBeenCalledTimes(2),
    );
    expect(screen.getByText("restore-error: none")).toBeTruthy();
  });

  it("an editor cannot restore (assertCan fails before the network)", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("editor"),
    );
    deletedApi.listDeletionLog.mockResolvedValue([]);

    renderProbe();
    // The log stays "loading" for an editor (the query is disabled) —
    // wait on the ungated transaction list instead.
    await screen.findByText("rows: 0");

    await userEvent.click(screen.getByRole("button", { name: "restore" }));

    await waitFor(() =>
      expect(screen.getByText("restore-error: forbidden")).toBeTruthy(),
    );
    expect(deletedApi.restoreDeleted).not.toHaveBeenCalled();
  });
});
