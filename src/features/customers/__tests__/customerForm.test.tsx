import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { AppError } from "@/lib/AppError";
import { paths, routePatterns } from "@/lib/paths";
import { toast } from "sonner";
import { getTransactionSheetState } from "@/features/transactions/sheetStore";
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
}));
const transactionsApi = vi.hoisted(() => ({
  getAllCustomerBalances: vi.fn(async () => ({})),
}));
// The fake database every mocked api function reads and mutates — the
// harness's server-state pattern: mutations write here, queries read
// here, so the app's refetch-after-mutate behaviour is observable.
const server = vi.hoisted(() => ({
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
  listTransactionsByCustomer: vi.fn(async () => []),
  updateTransaction: vi.fn(),
  updateTransactionStatus: vi.fn(),
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
    name: "Rahim Uddin",
    phone: "01712 222222",
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

async function openAddDialog() {
  await userEvent.click(screen.getByRole("button", { name: "Add customer" }));
  return screen.findByRole("dialog");
}

async function expandDetails(dialog: HTMLElement) {
  await userEvent.click(within(dialog).getByText("Additional details"));
}

async function rowScope(customerName: string) {
  const cell = await screen.findByText(customerName);
  const row = cell.closest("tr");
  if (!row) throw new Error(`no table row for ${customerName}`);
  return within(row);
}

beforeEach(() => {
  server.customers = [
    seedCustomer({
      id: "c1",
      tags: ["retail", "wholesale"],
      notes: "Pays on Fridays",
    }),
  ];

  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
  customersApi.queryCustomers.mockImplementation(
    async (_businessId: string, params?: { search?: string }) => {
      const search = (params?.search ?? "").trim().toLowerCase();
      const items = server.customers.filter(
        (customer) =>
          search === "" ||
          customer.name.toLowerCase().includes(search) ||
          (customer.phone ?? "").toLowerCase().includes(search),
      );
      return {
        items: items.map((customer) => ({ ...customer })),
        total: items.length,
        allTotal: items.length,
      };
    },
  );
  customersApi.listCustomers.mockImplementation(async () =>
    server.customers.map((customer) => ({ ...customer })),
  );
  customersApi.createCustomer.mockImplementation(
    async (input: Record<string, unknown>) => {
      const clean = Object.fromEntries(
        Object.entries(input).filter(([, value]) => value !== undefined),
      );
      const created = {
        ...seedCustomer({ id: `c${100 + server.customers.length}` }),
        ...(clean as Partial<CustomerListRow>),
      };
      server.customers.push(created);
      return created;
    },
  );
  customersApi.updateCustomer.mockImplementation(
    async (id: string, input: Record<string, unknown>) => {
      const row = server.customers.find((customer) => customer.id === id);
      if (!row) throw new Error("customer not found");
      Object.assign(
        row,
        Object.fromEntries(
          Object.entries(input).filter(([, value]) => value !== undefined),
        ),
      );
      return row;
    },
  );
  transactionsApi.getAllCustomerBalances.mockImplementation(async () =>
    Object.fromEntries(
      server.customers.map((customer) => [customer.id, customer.balance]),
    ),
  );
});

describe("S-29 customer form", () => {
  it("fast add: type a name, press Enter, and the toast offers Add transaction", async () => {
    renderPage();
    await screen.findByText("Rahim Uddin");

    const dialog = await openAddDialog();
    const nameInput = within(dialog).getByLabelText("Name") as HTMLInputElement;
    await userEvent.type(nameInput, "Asha Verma{Enter}");

    await waitFor(() =>
      expect(customersApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Asha Verma" }),
        "b1",
      ),
    );
    // Zero balance comes from having no transactions — the new row
    // renders Settled once the list refetches.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const scope = await rowScope("Asha Verma");
    expect(scope.getByText("Settled")).toBeTruthy();

    // Toast: "Customer added" with an Add transaction action that opens
    // the S-32 sheet with this brand-new customer preselected (B-04).
    const added = vi
      .mocked(toast.success)
      .mock.calls.find((call) => call[0] === "Customer added");
    expect(added).toBeTruthy();
    const [, options] = added as unknown as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(options.action.label).toBe("Add transaction");

    const created = (await customersApi.createCustomer.mock.results[0]!
      .value) as { id: string; name: string };
    expect(getTransactionSheetState().open).toBe(false);
    options.action.onClick();
    expect(getTransactionSheetState()).toMatchObject({
      open: true,
      customer: { id: created.id, name: created.name },
    });
    // And it did not navigate anywhere — the sheet IS the next step.
    expect(screen.getByTestId("location").textContent).toBe(
      paths.customers("b1"),
    );
  });

  it("keeps Name primary and the rest under Additional details", async () => {
    renderPage();
    await screen.findByText("Rahim Uddin");

    const dialog = await openAddDialog();
    // Name sits outside the details group…
    within(dialog).getByLabelText("Name");
    // …everything else behind the disclosure.
    await expandDetails(dialog);
    for (const label of [
      "Phone",
      "Email",
      "Address",
      "Alternate contact name",
      "Alternate contact phone",
      "Tags",
      "Notes",
    ]) {
      within(dialog).getByLabelText(label);
    }
    expect(within(dialog).getByText("Additional details")).toBeTruthy();
  });

  it("validates inline and saves nothing when Name is empty or a format is implausible", async () => {
    renderPage();
    await screen.findByText("Rahim Uddin");

    const dialog = await openAddDialog();
    await userEvent.type(within(dialog).getByLabelText("Name"), "{Enter}");
    expect(await within(dialog).findByText("Name is required")).toBeTruthy();
    expect(customersApi.createCustomer).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText("Name"), "Asha Verma");
    await expandDetails(dialog);
    await userEvent.type(
      within(dialog).getByLabelText("Email"),
      "not-an-email",
    );
    await userEvent.keyboard("{Enter}");
    expect(
      await within(dialog).findByText("Please enter a valid email address"),
    ).toBeTruthy();
    expect(customersApi.createCustomer).not.toHaveBeenCalled();

    await userEvent.clear(within(dialog).getByLabelText("Email"));
    await userEvent.type(within(dialog).getByLabelText("Phone"), "abc");
    await userEvent.keyboard("{Enter}");
    expect(
      await within(dialog).findByText("Please enter a valid phone number"),
    ).toBeTruthy();
    expect(customersApi.createCustomer).not.toHaveBeenCalled();
  });

  it("caps tags at 10 items of 24 characters each", async () => {
    renderPage();
    await screen.findByText("Rahim Uddin");

    const dialog = await openAddDialog();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Asha Verma");
    await expandDetails(dialog);
    const tagsInput = within(dialog).getByLabelText("Tags");

    await userEvent.type(
      tagsInput,
      "a, b, c, d, e, f, g, h, i, j, k",
    );
    await userEvent.keyboard("{Enter}");
    expect(await within(dialog).findByText("Up to 10 tags")).toBeTruthy();
    expect(customersApi.createCustomer).not.toHaveBeenCalled();

    await userEvent.clear(tagsInput);
    await userEvent.type(tagsInput, "x".repeat(25));
    await userEvent.keyboard("{Enter}");
    expect(
      await within(dialog).findByText("Tags can be 24 characters or less"),
    ).toBeTruthy();
    expect(customersApi.createCustomer).not.toHaveBeenCalled();
  });

  it("hints at a duplicate name + phone without blocking the save", async () => {
    renderPage();
    await screen.findByText("Rahim Uddin");

    const dialog = await openAddDialog();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rahim Uddin");
    await expandDetails(dialog);
    await userEvent.type(within(dialog).getByLabelText("Phone"), "01712 222222");

    expect(
      await within(dialog).findByText(
        "A customer with this name and phone already exists.",
      ),
    ).toBeTruthy();
    // The hint is not a gate: Add customer still submits.
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Add customer" }),
    );
    await waitFor(() =>
      expect(customersApi.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Rahim Uddin" }),
        "b1",
      ),
    );
  });

  it("offers to open the existing customer from the duplicate hint", async () => {
    renderPage();
    await screen.findByText("Rahim Uddin");

    const dialog = await openAddDialog();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Rahim Uddin");
    await expandDetails(dialog);
    await userEvent.type(within(dialog).getByLabelText("Phone"), "01712 222222");

    const hint = await within(dialog).findByText(
      "A customer with this name and phone already exists.",
    );
    expect(hint).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Open existing customer",
      }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("location").textContent).toBe(
      paths.customerDetail("b1", "c1"),
    );
    expect(customersApi.createCustomer).not.toHaveBeenCalled();
  });

  it("edit: pre-fills the row, saves through update, and the list refreshes", async () => {
    renderPage();
    await screen.findByText("Rahim Uddin");

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Rahim Uddin" }),
    );
    const menu = await screen.findByRole("menu");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Edit Customer" }),
    ).toBeTruthy();
    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Rahim Uddin");
    expect(
      (within(dialog).getByLabelText("Tags") as HTMLInputElement).value,
    ).toBe("retail, wholesale");
    expect(
      (within(dialog).getByLabelText("Notes") as HTMLTextAreaElement).value,
    ).toBe("Pays on Fridays");

    const nameInput = within(dialog).getByLabelText("Name") as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Rahim Chowdhury");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );

    await waitFor(() =>
      expect(customersApi.updateCustomer).toHaveBeenCalledWith(
        "c1",
        expect.objectContaining({ name: "Rahim Chowdhury" }),
        "b1",
      ),
    );
    expect(
      vi
        .mocked(toast.success)
        .mock.calls.some((call) => call[0] === "Customer updated"),
    ).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // The invalidated list refetches — the new name shows without a reload.
    expect(await screen.findByText("Rahim Chowdhury")).toBeTruthy();
    expect(screen.queryByText("Rahim Uddin")).toBeNull();
  });

  it("keeps the dialog open with every keystroke when the save fails", async () => {
    customersApi.createCustomer.mockImplementationOnce(async () => {
      throw new AppError("network", "Could not save the customer.");
    });
    renderPage();
    await screen.findByText("Rahim Uddin");

    const dialog = await openAddDialog();
    await userEvent.type(within(dialog).getByLabelText("Name"), "Asha Verma");
    await userEvent.keyboard("{Enter}");

    expect(
      await within(dialog).findByText("Could not save the customer."),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      (within(dialog).getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Asha Verma");
  });

  it("gives a Viewer no entry point to the dialog", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      membershipsFor("viewer"),
    );
    renderPage();
    await screen.findByText("Rahim Uddin");

    expect(screen.queryByRole("button", { name: "Add customer" })).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Rahim Uddin" }),
    );
    const menu = await screen.findByRole("menu");
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(labels).toEqual(["View"]);
  });
});
