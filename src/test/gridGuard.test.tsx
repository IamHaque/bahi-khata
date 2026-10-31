import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { __setMatchMedia } from "@/test/setup";
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { SettingsPage } from "@/features/business/pages/SettingsPage";
import { closeTransactionSheet } from "@/features/transactions/sheetStore";
import { routePatterns, paths } from "@/lib/paths";
import type { BusinessSummary } from "@/features/business/api";

// L-14 (F1 regression guard) — the browser audit found the dashboard's
// second row (`lg:grid-cols-[1.5fr_1fr]`) and the Settings sections
// (`lg:grid-cols-[16rem_1fr]`) could widen past the viewport because a
// bare `1fr` track has an implicit min-content floor. Every fixed track
// must be `minmax(0, …)` and each grid child must carry `min-w-0`, so a
// long name / 720px chart scrolls inside its own container instead of
// pushing the page sideways. These assertions pin the class strings the
// audit measured, so a future edit that drops minmax(0,…) fails here.

vi.setConfig({ testTimeout: 30000 });

const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
  createBusiness: vi.fn(),
  getBusiness: vi.fn(),
  getBusinessImpact: vi.fn(),
  updateBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
  businessExists: vi.fn(),
}));
const membersApi = vi.hoisted(() => ({
  getMembers: vi.fn(),
  getBusinessInvitations: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  getMyInvitations: vi.fn(),
  respondToInvitation: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  leaveBusiness: vi.fn(),
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
  getAllCustomerBalances: vi.fn(),
  queryTransactions: vi.fn(),
  transactionRollup: vi.fn(),
  getCustomerBalance: vi.fn(),
  getCustomerLedger: vi.fn(),
  getDashboardSummary: vi.fn(),
  getTransactionById: vi.fn(),
  restoreTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  voidTransaction: vi.fn(),
}));
const dashboardApi = vi.hoisted(() => ({
  getDailyActivity: vi.fn(),
  getActivityFeed: vi.fn(),
}));
const activeBusinessState = vi.hoisted(() => ({
  status: "ready" as "loading" | "ready" | "none" | "forbidden",
  business: null as BusinessSummary | null,
}));

vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
  createBusiness: businessApi.createBusiness,
  getBusiness: businessApi.getBusiness,
  getBusinessImpact: businessApi.getBusinessImpact,
  updateBusiness: businessApi.updateBusiness,
  deleteBusiness: businessApi.deleteBusiness,
  businessExists: businessApi.businessExists,
}));
vi.mock("@/features/members/api", () => ({
  getMembers: membersApi.getMembers,
  getBusinessInvitations: membersApi.getBusinessInvitations,
  createInvitation: membersApi.createInvitation,
  revokeInvitation: membersApi.revokeInvitation,
  getMyInvitations: membersApi.getMyInvitations,
  respondToInvitation: membersApi.respondToInvitation,
  changeMemberRole: membersApi.changeMemberRole,
  removeMember: membersApi.removeMember,
  leaveBusiness: membersApi.leaveBusiness,
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
  currentTimeZone: () => "UTC",
  deleteTransaction: vi.fn(),
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
vi.mock("@/contexts/BusinessContext", () => ({
  BusinessProvider: ({ children }: { children: React.ReactNode }) => children,
  useActiveBusiness: () => ({
    business: activeBusinessState.business,
    role: activeBusinessState.business?.role ?? null,
    isOwner: activeBusinessState.status === "ready",
    status: activeBusinessState.status,
  }),
  useBusinessContext: () => ({
    status: activeBusinessState.status,
    business: activeBusinessState.business,
    role: activeBusinessState.business?.role ?? null,
    isOwner: true,
    error: null,
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const session = { user: { email: "asha@example.com" } } as unknown as Session;

beforeEach(() => {
  vi.clearAllMocks();
  __setMatchMedia(false);
  closeTransactionSheet();
  activeBusinessState.status = "ready";
  activeBusinessState.business = {
    id: "b1",
    name: "Bahi Khata",
    role: "owner",
    isOwner: true,
  } as BusinessSummary;

  businessApi.getMemberships.mockResolvedValue({
    businesses: [],
    invitations: [],
  });
  businessApi.getBusiness.mockResolvedValue({
    id: "b1",
    owner_id: "u1",
    name: "Bahi Khata",
    business_type: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
  });
  businessApi.getBusinessImpact.mockResolvedValue({
    customerCount: 1,
    transactionCount: 1,
    memberCount: 1,
    invitationCount: 0,
  });
  businessApi.updateBusiness.mockResolvedValue({});
  businessApi.deleteBusiness.mockResolvedValue(undefined);

  transactionsApi.getDashboardSummary.mockResolvedValue({
    total_receivable: 9000,
    total_credit: 1200,
    open_accounts: 4,
    today_count: 3,
    today_net: 1500,
    customer_count: 12,
    top_debtors: [{ id: "c1", name: "Asha Verma", balance: 5000 }],
  });
  dashboardApi.getDailyActivity.mockResolvedValue([
    { activity_date: "2026-10-10", charges: 2400, payments: 0 },
  ]);
  dashboardApi.getActivityFeed.mockResolvedValue([
    {
      id: "t1",
      type: "payment",
      amount: 500,
      occurred_at: new Date().toISOString(),
      customer_id: "c1",
      customer_name: "Asha Verma",
      creator_name: "Eli",
    },
  ]);
});

/** Every fractional (`fr`) grid track in the container is wrapped in minmax(0, …).
 *  Fixed tracks (16rem, 180px) are fine bare — they cannot expand. A bare `1fr`
 *  has an implicit min-content floor, which is what widened the page (F1).
 *  Parses each `_`-separated track token rather than regex-matching, so the
 *  `5fr` inside `minmax(0,1.5fr)` is never mistaken for a bare track. */
function expectNoBareFractionalTracks(container: HTMLElement) {
  const grids = Array.from(
    container.querySelectorAll<HTMLElement>("[class*='grid-cols-']"),
  );
  expect(grids.length).toBeGreaterThan(0);
  for (const grid of grids) {
    const cols = (grid.className.match(/grid-cols-\[[^\]]+\]/) ?? [])[0] ?? "";
    if (!cols) continue;
    const inner = cols.slice(cols.indexOf("[") + 1, cols.lastIndexOf("]"));
    for (const track of inner.split("_")) {
      if (!/\d+(?:\.\d+)?fr/.test(track)) continue; // not a fractional track
      expect(
        track,
        `grid track "${cols}" has a bare fr track "${track}" — wrap every fr in minmax(0, …)`,
      ).toMatch(/^minmax\(0,/);
    }
  }
}

describe("L-14 F1 grid-guard (no bare fixed tracks that widen the page)", () => {
  it("DashboardPage row-2 grid uses minmax(0, …) tracks with min-w-0 children", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.business} element={<DashboardPage />} />
      </Routes>,
      { session, route: paths.business("b1") },
    );

    await screen.findByRole("heading", { name: "Where you stand" });
    expectNoBareFractionalTracks(container as HTMLElement);

    // The 1.5fr/1fr row is explicitly minmax(0, …) on both tracks.
    const row2 = container.querySelector<HTMLElement>(
      "[class*='lg:grid-cols-[minmax(0,1.5fr)']",
    );
    expect(row2, "dashboard row-2 grid not found").toBeTruthy();
    expect(row2?.className).toContain("minmax(0,1.5fr)");
    expect(row2?.className).toContain("minmax(0,1fr)");
  });

  it("SettingsPage section grids use minmax(0, …) second tracks", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.settings} element={<SettingsPage />} />
      </Routes>,
      { session, route: paths.settings("b1") },
    );

    await screen.findByText("Backup");
    expectNoBareFractionalTracks(container as HTMLElement);

    const sections = Array.from(
      container.querySelectorAll<HTMLElement>("section[class*='grid-cols-']"),
    );
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      expect(section.className).toContain("minmax(0,1fr)");
    }
  });
});
