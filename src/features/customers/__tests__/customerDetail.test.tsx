import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { __setMatchMedia } from "@/test/setup";
import { Topbar } from "@/components/layout/Topbar";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";
import {
  closeTransactionSheet as closeSheet,
  getTransactionSheetState,
} from "@/features/transactions/sheetStore";
import { AppError } from "@/lib/AppError";
import { formatDate } from "@/lib/format";
import { paths, routePatterns } from "@/lib/paths";
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
  getAllTransactions: vi.fn(async () => []),
  getCustomerBalance: vi.fn(),
  getCustomerLedger: vi.fn(),
  getDashboardSummary: vi.fn(),
  getTodayActivity: vi.fn(async () => ({ count: 0, net: 0 })),
  getTodayTransactions: vi.fn(async () => []),
  getTransactionById: vi.fn(),
  restoreTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  voidTransaction: vi.fn(),
}));
// The fake database: transactions carry the audit columns the ledger
// reads, and the ledger mock computes balance_after exactly like the
// customer_ledger RPC (voided rows contribute nothing).
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
  getAllTransactions: transactionsApi.getAllTransactions,
  getCustomerBalance: transactionsApi.getCustomerBalance,
  getCustomerLedger: transactionsApi.getCustomerLedger,
  getDashboardSummary: transactionsApi.getDashboardSummary,
  getTodayActivity: transactionsApi.getTodayActivity,
  getTodayTransactions: transactionsApi.getTodayTransactions,
  getTransactionById: transactionsApi.getTransactionById,
  restoreTransaction: transactionsApi.restoreTransaction,
  updateTransaction: transactionsApi.updateTransaction,
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
    email: "asha@example.com",
    address: "12 Lake Road, Dhaka",
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

function seedTx(
  overrides: Partial<(typeof server.transactions)[number]>,
): (typeof server.transactions)[number] {
  return {
    id: "t1",
    business_id: "b1",
    customer_id: "c1",
    type: "charge",
    amount: 5000,
    status: "active",
    occurred_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    note: null,
    source: "manual",
    created_by: "user-1",
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    updated_by: null,
    void_reason: null,
    voided_at: null,
    voided_by: null,
    ...overrides,
  };
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

function renderDetail() {
  return renderApp(
    <Routes>
      <Route path={routePatterns.business} element={<TopbarStub />}>
        <Route index element={<div>Business home</div>} />
        <Route path="customers/:customerId" element={<CustomerDetailPage />} />
      </Route>
    </Routes>,
    { session, route: paths.customerDetail("b1", "c1") },
  );
}

/** Scope to the ledger row that shows this amount. */
function rowElementByAmount(amountText: string) {
  const cell = screen.getByText(amountText);
  const row = cell.closest("tr");
  if (!row) throw new Error(`no <tr> containing ${amountText}`);
  return row;
}

/** The StatCard root that holds this label. */
function statCard(label: string) {
  const card = screen.getByText(label).closest("div");
  if (!card) throw new Error(`no card containing ${label}`);
  return card;
}

beforeEach(() => {
  // Module state shared by every test in this file.
  closeSheet();
  __setMatchMedia(false);

  server.customers = [
    seedCustomer({
      id: "c1",
      name: "Asha Verma",
      phone: "01711 111111",
      tags: ["regular", "wholesale"],
    }),
  ];
  server.transactions = [
    seedTx({ id: "t1", type: "charge", amount: 5000 }),
    seedTx({
      id: "t2",
      type: "payment",
      amount: 500,
      occurred_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      note: "partial",
    }),
  ];
  server.balances = { c1: 4500 };

  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );

  customersApi.getCustomer.mockImplementation(async (id: string) => {
    const row = server.customers.find((customer) => customer.id === id);
    if (!row) throw new Error("customer not found");
    return { ...row };
  });
  customersApi.listCustomers.mockImplementation(async () =>
    server.customers.map((customer) => ({ ...customer })),
  );
  customersApi.countCustomerTransactions.mockImplementation(async () => 1);
  customersApi.setCustomerArchived.mockImplementation(
    async (id: string, archived: boolean) => {
      const row = server.customers.find((customer) => customer.id === id);
      if (!row) throw new Error("customer not found");
      row.archived_at = archived ? new Date().toISOString() : null;
      return { ...row };
    },
  );

  transactionsApi.getCustomerBalance.mockImplementation(
    async (id: string) => server.balances[id] ?? 0,
  );
  // S-31's customer_ledger contract: every status, newest first,
  // balance_after computed the way the RPC computes it (voided rows
  // contribute nothing), editor names resolved when profiles know them.
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
});

