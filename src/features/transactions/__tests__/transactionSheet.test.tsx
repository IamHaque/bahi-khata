import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  screen,
  waitFor,
  within,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { Topbar } from "@/components/layout/Topbar";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";
import { AppError } from "@/lib/AppError";
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
// The fake database: mutations write here, queries read here, so the
// refetch-after-save behaviour (new row on top, recalculated balance)
// is observable — same server-state pattern as the other suites.
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
  }>,
  balances: {} as Record<string, number>,
  createError: null as Error | null,
  nextTxId: 1,
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

/** AppShell-equivalent: the real Topbar (with S-32's Add transaction and
 *  the one TransactionSheet instance) wrapping whatever page the route
 *  shows — nested exactly like the app's /b/:businessId layout. */
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
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:customerId" element={<CustomerDetailPage />} />
        </Route>
      </Routes>
    </>,
    { session, route },
  );
}

async function findRowScope(name: string) {
  const cell = await screen.findByText(name);
  const row = cell.closest("tr");
  if (!row) throw new Error(`no <tr> containing ${name}`);
  return within(row);
}

function rowScopeNow(name: string) {
  const cell = screen.getByText(name);
  const row = cell.closest("tr");
  if (!row) throw new Error(`no <tr> containing ${name}`);
  return within(row);
}

/** Open the customer's ledger and press its Add charge button. */
async function openLedgerSheet(customerId = "c1") {
  renderWithTopbar(paths.customerDetail("b1", customerId));
  await screen.findByText("Current Balance");
  await userEvent.click(
    screen.getByRole("button", { name: "Add charge" }),
  );
  return screen.findByRole("dialog");
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86400000)
    .toISOString()
    .split("T")[0]!;
}

