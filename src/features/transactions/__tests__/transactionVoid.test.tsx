import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { renderApp } from "@/test/app-render";
import { Topbar } from "@/components/layout/Topbar";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";
import { TransactionDetailPage } from "@/pages/TransactionDetailPage";
import { paths, routePatterns } from "@/lib/paths";
import { closeTransactionSheet } from "@/features/transactions/sheetStore";
import type { Memberships } from "@/features/business/api";
import type { CustomerListRow } from "@/features/customers/api";

const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
}));
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
// The fake database: rows carry the audit columns void/restore read,
// and both mutations write back so the refetch is observable. The
// restore mock enforces the migration-0005 rule: the row decides its
// own restored status ("edited" if it had been edited before).
const server = vi.hoisted(() => ({
  customers: [] as CustomerListRow[],
  transactions: [] as Array<{
    id: string;
    business_id: string;
    customer_id: string;
    type: string;
    amount: number;
    status: string;
    occurred_at: string;
    note: string | null;
    source: string;
    created_by: string;
    created_at: string;
    updated_at: string;
    updated_by: string | null;
    void_reason: string | null;
    voided_at: string | null;
    voided_by: string | null;
  }>,
  balances: {} as Record<string, number>,
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
vi.mock("@/features/transactions/api", () => ({
  createTransaction: transactionsApi.createTransaction,
  createTransactionsBatch: transactionsApi.createTransactionsBatch,
  getAllCustomerBalances: transactionsApi.getAllCustomerBalances,
  queryTransactions: transactionsApi.queryTransactions,
  transactionRollup: transactionsApi.transactionRollup,
  getCustomerBalance: transactionsApi.getCustomerBalance,
  getDashboardSummary: transactionsApi.getDashboardSummary,
  getTransactionById: transactionsApi.getTransactionById,
  getCustomerLedger: transactionsApi.getCustomerLedger,
  updateTransaction: transactionsApi.updateTransaction,
  restoreTransaction: transactionsApi.restoreTransaction,
  voidTransaction: transactionsApi.voidTransaction,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

function membershipsFor(role: "owner" | "viewer"): Memberships {
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

function seedCustomer(overrides: Partial<CustomerListRow>): CustomerListRow {
  return {
    id: "c1",
    name: "Asha Verma",
    phone: "01711 111111",
    email: null,
    address: null,
    alternate_contact_name: null,
    alternate_contact_phone: null,
    tags: null,
    notes: null,
    created_at: "2026-01-05T00:00:00+00:00",
    updated_at: "2026-01-05T00:00:00+00:00",
    balance: 0,
    last_activity: null,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function TopbarStub() {
  return (
    <>
      <Topbar
        title="Bahi Khata"
        collapsed={false}
        onToggleSidebar={() => {}}
        onOpenMenu={() => {}}
      />
      <Outlet />
    </>
  );
}

function renderWithTopbar(route: string) {
  return renderApp(
    <>
      <LocationProbe />
      <Routes>
        <Route path={routePatterns.business} element={<TopbarStub />}>
          <Route index element={<div>Business home</div>} />
          <Route path="customers/:customerId" element={<CustomerDetailPage />} />
          <Route
            path="transactions/:transactionId"
            element={<TransactionDetailPage />}
          />
        </Route>
      </Routes>
    </>,
    { session, route },
  );
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86400000)
    .toISOString()
    .split("T")[0]!;
}

/** Open a customer's ledger and wait for the rows. */
async function openLedger(customerId = "c1") {
  renderWithTopbar(paths.customerDetail("b1", customerId));
  await screen.findByText("Current Balance");
}

/** The ledger row that shows this amount. The amount and the
 *  Balance-after column can print the same number (L-03), so pick the
 *  Money cell — the one carrying the aria-label. */
function rowElementByAmount(amountText: string) {
  const cell = screen
    .getAllByText(amountText)
    .find((el) => el.hasAttribute("aria-label"));
  if (!cell) throw new Error(`no amount cell containing ${amountText}`);
  const row = cell.closest("tr");
  if (!row) throw new Error(`no <tr> containing ${amountText}`);
  return row;
}

/** The last toast.success options (mocked sonner). */
function lastSuccessOptions() {
  const calls = (toast.success as ReturnType<typeof vi.fn>).mock.calls;
  const last = calls[calls.length - 1];
  return last?.[1] as
    | { duration: number; action: { label: string; onClick: () => void } }
    | undefined;
}

beforeEach(() => {
  // Module store shared by every test in this file.
  closeTransactionSheet();

  server.customers = [
    seedCustomer({ id: "c1", name: "Asha Verma", phone: "01711 111111" }),
    seedCustomer({ id: "c2", name: "Karim Chowdhury", phone: "01722 222222" }),
  ];
  server.transactions = [
    {
      id: "t1",
      business_id: "b1",
      customer_id: "c1",
      type: "payment",
      amount: 500,
      status: "active",
      occurred_at: `${isoDay(-3)}T00:00:00.000Z`,
      note: "partial",
      source: "manual",
      created_by: "user-1",
      created_at: `${isoDay(-3)}T00:00:00.000Z`,
      updated_at: `${isoDay(-3)}T00:00:00.000Z`,
      updated_by: null,
      void_reason: null,
      voided_at: null,
      voided_by: null,
    },
    {
      id: "t0",
      business_id: "b1",
      customer_id: "c1",
      type: "charge",
      amount: 5000,
      status: "active",
      occurred_at: `${isoDay(-6)}T00:00:00.000Z`,
      note: null,
      source: "manual",
      created_by: "user-1",
      created_at: `${isoDay(-6)}T00:00:00.000Z`,
      updated_at: `${isoDay(-6)}T00:00:00.000Z`,
      updated_by: null,
      void_reason: null,
      voided_at: null,
      voided_by: null,
    },
  ];
  // Asha: 5000 charge minus the 500 payment.
  server.balances = { c1: 4500, c2: 0 };

  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );

  customersApi.listCustomers.mockImplementation(async () =>
    server.customers.map((customer) => ({ ...customer })),
  );
  customersApi.getCustomer.mockImplementation(async (id: string) => {
    const row = server.customers.find((customer) => customer.id === id);
    if (!row) throw new Error("customer not found");
    return { ...row };
  });

  transactionsApi.getCustomerBalance.mockImplementation(
    async (id: string) => server.balances[id] ?? 0,
  );
  transactionsApi.getAllCustomerBalances.mockImplementation(
    async () => ({ ...server.balances }),
  );
  // S-31's customer_ledger contract: every status (voided rows stay
  // visible, muted), newest first, balance_after computed the way the
  // RPC computes it (a voided row contributes nothing).
  transactionsApi.getCustomerLedger.mockImplementation(async (id: string) => {
    const newestFirst = server.transactions
      .filter((tx) => tx.customer_id === id)
      .sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() -
          new Date(a.occurred_at).getTime(),
      );
    let running = 0;
    return [...newestFirst]
      .reverse()
      .map((tx) => {
        if (tx.status !== "voided") {
          running += tx.type === "charge" ? tx.amount : -tx.amount;
        }
        return { ...tx, balance_after: running, updated_by_name: null };
      })
      .reverse();
  });
  // Mirrors the real api's void contract: status flips, the reason and
  // the voider are stamped, updated_by stays untouched (the restore
  // marker), and the balance stops counting the entry.
  transactionsApi.voidTransaction.mockImplementation(
    async (id: string, reason: string | null) => {
      const tx = server.transactions.find((row) => row.id === id);
      if (!tx) throw new Error("transaction not found");
      const effect = tx.type === "charge" ? tx.amount : -tx.amount;
      tx.status = "voided";
      tx.void_reason = reason;
      tx.voided_at = new Date().toISOString();
      tx.voided_by = "user-1";
      tx.updated_at = new Date().toISOString();
      server.balances[tx.customer_id] =
        (server.balances[tx.customer_id] ?? 0) - effect;
      return { ...tx };
    },
  );
  // Mirrors migration 0005's restore_transaction: only voided rows,
  // "edited" if it had been edited before, otherwise "active".
  transactionsApi.restoreTransaction.mockImplementation(async (id: string) => {
    const tx = server.transactions.find((row) => row.id === id);
    if (!tx || tx.status !== "voided") throw new Error("not voided");
    tx.status = tx.updated_by ? "edited" : "active";
    tx.void_reason = null;
    tx.voided_at = null;
    tx.voided_by = null;
    tx.updated_at = new Date().toISOString();
    const effect = tx.type === "charge" ? tx.amount : -tx.amount;
    server.balances[tx.customer_id] =
      (server.balances[tx.customer_id] ?? 0) + effect;
    return { ...tx };
  });
  // The detail page's single-row read (with the customer join).
  transactionsApi.getTransactionById.mockImplementation(async (id: string) => {
    const tx = server.transactions.find((row) => row.id === id);
    if (!tx) return null;
    const customer = server.customers.find((c) => c.id === tx.customer_id);
    return {
      ...tx,
      customer_name: customer?.name ?? "Unknown",
      customer_phone: customer?.phone ?? "",
    };
  });
});

describe("S-34 void and restore transactions", () => {
  it("voids with a confirmation and optional reason: the row stays, muted, with a Voided badge; the balance stops counting it; Undo is offered", async () => {
    await openLedger();
    await userEvent.click(
      screen.getByRole("button", { name: "Void payment of ₹500.00" }),
    );

    const dialog = await screen.findByRole("dialog");
    within(dialog).getByText("Void this payment of ₹500.00?");
    // The reason is optional and capped at 200 characters by the input.
    const reason = within(dialog).getByLabelText("Reason (optional)");
    expect(reason.getAttribute("maxlength")).toBe("200");
    fireEvent.change(reason, { target: { value: "Duplicate entry" } });

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Void transaction" }),
    );

    await waitFor(() =>
      expect(transactionsApi.voidTransaction).toHaveBeenCalledWith(
        "t1",
        "Duplicate entry",
        "b1",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // The row stays visible: muted badge, struck-through amount…
    const row = rowElementByAmount("-₹500.00");
    within(row).getByText("Voided");
    const amount = screen.getByText("-₹500.00");
    expect(amount.className).toContain("line-through");
    // …the balance stopped counting it and flashes the new number…
    await waitFor(() =>
      expect(
        screen
          .getAllByText("₹5,000.00")
          .find((el) => el.closest("p"))
          ?.closest("p")?.className,
      ).toContain("balance-flash"),
    );
    // …and the toast carries Undo for 8 seconds.
    const options = lastSuccessOptions();
    expect(options?.duration).toBe(8000);
    expect(options?.action.label).toBe("Undo");
    // The untouched older row proves nothing else moved.
    expect(transactionsApi.voidTransaction).toHaveBeenCalledTimes(1);
  });

  it("Undo in the toast brings the row back in one click", async () => {
    await openLedger();
    await userEvent.click(
      screen.getByRole("button", { name: "Void payment of ₹500.00" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Void transaction" }),
    );
    await waitFor(() =>
      expect(transactionsApi.voidTransaction).toHaveBeenCalledTimes(1),
    );

    lastSuccessOptions()!.action.onClick();

    await waitFor(() =>
      expect(transactionsApi.restoreTransaction).toHaveBeenCalledWith(
        "t1",
        "b1",
      ),
    );
    // Never edited before → back to plain active: no badges, balance
    // counts it again.
    await waitFor(() => expect(screen.queryByText("Voided")).toBeNull());
    expect(screen.queryByText("Edited")).toBeNull();
    await waitFor(() =>
      expect(
        screen
          .getAllByText("₹4,500.00")
          .find((el) => el.closest("p"))
          ?.closest("p")?.className,
      ).toContain("balance-flash"),
    );
  });

  it("restores: edited-before comes back Edited, never-edited comes back Active", async () => {
    // Both voided; only the payment had been edited before.
    server.transactions[0] = {
      ...server.transactions[0]!,
      amount: 450,
      status: "voided",
      updated_by: "u-eli",
      void_reason: "Wrong amount",
      voided_at: `${isoDay(-1)}T00:00:00.000Z`,
      voided_by: "user-1",
    };
    server.transactions[1] = {
      ...server.transactions[1]!,
      status: "voided",
      void_reason: "Duplicate",
      voided_at: `${isoDay(-1)}T00:00:00.000Z`,
      voided_by: "user-1",
    };
    server.balances.c1 = 0; // both out of the math

    await openLedger();

    await userEvent.click(
      screen.getByRole("button", { name: "Restore payment of ₹450.00" }),
    );
    await waitFor(() =>
      expect(transactionsApi.restoreTransaction).toHaveBeenCalledWith(
        "t1",
        "b1",
      ),
    );
    // The edit marker survived the void: back as Edited, with the badge.
    await waitFor(() =>
      expect(server.transactions[0]!.status).toBe("edited"),
    );
    within(rowElementByAmount("-₹450.00")).getByText("Edited");
    expect(toast.success).toHaveBeenLastCalledWith("Transaction restored.");

    await userEvent.click(
      screen.getByRole("button", { name: "Restore charge of ₹5,000.00" }),
    );
    await waitFor(() =>
      expect(server.transactions[1]!.status).toBe("active"),
    );
    // No markers at all: neither badge.
    const row = rowElementByAmount("+₹5,000.00");
    expect(within(row).queryByText("Edited")).toBeNull();
    expect(within(row).queryByText("Voided")).toBeNull();
  });

  it("cancelling the confirmation is harmless", async () => {
    await openLedger();
    await userEvent.click(
      screen.getByRole("button", { name: "Void payment of ₹500.00" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (optional)"), {
      target: { value: "Never mind" },
    });

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(transactionsApi.voidTransaction).not.toHaveBeenCalled();
    expect(screen.queryByText("Voided")).toBeNull();
    // No toast, no balance change.
    expect(toast.success).not.toHaveBeenCalled();
    screen.getByRole("button", { name: "Void payment of ₹500.00" });
  });

  it("shows a Viewer no void or restore actions", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    await openLedger();

    expect(
      screen.queryByRole("button", { name: /void (charge|payment)/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /restore (charge|payment)/i }),
    ).toBeNull();
    // Rows stay readable.
    screen.getByText("Current Balance");
    expect(rowElementByAmount("+₹5,000.00")).toBeTruthy();
  });

  it("transaction detail: voids with the page's button, shows the reason, restores, and edits through the shared sheet", async () => {
    renderWithTopbar("/b/b1/transactions/t1");
    await screen.findByText("Transaction Detail");

    // S-34 rework: the page's own Void, then the reason is part of the
    // record.
    await userEvent.click(screen.getByRole("button", { name: "Void" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Reason (optional)"), {
      target: { value: "Wrong amount" },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Void transaction" }),
    );
    await waitFor(() =>
      expect(transactionsApi.voidTransaction).toHaveBeenCalledWith(
        "t1",
        "Wrong amount",
        "b1",
      ),
    );

    await waitFor(() => screen.getByText("Void reason"));
    screen.getByText("Wrong amount");
    screen.getByText("Voided");

    // Restore from the page too.
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(transactionsApi.restoreTransaction).toHaveBeenCalledWith(
        "t1",
        "b1",
      ),
    );
    await waitFor(() => screen.getByText("Active"));
    expect(screen.queryByText("Void reason")).toBeNull();

    // S-33 handoff: Edit now opens the shared sheet, not the v1 one.
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog");
    within(sheet).getByText("Edit transaction");
    expect(
      (within(sheet).getByLabelText("Amount") as HTMLInputElement).value,
    ).toBe("500");
  });
});
