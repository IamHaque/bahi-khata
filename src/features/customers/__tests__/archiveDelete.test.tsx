import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { AppError } from "@/lib/AppError";
import { paths, routePatterns } from "@/lib/paths";
import { toast } from "sonner";
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
  getAllCustomerBalances: vi.fn(async () => ({})),
}));
// The fake database every mocked api function reads and mutates — the
// harness's server-state pattern: mutations write here, queries read
// here, so archive/restore/delete round trips are observable.
const server = vi.hoisted(() => ({
  customers: [] as CustomerListRow[],
  counts: {} as Record<string, number>,
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
  createTransaction: vi.fn(),
  createTransactionsBatch: vi.fn(),
  getAllCustomerBalances: transactionsApi.getAllCustomerBalances,
  getAllTransactions: vi.fn(async () => []),
  getCustomerBalance: vi.fn(async () => 0),
  getDashboardSummary: vi.fn(),
  getTodayActivity: vi.fn(async () => ({ count: 0, net: 0 })),
  getTodayTransactions: vi.fn(async () => []),
  getTransactionById: vi.fn(),
  getCustomerLedger: vi.fn(async () => []),
  updateTransaction: vi.fn(),
  restoreTransaction: vi.fn(),
  voidTransaction: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

type Role = "owner" | "editor" | "viewer";

function membershipsFor(role: Role): Memberships {
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
    archived_at: null,
    ...overrides,
  };
}

function renderPage(route = paths.customers("b1")) {
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

async function findRowScope(customerName: string) {
  const cell = await screen.findByText(customerName);
  const row = cell.closest("tr");
  if (!row) throw new Error(`no table row for ${customerName}`);
  return within(row);
}

async function openRowMenu(customerName: string) {
  const scope = await findRowScope(customerName);
  await userEvent.click(
    scope.getByRole("button", { name: `Actions for ${customerName}` }),
  );
  return screen.findByRole("menu");
}

async function showArchivedFilter() {
  await userEvent.click(screen.getByRole("button", { name: "Archived" }));
  await waitFor(() =>
    expect(customersApi.queryCustomers).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ status: "archived" }),
    ),
  );
}

function archiveAsha() {
  const asha = server.customers[0];
  if (!asha) throw new Error("fixture missing Asha");
  asha.archived_at = "2026-03-01T00:00:00+00:00";
}

beforeEach(() => {
  server.customers = [
    seedCustomer({ id: "c1", name: "Asha Verma", balance: 4500 }),
    seedCustomer({ id: "c2", name: "Karim Chowdhury", balance: 0 }),
  ];
  server.counts = { c1: 12, c2: 0 };

  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
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
        else if (status === "credit") items = items.filter((c) => c.balance < 0);
        else if (status === "settled") items = items.filter((c) => c.balance === 0);
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
    // Mirrors the real feed (S-30): archived customers leave the totals.
    Object.fromEntries(
      server.customers
        .filter((customer) => customer.archived_at == null)
        .map((customer) => [customer.id, customer.balance]),
    ),
  );
});

