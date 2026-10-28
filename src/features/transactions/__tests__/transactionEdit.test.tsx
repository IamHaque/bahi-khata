import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { Topbar } from "@/components/layout/Topbar";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";
import { paths, routePatterns } from "@/lib/paths";
import { formatDate, formatTime } from "@/lib/format";
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
// The fake database, richer than the add-sheet suite: rows carry the
// audit columns the Edited badge reads, profiles hold the editor
// names, and mutations write back so the refetch is observable.
const server = vi.hoisted(() => ({
  customers: [] as CustomerListRow[],
  profiles: [] as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
  }>,
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
        </Route>
      </Routes>
    </>,
    { session, route },
  );
}

/** An ISO day in the LOCAL timezone (the form speaks local wall clock). */
function isoDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The instant a day-start timestamp stores: local start of day. */
function atDayStart(offsetDays: number): string {
  return new Date(`${isoDay(offsetDays)}T00:00`).toISOString();
}

/** Open a customer's ledger and wait for the rows. */
async function openLedger(customerId = "c1") {
  renderWithTopbar(paths.customerDetail("b1", customerId));
  await screen.findByRole("tab", { name: "Ledger" });
}

/** Scope to the ledger body row whose Charged or Paid cell shows
 *  exactly this amount (L-07: the column word carries the direction,
 *  so numbers print unsigned; the totals row prints the same digits,
 *  hence the tbody scope). */
function rowScopeByAmount(amountText: string) {
  const row = Array.from(
    document.querySelectorAll<HTMLTableRowElement>("tbody tr"),
  ).find(
    (tr) =>
      tr.cells[2]?.textContent?.trim() === amountText ||
      tr.cells[3]?.textContent?.trim() === amountText,
  );
  if (!row) throw new Error(`no ledger row with amount ${amountText}`);
  return within(row);
}

beforeEach(() => {
  // Module store shared by every test in this file.
  closeTransactionSheet();

  server.customers = [
    seedCustomer({ id: "c1", name: "Asha Verma", phone: "01711 111111" }),
    seedCustomer({ id: "c2", name: "Karim Chowdhury", phone: "01722 222222" }),
  ];
  server.profiles = [
    { id: "u-eli", full_name: "Eli", email: "eli@example.com" },
  ];
  server.transactions = [
    {
      id: "t1",
      business_id: "b1",
      customer_id: "c1",
      type: "payment",
      amount: 500,
      status: "active",
      occurred_at: atDayStart(-3),
      note: "partial",
      source: "manual",
      created_by: "user-1",
      created_at: atDayStart(-3),
      updated_at: atDayStart(-3),
      updated_by: null,
    },
    {
      id: "t0",
      business_id: "b1",
      customer_id: "c1",
      type: "charge",
      amount: 5000,
      status: "active",
      occurred_at: atDayStart(-6),
      note: null,
      source: "manual",
      created_by: "user-1",
      created_at: atDayStart(-6),
      updated_at: atDayStart(-6),
      updated_by: null,
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
  // visible — S-34), newest first, balance_after computed the way the
  // RPC computes it (voided contributes nothing), editor names
  // resolved against profiles (unreadable → null → the badge's
  // "Former member").
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
        return { ...tx, balance_after: running };
      })
      .reverse()
      .map((tx) => ({
        ...tx,
        updated_by_name: tx.updated_by
          ? (server.profiles.find((profile) => profile.id === tx.updated_by)
              ?.full_name ?? null)
          : null,
      }));
  });
  // Mirrors the real api's payload contract: only the editable fields
  // apply; provenance (source, created_by) is untouched; status flips
  // to edited with who/when; the balance swaps the old effect for the
  // new one.
  transactionsApi.updateTransaction.mockImplementation(
    async (id: string, input: Record<string, unknown>) => {
      const tx = server.transactions.find((row) => row.id === id);
      if (!tx) throw new Error("transaction not found");
      const oldEffect = tx.type === "charge" ? tx.amount : -tx.amount;
      if (input.type !== undefined) tx.type = String(input.type);
      if (input.amount !== undefined) tx.amount = Number(input.amount);
      if (input.occurred_at !== undefined)
        tx.occurred_at = String(input.occurred_at);
      if (input.note !== undefined)
        tx.note = (input.note as string | null) ?? null;
      const newEffect = tx.type === "charge" ? tx.amount : -tx.amount;
      server.balances[tx.customer_id] =
        (server.balances[tx.customer_id] ?? 0) - oldEffect + newEffect;
      tx.status = "edited";
      tx.updated_at = new Date().toISOString();
      tx.updated_by = "user-1";
      return { ...tx };
    },
  );
});

