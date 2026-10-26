import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { Outlet, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { __setMatchMedia } from "@/test/setup";
import { Topbar } from "@/components/layout/Topbar";
import { BusinessSwitcher } from "@/components/layout/BusinessSwitcher";
import { LoginPage } from "@/pages/Login";
import { CreateBusinessPage } from "@/features/business/pages/CreateBusinessPage";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { CustomerDetailPage } from "@/features/customers/pages/CustomerDetailPage";
import { MembersPage } from "@/features/members/pages/MembersPage";
import { signInWithGoogle } from "@/features/auth/api";
import { useBusiness } from "@/features/business/hooks";
import {
  closeTransactionSheet,
  getTransactionSheetState,
} from "@/features/transactions/sheetStore";
import { paths, routePatterns } from "@/lib/paths";
import type { BusinessRole, Memberships } from "@/features/business/api";
import type { BusinessSummary } from "@/features/business/api";
import type { CustomerListRow } from "@/features/customers/api";

// S-40 — "I can complete these journeys without a mouse: sign in,
// create business, invite a member, add customer, add transaction,
// void a transaction, archive and restore a customer, switch business".
//
// Every journey is driven with userEvent.setup() + tab/keyboard only
// (no pointer events once a journey starts) and asserts the journey
// COMPLETED: the mutation was called or the navigation happened.
// The mock foundation is cribbed from the proven per-feature harnesses
// (landingResolver, createBusinessPage, inviteDialog, customersList,
// customerForm, transactionSheet, transactionVoid, archiveDelete,
// businessSwitcher).

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
// LoginPage and CreateBusinessPage read the business context directly
// (renderApp mounts no BusinessProvider) — the landingResolver and
// createBusinessPage suites stub it the same way.
const activeBusinessState = vi.hoisted(() => ({
  status: "none" as "loading" | "ready" | "none" | "forbidden",
  business: null as BusinessSummary | null,
}));
// The fake database: mutations write here, queries read here, so the
// archive round trip (journey g) and the void (journey f) are observable.
const server = vi.hoisted(() => ({
  customers: [] as CustomerListRow[],
  counts: {} as Record<string, number>,
  balances: {} as Record<string, number>,
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
// Journey (a): the login button's auth call lands here. The rest of the
// auth module (getSession/onAuthStateChange) stays real over the
// supabase mock renderApp installs.
vi.mock("@/features/auth/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/api")>()),
  signInWithGoogle: vi.fn(),
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
    isOwner: false,
    error: null,
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const session = {
  user: { email: "asha@example.com", id: "u-owner" },
} as unknown as Session;

function membershipsFor(role: BusinessRole): Memberships {
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
    archived_at: null,
    ...overrides,
  };
}

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86400000)
    .toISOString()
    .split("T")[0]!;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
    </span>
  );
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

/**
 * Tab from wherever focus is until `predicate` accepts
 * document.activeElement. Bounded — never an infinite loop.
 */
async function tabUntil(
  user: UserEvent,
  predicate: (element: Element | null) => boolean,
  label: string,
  maxTabs = 60,
): Promise<HTMLElement> {
  for (let attempt = 0; attempt <= maxTabs; attempt += 1) {
    const active = document.activeElement;
    if (predicate(active)) return active as HTMLElement;
    await user.tab();
  }
  throw new Error(`Tabbing never reached ${label} (${maxTabs} tabs)`);
}

