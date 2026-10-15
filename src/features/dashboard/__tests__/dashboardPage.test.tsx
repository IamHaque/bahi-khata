import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { Topbar } from "@/components/layout/Topbar";
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { TransactionsPage } from "@/features/transactions/pages/TransactionsPage";
import {
  closeTransactionSheet as closeSheet,
  getTransactionSheetState,
} from "@/features/transactions/sheetStore";
import { formatMoney } from "@/lib/format";
import { paths, routePatterns, transactionsPath } from "@/lib/paths";
import type { Memberships } from "@/features/business/api";
import type { DashboardSummary } from "@/features/transactions/api";
import type {
  ActivityFeedItem,
  DailyActivityRow,
} from "@/features/dashboard/api";

const businessApi = vi.hoisted(() => ({ getMemberships: vi.fn() }));
const dashboardApi = vi.hoisted(() => ({
  getDailyActivity: vi.fn(),
  getActivityFeed: vi.fn(),
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

// The fake server: dashboard_summary's parsed output (the page's only
// read) plus the transactions-page pieces the Today click-through
// needs (its totals footer comes from the same-shaped rollup row).
interface RollupTotalsRow {
  period_start: string | null;
  entries: number;
  total_charged: number;
  total_paid: number;
  net: number;
}

const server = vi.hoisted(() => ({
  summary: {
    total_receivable: 9000,
    total_credit: 1200,
    open_accounts: 4,
    today_count: 3,
    today_net: 1500,
    customer_count: 12,
    top_debtors: [] as DashboardSummary["top_debtors"],
  } as DashboardSummary,
  rows: [] as unknown[],
  total: 0,
  totals: null as RollupTotalsRow | null,
  daily: [] as DailyActivityRow[],
  feed: [] as ActivityFeedItem[],
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
vi.mock("@/features/dashboard/api", () => ({
  getDailyActivity: dashboardApi.getDailyActivity,
  getActivityFeed: dashboardApi.getActivityFeed,
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const session = {
  user: { email: "ollie@example.com" },
} as unknown as Session;

function membershipsFor(role: "owner" | "editor" | "viewer"): Memberships {
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

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="url">{location.search}</div>;
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

function renderPage(route = paths.business("b1")) {
  return renderApp(
    <Routes>
      <Route path={routePatterns.business} element={<TopbarStub />}>
        <Route index element={<DashboardPage />} />
        {/* The Today card's landing spot — the click-through test
            renders the real page to prove identical count and net. */}
        <Route path="transactions" element={<TransactionsPage />} />
      </Route>
    </Routes>,
    { session, route },
  );
}

beforeEach(() => {
  closeSheet();

  server.summary = {
    total_receivable: 9000,
    total_credit: 1200,
    open_accounts: 4,
    today_count: 3,
    today_net: 1500,
    customer_count: 12,
    top_debtors: [
      { id: "c1", name: "Asha Verma", balance: 5000 },
      { id: "c9", name: "Rahim Traders", balance: 4000 },
    ],
  };
  server.rows = [];
  server.total = 0;
  server.totals = null;
  server.daily = [
    { activity_date: "2026-10-09", charges: 0, payments: 0 },
    { activity_date: "2026-10-10", charges: 2400, payments: 0 },
    { activity_date: "2026-10-11", charges: 0, payments: 600 },
    { activity_date: "2026-10-12", charges: 0, payments: 0 },
  ];
  server.feed = [
    {
      id: "t1",
      type: "payment",
      amount: 500,
      occurred_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      customer_id: "c1",
      customer_name: "Asha Verma",
      creator_name: "Eli",
    },
    {
      id: "t2",
      type: "charge",
      amount: 1500,
      occurred_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      customer_id: "c9",
      customer_name: "Rahim Traders",
      creator_name: null,
    },
  ];

  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
  transactionsApi.getDashboardSummary.mockImplementation(
    async () => server.summary,
  );
  transactionsApi.queryTransactions.mockImplementation(async () => ({
    rows: server.rows,
    total: server.total,
  }));
  transactionsApi.transactionRollup.mockImplementation(
    async (_bid: string, params: { granularity?: string | null }) => {
      if (params?.granularity) return [];
      return server.totals ? [server.totals] : [];
    },
  );
  dashboardApi.getDailyActivity.mockImplementation(async () => server.daily);
  dashboardApi.getActivityFeed.mockImplementation(async () => server.feed);
});

describe("S-36 dashboard v2", () => {
  it("KPI cards read dashboard_summary in one scoped call, receivable largest", async () => {
    renderPage();

    expect(await screen.findByText("Total owes you")).toBeTruthy();
    expect(transactionsApi.getDashboardSummary).toHaveBeenCalledWith("b1");
    expect(transactionsApi.getDashboardSummary).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Welcome, ollie")).toBeTruthy();

    // The receivable is the largest card — the PRD pins it.
    const receivable = screen.getByText("₹9,000.00");
    expect(receivable.className).toContain("text-4xl");
    expect(screen.getByText("Total you owe")).toBeTruthy();
    expect(screen.getByText("₹1,200.00").className).toContain("text-2xl");

    expect(screen.getByText("Open accounts")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();

    expect(screen.getByText("Today's activity")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Net ₹1,500.00")).toBeTruthy();
  });

  it("every KPI total equals the manual sum of the seed data (voided excluded)", async () => {
    // The seed ledger. dashboard_summary's rules: voided entries never
    // count, archived customers never count (none in this seed),
    // balance = charges - payments.
    const seed: Array<{
      customer: string;
      type: "charge" | "payment";
      amount: number;
      status: string;
    }> = [
      { customer: "Asha Verma", type: "charge", amount: 6000, status: "active" },
      { customer: "Asha Verma", type: "charge", amount: 3000, status: "active" },
      {
        customer: "Rahim Traders",
        type: "payment",
        amount: 1200,
        status: "active",
      },
      { customer: "Karim Store", type: "charge", amount: 500, status: "voided" },
    ];

    const balances = new Map<string, number>();
    for (const entry of seed) {
      if (entry.status === "voided") continue;
      const current = balances.get(entry.customer) ?? 0;
      balances.set(
        entry.customer,
        current + (entry.type === "charge" ? entry.amount : -entry.amount),
      );
    }
    const receivable = [...balances.values()]
      .filter((balance) => balance > 0)
      .reduce((sum, balance) => sum + balance, 0);
    const credit = [...balances.values()]
      .filter((balance) => balance < 0)
      .reduce((sum, balance) => sum + Math.abs(balance), 0);
    const openAccounts = [...balances.values()].filter(
      (balance) => balance !== 0,
    ).length;

    server.summary = {
      total_receivable: receivable,
      total_credit: credit,
      open_accounts: openAccounts,
      today_count: 0,
      today_net: 0,
      customer_count: 3,
      top_debtors: [],
    };
    renderPage();

    expect(await screen.findByText("Total owes you")).toBeTruthy();
    expect(screen.getByText(formatMoney(receivable))).toBeTruthy();
    expect(screen.getByText(formatMoney(credit))).toBeTruthy();
    expect(screen.getByText(String(openAccounts))).toBeTruthy();
    // The voided charge is nowhere in any figure.
    expect(screen.queryByText(formatMoney(9500))).toBeNull();
  });

  it("top outstanding: up to 8, avatar, balance and a link to detail", async () => {
    server.summary.top_debtors = Array.from({ length: 9 }, (_, index) => {
      const rank = 9 - index;
      return { id: `d${rank}`, name: `Debtor ${rank}`, balance: rank * 1000 };
    });
    renderPage();

    const list = await screen.findByRole("list", {
      name: "Top outstanding balances",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(8); // capped at 8
    expect(items[0]!.getAttribute("href")).toBe(
      paths.customerDetail("b1", "d9"),
    );
    expect(within(items[0]!).getByText("Debtor 9")).toBeTruthy();
    expect(within(items[0]!).getByText("₹9,000.00")).toBeTruthy();
    // The decorative initials avatar rides along.
    expect(items[0]!.querySelector("span.rounded-full")).not.toBeNull();
    // The ninth debtor never renders.
    expect(screen.queryByText("Debtor 1")).toBeNull();
  });

  it("nobody owes anything: the calm All settled state", async () => {
    server.summary.top_debtors = [];
    renderPage();

    expect(
      await screen.findByText("All settled — no outstanding balances."),
    ).toBeTruthy();
  });

  it("Today links through to the transactions page with identical count and net", async () => {
    server.totals = {
      period_start: null,
      entries: 3,
      total_charged: 1800,
      total_paid: 300,
      net: 1500,
    };
    renderPage();

    const todayLink = await screen.findByRole("link", {
      name: /Today's activity/,
    });
    expect(todayLink.getAttribute("href")).toBe(
      transactionsPath("b1", { range: "today" }),
    );
    // The dashboard's own figures, before navigation.
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("Net ₹1,500.00")).toBeTruthy();

    await userEvent.click(todayLink);

    // Landed on Transactions filtered to today...
    expect(await screen.findByText("Range: Today")).toBeTruthy();
    expect(screen.getByTestId("url").textContent).toContain("range=today");
    // ...with identical count and net in the totals footer.
    const region = await screen.findByRole("region", {
      name: "Totals for the current filter",
    });
    expect(within(region).getByText(/3 entries/)).toBeTruthy();
    expect(within(region).getByText("₹1,500.00")).toBeTruthy();
  });

  it("owner: Add Transaction opens the shared sheet, Add customer the dialog", async () => {
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Add Transaction" }),
    );
    expect(getTransactionSheetState()).toMatchObject({
      open: true,
      mode: "add",
    });
    closeSheet();

    // The sheet has just closed (its modal aria-hidden lingers a beat).
    await userEvent.click(
      await screen.findByRole("button", { name: "Add customer" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Add customer" }),
    ).toBeTruthy();
  });

  it("editor: quick actions work and first-run shows steps 1-2 but no invite", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("editor"),
    );
    server.summary = { ...server.summary, customer_count: 0 };
    renderPage();

    expect(await screen.findByRole("button", { name: "Add customer" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add Transaction" }),
    ).toBeTruthy();

    // First-run: actionable steps 1 and 2, no invite step (Owner only).
    expect(screen.getByText("Add your first customer")).toBeTruthy();
    expect(screen.queryByText("Invite a teammate")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Record your first transaction" }),
    );
    expect(getTransactionSheetState()).toMatchObject({
      open: true,
      mode: "add",
    });
    closeSheet();
  });

  it("viewer: no write action anywhere, guidance reads as plain text, numbers stay readable", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    server.summary = { ...server.summary, customer_count: 0 };
    renderPage();

    expect(await screen.findByText("Total owes you")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add customer" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add Transaction" }),
    ).toBeNull();

    expect(screen.getByText("Add your first customer")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add your first customer" }),
    ).toBeNull();
    expect(screen.getByText("Record your first transaction")).toBeTruthy();
    expect(screen.queryByText("Invite a teammate")).toBeNull();

    expect(screen.getByText("₹9,000.00")).toBeTruthy();
  });

  it("owner first-run: the three steps, invite links to Members, step 1 opens the dialog", async () => {
    server.summary = { ...server.summary, customer_count: 0 };
    renderPage();

    expect(await screen.findByText("Add your first customer")).toBeTruthy();
    expect(screen.getByText("Record your first transaction")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Invite a teammate" }).getAttribute("href"),
    ).toBe(paths.members("b1"));

    await userEvent.click(
      screen.getByRole("button", { name: "Add your first customer" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: "Add customer" }),
    ).toBeTruthy();
  });

  it("a pending read shows the loading skeleton and no figures", async () => {
    transactionsApi.getDashboardSummary.mockImplementation(
      () => new Promise(() => {}),
    );
    renderPage();

    expect(screen.getByRole("status", { name: "Loading dashboard" })).toBeTruthy();
    expect(screen.queryByText("Total owes you")).toBeNull();
    expect(screen.queryByText("₹9,000.00")).toBeNull();
  });

  it("a failed read shows the error state and Try again re-reads", async () => {
    transactionsApi.getDashboardSummary.mockImplementation(async () => {
      throw new Error("Summary exploded");
    });
    renderPage();

    expect(await screen.findByText("Summary exploded")).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeTruthy();

    transactionsApi.getDashboardSummary.mockImplementation(
      async () => server.summary,
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Total owes you")).toBeTruthy();
  });

  it("trend chart: server-aggregated days, text summary, hidden data table, selector re-reads", async () => {
    renderPage();

    expect(await screen.findByText("Daily activity")).toBeTruthy();
    expect(dashboardApi.getDailyActivity).toHaveBeenCalledWith("b1", 7);

    // The visible text summary and the chart itself (recharts svg,
    // bars filled with the chart tokens).
    expect(
      screen.getByText("Last 7 days: charged ₹2,400.00, paid ₹600.00."),
    ).toBeTruthy();
    // The chart section itself carries the plot (the topbar's icons
    // are svgs too, so the assertion stays inside the region).
    const chart = await screen.findByRole("region", {
      name: "Charges and payments per day",
    });
    expect(chart.querySelector("svg")).not.toBeNull();

    // The equivalent, visually hidden data table: header + one row per
    // day, including the zero days.
    const table = await screen.findByRole("table", {
      name: /Daily charges and payments/,
    });
    expect(within(table).getAllByRole("row")).toHaveLength(5);
    expect(within(table).getByText("₹2,400.00")).toBeTruthy();
    expect(within(table).getByText("₹600.00")).toBeTruthy();

    // The 7/30/90 selector re-reads server-side per window.
    await userEvent.click(screen.getByRole("button", { name: "30 days" }));
    expect(dashboardApi.getDailyActivity).toHaveBeenCalledWith("b1", 30);
    expect(
      screen.getByRole("button", { name: "30 days" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("trend chart: an all-zero window is a friendly empty state, no bare plot", async () => {
    server.daily = [
      { activity_date: "2026-10-09", charges: 0, payments: 0 },
      { activity_date: "2026-10-10", charges: 0, payments: 0 },
      { activity_date: "2026-10-11", charges: 0, payments: 0 },
      { activity_date: "2026-10-12", charges: 0, payments: 0 },
    ];
    renderPage();

    expect(
      await screen.findByText(
        "No charges or payments in the last 7 days yet.",
      ),
    ).toBeTruthy();
    const chart = await screen.findByRole("region", {
      name: "Charges and payments per day",
    });
    expect(chart.querySelector("svg")).toBeNull();
  });

  it("trend chart: a failed read shows the error state and Try again re-reads", async () => {
    dashboardApi.getDailyActivity.mockImplementation(async () => {
      throw new Error("Chart exploded");
    });
    renderPage();

    expect(await screen.findByText("Chart exploded")).toBeTruthy();

    dashboardApi.getDailyActivity.mockImplementation(async () => server.daily);
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/Last 7 days: charged/)).toBeTruthy();
  });

  it("activity feed: sentences with links, and the Former member fallback", async () => {
    renderPage();

    expect(await screen.findByText("Recent activity")).toBeTruthy();
    expect(dashboardApi.getActivityFeed).toHaveBeenCalledWith("b1");

    const feed = await screen.findByRole("region", { name: "Recent activity" });
    const items = within(feed).getAllByRole("listitem");
    expect(items).toHaveLength(2);

    // The PRD's sentence, in structure: "<creator> recorded a
    // <type> of <amount> from <customer>, <when>".
    expect(items[0]!.textContent).toContain("Eli recorded a payment of");
    expect(items[0]!.textContent).toContain("₹500.00");
    expect(items[0]!.textContent).toContain("2 hr ago");
    expect(
      within(items[0]!)
        .getByRole("link", { name: "Asha Verma" })
        .getAttribute("href"),
    ).toBe(paths.customerDetail("b1", "c1"));

    // A creator who has since left reads "Former member" (the S-25
    // contract the transactions list already uses).
    expect(items[1]!.textContent).toContain("Former member recorded a charge of");
    expect(items[1]!.textContent).toContain("₹1,500.00");
    expect(
      within(items[1]!).getByRole("link", { name: "Rahim Traders" }),
    ).toBeTruthy();
  });

  it("activity feed: a fresh business gets a friendly empty state", async () => {
    server.feed = [];
    renderPage();

    expect(
      await screen.findByText(
        "No activity yet — the entries you record will appear here.",
      ),
    ).toBeTruthy();
  });

  it("activity feed: a failed read offers retry", async () => {
    dashboardApi.getActivityFeed.mockImplementation(async () => {
      throw new Error("Feed exploded");
    });
    renderPage();

    expect(await screen.findByText("Feed exploded")).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "Try again" }),
    ).toBeTruthy();
  });
});
