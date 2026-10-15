import { describe, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { Outlet, Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { __setMatchMedia } from "@/test/setup";
import { Topbar } from "@/components/layout/Topbar";
import { LoginPage } from "@/pages/Login";
import { TransactionDetailPage } from "@/pages/TransactionDetailPage";
import { BusinessesPage } from "@/features/business/pages/BusinessesPage";
import { CreateBusinessPage } from "@/features/business/pages/CreateBusinessPage";
import { SettingsPage } from "@/features/business/pages/SettingsPage";
import { DashboardPage } from "@/features/dashboard/pages/DashboardPage";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";
import { ImportPage } from "@/features/import-export/pages/ImportPage";
import { StatementPage } from "@/features/import-export/pages/StatementPage";
import { TransactionsPage } from "@/features/transactions/pages/TransactionsPage";
import { MembersPage } from "@/features/members/pages/MembersPage";
import { UiGallery } from "@/features/dev/UiGallery";
import { closeTransactionSheet } from "@/features/transactions/sheetStore";
import { paths, routePatterns } from "@/lib/paths";
import type {
  BusinessRole,
  BusinessSummary,
  Memberships,
} from "@/features/business/api";
import type { CustomerListRow } from "@/features/customers/api";

// S-40 — "automated axe checks run on every page and shared component,
// with zero serious or critical violations".
//
// One shared mock foundation serves every page: the function names and
// return shapes are cribbed from the proven per-feature harnesses
// (businessesPage, createBusinessPage, dashboardPage, customersList,
// customerDetail, importPage, statementPage, transactionsPage,
// transactionVoid, membersPage/inviteDialog, settingsPage/backup,
// uiGallery). Each test renders the page the way its own suite does,
// waits for the AuthProvider gate, then runs axe on the container.

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
const importExportApi = vi.hoisted(() => ({
  getImportCustomers: vi.fn(),
  importHistory: vi.fn(),
}));
// LoginPage and CreateBusinessPage read the business context directly;
// renderApp mounts no BusinessProvider (same stub as the landingResolver
// and createBusinessPage suites).
const activeBusinessState = vi.hoisted(() => ({
  status: "none" as "loading" | "ready" | "none" | "forbidden",
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
vi.mock("@/features/import-export/api", () => importExportApi);
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
    isOwner: false,
    error: null,
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

function membershipsFor(
  role: BusinessRole,
  businessId = "b1",
  name = "Bahi Khata",
): Memberships {
  return {
    businesses: [
      {
        id: businessId,
        name,
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

function listRow(overrides: Partial<CustomerListRow>): CustomerListRow {
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
    archived_at: null,
    ...overrides,
  };
}

const threeCustomers: CustomerListRow[] = [
  listRow({ id: "c1", name: "Asha Verma", balance: 500 }),
  listRow({ id: "c2", name: "Rahim", phone: "01712 222222", balance: -200 }),
  listRow({ id: "c3", name: "Chand", phone: null, tags: ["retail"] }),
];

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

beforeEach(() => {
  vi.clearAllMocks();
  __setMatchMedia(false);
  closeTransactionSheet();
  activeBusinessState.status = "none";
  activeBusinessState.business = null;

  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
  businessApi.createBusiness.mockResolvedValue({ id: "b1" });
  businessApi.getBusiness.mockImplementation(async (id: string) => ({
    id,
    owner_id: "u1",
    name: "Bahi Khata",
    business_type: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
  }));
  businessApi.getBusinessImpact.mockResolvedValue({
    customerCount: 2,
    transactionCount: 5,
    memberCount: 1,
    invitationCount: 0,
  });
  businessApi.updateBusiness.mockResolvedValue({});
  businessApi.deleteBusiness.mockResolvedValue(undefined);
  businessApi.businessExists.mockResolvedValue(true);

  membersApi.getMembers.mockResolvedValue([
    {
      userId: "u-owner",
      role: "owner" as BusinessRole,
      fullName: "Asha Verma",
      email: "asha@example.com",
      avatarUrl: null,
      joinedAt: "2026-01-01T12:00:00Z",
    },
    {
      userId: "u-editor",
      role: "editor" as BusinessRole,
      fullName: "Eli the Editor",
      email: "eli@example.com",
      avatarUrl: null,
      joinedAt: "2026-02-01T12:00:00Z",
    },
  ]);
  membersApi.getBusinessInvitations.mockResolvedValue([
    {
      id: "i1",
      email: "vic@example.com",
      role: "viewer" as BusinessRole,
      createdAt: "2026-04-01T12:00:00Z",
    },
  ]);
  membersApi.getMyInvitations.mockResolvedValue([]);
  membersApi.createInvitation.mockResolvedValue({
    id: "i9",
    email: "vic@example.com",
    role: "viewer" as BusinessRole,
    createdAt: "2026-04-09T12:00:00Z",
  });

  customersApi.listCustomers.mockResolvedValue(threeCustomers);
  customersApi.queryCustomers.mockResolvedValue({
    items: threeCustomers,
    total: 3,
    allTotal: 3,
  });
  customersApi.createCustomer.mockResolvedValue(threeCustomers[0]);
  customersApi.getCustomer.mockImplementation(async (id: string) => {
    const row = threeCustomers.find((customer) => customer.id === id);
    if (!row) throw new Error("customer not found");
    return { ...row };
  });
  customersApi.updateCustomer.mockResolvedValue(threeCustomers[0]);
  customersApi.setCustomerArchived.mockResolvedValue(threeCustomers[0]);
  customersApi.deleteCustomerPermanently.mockResolvedValue(undefined);
  customersApi.countCustomerTransactions.mockResolvedValue(3);

  transactionsApi.getAllCustomerBalances.mockResolvedValue({
    c1: 500,
    c2: -200,
    c3: 0,
  });
  transactionsApi.queryTransactions.mockResolvedValue({
    rows: [
      {
        id: "t1",
        business_id: "b1",
        customer_id: "c1",
        type: "charge",
        amount: 5000,
        status: "active",
        occurred_at: "2026-10-12T10:00:00+00:00",
        note: "Rice for the month",
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
      },
    ],
    total: 1,
  });
  transactionsApi.transactionRollup.mockResolvedValue([
    {
      period_start: null,
      entries: 1,
      total_charged: 5000,
      total_paid: 0,
      net: 5000,
    },
  ]);
  transactionsApi.getCustomerBalance.mockResolvedValue(4500);
  transactionsApi.getCustomerLedger.mockImplementation(
    async (customerId: string) =>
      [
        {
          id: "t1",
          business_id: "b1",
          customer_id: customerId,
          type: "charge",
          amount: 1500,
          status: "posted",
          occurred_at: "2024-01-15T10:00:00.000Z",
          note: "Milk",
          balance_after: 1500,
        },
        {
          id: "t2",
          business_id: "b1",
          customer_id: customerId,
          type: "payment",
          amount: 500,
          status: "posted",
          occurred_at: "2024-02-01T10:00:00.000Z",
          note: "bKash",
          balance_after: 1000,
        },
      ] as unknown[],
  );
  transactionsApi.getDashboardSummary.mockResolvedValue({
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
  });
  transactionsApi.getTransactionById.mockImplementation(
    async (transactionId: string) => ({
      id: transactionId,
      business_id: "b1",
      customer_id: "c1",
      type: "payment",
      amount: 500,
      status: "active",
      occurred_at: "2026-10-09T09:00:00+00:00",
      note: "partial",
      source: "manual",
      created_by: "u1",
      created_at: "2026-10-09T09:00:00+00:00",
      updated_at: "2026-10-09T09:00:00+00:00",
      updated_by: null,
      void_reason: null,
      voided_at: null,
      voided_by: null,
      customer_name: "Asha Verma",
      customer_phone: "01711 111111",
    }),
  );
  transactionsApi.createTransaction.mockResolvedValue({ id: "t9" });
  transactionsApi.createTransactionsBatch.mockResolvedValue({
    customers_created: 0,
    transactions_created: 0,
  });
  transactionsApi.restoreTransaction.mockResolvedValue({});
  transactionsApi.updateTransaction.mockResolvedValue({});
  transactionsApi.voidTransaction.mockResolvedValue({});

  dashboardApi.getDailyActivity.mockResolvedValue([
    { activity_date: "2026-10-10", charges: 2400, payments: 0 },
    { activity_date: "2026-10-11", charges: 0, payments: 600 },
  ]);
  dashboardApi.getActivityFeed.mockResolvedValue([
    {
      id: "t1",
      type: "payment",
      amount: 500,
      occurred_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      customer_id: "c1",
      customer_name: "Asha Verma",
      creator_name: "Eli",
    },
  ]);

  importExportApi.getImportCustomers.mockResolvedValue([
    { id: "c1", name: "Asha Verma", phone: "01711 111111", archived_at: null },
  ]);
  importExportApi.importHistory.mockResolvedValue({
    customers_created: 1,
    transactions_created: 2,
  });
});

describe("S-40 axe checks", () => {
  it("LoginPage (/login)", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.login} element={<LoginPage />} />
      </Routes>,
      { route: paths.login },
    );

    await screen.findByRole("button", { name: /Continue with Google/ });
    await expectNoSeriousViolations(container);
  });

  it("BusinessesPage (/businesses)", async () => {
    businessApi.getMemberships.mockResolvedValue({
      businesses: [
        {
          id: "b1",
          name: "Bahi Khata",
          businessType: null,
          ownerId: "u1",
          ownerName: "Asha Verma",
          ownerEmail: "asha@example.com",
          role: "owner",
          isOwner: true,
        },
        {
          id: "b2",
          name: "Rahim Traders",
          businessType: null,
          ownerId: "u2",
          ownerName: "Rahim",
          ownerEmail: "rahim@example.com",
          role: "viewer",
          isOwner: false,
        },
      ],
      invitations: [],
    });
    const { container } = renderApp(
      <Routes>
        <Route
          path={routePatterns.businesses}
          element={<BusinessesPage />}
        />
        <Route
          path={routePatterns.business}
          element={<div>business page</div>}
        />
      </Routes>,
      { session, route: paths.businesses },
    );

    await screen.findByRole("heading", { name: "My business" });
    await expectNoSeriousViolations(container);
  });

  it("CreateBusinessPage (onboarding)", async () => {
    const { container } = renderApp(<CreateBusinessPage />, { session });

    await screen.findByRole("button", { name: "Create business" });
    await expectNoSeriousViolations(container);
  });

  it("DashboardPage (/b/b1)", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.business} element={<TopbarStub />}>
          <Route index element={<DashboardPage />} />
        </Route>
      </Routes>,
      { session, route: paths.business("b1") },
    );

    await screen.findByText("Total owes you");
    await expectNoSeriousViolations(container);
  });

  it("CustomersPage (/b/b1/customers)", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.customers} element={<CustomersPage />} />
        <Route
          path={`${routePatterns.customers}/:customerId`}
          element={<div>customer detail</div>}
        />
      </Routes>,
      { session, route: paths.customers("b1") },
    );

    await screen.findByRole("columnheader", { name: "Customer" });
    await expectNoSeriousViolations(container);
  });

  it("CustomerDetailPage (/b/b1/customers/c1)", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.business} element={<TopbarStub />}>
          <Route index element={<div>Business home</div>} />
          <Route
            path="customers/:customerId"
            element={<CustomerDetailPage />}
          />
        </Route>
      </Routes>,
      { session, route: paths.customerDetail("b1", "c1") },
    );

    await screen.findByText("Current Balance");
    await expectNoSeriousViolations(container);
  });

  it("ImportPage (/b/b1/customers/import)", async () => {
    const { container } = renderApp(
      <Routes>
        <Route
          path={routePatterns.importCustomers}
          element={<ImportPage />}
        />
      </Routes>,
      { session, route: paths.importCustomers("b1") },
    );

    await screen.findByLabelText(/Choose a CSV file/);
    await expectNoSeriousViolations(container);
  });

  it("StatementPage (/b/b1/customers/c1/statement)", async () => {
    businessApi.getBusiness.mockResolvedValue({
      id: "b1",
      name: "Rahim Traders",
      business_type: null,
      phone: null,
      email: null,
      address: null,
      notes: null,
      created_at: "2026-01-01T00:00:00Z",
      owner_id: "u1",
    });
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.statement} element={<StatementPage />} />
      </Routes>,
      { session, route: paths.statement("b1", "c1") },
    );

    await screen.findByText("Rahim Traders");
    await expectNoSeriousViolations(container);
  });

  it("TransactionsPage (/b/b1/transactions)", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.business} element={<TopbarStub />}>
          <Route path="transactions" element={<TransactionsPage />} />
        </Route>
      </Routes>,
      { session, route: paths.transactions("b1") },
    );

    await screen.findByText("Rice for the month");
    await expectNoSeriousViolations(container);
  });

  it("TransactionDetailPage (/b/b1/transactions/t1)", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.business} element={<TopbarStub />}>
          <Route index element={<div>Business home</div>} />
          <Route
            path="transactions/:transactionId"
            element={<TransactionDetailPage />}
          />
        </Route>
      </Routes>,
      { session, route: paths.transactionDetail("b1", "t1") },
    );

    await screen.findByText("Transaction Detail");
    await expectNoSeriousViolations(container);
  });

  it("MembersPage (/b/b1/members, owner with pending invitations)", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.members} element={<MembersPage />} />
      </Routes>,
      { session, route: paths.members("b1") },
    );

    await screen.findByText("Asha Verma");
    await screen.findByText("Pending invitations");
    await expectNoSeriousViolations(container);
  });

  it("SettingsPage (/b/b1/settings)", async () => {
    const { container } = renderApp(
      <Routes>
        <Route path={routePatterns.settings} element={<SettingsPage />} />
      </Routes>,
      { session, route: paths.settings("b1") },
    );

    await screen.findByText("Backup");
    await expectNoSeriousViolations(container);
  });

  it("UiGallery — every shared component", async () => {
    const { container } = renderApp(<UiGallery />, {
      route: paths.uiGallery,
    });

    await screen.findByRole("heading", { name: "UI Gallery" });
    await expectNoSeriousViolations(container);
  });
});