beforeEach(() => {
  vi.clearAllMocks();
  __setMatchMedia(false);
  closeTransactionSheet();
  activeBusinessState.status = "none";
  activeBusinessState.business = null;

  server.customers = [
    seedCustomer({ id: "c1", name: "Asha Verma", balance: 4500 }),
    seedCustomer({ id: "c2", name: "Karim Chowdhury", balance: 0 }),
  ];
  server.counts = { c1: 12, c2: 0 };
  server.balances = { c1: 4500, c2: 0 };
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

  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
  businessApi.createBusiness.mockResolvedValue({ id: "b1" });
  businessApi.getBusiness.mockImplementation(async (id: string) => ({
    id,
    owner_id: "u1",
    name: id === "b1" ? "Bahi Khata" : "Rahim Traders",
    business_type: null,
    phone: null,
    email: null,
    address: null,
    notes: `${id} notes`,
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
  membersApi.getBusinessInvitations.mockResolvedValue([]);
  membersApi.getMyInvitations.mockResolvedValue([]);
  membersApi.createInvitation.mockResolvedValue({
    id: "i1",
    email: "vic@example.com",
    role: "viewer" as BusinessRole,
    createdAt: "2026-04-01T12:00:00Z",
  });

  // The customers "server": search/status filters and the archived
  // round trip, exactly like archiveDelete.test.tsx.
  customersApi.queryCustomers.mockImplementation(
    async (
      _businessId: string,
      params?: { search?: string; status?: string },
    ) => {
      const search = (params?.search ?? "").trim().toLowerCase();
      const status = params?.status ?? "all";
      let items = [...server.customers];
      if (status === "archived") {
        items = items.filter((customer) => customer.archived_at != null);
      } else {
        items = items.filter((customer) => customer.archived_at == null);
        if (status === "owes") items = items.filter((c) => c.balance > 0);
        else if (status === "credit")
          items = items.filter((c) => c.balance < 0);
        else if (status === "settled")
          items = items.filter((c) => c.balance === 0);
      }
      if (search) {
        items = items.filter(
          (customer) =>
            customer.name.toLowerCase().includes(search) ||
            (customer.phone ?? "").toLowerCase().includes(search),
        );
      }
      const activeCount = server.customers.filter(
        (customer) => customer.archived_at == null,
      ).length;
      return {
        items: items.map((customer) => ({ ...customer })),
        total: items.length,
        allTotal: activeCount,
      };
    },
  );
  customersApi.listCustomers.mockImplementation(async () =>
    server.customers
      .filter((customer) => customer.archived_at == null)
      .map((customer) => ({ ...customer })),
  );
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
  customersApi.getCustomer.mockImplementation(async (id: string) => {
    const row = server.customers.find((customer) => customer.id === id);
    if (!row) throw new Error("customer not found");
    return { ...row };
  });
  customersApi.updateCustomer.mockResolvedValue(seedCustomer({}));
  customersApi.setCustomerArchived.mockImplementation(
    async (id: string, archived: boolean) => {
      const row = server.customers.find((customer) => customer.id === id);
      if (!row) throw new Error("customer not found");
      row.archived_at = archived ? "2026-03-02T00:00:00+00:00" : null;
      return { ...row };
    },
  );
  customersApi.deleteCustomerPermanently.mockImplementation(
    async (id: string) => {
      server.customers = server.customers.filter(
        (customer) => customer.id !== id,
      );
      delete server.counts[id];
    },
  );
  customersApi.countCustomerTransactions.mockImplementation(
    async (id: string) => server.counts[id] ?? 0,
  );

  transactionsApi.getAllCustomerBalances.mockImplementation(async () =>
    Object.fromEntries(
      server.customers
        .filter((customer) => customer.archived_at == null)
        .map((customer) => [customer.id, customer.balance]),
    ),
  );
  transactionsApi.getCustomerBalance.mockImplementation(
    async (id: string) => server.balances[id] ?? 0,
  );
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
  transactionsApi.createTransaction.mockResolvedValue({ id: "t9" });
  transactionsApi.voidTransaction.mockResolvedValue({});
  transactionsApi.restoreTransaction.mockResolvedValue({});
  transactionsApi.updateTransaction.mockResolvedValue({});
  transactionsApi.queryTransactions.mockResolvedValue({ rows: [], total: 0 });
  transactionsApi.transactionRollup.mockResolvedValue([]);
  transactionsApi.getTransactionById.mockResolvedValue(null);
  transactionsApi.getDashboardSummary.mockResolvedValue(null);
});

describe("S-40 keyboard-only journeys", () => {
  it("a. sign in: Tab to Continue with Google, Enter starts the OAuth flow", async () => {
    renderApp(
      <Routes>
        <Route path={routePatterns.login} element={<LoginPage />} />
        <Route path="*" element={<div data-testid="landed" />} />
      </Routes>,
      { route: paths.login },
    );
    const user = userEvent.setup();

    await screen.findByRole("button", { name: /Continue with Google/ });
    await tabUntil(
      user,
      (element) =>
        element ===
        screen.getByRole("button", { name: /Continue with Google/ }),
      "the Google sign-in button",
    );
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(signInWithGoogle as ReturnType<typeof vi.fn>).toHaveBeenCalledTimes(
        1,
      ),
    );
  });

  it("b. create business: Tab to Name, type, Tab to submit, Enter", async () => {
    renderApp(
      <>
        <LocationProbe />
        <CreateBusinessPage />
      </>,
      { session },
    );
    const user = userEvent.setup();

    await screen.findByRole("button", { name: "Create business" });
    // Autofocus lands on Name; the tab loop finds it either way.
    await tabUntil(
      user,
      (element) => element === screen.getByLabelText("Name"),
      "the Name field",
    );
    await user.keyboard("Rahim Traders");
    await tabUntil(
      user,
      (element) =>
        element === screen.getByRole("button", { name: "Create business" }),
      "the Create business button",
    );
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(businessApi.createBusiness).toHaveBeenCalledTimes(1),
    );
    expect(businessApi.createBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Rahim Traders" }),
      expect.anything(),
    );
    // Landed on the new business's dashboard URL (S-17).
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/b/b1"),
    );
  });

  it("c. invite a member: Tab to Invite, Enter, type email, Enter", async () => {
    renderApp(
      <Routes>
        <Route path={routePatterns.members} element={<MembersPage />} />
      </Routes>,
      { session, route: paths.members("b1") },
    );
    const user = userEvent.setup();

    await screen.findByText("Asha Verma");
    await tabUntil(
      user,
      (element) => element === screen.getByRole("button", { name: "Invite" }),
      "the Invite button",
    );
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog");

    await tabUntil(
      user,
      (element) => element === within(dialog).getByLabelText("Google email"),
      "the Google email field",
    );
    await user.keyboard("vic@example.com");

    const submit = dialog.querySelector('button[type="submit"]');
    if (!submit) throw new Error("invite dialog has no submit button");
    await tabUntil(user, (element) => element === submit, "the Invite submit");
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(membersApi.createInvitation).toHaveBeenCalledWith("b1", {
        email: "vic@example.com",
        role: "viewer",
      }),
    );
  });

  it("d. add customer: Tab to Add customer, Enter, type name, Enter", async () => {
    renderApp(
      <Routes>
        <Route path={routePatterns.customers} element={<CustomersPage />} />
        <Route
          path={`${routePatterns.customers}/:customerId`}
          element={<div>customer detail</div>}
        />
      </Routes>,
      { session, route: paths.customers("b1") },
    );
    const user = userEvent.setup();

    await screen.findByRole("columnheader", { name: "Customer" });
    // The header buttons gate on the (async) permissions query — wait
    // for the list to be interactive before tabbing.
    const addCustomer = await screen.findByRole("button", {
      name: "Add customer",
    });
    await tabUntil(
      user,
      (element) => element === addCustomer,
      "the Add customer button",
    );
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog");

    await tabUntil(
      user,
      (element) => element === within(dialog).getByLabelText("Name"),
      "the Name field",
    );
    await user.keyboard("Karim Store{Enter}");

    await waitFor(() =>
      expect(customersApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Karim Store" }),
        "b1",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("e. add transaction: Tab to Add transaction, Enter, pick customer, Enter saves", async () => {
    renderApp(
      <Routes>
        <Route path={routePatterns.business} element={<TopbarStub />}>
          <Route index element={<div>Business home</div>} />
        </Route>
      </Routes>,
      { session, route: paths.business("b1") },
    );
    const user = userEvent.setup();

    await screen.findByRole("button", { name: "Add transaction" });
    await tabUntil(
      user,
      (element) =>
        element === screen.getByRole("button", { name: "Add transaction" }),
      "the Add transaction button",
    );
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(getTransactionSheetState()).toMatchObject({ open: true }),
    );
    // The amount field takes focus on open (S-32 keyboard flow).
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("amount-money"),
    );

    // The searchable customer picker comes first in the form.
    const picker = within(dialog).getByRole("button", {
      name: "Select customer...",
    });
    await tabUntil(user, (element) => element === picker, "the picker");
    await user.keyboard("{Enter}");

    const search = await screen.findByPlaceholderText("Search customers...");
    // Wait for the customers to load BEFORE arrowing — while loading the
    // listbox has no options and ArrowDown would land nowhere.
    const listbox = await screen.findByRole("listbox", { name: "Customers" });
    await waitFor(() => expect(document.activeElement).toBe(search));
    // ArrowDown focuses the first option; Enter selects it.
    await user.keyboard("{ArrowDown}");
    await waitFor(() =>
      expect(listbox.contains(document.activeElement)).toBe(true),
    );
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(
        within(dialog).queryByRole("button", { name: "Select customer..." }),
      ).toBeNull(),
    );

    // Back to Amount and save with Enter.
    await tabUntil(
      user,
      (element) => element === within(dialog).getByLabelText("Amount"),
      "the Amount field",
    );
    await user.keyboard("500{Enter}");

    await waitFor(() =>
      expect(transactionsApi.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          customer_id: "c1",
          type: "charge",
          amount: 500,
        }),
        "b1",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("f. void a transaction: Tab to the row's Void, Enter, reason, Enter", async () => {
    renderApp(
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
    const user = userEvent.setup();

    await screen.findByText("Current Balance");
    await tabUntil(
      user,
      (element) =>
        element ===
        screen.getByRole("button", { name: "Void payment of ₹500.00" }),
      "the row's Void action",
    );
    await user.keyboard("{Enter}");
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Void this payment of ₹500.00?"),
    ).toBeTruthy();

    await tabUntil(
      user,
      (element) =>
        element === within(dialog).getByLabelText("Reason (optional)"),
      "the reason field",
    );
    await user.keyboard("Duplicate entry");
    await tabUntil(
      user,
      (element) =>
        element === within(dialog).getByRole("button", { name: "Void transaction" }),
      "the Void transaction button",
    );
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(transactionsApi.voidTransaction).toHaveBeenCalledWith(
        "t1",
        "Duplicate entry",
        "b1",
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("g. archive and restore a customer, both by keyboard", async () => {
    function renderCustomers(route = paths.customers("b1")) {
      return renderApp(
        <Routes>
          <Route path={routePatterns.customers} element={<CustomersPage />} />
          <Route
            path={`${routePatterns.customers}/:customerId`}
            element={<div>customer detail</div>}
          />
        </Routes>,
        { session, route },
      );
    }

    const user = userEvent.setup();

    // --- Archive from the active list ---
    const first = renderCustomers();
    await screen.findByRole("columnheader", { name: "Customer" });
    // Rows render from the async list query — wait for Asha's action
    // button before the tab loop starts.
    const ashaActions = await screen.findByRole("button", {
      name: "Actions for Asha Verma",
    });
    await tabUntil(
      user,
      (element) => element === ashaActions,
      "Asha's row actions",
    );
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    // The menu focuses its first item (View) once open.
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(menu).getByRole("menuitem", { name: "View" }),
      ),
    );
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(
      within(menu).getByRole("menuitem", { name: "Archive" }),
    );
    await user.keyboard("{Enter}");
    const archiveDialog = await screen.findByRole("dialog");
    await tabUntil(
      user,
      (element) =>
        element ===
        within(archiveDialog).getByRole("button", {
          name: "Archive customer",
        }),
      "the Archive customer button",
    );
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(customersApi.setCustomerArchived).toHaveBeenCalledWith(
        "c1",
        true,
        "b1",
      ),
    );
    first.unmount();

    // --- Restore from the archived filter (status=archived URL) ---
    renderCustomers(`${paths.customers("b1")}?status=archived`);
    await screen.findByText("Asha Verma");
    await tabUntil(
      user,
      (element) =>
        element ===
        screen.getByRole("button", { name: "Actions for Asha Verma" }),
      "the archived row's actions",
    );
    await user.keyboard("{Enter}");
    const archivedMenu = await screen.findByRole("menu");
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(archivedMenu).getByRole("menuitem", { name: "View" }),
      ),
    );
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      within(archivedMenu).getByRole("menuitem", { name: "Restore" }),
    );
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(customersApi.setCustomerArchived).toHaveBeenCalledWith(
        "c1",
        false,
        "b1",
      ),
    );
  });

  it("h. switch business: Tab to the switcher, Enter, Enter on the other one", async () => {
    renderApp(
      <>
        <LocationProbe />
        <Routes>
          <Route
            path={routePatterns.business}
            element={
              <>
                <BusinessSwitcher />
                <BusinessProbe />
              </>
            }
          />
          <Route
            path={routePatterns.businesses}
            element={<div>all businesses</div>}
          />
        </Routes>
      </>,
      { session, route: paths.business("b1") },
    );
    const user = userEvent.setup();

    const trigger = await screen.findByRole("button", {
      name: "Switch business: Bahi Khata (Owner)",
    });
    expect(await screen.findByText("Notes: b1 notes")).toBeTruthy();

    await tabUntil(user, (element) => element === trigger, "the switcher");
    await user.keyboard("{Enter}");
    const selected = await screen.findByRole("menuitemradio", {
      name: /Bahi Khata/,
    });
    // The menu focuses the current business on open.
    await waitFor(() => expect(document.activeElement).toBe(selected));

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitemradio", { name: /Rahim Traders/ }),
    );
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        paths.business("b2"),
      ),
    );
    expect(await screen.findByText("Notes: b2 notes")).toBeTruthy();
  });
});

/**
 * Stands in for a business page: reads the business from the URL with
 * the business-scoped query (the businessSwitcher suite's probe).
 */
function BusinessProbe() {
  const location = useLocation();
  const match = /^\/b\/([^/]+)/.exec(location.pathname);
  const businessId = match?.[1] ?? "";
  const { data } = useBusiness(businessId);
  return <p>Notes: {data?.notes ?? "none"}</p>;
}
