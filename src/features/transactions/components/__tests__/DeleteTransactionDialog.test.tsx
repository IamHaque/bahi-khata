import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { renderApp } from "@/test/app-render";
import {
  DeleteTransactionDialog,
  type DeletableTransaction,
} from "../DeleteTransactionDialog";
import { AppError } from "@/lib/AppError";
import { formatDate, formatMoney } from "@/lib/format";
import type { Memberships } from "@/features/business/api";

// v3 (S-54) — the owner's hard-delete dialog: the balance sentence, the
// optional capped reason, the Void instead escape hatch, and the
// 10-second Undo toast wired to restore_deleted. The real hooks run
// against mocked api modules; sonner is a spy.

const businessApi = vi.hoisted(() => ({ getMemberships: vi.fn() }));
const transactionsApi = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  createTransactionsBatch: vi.fn(),
  currentTimeZone: vi.fn(() => "UTC"),
  deleteTransaction: vi.fn(),
  getAllCustomerBalances: vi.fn(async () => ({})),
  queryTransactions: vi.fn(async () => ({ rows: [], total: 0 })),
  transactionRollup: vi.fn(async () => []),
  getCustomerBalance: vi.fn(),
  getDashboardSummary: vi.fn(),
  getTransactionById: vi.fn(),
  getCustomerLedger: vi.fn(),
  updateTransaction: vi.fn(),
  restoreTransaction: vi.fn(),
  voidTransaction: vi.fn(),
}));
const deletedApi = vi.hoisted(() => ({
  listDeletionLog: vi.fn(async () => []),
  restoreDeleted: vi.fn(),
}));

vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
}));
vi.mock("@/features/transactions/api", () => transactionsApi);
vi.mock("@/features/deleted-items/api", () => deletedApi);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), action: vi.fn() },
}));

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

const sample: DeletableTransaction = {
  id: "t1",
  type: "charge",
  amount: 500,
  occurred_at: "2026-10-20T10:00:00+00:00",
  customer_name: "Rahim Uddin",
  balance_before: 1000,
  balance_after: 500,
};

function renderDialog(
  overrides: {
    transaction?: DeletableTransaction | null;
    onVoidInstead?: (id: string) => void;
  } = {},
) {
  const onOpenChange = vi.fn();
  renderApp(
    <Routes>
      <Route
        path="/b/:businessId"
        element={
          <DeleteTransactionDialog
            open
            onOpenChange={onOpenChange}
            businessId="b1"
            transaction={overrides.transaction ?? sample}
            onVoidInstead={overrides.onVoidInstead}
          />
        }
      />
    </Routes>,
    { session, route: "/b/b1" },
  );
  return { onOpenChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
  transactionsApi.deleteTransaction.mockResolvedValue("log-1");
  deletedApi.restoreDeleted.mockResolvedValue({ status: "ok", restored: 1 });
});

describe("DeleteTransactionDialog (S-54)", () => {
  it("states the amount, the balance change, and the restore promise", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    within(dialog).getByText("Delete this transaction?");
    within(dialog).getByText(
      `Charge of ${formatMoney(500)} for Rahim Uddin on ${formatDate("2026-10-20T10:00:00+00:00")} will be removed, and Rahim Uddin's balance will change from ${formatMoney(1000)} to ${formatMoney(500)}. You can restore it from Recently deleted.`,
    );
  });

  it("omits the balance sentence when either balance is unknown", async () => {
    renderDialog({
      transaction: { ...sample, balance_before: null, balance_after: null },
    });
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).queryByText(/balance will change/),
    ).toBeNull();
    within(dialog).getByText(/You can restore it from Recently deleted/);
  });

  it("offers the reason field as optional and capped at 200 characters", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    const reason = within(dialog).getByLabelText("Reason (optional)");
    expect(reason.getAttribute("maxlength")).toBe("200");
  });

  it("deletes with the typed reason and the Undo restores via restore_deleted", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(
      within(dialog).getByLabelText("Reason (optional)"),
      "Duplicate entry",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete transaction" }),
    );

    await waitFor(() =>
      expect(transactionsApi.deleteTransaction).toHaveBeenCalledWith(
        "t1",
        "b1",
        "Duplicate entry",
      ),
    );

    const successCalls = (toast.success as ReturnType<typeof vi.fn>).mock
      .calls;
    const [, options] = successCalls[successCalls.length - 1]!;
    expect(successCalls[successCalls.length - 1]![0]).toBe(
      "Transaction deleted",
    );
    const undo = options as {
      duration: number;
      action: { label: string; onClick: () => void };
    };
    expect(undo.duration).toBe(10_000);
    expect(undo.action.label).toBe("Undo");

    undo.action.onClick();
    await waitFor(() =>
      expect(deletedApi.restoreDeleted).toHaveBeenCalledWith("log-1"),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Restored"),
    );
  });

  it("sends null when the reason is left empty", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete transaction" }),
    );
    await waitFor(() =>
      expect(transactionsApi.deleteTransaction).toHaveBeenCalledWith(
        "t1",
        "b1",
        null,
      ),
    );
  });

  it("shows the database's message on a notFound/conflict AppError", async () => {
    transactionsApi.deleteTransaction.mockRejectedValue(
      new AppError("notFound", "Transaction not found."),
    );
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete transaction" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Transaction not found."),
    );
  });

  it("falls back to the shared error form for anything else", async () => {
    transactionsApi.deleteTransaction.mockRejectedValue(new Error("boom"));
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete transaction" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Could not delete the transaction. Try again.",
      ),
    );
  });

  it("the Void instead link closes this dialog and hands the id back", async () => {
    const onVoidInstead = vi.fn();
    const { onOpenChange } = renderDialog({ onVoidInstead });
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Void instead" }),
    );
    expect(onVoidInstead).toHaveBeenCalledWith("t1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("hides the hint and the link together when the page offers no void", async () => {
    renderDialog();
    const dialog = await screen.findByRole("dialog");
    // No Void affordance exists without onVoidInstead — a hint with no
    // link would be a dead end.
    expect(
      within(dialog).queryByText(/Not sure\? Void it instead/),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Void instead" }),
    ).toBeNull();
  });
});