describe("S-30 archive, restore and delete", () => {
  it("warns about kept history — and about totals only when the balance is not zero", async () => {
    renderPage();
    const menu = await openRowMenu("Asha Verma");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Archive" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Archive Asha Verma?" }),
    ).toBeTruthy();
    expect(
      await within(dialog).findByText(/has 12 transactions/),
    ).toBeTruthy();
    expect(
      await within(dialog).findByText(/restored at any time/),
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/left out of lists and dashboard totals/),
    ).toBeTruthy();
    within(dialog).getByRole("button", { name: "Archive customer" });

    // A settled customer gets the kept-history promise, not the totals
    // warning — archiving them changes no total.
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const karimMenu = await openRowMenu("Karim Chowdhury");
    await userEvent.click(
      within(karimMenu).getByRole("menuitem", { name: "Archive" }),
    );
    const karimDialog = await screen.findByRole("dialog");
    await within(karimDialog).findByText(/has 0 transactions/);
    expect(
      within(karimDialog).queryByText(/left out of lists/),
    ).toBeNull();
  });

  it("archives the row away from the list and offers Undo for 8 seconds", async () => {
    renderPage();
    const menu = await openRowMenu("Asha Verma");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
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
    // The toast says what happened and carries Undo for 8 seconds.
    const archivedCall = vi
      .mocked(toast.success)
      .mock.calls.find((call) => call[0] === "Customer archived");
    expect(archivedCall).toBeTruthy();
    const [, options] = archivedCall as unknown as [
      string,
      { duration: number; action: { label: string; onClick: () => void } },
    ];
    expect(options.duration).toBe(8000);
    expect(options.action.label).toBe("Undo");

    // Gone from the list (the invalidation refetches through the mock)…
    await waitFor(() =>
      expect(screen.queryByText("Asha Verma")).toBeNull(),
    );
    // …and Undo puts her back with one restore.
    options.action.onClick();
    await waitFor(() =>
      expect(customersApi.setCustomerArchived).toHaveBeenCalledWith(
        "c1",
        false,
        "b1",
      ),
    );
    expect(await screen.findByText("Asha Verma")).toBeTruthy();
  });

  it("shows archived customers with balances under the Archived filter", async () => {
    archiveAsha();
    renderPage();
    expect(await screen.findByText("Karim Chowdhury")).toBeTruthy();
    expect(screen.queryByText("Asha Verma")).toBeNull();

    await showArchivedFilter();

    const asha = await findRowScope("Asha Verma");
    expect(asha.getByText("Archived")).toBeTruthy();
    // Her 4500 still renders — history's balances never disappear.
    expect(asha.getByText(/4,500/)).toBeTruthy();
    expect(screen.queryByText("Karim Chowdhury")).toBeNull();
  });

  it("restores from the archived row's menu, taking it back out of the filter", async () => {
    archiveAsha();
    renderPage();
    await showArchivedFilter();

    const menu = await openRowMenu("Asha Verma");
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(labels).toEqual(["View", "Restore", "Delete permanently"]);

    await userEvent.click(within(menu).getByRole("menuitem", { name: "Restore" }));
    await waitFor(() =>
      expect(customersApi.setCustomerArchived).toHaveBeenCalledWith(
        "c1",
        false,
        "b1",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Asha Verma")).toBeNull(),
    );
  });

  it("gates permanent delete behind typing the customer's exact name", async () => {
    archiveAsha();
    renderPage();
    await showArchivedFilter();

    const menu = await openRowMenu("Asha Verma");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Delete permanently" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Delete Asha Verma permanently?",
      }),
    ).toBeTruthy();
    expect(
      await within(dialog).findByText(/all 12 transactions are permanently removed/),
    ).toBeTruthy();
    within(dialog).getByText("Type Asha Verma to confirm");

    const confirmButton = () =>
      within(dialog).getByRole("button", {
        name: "Delete permanently",
      }) as HTMLButtonElement;
    expect(confirmButton().disabled).toBe(true);

    await userEvent.type(
      within(dialog).getByLabelText("Type Asha Verma to confirm"),
      "Asha Verm",
    );
    expect(confirmButton().disabled).toBe(true);

    await userEvent.type(
      within(dialog).getByLabelText("Type Asha Verma to confirm"),
      "a",
    );
    expect(confirmButton().disabled).toBe(false);

    await userEvent.click(confirmButton());
    await waitFor(() =>
      expect(customersApi.deleteCustomerPermanently).toHaveBeenCalledWith(
        "c1",
        "b1",
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Asha Verma")).toBeNull(),
    );
  });

  it("lets an Editor archive and restore but never destroy", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("editor"),
    );
    archiveAsha();
    renderPage();

    // Active row: full working-set menu, Archive live (S-30).
    const karimMenu = await openRowMenu("Karim Chowdhury");
    const activeLabels = within(karimMenu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(activeLabels).toEqual([
      "View",
      "Edit",
      "Add transaction",
      "Archive",
    ]);

    await showArchivedFilter();
    const archivedMenu = await openRowMenu("Asha Verma");
    const archivedLabels = within(archivedMenu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(archivedLabels).toEqual(["View", "Restore"]);
  });

  it("gives a Viewer no archive, restore or delete action at all", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    archiveAsha();
    renderPage();

    const activeMenu = await openRowMenu("Karim Chowdhury");
    expect(
      within(activeMenu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["View"]);

    await showArchivedFilter();
    const archivedMenu = await openRowMenu("Asha Verma");
    expect(
      within(archivedMenu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["View"]);
  });

  it("keeps the row in place and says so when the archive fails", async () => {
    customersApi.setCustomerArchived.mockImplementationOnce(async () => {
      throw new AppError("network", "offline");
    });
    renderPage();
    const menu = await openRowMenu("Asha Verma");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Archive" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Archive customer" }),
    );

    await waitFor(() =>
      expect(
        vi
          .mocked(toast.error)
          .mock.calls.some(
            (call) => call[0] === "Could not archive the customer. Try again.",
          ),
      ).toBe(true),
    );
    // Nothing was archived, so the row never left the list.
    expect(screen.getByText("Asha Verma")).toBeTruthy();
  });
});
