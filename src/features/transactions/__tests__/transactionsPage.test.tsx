import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { __setMatchMedia } from "@/test/setup";
import { Topbar } from "@/components/layout/Topbar";
import { TransactionsPage } from "@/features/transactions/pages/TransactionsPage";
import {
  closeTransactionSheet as closeSheet,
  getTransactionSheetState,
} from "@/features/transactions/sheetStore";
import { paths, routePatterns } from "@/lib/paths";
import type { Memberships } from "@/features/business/api";
import type { CustomerListRow } from "@/features/customers/api";

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
  getAllCustomerBalances: vi.fn(async () => ({})),
  queryTransactions: vi.fn(),
  transactionRollup: vi.fn(),
  getCustomerBalance: vi.fn(async () => 0),
  getCustomerLedger: vi.fn(async () => []),
  getDashboardSummary: vi.fn(),
  getTransactionById: vi.fn(),
  restoreTransaction: vi.fn(async () => {}),
  updateTransaction: vi.fn(),
  voidTransaction: vi.fn(async () => {}),
}));

/** One row of the detailed view: the stored entry, the inner-join
 *  customer and the resolved profile names the page labels render. */
interface ListRow {
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
  customer: { id: string; name: string; phone: string | null };
  created_by_name: string | null;
  updated_by_name: string | null;
}

interface PeriodRow {
  period_start: string | null;
  entries: number;
  total_charged: number;
  total_paid: number;
  net: number;
}