describe("S-31 customer detail v2", () => {
  it("header and hero: avatar, tags, tappable contacts, Edit + Archive menu, the balance as the largest element with stat cards and the two primary actions", async () => {
    renderDetail();
    await screen.findByText("Current Balance");

    // Header.
    screen.getByText("AV"); // avatar initials
    screen.getByRole("heading", { name: "Asha Verma" });
    screen.getByText("regular");
    screen.getByText("wholesale");
    const tel = screen.getByRole("link", { name: /01711 111111/ });
    expect(tel.getAttribute("href")).toBe("tel:01711 111111");
    const mail = screen.getByRole("link", { name: /asha@example.com/ });
    expect(mail.getAttribute("href")).toBe("mailto:asha@example.com");
    screen.getByText(/12 Lake Road, Dhaka/);

    // Edit + a menu with Archive (owner, active customer).
    screen.getByRole("button", { name: "Edit" });
    await userEvent.click(
      screen.getByRole("button", { name: "Customer actions" }),
    );
    screen.getByRole("menuitem", { name: "Archive" });

    // The balance is the hero: the biggest number on the page, badge
    // alongside.
    const hero = screen.getByText("₹4,500");
    expect(hero.className).toContain("text-5xl");
    screen.getByText("Current Balance");
    screen.getByText("Owes you");

    // Stat cards — total charged excludes the payment, total paid is
    // the payments, last activity is the newest entry.
    await waitFor(() =>
      expect(
        within(statCard("Total charged")).getByText("₹5,000.00"),
      ).toBeTruthy(),
    );
    within(statCard("Total paid")).getByText("₹500.00");
    within(statCard("Last activity")).getByText(
      formatDate(new Date(Date.now() - 2 * 86400000)),
    );

    // The two primary actions.
    screen.getByRole("button", { name: "Add charge" });
    screen.getByRole("button", { name: "Add payment" });
  });

  it("Add payment opens the shared sheet with Payment already selected (S-31 preset)", async () => {
    renderDetail();
    await screen.findByText("Current Balance");

    await userEvent.click(screen.getByRole("button", { name: "Add payment" }));
    const dialog = await screen.findByRole("dialog");

    // The store remembers which of the two buttons opened it…
    expect(getTransactionSheetState()).toMatchObject({
      open: true,
      mode: "add",
      presetType: "payment",
    });
    // …and the form speaks in that type: the footer follows the
    // selected type, so "Add payment" here proves Payment is selected.
    const submit = within(dialog).getByRole("button", { name: "Add payment" });

    await userEvent.type(within(dialog).getByLabelText("Amount"), "500");
    await userEvent.click(submit);

    await waitFor(() =>
      expect(transactionsApi.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ customer_id: "c1", type: "payment" }),
        "b1",
      ),
    );
  });

  it("ledger: newest first with Balance after per row from the RPC, voided rows muted and out of the running balance", async () => {
    server.transactions.push(
      seedTx({
        id: "t3",
        type: "charge",
        amount: 300,
        status: "voided",
        occurred_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      }),
    );
    renderDetail();
    await screen.findByText("Current Balance");

    // The ledger comes from the RPC, business-scoped.
    await waitFor(() =>
      expect(transactionsApi.getCustomerLedger).toHaveBeenCalledWith(
        "c1",
        "b1",
      ),
    );

    // Every PRD column is there.
    const headers = screen
      .getAllByRole("columnheader")
      .map((el) => el.textContent);
    expect(headers).toEqual(
      expect.arrayContaining(["Date", "Type", "Note", "Amount", "Balance after"]),
    );

    // Newest first: the voided charge (one day ago) leads.
    const rows = screen.getAllByRole("row");
    within(rows[1]!).getByText("Voided");

    // Balance after is the running total in date order; the voided
    // 300-charged row shows the live balance (its own amount is not
    // part of the math).
    const voidedRow = rowElementByAmount("+₹300");
    within(voidedRow).getByText("₹4,500.00");
    // The voided amount itself is struck through…
    expect(screen.getByText("+₹300").className).toContain("line-through");
    // …the payment row carries the same running balance…
    within(rowElementByAmount("-₹500")).getByText("₹4,500.00");
    // …and the opening charge starts at 5000.
    within(rowElementByAmount("+₹5,000")).getByText("₹5,000.00");
  });

  it("ledger filters: All / Charges / Payments and Show voided (on by default)", async () => {
    server.transactions.push(
      seedTx({
        id: "t3",
        type: "charge",
        amount: 300,
        status: "voided",
        occurred_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      }),
    );
    renderDetail();
    await screen.findByText("Current Balance");
    await waitFor(() =>
      expect(screen.getByText("+₹300")).toBeTruthy(), // voided visible by default
    );

    // Charges: both charges (including the voided one), no payment.
    await userEvent.click(screen.getByRole("button", { name: "Charges" }));
    await waitFor(() => expect(screen.queryByText("-₹500")).toBeNull());
    screen.getByText("+₹5,000");
    screen.getByText("+₹300");

    // Payments: just the payment.
    await userEvent.click(screen.getByRole("button", { name: "Payments" }));
    await waitFor(() => expect(screen.queryByText("+₹5,000")).toBeNull());
    screen.getByText("-₹500");

    // Back to All: everything again.
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    await waitFor(() => screen.getByText("+₹5,000"));
    screen.getByText("+₹300");

    // Show voided is on by default; switching it off hides the voided
    // row only, and switching it back brings it home.
    const toggle = screen.getByRole("button", { name: "Show voided" });
    await userEvent.click(toggle);
    await waitFor(() => expect(screen.queryByText("+₹300")).toBeNull());
    screen.getByText("+₹5,000");
    screen.getByText("-₹500");

    await userEvent.click(toggle);
    await waitFor(() => screen.getByText("+₹300"));
  });

  it("Details tab shows every profile field and notes", async () => {
    server.customers[0] = {
      ...server.customers[0]!,
      alternate_contact_name: "Rafiq Chowdhury",
      alternate_contact_phone: "01799 999999",
      tags: ["regular", "wholesale"],
      notes: "Pays by bKash on Fridays.",
    };
    renderDetail();
    await screen.findByText("Current Balance");

    await userEvent.click(screen.getByRole("tab", { name: "Details" }));

    // Every field has its label…
    for (const label of [
      "Phone",
      "Email",
      "Address",
      "Alternate contact name",
      "Alternate contact phone",
      "Tags",
      "Notes",
      "Created",
      "Last updated",
    ]) {
      screen.getByText(label);
    }
    // …with the values beside them (scoped: the header links repeat a
    // few of them).
    const field = (label: string) => {
      const dt = screen.getByText(label);
      const box = dt.parentElement;
      if (!box) throw new Error(`no field box for ${label}`);
      return within(box);
    };
    field("Phone").getByText("01711 111111");
    field("Email").getByText("asha@example.com");
    field("Address").getByText("12 Lake Road, Dhaka");
    field("Alternate contact name").getByText("Rafiq Chowdhury");
    field("Alternate contact phone").getByText("01799 999999");
    field("Tags").getByText("regular, wholesale");
    field("Notes").getByText("Pays by bKash on Fridays.");
    field("Created").getByText(formatDate("2026-01-05T00:00:00+00:00"));
  });

  it("archived: the menu archives through its confirmation, the banner restores, and writes stay hidden while archived", async () => {
    renderDetail();
    await screen.findByText("Current Balance");

    // Owner archives through the header menu + confirmation.
    await userEvent.click(
      screen.getByRole("button", { name: "Customer actions" }),
    );
    await userEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    within(dialog).getByText("Archive Asha Verma?");
    // The dialog states the exact transaction count (mock returns 1).
    within(dialog).getByText(/has 1 transaction/);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Archive customer" }),
    );

    await waitFor(() =>
      expect(customersApi.setCustomerArchived).toHaveBeenCalledWith(
        "c1",
        true,
        "b1",
      ),
    );
    await screen.findByText("This customer is archived.");

    // Writes are hidden while archived…
    expect(screen.queryByRole("button", { name: "Add charge" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Customer actions" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Void (charge|payment)/ }),
    ).toBeNull();
    // …but the history stays readable.
    screen.getByText("Current Balance");
    rowElementByAmount("+₹5,000");

    // The banner's Restore brings it all back.
    await userEvent.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(customersApi.setCustomerArchived).toHaveBeenCalledWith(
        "c1",
        false,
        "b1",
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("This customer is archived."),
      ).toBeNull(),
    );
    screen.getByRole("button", { name: "Add charge" });
    screen.getByRole("button", { name: "Customer actions" });
  });

  it("Viewer: everything readable, no write actions anywhere", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    renderDetail();
    await screen.findByText("Current Balance");
    await waitFor(() => screen.getByText("+₹5,000"));

    // No primary actions, no Edit, no menu, no row actions.
    expect(screen.queryByRole("button", { name: "Add charge" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Customer actions" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Void (charge|payment)/ }),
    ).toBeNull();

    // Reading works: the table and the tabs are all there.
    screen.getAllByRole("columnheader");
    screen.getByRole("tab", { name: "Ledger" });
    screen.getByRole("tab", { name: "Details" });
  });

  it("narrow screens: the ledger renders as cards", async () => {
    __setMatchMedia(true);
    try {
      renderDetail();
      await screen.findByText("Current Balance");

      // No table — card blocks instead, each carrying its figures.
      await waitFor(() =>
        expect(screen.queryByRole("columnheader")).toBeNull(),
      );
      const cards = screen.getAllByText(/Balance after/);
      expect(cards).toHaveLength(2); // both seeded rows
      screen.getByText("Balance after ₹5,000.00");
      // The row actions ride along in the card (owner).
      screen.getByRole("button", { name: "Void charge of ₹5000" });
      screen.getByRole("button", { name: "Void payment of ₹500" });
    } finally {
      __setMatchMedia(false);
    }
  });

  it("empty: an EmptyState points at Add charge and Add payment", async () => {
    server.transactions = [];
    server.balances = { c1: 0 };

    renderDetail();
    await screen.findByText("Current Balance");

    await screen.findByText("No transactions yet");
    // The same two actions appear in the hero AND in the empty state.
    expect(
      screen.getAllByRole("button", { name: "Add charge" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "Add payment" }),
    ).toHaveLength(2);
    // Zeroed figures read honestly.
    within(statCard("Total charged")).getByText("₹0.00");
    within(statCard("Total paid")).getByText("₹0.00");
    within(statCard("Last activity")).getByText("No activity yet");
  });

  it("error: the ledger failure shows an ErrorState whose retry re-reads", async () => {
    let calls = 0;
    transactionsApi.getCustomerLedger.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        throw new AppError("network", "Could not reach the server.");
      }
      return [];
    });

    renderDetail();
    await screen.findByText("Current Balance");

    await screen.findByText("Could not reach the server.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    // Second read succeeds: the empty state takes over.
    await screen.findByText("No transactions yet");
    expect(calls).toBe(2);
  });
});