describe("S-33 edit transaction", () => {
  it("edits in the same sheet: prefilled row values, honest preview, recalculated balance, Edited badge", async () => {
    await openLedger();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit payment of ₹500.00" }),
    );
    const dialog = await screen.findByRole("dialog");

    // The very same sheet, in edit shape: title, prefilled values,
    // customer shown but not picked.
    within(dialog).getByText("Edit transaction");
    expect(
      (within(dialog).getByLabelText("Amount") as HTMLInputElement).value,
    ).toBe("500");
    expect(
      within(dialog).getByRole("radio", { name: "Payment" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      (within(dialog).getByLabelText("Date") as HTMLInputElement).value,
    ).toBe(isoDay(-3));
    // The stored instant was the local start of that day; the time
    // field shows it, so an unchanged save preserves the moment.
    expect(
      (within(dialog).getByLabelText("Time") as HTMLInputElement).value,
    ).toBe("00:00");
    expect(
      (within(dialog).getByLabelText("Note") as HTMLInputElement).value,
    ).toBe("partial");
    within(dialog).getByText("Asha Verma");

    // The preview knows the balance already contains this entry: it
    // removes the old 500 payment and adds the new 450 — while the
    // amounts are still equal both strips read the same, so the check
    // lands after typing.
    within(dialog).getByText("Current balance");
    const amount = within(dialog).getByLabelText("Amount");
    await userEvent.clear(amount);
    await userEvent.type(amount, "450");
    expect(await within(dialog).findByText("Balance after")).toBeTruthy();
    within(dialog).getByText("₹4,550.00");

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    // Saved through the update, not a new row.
    await waitFor(() =>
      expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({
          type: "payment",
          amount: 450,
          occurred_at: atDayStart(-3),
          note: "partial",
        }),
        "b1",
      ),
    );
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // The row keeps its place with the Edited badge…
    expect(screen.getByText("Edited")).toBeTruthy();
    rowScopeByAmount("₹450.00");
    // …the balance recalculated and flashes…
    await waitFor(() =>
      expect(
        screen
          .getAllByText("₹4,550.00")
          .find((el) => el.closest("p"))
          ?.closest("p")?.className,
      ).toContain("balance-flash"),
    );
    // …and the older row is untouched.
    expect(transactionsApi.updateTransaction).toHaveBeenCalledTimes(1);
  });

  it("shows who edited and when, with the Former member fallback", async () => {
    server.transactions = [
      { ...server.transactions[0]!, amount: 450, status: "edited", updated_by: "u-eli", updated_at: "2026-10-12T08:35:00.000Z" },
      { ...server.transactions[1]!, status: "edited", updated_by: "u-gone", updated_at: "2026-10-10T09:00:00.000Z" },
    ];

    await openLedger();

    // Hover or focus reads: 'Edited by Eli on 12 Oct 2026, …'. The
    // pill's wrapper carries the tooltip; the pill carries the text.
    const eliBadge = rowScopeByAmount("₹450.00")
      .getByText("Edited")
      .closest("span[title]");
    if (!eliBadge) throw new Error("badge wrapper with title not found");
    const expected = `Edited by Eli on ${formatDate("2026-10-12T08:35:00.000Z")}, ${formatTime("2026-10-12T08:35:00.000Z")}`;
    expect(eliBadge.getAttribute("title")).toBe(expected);
    // Focusable, and screen readers get the same sentence.
    expect(eliBadge.getAttribute("tabindex")).toBe("0");
    expect(eliBadge.textContent).toContain(expected);

    // An editor whose profile is no longer readable degrades honestly.
    const goneBadge = rowScopeByAmount("₹5,000.00")
      .getByText("Edited")
      .closest("span[title]");
    expect(goneBadge?.getAttribute("title")).toContain(
      "Edited by Former member on",
    );
  });

  it("keeps the customer fixed, allows type/amount/date/note, and applies the same validation", async () => {
    await openLedger();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit payment of ₹500.00" }),
    );
    const dialog = await screen.findByRole("dialog");

    // Customer: shown, not picked.
    within(dialog).getByText("Asha Verma");
    expect(
      within(dialog).queryByRole("button", { name: "Select customer..." }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Asha Verma" }),
    ).toBeNull();

    // Same validation as adding: above zero…
    fireEvent.change(within(dialog).getByLabelText("Amount"), {
      target: { value: "0" },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await within(dialog).findByText("Amount must be above zero"),
    ).toBeTruthy();
    expect(transactionsApi.updateTransaction).not.toHaveBeenCalled();

    // …and no future dates.
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: isoDay(1) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await within(dialog).findByText("Date cannot be in the future"),
    ).toBeTruthy();
    expect(transactionsApi.updateTransaction).not.toHaveBeenCalled();

    // Type IS editable: switch to Charge and correct everything.
    await userEvent.click(
      within(dialog).getByRole("radio", { name: "Charge" }),
    );
    fireEvent.change(within(dialog).getByLabelText("Amount"), {
      target: { value: "600" },
    });
    fireEvent.change(within(dialog).getByLabelText("Date"), {
      target: { value: isoDay(-3) },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ type: "charge", amount: 600 }),
        "b1",
      ),
    );
  });

  it("lets an imported row be edited and keeps its source", async () => {
    server.transactions.push({
      id: "t9",
      business_id: "b1",
      customer_id: "c2",
      type: "charge",
      amount: 300,
      status: "active",
      occurred_at: atDayStart(-2),
      note: null,
      source: "import",
      created_by: "user-1",
      created_at: atDayStart(-2),
      updated_at: atDayStart(-2),
      updated_by: null,
    });
    server.balances.c2 = 300;

    await openLedger("c2");
    await userEvent.click(
      screen.getByRole("button", { name: "Edit charge of ₹300.00" }),
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount"), {
      target: { value: "250" },
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(transactionsApi.updateTransaction).toHaveBeenCalledTimes(1),
    );
    // The payload never carried provenance — nothing to rewrite.
    const input = transactionsApi.updateTransaction.mock.calls[0]![1] as Record<
      string,
      unknown
    >;
    expect(input).not.toHaveProperty("source");
    expect(input).not.toHaveProperty("created_by");
    expect(input).not.toHaveProperty("customer_id");
    // The row comes back edited — and still imported.
    await waitFor(() => expect(screen.getByText("Edited")).toBeTruthy());
    rowScopeByAmount("₹250.00");
    expect(
      server.transactions.find((tx) => tx.id === "t9")?.source,
    ).toBe("import");
  });

  it("shows a Viewer no edit action anywhere", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    await openLedger();

    // No ledger pencil, no top-bar Add — the rows stay readable.
    expect(
      screen.queryByRole("button", { name: /edit (charge|payment)/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /add transaction/i }),
    ).toBeNull();
    screen.getByRole("tab", { name: "Ledger" });
    rowScopeByAmount("₹5,000.00");
  });
});
