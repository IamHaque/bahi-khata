import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { AppError } from "@/lib/AppError";
import { formatDate, formatMoney } from "@/lib/format";
import { paths, routePatterns } from "@/lib/paths";
import type { Memberships } from "@/features/business/api";
import type {
  CustomerListResult,
  CustomerListRow,
} from "@/features/customers/api";

const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
}));
const customersApi = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  queryCustomers: vi.fn(),
  createCustomer: vi.fn(),
  getCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}));
const transactionsApi = vi.hoisted(() => ({
  getAllCustomerBalances: vi.fn(async () => ({})),
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
}));
// The page's hooks import the transactions api surface through
// useAllCustomerBalances.
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

function listRow(overrides: Partial<CustomerListRow>): CustomerListRow {
  return {
    id: "c1",
    name: "Asha",
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

const threeCustomers: CustomerListRow[] = [
  listRow({ id: "c1", name: "Asha", balance: 500, last_activity: "2026-02-01T10:00:00+00:00" }),
  listRow({
    id: "c2",
    name: "Rahim",
    phone: "01712 222222",
    balance: -200,
    created_at: "2026-01-10T00:00:00+00:00",
  }),
  listRow({
    id: "c3",
    name: "Chand",
    phone: null,
    tags: ["retail"],
    created_at: "2026-01-15T00:00:00+00:00",
    last_activity: "2026-01-20T00:00:00+00:00",
  }),
];

function result(rows = threeCustomers, total = 3): CustomerListResult {
  return { items: rows, total, allTotal: 3 };
}

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <span data-testid="location">{location.pathname}</span>
      <span data-testid="search">{location.search}</span>
      <button type="button" onClick={() => navigate(-1)}>
        Go back
      </button>
    </>
  );
}

function renderPage(route = paths.customers("b1")) {
  return renderApp(
    <>
      <LocationProbe />
      <Routes>
        <Route path={routePatterns.customers} element={<CustomersPage />} />
        <Route
          path={`${routePatterns.customers}/:customerId`}
          element={<div>customer detail</div>}
        />
      </Routes>
    </>,
    { session, route },
  );
}

async function findRowScope(customerName: string) {
  const cell = await screen.findByText(customerName);
  const row = cell.closest("tr");
  if (!row) throw new Error(`no table row for ${customerName}`);
  return within(row);
}

beforeEach(() => {
  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
  customersApi.queryCustomers.mockImplementation(async () => result());
  transactionsApi.getAllCustomerBalances.mockImplementation(async () => ({
    c1: 500,
    c2: -200,
    c3: 0,
  }));
});

