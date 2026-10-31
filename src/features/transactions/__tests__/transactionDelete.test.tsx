import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { renderApp } from "@/test/app-render";
import { TransactionsPage } from "@/features/transactions/pages/TransactionsPage";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";
import { TransactionDetailPage } from "@/pages/TransactionDetailPage";
import { AppError } from "@/lib/AppError";
import type { Memberships } from "@/features/business/api";
import type { CustomerListRow } from "@/features/customers/api";

// v3 (S-54) — the three delete entry points: the list's row action, the
// customer ledger's row action (with the balance sentence from the
// running balance), and the detail page's own button. An editor never
// sees Delete; a notFound/conflict error shows the database's message.

const businessApi = vi.hoisted(() => ({ getMemberships: vi.fn() }));
const customersApi = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  queryCustomers: vi.fn(),
  createCustomer: vi.fn(),
  getCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  setCustomerArchived: vi.fn(),
  deleteCustomerPermanently: vi.fn(),
  countCustomerTransactions: vi.fn(),
}));
const transactionsApi = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  createTransactionsBatch: vi.fn(),
  currentTimeZone: vi.fn(() => "UTC"),
  deleteTransaction: vi.fn(),
  getAllCustomerBalances: vi.fn(async (): Promise<Record<string, number>> => ({})),
  queryTransactions: vi.fn(),
  transactionRollup: vi.fn(async (): Promise<unknown[]> => []),
  getCustomerBalance: vi.fn(async (): Promise<number> => 0),
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
vi.mock("@/features/customers/api", () => ({
  listCustomers: customersApi.listCustomers,
  queryCustomers: customersApi.queryCustomers,
  createCustomer: customersApi.createCustomer,
  getCustomer: customersApi.getCustomer,
  updateCustomer: customersApi.updateCustomer,
  setCustomerArchived: customersApi.setCustomerArchived,
  deleteCustomerPermanently: customersApi.deleteCustomerPermanently,
  countCustomerTransactions: customersApi.countCustomerTransactions,
}));
vi.mock("@/features/transactions/api", () => transactionsApi);
vi.mock("@/features/deleted-items/api", () => deletedApi);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86400000)
    .toISOString()
    .split("T")[0]!;
}

const customer = {
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
  archived_at: null,
  balance: 45000,
  last_activity: null,
} satisfies CustomerListRow;

const txBase = {
  id: "t1",
  business_id: "b1",
  customer_id: "c1",
  type: "charge" as const,
  amount: 500,
  status: "active" as const,
  occurred_at: `${isoDay(-1)}T10:00:00.000Z`,
  note: null,
  source: "manual" as const,
  created_by: "u1",
  created_at: `${isoDay(-1)}T10:00:00.000Z`,
  updated_at: `${isoDay(-1)}T10:00:00.000Z`,
  updated_by: null,
  void_reason: null,
  voided_at: null,
  voided_by: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
  customersApi.getCustomer.mockImplementation(async () => ({ ...customer }));
  transactionsApi.getCustomerBalance.mockResolvedValue(45000);
  transactionsApi.getAllCustomerBalances.mockResolvedValue({ c1: 45000 });
  // The ledger's running balance includes the row itself (S-31).
  transactionsApi.getCustomerLedger.mockImplementation(async () => [
    { ...txBase, balance_after: 45000, updated_by_name: null },
  ]);
  transactionsApi.getTransactionById.mockImplementation(async () => ({
    ...txBase,
    customer_name: customer.name,
    customer_phone: "",
  }));
  transactionsApi.queryTransactions.mockImplementation(async () => ({
    rows: [{ ...txBase, customer: { id: "c1", name: customer.name, phone: null } }],
    total: 1,
  }));
  transactionsApi.deleteTransaction.mockResolvedValue("log-1");
  deletedApi.restoreDeleted.mockResolvedValue({ status: "ok", restored: 1 });
});

async function confirmDelete() {
  const dialog = await screen.findByRole("dialog");
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Delete transaction" }),
  );
  return dialog;
}

describe("S-54 delete transaction entry points", () => {
  it("the transactions list: Delete after Void, no balance sentence, delete goes through", async () => {
    renderApp(
      <Routes>
        <Route
          path="/b/:businessId/transactions"
          element={<TransactionsPage />}
        />
      </Routes>,
      { session, route: "/b/b1/transactions" },
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete charge of ₹500.00" }),
    );
    const dialog = await screen.findByRole("dialog");
    within(dialog).getByText("Delete this transaction?");
    // This page holds no customer balance column → no balance sentence.
    expect(within(dialog).queryByText(/balance will change/)).toBeNull();

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
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "Transaction deleted",
        expect.objectContaining({ duration: 10_000 }),
      ),
    );
  });

  it("an editor on the list sees Void but never Delete", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("editor"),
    );
    renderApp(
      <Routes>
        <Route
          path="/b/:businessId/transactions"
          element={<TransactionsPage />}
        />
      </Routes>,
      { session, route: "/b/b1/transactions" },
    );

    await screen.findByRole("button", { name: "Void charge of ₹500.00" });
    expect(
      screen.queryByRole("button", { name: "Delete charge of ₹500.00" }),
    ).toBeNull();
    expect(transactionsApi.deleteTransaction).not.toHaveBeenCalled();
  });

  it("the customer ledger: the dialog carries the balance sentence from the running balance", async () => {
    renderApp(
      <Routes>
        <Route
          path="/b/:businessId/customers/:customerId"
          element={<CustomerDetailPage />}
        />
      </Routes>,
      { session, route: "/b/b1/customers/c1" },
    );

    await screen.findByRole("tab", { name: "Ledger" });
    await userEvent.click(
      screen.getByRole("button", { name: "Delete charge of ₹500.00" }),
    );
    const dialog = await screen.findByRole("dialog");
    // balance_after 45,000 includes this 500 charge → before was 44,500.
    within(dialog).getByText(
      /balance will change from ₹44,500\.00 to ₹45,000\.00/,
    );

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

  it("the detail page: its own Delete button opens the dialog with the balance sentence and deletes", async () => {
    renderApp(
      <Routes>
        <Route
          path="/b/:businessId/transactions/:transactionId"
          element={<TransactionDetailPage />}
        />
      </Routes>,
      { session, route: "/b/b1/transactions/t1" },
    );

    await screen.findByText("Transaction Detail");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    within(dialog).getByText(
      /balance will change from ₹44,500\.00 to ₹45,000\.00/,
    );

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

  it("the detail page shows the database's message on a notFound/conflict error", async () => {
    transactionsApi.deleteTransaction.mockRejectedValue(
      new AppError("conflict", "Restore the customer first."),
    );
    renderApp(
      <Routes>
        <Route
          path="/b/:businessId/transactions/:transactionId"
          element={<TransactionDetailPage />}
        />
      </Routes>,
      { session, route: "/b/b1/transactions/t1" },
    );

    await screen.findByText("Transaction Detail");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await confirmDelete();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Restore the customer first."),
    );
  });

  it("an editor on the detail page has Void but no Delete", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("editor"),
    );
    renderApp(
      <Routes>
        <Route
          path="/b/:businessId/transactions/:transactionId"
          element={<TransactionDetailPage />}
        />
      </Routes>,
      { session, route: "/b/b1/transactions/t1" },
    );

    await screen.findByText("Transaction Detail");
    await screen.findByRole("button", { name: "Void" });
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});