// The fake server: the list returns whatever the test seeded; the
// rollup branches on granularity exactly like the page's two queries
// (null = the ungrouped totals row for the footer).
const server = vi.hoisted(() => ({
  rows: [] as ListRow[],
  total: 0,
  periods: [] as PeriodRow[],
  totals: null as PeriodRow | null,
  customers: [] as CustomerListRow[],
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
  getCustomerLedger: transactionsApi.getCustomerLedger,
  getDashboardSummary: transactionsApi.getDashboardSummary,
  getTransactionById: transactionsApi.getTransactionById,
  restoreTransaction: transactionsApi.restoreTransaction,
  updateTransaction: transactionsApi.updateTransaction,
  voidTransaction: transactionsApi.voidTransaction,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const session = {
  user: { email: "ollie@example.com" },
} as unknown as Session;

function membershipsFor(role: "owner" | "viewer"): Memberships {
  return {
    businesses: [
      {
        id: "b1",
        name: "Bahi Khata",
        businessType: null,
        ownerId: "u1",
        ownerName: "Ollie Owner",
        ownerEmail: "ollie@example.com",
        role,
        isOwner: role === "owner",
      },
    ],
    invitations: [],
  };
}

function seedRow(overrides: Partial<ListRow>): ListRow {
  return {
    id: "t1",
    business_id: "b1",
    customer_id: "c1",
    type: "charge",
    amount: 5000,
    status: "active",
    occurred_at: "2026-10-12T10:00:00+00:00",
    note: null,
    source: "manual",
    created_by: "u1",
    created_at: "2026-10-12T10:00:00+00:00",
    updated_at: "2026-10-12T10:00:00+00:00",
    updated_by: null,
    void_reason: null,
    voided_at: null,
    voided_by: null,
    customer: { id: "c1", name: "Asha Verma", phone: "01711 111111" },
    created_by_name: "Eli Hassan",
    updated_by_name: null,
    ...overrides,
  };
}

function seedCustomer(overrides: Partial<CustomerListRow>): CustomerListRow {
  return {
    id: "c1",
    name: "Asha Verma",
    phone: "01711 111111",
    email: "asha@example.com",
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
  return <div data-testid="url">{location.search}</div>;
}

function TransactionDetailStub() {
  const params = useParams();
  return <div>Transaction detail {params.transactionId}</div>;
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
      <LocationProbe />
      <Outlet />
    </>
  );
}

function renderPage(route = paths.transactions("b1")) {
  return renderApp(
    <Routes>
      <Route path={routePatterns.business} element={<TopbarStub />}>
        <Route path="transactions" element={<TransactionsPage />} />
        <Route
          path="transactions/:transactionId"
          element={<TransactionDetailStub />}
        />
      </Route>
    </Routes>,
    { session, route },
  );
}

/** Scope to the row that shows this amount (mobile cards included —
 *  the card root is the closest block container). */
function rowElementByAmount(amountText: string) {
  const cell = screen.getByText(amountText);
  const row =
    cell.closest("tr") ??
    (cell.closest("[class*='rounded-lg']") as HTMLElement | null);
  if (!row) throw new Error(`no row containing ${amountText}`);
  return row;
}

beforeEach(() => {
  closeSheet();
  __setMatchMedia(false);

  server.rows = [
    seedRow({
      id: "t1",
      amount: 5000,
      note: "Rice for the month",
      customer: { id: "c1", name: "Asha Verma", phone: "01711 111111" },
    }),
    seedRow({
      id: "t2",
      type: "payment",
      amount: 500,
      status: "edited",
      occurred_at: "2026-10-10T09:00:00+00:00",
      updated_at: "2026-10-11T05:00:00+00:00",
      updated_by: "u1",
      created_by_name: "Ollie Owner",
      customer: { id: "c9", name: "Rahim Traders", phone: null },
    }),
    seedRow({
      id: "t3",
      amount: 700,
      source: "import",
      occurred_at: "2026-10-08T09:00:00+00:00",
      customer: { id: "c11", name: "Karim Store", phone: null },
      created_by_name: null,
    }),
  ];
  server.total = 3;
  server.periods = [
    {
      period_start: "2026-10-12T00:00:00",
      entries: 2,
      total_charged: 1500,
      total_paid: 300,
      net: 1200,
    },
    {
      period_start: "2026-10-05T00:00:00",
      entries: 1,
      total_charged: 500,
      total_paid: 0,
      net: 500,
    },
  ];
  server.totals = {
    period_start: null,
    entries: 42,
    total_charged: 5700,
    total_paid: 700,
    net: 5000,
  };
  server.customers = [
    seedCustomer({ id: "c1", name: "Asha Verma" }),
    seedCustomer({ id: "c9", name: "Rahim Traders", phone: null }),
  ];

  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
  customersApi.listCustomers.mockImplementation(async () => server.customers);
  customersApi.getCustomer.mockImplementation(
    async (id: string) =>
      server.customers.find((customer) => customer.id === id) ?? null,
  );
  transactionsApi.queryTransactions.mockImplementation(async () => ({
    rows: server.rows,
    total: server.total,
  }));
  transactionsApi.transactionRollup.mockImplementation(
    async (_bid: string, params: { granularity?: string | null }) => {
      if (params?.granularity) return server.periods;
      return server.totals ? [server.totals] : [];
    },
  );
  transactionsApi.restoreTransaction.mockImplementation(async () => {});
  transactionsApi.voidTransaction.mockImplementation(async () => {});
});

describe("S-35 transactions page v2", () => {
  it("detailed view: columns, newest first, linked customer, recorded by and status/source badges on the default This-month range; sortable headers re-query server-side", async () => {
    renderPage();
    // The list resolves asynchronously — settle before querying rows.
    await screen.findByText("Rice for the month");

    for (const header of [
      "Date",
      "Customer",
      "Type",
      "Note",
      "Amount",
      "Recorded by",
      "Status",
    ]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    }

    // Newest first = the server's order, passed through untouched.
    const firstRow = rowElementByAmount("+₹5,000");
    expect(within(firstRow).getByText("Asha Verma")).toBeTruthy();
    expect(within(firstRow).getByText("Rice for the month")).toBeTruthy();
    expect(within(firstRow).getByText("Eli Hassan")).toBeTruthy();
    expect(within(firstRow).getByText("Charge")).toBeTruthy();

    const secondRow = rowElementByAmount("-₹500");
    expect(within(secondRow).getByText("Rahim Traders")).toBeTruthy();
    expect(within(secondRow).getByText("Edited")).toBeTruthy();

    const thirdRow = rowElementByAmount("+₹700");
    expect(within(thirdRow).getByText("Import")).toBeTruthy();
    // A former member resolves to the S-25 fallback.
    expect(within(thirdRow).getByText("Former member")).toBeTruthy();

    // The customer is a link to its detail page.
    const customerLink = screen.getByRole("link", { name: /Asha Verma/ });
    expect(customerLink.getAttribute("href")).toBe(
      paths.customerDetail("b1", "c1"),
    );

    // Default range = This month, half-open, newest first, paged.
    await waitFor(() =>
      expect(transactionsApi.queryTransactions).toHaveBeenCalled(),
    );
    const now = new Date();
    expect(transactionsApi.queryTransactions.mock.calls[0]).toEqual([
      "b1",
      expect.objectContaining({
        range: {
          start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
          end: new Date(now.getFullYear(), now.getMonth() + 1, 1)
            .toISOString(),
        },
        type: "all",
        customerId: null,
        includeVoided: false,
        page: 1,
        pageSize: 25,
        sort: "occurred_at",
        dir: "desc",
      }),
    ]);
    // The footer reads the ungrouped rollup row.
    await waitFor(() =>
      expect(transactionsApi.transactionRollup).toHaveBeenCalled(),
    );
    await waitFor(() =>
      expect(transactionsApi.transactionRollup.mock.calls[0]?.[1]).toMatchObject(
        { granularity: null, includeVoided: false },
      ),
    );

    // Row click still opens the entry's detail page.
    await userEvent.click(rowElementByAmount("+₹5,000"));
    expect(await screen.findByText("Transaction detail t1")).toBeTruthy();
  });

  it("row click opens the entry detail and sortable headers re-query server-side", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("columnheader", { name: "Amount" }));
    await waitFor(() =>
      expect(transactionsApi.queryTransactions).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ sort: "amount", dir: "asc" }),
      ),
    );
  });

  it("filters write to the URL and reach both queries (type, voided, text search)", async () => {
    renderPage();

    // Type pill
    await userEvent.click(screen.getByRole("button", { name: "Payment" }));
    await waitFor(() =>
      expect(transactionsApi.queryTransactions).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ type: "payment" }),
      ),
    );
    expect(screen.getByText("Type: Payment")).toBeTruthy();
    expect(screen.getByTestId("url").textContent).toContain("type=payment");

    // Include voided
    await userEvent.click(
      screen.getByRole("button", { name: "Include voided" }),
    );
    await waitFor(() =>
      expect(transactionsApi.queryTransactions).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ includeVoided: true }),
      ),
    );
    expect(screen.getByText("Including voided")).toBeTruthy();
    expect(screen.getByTestId("url").textContent).toContain("voided=1");
    await waitFor(() =>
      expect(transactionsApi.transactionRollup).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ includeVoided: true }),
      ),
    );

    // Text search: SearchInput debounces its own callback.
    await userEvent.type(
      screen.getByLabelText("Search by customer, phone or note"),
      "bKash",
    );
    await waitFor(
      () =>
        expect(transactionsApi.queryTransactions).toHaveBeenCalledWith(
          "b1",
          expect.objectContaining({ search: "bKash" }),
        ),
      { timeout: 2000 },
    );
    expect(screen.getByText("Search: bKash")).toBeTruthy();
    expect(screen.getByTestId("url").textContent).toContain("q=bKash");
  });

  it("deep link: every filter, view and group restores from the query string — the dashboard's Today link shape", async () => {
    renderPage(
      `${paths.transactions("b1")}?range=today&type=charge&q=sha&voided=1&view=summarized`,
    );

    expect(await screen.findByText("Range: Today")).toBeTruthy();
    expect(screen.getByText("Type: Charge")).toBeTruthy();
    expect(screen.getByText("Search: sha")).toBeTruthy();
    expect(screen.getByText("Including voided")).toBeTruthy();
    expect(screen.getByTestId("url").textContent).toContain("range=today");

    // Today's half-open bounds reach the detailed query.
    await waitFor(() =>
      expect(transactionsApi.queryTransactions).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({
          type: "charge",
          includeVoided: true,
          search: "sha",
        }),
      ),
    );
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    expect(transactionsApi.queryTransactions.mock.calls[0]![1].range).toEqual({
      start: start.toISOString(),
      end: end.toISOString(),
    });

    // view=summarized lands directly on the period table (day grouping).
    expect(
      await screen.findByRole("columnheader", { name: "Period" }),
    ).toBeTruthy();
    expect(await screen.findByText("12 Oct 2026")).toBeTruthy();
    await waitFor(() =>
      expect(
        transactionsApi.transactionRollup.mock.calls.some(
          (call) => call[1]?.granularity === "day",
        ),
      ).toBe(true),
    );
  });

  it("the customer filter searches the feed, writes the URL and shows the live name", async () => {
    renderPage();

    await userEvent.click(
      screen.getByRole("button", { name: "Filter by customer" }),
    );
    const popoverSearch = await screen.findByLabelText("Search customers");
    await userEvent.type(popoverSearch, "Rah");

    const option = await screen.findByRole("button", {
      name: /Rahim Traders/,
    });
    // The popover search debounces — Asha leaves once it settles.
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Asha Verma/ })).toBeNull(),
    );
    await userEvent.click(option);

    await waitFor(() =>
      expect(transactionsApi.queryTransactions).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ customerId: "c9" }),
      ),
    );
    expect(
      (await screen.findAllByText("Customer: Rahim Traders")).length,
    ).toBeGreaterThan(0);
    expect(screen.getByTestId("url").textContent).toContain("customer=c9");

    // Removing the chip widens the query again.
    await userEvent.click(
      screen.getByRole("button", {
        name: "Remove filter Customer: Rahim Traders",
      }),
    );
    await waitFor(() =>
      expect(transactionsApi.queryTransactions).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ customerId: null }),
      ),
    );
    expect(screen.queryByText(/Customer: Rahim/)).toBeNull();
  });

  it("summarized view: database-computed periods, labels and the group-by control", async () => {
    renderPage();

    await userEvent.click(screen.getByRole("button", { name: "Summarized" }));
    expect(screen.getByTestId("url").textContent).toContain("view=summarized");

    // Day grouping by default — the rollup's numbers land in the table.
    await waitFor(() =>
      expect(
        transactionsApi.transactionRollup.mock.calls.some(
          (call) => call[1]?.granularity === "day",
        ),
      ).toBe(true),
    );
    for (const header of ["Period", "Entries", "Charges", "Payments", "Net"]) {
      expect(screen.getByRole("columnheader", { name: header })).toBeTruthy();
    }
    expect(await screen.findByText("12 Oct 2026")).toBeTruthy();
    expect(screen.getByText("5 Oct 2026")).toBeTruthy();
    expect(screen.getByText("₹1,500.00")).toBeTruthy();
    expect(screen.getByText("+₹1,200.00")).toBeTruthy();

    // Week grouping re-cuts the buckets server-side.
    await userEvent.click(screen.getByLabelText("Group by"));
    await userEvent.click(await screen.findByRole("option", { name: "Week" }));
    await waitFor(() =>
      expect(
        transactionsApi.transactionRollup.mock.calls.some(
          (call) => call[1]?.granularity === "week",
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("Week of 12 Oct")).toBeTruthy();
    expect(screen.getByTestId("url").textContent).toContain("group=week");
  });

  it("totals for the current filter cover everything matching, not only the visible page", async () => {
    server.total = 120;
    renderPage();

    const region = await screen.findByRole("region", {
      name: "Totals for the current filter",
    });
    await waitFor(() =>
      expect(within(region).getByText("₹5,700.00")).toBeTruthy(),
    );
    expect(within(region).getByText("₹700.00")).toBeTruthy();
    expect(within(region).getByText("₹5,000.00")).toBeTruthy();
    expect(within(region).getByText(/42 entries/)).toBeTruthy();

    // Paging happens server-side and the footer does not follow the
    // page — it always reports the whole filtered set.
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(transactionsApi.queryTransactions).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ page: 2 }),
      ),
    );
    expect(screen.getByTestId("url").textContent).toContain("page=2");
    const regionAfter = screen.getByRole("region", {
      name: "Totals for the current filter",
    });
    expect(within(regionAfter).getByText("₹5,700.00")).toBeTruthy();
    expect(within(regionAfter).getByText(/42 entries/)).toBeTruthy();
  });

  it("a pending read renders the loading skeleton", async () => {
    transactionsApi.queryTransactions.mockImplementation(
      () => new Promise(() => {}),
    );
    renderPage();

    // Headers stay, rows do not.
    expect(screen.getByRole("columnheader", { name: "Date" })).toBeTruthy();
    expect(screen.queryByText("No transactions yet")).toBeNull();
    expect(screen.queryByText("Asha Verma")).toBeNull();
  });

  it("a genuinely empty business shows the empty state whose Add Transaction opens the shared sheet", async () => {
    server.rows = [];
    server.total = 0;
    renderPage();

    expect(await screen.findByText("No transactions yet")).toBeTruthy();
    const addButtons = screen.getAllByRole("button", {
      name: "Add Transaction",
    });
    expect(addButtons.length).toBe(2); // header + empty state
    await userEvent.click(addButtons[1]!);
    expect(getTransactionSheetState()).toMatchObject({
      open: true,
      mode: "add",
    });
    closeSheet();
  });

  it("filters that match nothing keep the active filters visible and Clear filters resets the URL", async () => {
    server.rows = [];
    server.total = 0;
    renderPage(`${paths.transactions("b1")}?type=payment&q=nothing`);

    expect(
      await screen.findByText("No transactions match these filters"),
    ).toBeTruthy();
    expect(screen.getByText("Type: Payment")).toBeTruthy();
    expect(screen.getByText("Search: nothing")).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: /Clear filters/ }),
    );
    await waitFor(() =>
      expect(transactionsApi.queryTransactions).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ type: "all", search: "" }),
      ),
    );
    expect(screen.getByTestId("url").textContent).toBe("");
    expect(screen.queryByText("No transactions match these filters")).toBeNull();
    expect(await screen.findByText("No transactions yet")).toBeTruthy();
  });

  it("a failed read shows the error state and Try again re-reads", async () => {
    transactionsApi.queryTransactions.mockImplementation(async () => {
      throw new Error("Network exploded");
    });
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeTruthy();

    transactionsApi.queryTransactions.mockImplementation(async () => ({
      rows: server.rows,
      total: server.total,
    }));
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Asha Verma")).toBeTruthy();
  });

  it("narrow screens render cards and never truncate amounts", async () => {
    __setMatchMedia(true);
    try {
      renderPage();

      expect(await screen.findByText("Asha Verma")).toBeTruthy();
      expect(screen.queryByRole("columnheader")).toBeNull();
      const amount = screen.getByText("+₹5,000");
      expect(amount.className).not.toContain("truncate");
      expect(screen.getByText("-₹500")).toBeTruthy();
      expect(screen.getByText("Former member")).toBeTruthy();
    } finally {
      __setMatchMedia(false);
    }
  });

  it("viewers read everything but find no write action", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    renderPage();

    expect(await screen.findByText("Asha Verma")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Transaction" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Edit charge of ₹5000" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Void charge of ₹5000" }),
    ).toBeNull();
    // The information itself stays fully readable.
    expect(screen.getByRole("columnheader", { name: "Amount" })).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Totals for the current filter" }),
    ).toBeTruthy();
  });

  it("row actions follow the role: edit opens the shared sheet, void confirms, a voided row restores", async () => {
    server.rows = [
      seedRow({ id: "t1", amount: 5000 }),
      seedRow({
        id: "t9",
        amount: 300,
        status: "voided",
        occurred_at: "2026-10-09T09:00:00+00:00",
        customer: { id: "c13", name: "Karim Store", phone: null },
        created_by_name: "Ollie Owner",
      }),
    ];
    server.total = 2;
    renderPage(`${paths.transactions("b1")}?voided=1`);

    // Edit → the one shared sheet, in edit mode.
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit charge of ₹5000" }),
    );
    expect(getTransactionSheetState()).toMatchObject({
      open: true,
      mode: "edit",
    });
    closeSheet();

    // Void → the confirmation dialog with its copy. The sheet has just
    // closed (its modal aria-hidden lingers a beat), so wait for it.
    await userEvent.click(
      await screen.findByRole("button", { name: "Void charge of ₹5000" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Void this charge of ₹5000?"),
    ).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // The voided row offers Restore (and nothing else).
    await userEvent.click(
      await screen.findByRole("button", { name: "Restore charge of ₹300" }),
    );
    await waitFor(() =>
      expect(transactionsApi.restoreTransaction).toHaveBeenCalledWith(
        "t9",
        "b1",
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Edit charge of ₹300" }),
    ).toBeNull();
  });
});