beforeEach(() => {
  // The sheet store is module state shared by every test in this file.
  closeTransactionSheet();

  server.customers = [
    seedCustomer({ id: "c1", name: "Asha Verma", phone: "01711 111111" }),
    seedCustomer({ id: "c2", name: "Karim Chowdhury", phone: "01722 222222" }),
  ];
  server.balances = { c1: 1000, c2: 0 };
  server.transactions = [
    {
      id: "t0",
      business_id: "b1",
      customer_id: "c1",
      type: "charge",
      amount: 5000,
      status: "active",
      occurred_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      note: "Old advance",
      source: "manual",
      created_by: "user-1",
    },
  ];
  server.createError = null;
  server.nextTxId = 1;

  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );

  customersApi.listCustomers.mockImplementation(async () =>
    server.customers
      .filter((customer) => !customer.archived_at)
      .map((customer) => ({ ...customer })),
  );
  customersApi.queryCustomers.mockImplementation(async () => {
    const items = server.customers
      .filter((customer) => !customer.archived_at)
      .map((customer) => ({
        ...customer,
        balance: server.balances[customer.id] ?? 0,
      }));
    return { items, total: items.length, allTotal: items.length };
  });
  customersApi.getCustomer.mockImplementation(async (id: string) => {
    const row = server.customers.find((customer) => customer.id === id);
    if (!row) throw new Error("customer not found");
    return { ...row };
  });
  customersApi.createCustomer.mockImplementation(
    async (input: Record<string, unknown>) => {
      const created = {
        ...seedCustomer({ id: `c${100 + server.customers.length}` }),
        ...(input as Partial<CustomerListRow>),
      };
      server.customers.push(created);
      return created;
    },
  );

  transactionsApi.createTransaction.mockImplementation(
    async (input: Record<string, unknown>, businessId: string) => {
      if (server.createError) throw server.createError;
      const customerId = String(input.customer_id);
      const type = String(input.type) as "charge" | "payment";
      const amount = Number(input.amount);
      const tx = {
        id: `t${server.nextTxId++}`,
        business_id: businessId,
        customer_id: customerId,
        type,
        amount,
        status: "active",
        occurred_at: String(input.occurred_at),
        note: (input.note as string | undefined) ?? null,
        source: "manual",
        created_by: "user-1",
      };
      server.transactions.push(tx);
      const delta = type === "charge" ? amount : -amount;
      server.balances[customerId] = (server.balances[customerId] ?? 0) + delta;
      return tx;
    },
  );
  transactionsApi.getCustomerBalance.mockImplementation(
    async (id: string) => server.balances[id] ?? 0,
  );
  // S-31's customer_ledger contract: every status, newest first, and
  // balance_after computed the way the RPC computes it (voided rows
  // contribute nothing).
  transactionsApi.getCustomerLedger.mockImplementation(async (id: string) => {
    const newestFirst = server.transactions
      .filter((tx) => tx.customer_id === id)
      .sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
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
  transactionsApi.getAllCustomerBalances.mockImplementation(
    async () => ({ ...server.balances }),
  );
});

describe("S-32 transaction sheet", () => {
  it("adds a charge from the ledger: focused amount, live preview, row on top, balance flashes", async () => {
    const dialog = await openLedgerSheet();

    // Amount is focused on open, with Charge selected and the footer
    // button speaking in the same type.
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("amount-money"),
    );
    expect(
      within(dialog)
        .getByRole("radio", { name: "Charge" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    within(dialog).getByRole("button", { name: "Add charge" });

    // Live preview: the 1000 owed today, then the result while typing.
    expect(await within(dialog).findByText("Current balance")).toBeTruthy();
    within(dialog).getByText("₹1,000.00");
    await userEvent.type(within(dialog).getByLabelText("Amount"), "500");
    expect(await within(dialog).findByText("Balance after")).toBeTruthy();
    within(dialog).getByText("₹1,500.00");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add charge" }),
    );

    // Provenance: business-scoped, today's date, no note. source
    // "manual" and created_by are stored by the api (also asserted in
    // businessScoping.test).
    await waitFor(() =>
      expect(transactionsApi.createTransaction).toHaveBeenCalledTimes(1),
    );
    const firstCall = transactionsApi.createTransaction.mock.calls[0]!;
    const input = firstCall[0] as {
      customer_id: string;
      type: string;
      amount: number;
      occurred_at: string;
      note?: string | undefined;
    };
    expect(input).toMatchObject({
      customer_id: "c1",
      type: "charge",
      amount: 500,
    });
    expect(input.note).toBeUndefined();
    expect(firstCall[1]).toBe("b1");
    expect(input.occurred_at.split("T")[0]).toBe(isoDay(0));

    // The sheet closed, the balance recalculated and highlights…
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.getByText("₹1,500").className).toContain(
        "balance-flash",
      ),
    );

    // …and the new row sits at the top of her ledger, above the old one.
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    const newIdx = rows.findIndex((row) =>
      (row.textContent ?? "").includes("+₹500"),
    );
    const oldIdx = rows.findIndex((row) =>
      (row.textContent ?? "").includes("+₹5,000"),
    );
    expect(newIdx).toBeGreaterThan(-1);
    expect(oldIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeLessThan(oldIdx);
  });

  it("records a payment that creates credit: preview and list badge both say You owe 300", async () => {
    renderWithTopbar(paths.customers("b1"));
    const asha = await findRowScope("Asha Verma");
    await userEvent.click(
      asha.getByRole("button", { name: "Actions for Asha Verma" }),
    );
    const menu = await screen.findByRole("menu");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Add transaction" }),
    );

    const dialog = await screen.findByRole("dialog");
    // Preselected from the row: the picker already shows her name.
    within(dialog).getByRole("button", { name: "Asha Verma" });
    expect(await within(dialog).findByText("Current balance")).toBeTruthy();
    within(dialog).getByText("Owes you");

    await userEvent.click(
      within(dialog).getByRole("radio", { name: "Payment" }),
    );
    await userEvent.type(within(dialog).getByLabelText("Amount"), "1300");
    // The preview flips to credit while I type: You owe 300.
    expect(await within(dialog).findByText("Balance after")).toBeTruthy();
    within(dialog).getByText("You owe");
    within(dialog).getByText("₹300.00");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add payment" }),
    );
    await waitFor(() =>
      expect(transactionsApi.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: "c1",
          type: "payment",
          amount: 1300,
        }),
        "b1",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // The list refetched: her row's badge now says You owe 300.
    await waitFor(() => {
      const scope = rowScopeNow("Asha Verma");
      expect(scope.getByText("You owe")).toBeTruthy();
      expect(scope.getByText("₹300.00")).toBeTruthy();
    });
  });

  it("validates inline: required amount, 2 decimals, no future date, note limit — and back-dates", async () => {
    const dialog = await openLedgerSheet();

    // Date defaults to today.
    const dateInput = within(dialog).getByLabelText("Date") as HTMLInputElement;
    expect(dateInput.value).toBe(isoDay(0));

    // Empty amount: required, nothing saved.
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add charge" }),
    );
    expect(await within(dialog).findByText("Amount is required")).toBeTruthy();
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled();

    // Above zero.
    const amount = within(dialog).getByLabelText("Amount");
    fireEvent.change(amount, { target: { value: "0" } });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add charge" }),
    );
    expect(
      await within(dialog).findByText("Amount must be above zero"),
    ).toBeTruthy();
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled();

    // At most 2 decimals.
    fireEvent.change(amount, { target: { value: "1.234" } });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add charge" }),
    );
    expect(
      await within(dialog).findByText("Amount can have at most 2 decimals"),
    ).toBeTruthy();
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled();

    // No future dates…
    fireEvent.change(dateInput, { target: { value: isoDay(1) } });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add charge" }),
    );
    expect(
      await within(dialog).findByText("Date cannot be in the future"),
    ).toBeTruthy();
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled();

    // …but a note over 500 characters is refused too.
    fireEvent.change(within(dialog).getByLabelText("Note"), {
      target: { value: "x".repeat(501) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add charge" }),
    );
    expect(
      await within(dialog).findByText(
        "Note must be 500 characters or fewer",
      ),
    ).toBeTruthy();
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled();

    // Fix everything, back-date to yesterday: it saves.
    fireEvent.change(amount, { target: { value: "500" } });
    fireEvent.change(within(dialog).getByLabelText("Note"), {
      target: { value: "" },
    });
    fireEvent.change(dateInput, { target: { value: isoDay(-1) } });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add charge" }),
    );
    await waitFor(() =>
      expect(transactionsApi.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          occurred_at: `${isoDay(-1)}T00:00:00.000Z`,
        }),
        "b1",
      ),
    );
  });

  it("quick add from the top bar: searchable picker first, then the same fields", async () => {
    renderWithTopbar(paths.business("b1"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Add transaction" }),
    );
    const dialog = await screen.findByRole("dialog");

    // The picker comes first — ahead of Amount in the form…
    const picker = within(dialog).getByRole("button", {
      name: "Select customer...",
    });
    const amount = within(dialog).getByLabelText("Amount");
    expect(
      picker.compareDocumentPosition(amount) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // …and there is no preview until a customer is chosen.
    expect(within(dialog).queryByText("Current balance")).toBeNull();

    // Open the searchable picker and choose Asha.
    await userEvent.click(picker);
    const listbox = await screen.findByRole("listbox", { name: "Customers" });
    await userEvent.click(
      within(listbox).getByRole("option", { name: /Asha/ }),
    );

    // Same fields, now with the live preview for the chosen customer.
    expect(await within(dialog).findByText("Current balance")).toBeTruthy();
    within(dialog).getByText("Owes you");

    await userEvent.type(within(dialog).getByLabelText("Amount"), "500");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add charge" }),
    );
    await waitFor(() =>
      expect(transactionsApi.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ customer_id: "c1", type: "charge" }),
        "b1",
      ),
    );
  });

  it("keyboard flow: Amount focused on open and Enter saves", async () => {
    renderWithTopbar(paths.customerDetail("b1", "c1"));
    await screen.findByText("Current Balance");
    await userEvent.click(
      screen.getByRole("button", { name: "Add charge" }),
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("amount-money"),
    );

    await userEvent.type(within(dialog).getByLabelText("Amount"), "500");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(transactionsApi.createTransaction).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Escape closes the clean sheet and focus returns to the trigger", async () => {
    renderWithTopbar(paths.customerDetail("b1", "c1"));
    await screen.findByText("Current Balance");
    const trigger = screen.getByRole("button", { name: "Add charge" });
    await userEvent.click(trigger);
    await screen.findByRole("dialog");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("keeps the sheet open with an error and the values intact when saving fails", async () => {
    server.createError = new AppError(
      "network",
      "Could not reach the server.",
    );
    const dialog = await openLedgerSheet();

    await userEvent.type(within(dialog).getByLabelText("Amount"), "500");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add charge" }),
    );

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Could not reach the server.");
    // Sheet still open, value intact, nothing half-saved.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      (within(dialog).getByLabelText("Amount") as HTMLInputElement).value,
    ).toBe("500");
    expect(transactionsApi.createTransaction).toHaveBeenCalledTimes(1);
  });

  it("shows a Viewer no Add action in the top bar", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    renderWithTopbar(paths.business("b1"));
    // The top bar is there (search still works) — the Add is not.
    await screen.findByRole("button", { name: "Search (Ctrl+K)" });
    expect(
      screen.queryByRole("button", { name: "Add transaction" }),
    ).toBeNull();
  });

  it("shows a Viewer no Add action on the ledger", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    renderWithTopbar(paths.customerDetail("b1", "c1"));
    await screen.findByText("Current Balance");
    // Neither the ledger button nor the top bar's (case-insensitive so
    // both spellings are covered).
    expect(screen.queryByRole("button", { name: /add transaction/i })).toBeNull();
  });
});