describe("S-28 customers list", () => {
  it("renders the shared table with balance, last activity and added columns", async () => {
    renderPage();

    expect(
      await screen.findByRole("columnheader", { name: "Customer" }),
    ).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Phone" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Balance" })).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Last activity" }),
    ).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Added" })).toBeTruthy();

    const asha = await findRowScope("Asha");
    expect(asha.getByText("01711 111111")).toBeTruthy();
    expect(asha.getByText("Owes you")).toBeTruthy();
    expect(asha.getByText(formatMoney(500))).toBeTruthy();
    expect(asha.getByText(formatDate(threeCustomers[0]!.last_activity!))).toBeTruthy();
    expect(asha.getByText(formatDate(threeCustomers[0]!.created_at))).toBeTruthy();

    const rahim = await findRowScope("Rahim");
    expect(rahim.getByText("You owe")).toBeTruthy();
    expect(rahim.getByText(formatMoney(200))).toBeTruthy();
    // No transactions yet → an em dash, not a date.
    expect(rahim.getByText("—")).toBeTruthy();

    const chand = await findRowScope("Chand");
    expect(chand.getByText("retail")).toBeTruthy();
    expect(chand.getByText("—")).toBeTruthy();
  });

  it("shows the summary strip totals above the table", async () => {
    renderPage();
    const summary = within(
      await screen.findByRole("region", { name: "Customer summary" }),
    );

    // Wait for the data — the strip shows — while loading.
    await waitFor(() => expect(summary.getByText("3")).toBeTruthy());
    await waitFor(() =>
      expect(summary.getByText(formatMoney(500))).toBeTruthy(),
    );
    await waitFor(() => expect(summary.getByText(formatMoney(200))).toBeTruthy());
    expect(summary.getByText("Customers")).toBeTruthy();
    expect(summary.getByText("Owes you")).toBeTruthy();
    expect(summary.getByText("You owe")).toBeTruthy();
  });

  it("restores search, filter, sort and page from the URL", async () => {
    renderPage(
      "/b/b1/customers?q=ash&status=owes&sort=balance-desc&page=2",
    );

    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith("b1", {
        search: "ash",
        status: "owes",
        sort: "balance",
        dir: "desc",
        page: 2,
        pageSize: 10,
      }),
    );
    // Loaded rows, not the loading skeleton (whose headers carry no
    // sort affordance).
    await screen.findByText("Asha");

    expect(
      (screen.getByLabelText("Search customers by name or phone") as HTMLInputElement)
        .value,
    ).toBe("ash");
    expect(
      screen.getByRole("button", { name: "Owes you" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("columnheader", { name: "Balance" })
        .getAttribute("aria-sort"),
    ).toBe("descending");
  });

  it("sends a debounced search to the server and updates the URL", async () => {
    renderPage();
    await screen.findByText("Asha");
    expect(customersApi.queryCustomers).toHaveBeenCalledWith(
      "b1",
      expect.objectContaining({ search: "" }),
    );

    await userEvent.type(
      screen.getByLabelText("Search customers by name or phone"),
      "rah",
    );

    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe("?q=rah"),
    );
    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ search: "rah" }),
      ),
    );

    // Clearing restores the unfiltered list.
    await userEvent.clear(
      screen.getByLabelText("Search customers by name or phone"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe(""),
    );
  });

  it("filters, sorts and pages through the URL, and back restores the view", async () => {
    renderPage();
    // Loaded data: loading headers are not yet interactive.
    await screen.findByText("Asha");

    // Balance filter — pushed so the back button can undo it, page reset.
    await userEvent.click(screen.getByRole("button", { name: "Owes you" }));
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe("?status=owes"),
    );
    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ status: "owes", page: 1 }),
      ),
    );

    // Sort by clicking the Balance header (first click: low to high).
    await userEvent.click(screen.getByRole("columnheader", { name: "Balance" }));
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe(
        "?status=owes&sort=balance-asc",
      ),
    );
    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ sort: "balance", dir: "asc" }),
      ),
    );

    // Back undoes the sort, back again undoes the filter.
    await userEvent.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe("?status=owes"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe(""),
    );
  });

  it("resolves Recently added through the URL and pages to the server", async () => {
    customersApi.queryCustomers.mockImplementation(async () =>
      result(threeCustomers, 12),
    );
    renderPage("/b/b1/customers?sort=created-desc");

    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ sort: "created", dir: "desc", page: 1 }),
      ),
    );

    // Next page goes to the server with the same view.
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe(
        "?sort=created-desc&page=2",
      ),
    );
    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  it("opens the customer detail from a row", async () => {
    renderPage();
    const asha = await findRowScope("Asha");

    await userEvent.click(asha.getByText("Asha"));
    expect(screen.getByTestId("location").textContent).toBe(
      paths.customerDetail("b1", "c1"),
    );
  });

  it("offers View, Edit, Add transaction and Archive to an Owner", async () => {
    renderPage();
    const asha = await findRowScope("Asha");

    await userEvent.click(
      asha.getByRole("button", { name: "Actions for Asha" }),
    );
    const menu = await screen.findByRole("menu");
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(labels).toEqual(["View", "Edit", "Add transaction", "Archive"]);

    // Live since S-32: opens the shared sheet with this row's customer
    // preselected (the sheet itself mounts in the Topbar).
    expect(
      (
        within(menu).getByRole("menuitem", {
          name: "Add transaction",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    // Live since S-30: the archive column exists, so Archive opens the
    // confirmation instead of pretending.
    expect(
      (within(menu).getByRole("menuitem", { name: "Archive" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    // Edit opens the form dialog with this row's customer loaded.
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Edit Customer" }),
    ).toBeTruthy();
    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Asha");
  });

  it("navigates to the detail page from View", async () => {
    renderPage();
    const rahim = await findRowScope("Rahim");

    await userEvent.click(
      rahim.getByRole("button", { name: "Actions for Rahim" }),
    );
    const menu = await screen.findByRole("menu");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "View" }));

    expect(screen.getByTestId("location").textContent).toBe(
      paths.customerDetail("b1", "c2"),
    );
  });

  it("gives a Viewer only View and hides the create actions", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    renderPage();
    const asha = await findRowScope("Asha");

    await userEvent.click(
      asha.getByRole("button", { name: "Actions for Asha" }),
    );
    const menu = await screen.findByRole("menu");
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(labels).toEqual(["View"]);

    expect(screen.queryByRole("button", { name: "Add customer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import CSV" })).toBeNull();
  });

  it("shows an empty state that invites the first customer", async () => {
    customersApi.queryCustomers.mockImplementation(async () => ({
      items: [],
      total: 0,
      allTotal: 0,
    }));
    renderPage();

    expect(await screen.findByText("No customers yet")).toBeTruthy();
    // Invitation text for everyone (also the Viewer's copy)…
    expect(screen.getByText("Add your first customer to get started.")).toBeTruthy();
    // …but the action only for those who may add. Distinct from the
    // header's "Add customer" so the intent matches the row it leaves.
    const addButton = await screen.findByRole("button", {
      name: "Add your first customer",
    });
    await userEvent.click(addButton);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Add Customer" }),
    ).toBeTruthy();
  });

  it("keeps the empty state text-only for a Viewer", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    customersApi.queryCustomers.mockImplementation(async () => ({
      items: [],
      total: 0,
      allTotal: 0,
    }));
    renderPage();

    expect(await screen.findByText("No customers yet")).toBeTruthy();
    expect(screen.getByText("Add your first customer to get started.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Add your first customer" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Add customer" })).toBeNull();
  });

  it("shows a distinct no-results state with Clear filters", async () => {
    customersApi.queryCustomers.mockImplementation(async () => ({
      items: [],
      total: 0,
      allTotal: 3,
    }));
    renderPage("/b/b1/customers?q=zzz");

    expect(await screen.findByText("No customers match")).toBeTruthy();
    // Not the "no customers" empty state.
    expect(screen.queryByText("No customers yet")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    await waitFor(() =>
      expect(screen.getByTestId("search").textContent).toBe(""),
    );
    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith(
        "b1",
        expect.objectContaining({ search: "" }),
      ),
    );
  });

  it("recovers from a failed load with Try again", async () => {
    customersApi.queryCustomers.mockImplementationOnce(async () => {
      throw new AppError("network", "Could not reach the server.");
    });
    renderPage();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("Could not reach the server.")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("columnheader", { name: "Customer" })).toBeTruthy();
  });
});
