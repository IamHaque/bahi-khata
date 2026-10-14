import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { Topbar } from "@/components/layout/Topbar";
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

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

const memberships: Memberships = {
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
  ],
  invitations: [],
};

function paletteRow(id: string, name: string, phone: string | null): CustomerListRow {
  return {
    id,
    name,
    phone,
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
  };
}

const allCustomers = [
  paletteRow("c1", "Asha", "01711 111111"),
  paletteRow("c2", "Rahim", "01712 222222"),
  paletteRow("c3", "Chand", null),
];

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function TopbarStub() {
  return (
    <Topbar
      title="Dashboard"
      collapsed={false}
      onToggleSidebar={() => {}}
      onOpenMenu={() => {}}
    />
  );
}

function renderTopbar(route: string) {
  return renderApp(
    <>
      <LocationProbe />
      <Routes>
        <Route path={routePatterns.business} element={<TopbarStub />} />
        <Route path={routePatterns.businesses} element={<TopbarStub />} />
        <Route
          path={`${routePatterns.customers}/:customerId`}
          element={<div>customer detail</div>}
        />
      </Routes>
    </>,
    { session, route },
  );
}

async function openPalette() {
  await userEvent.click(screen.getByRole("button", { name: "Search (Ctrl+K)" }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  businessApi.getMemberships.mockImplementation(async () => memberships);
  customersApi.queryCustomers.mockImplementation(
    async (_businessId: string, params?: { search?: string }) => {
      const search = (params?.search ?? "").toLowerCase();
      const items =
        search === ""
          ? allCustomers
          : allCustomers.filter(
              (customer) =>
                customer.name.toLowerCase().includes(search) ||
                (customer.phone ?? "").toLowerCase().includes(search),
            );
      return { items, total: items.length, allTotal: allCustomers.length };
    },
  );
});

describe("S-28 command palette", () => {
  it("opens from the top bar search button and opens the chosen customer", async () => {
    renderTopbar(paths.business("b1"));

    const dialog = await openPalette();
    expect(within(dialog).getByText("Search customers")).toBeTruthy();

    await userEvent.type(
      within(dialog).getByLabelText("Search customers by name or phone"),
      "rah",
    );

    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith("b1", {
        search: "rah",
        pageSize: 8,
      }),
    );

    const option = await within(dialog).findByText("Rahim");
    await userEvent.click(option);

    expect(screen.getByTestId("location").textContent).toBe(
      paths.customerDetail("b1", "c2"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens with Ctrl+K, arrows to the second result and Enter opens it", async () => {
    renderTopbar(paths.business("b1"));
    await screen.findByRole("button", { name: "Search (Ctrl+K)" });

    await userEvent.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog")).toBeTruthy();

    // Empty term lists the business's customers once loaded.
    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith("b1", {
        search: "",
        pageSize: 8,
      }),
    );
    await screen.findByRole("option", { name: /Asha/ });

    // Keyboard flow runs on the input (auto-focused on open; focus it
    // explicitly so the events land there regardless of dialog focus).
    const input = screen.getByLabelText("Search customers by name or phone");
    input.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByTestId("location").textContent).toBe(
      paths.customerDetail("b1", "c2"),
    );
  });

  it("reports no match for a search that finds nothing", async () => {
    renderTopbar(paths.business("b1"));

    const dialog = await openPalette();
    await userEvent.type(
      within(dialog).getByLabelText("Search customers by name or phone"),
      "zzz",
    );

    expect(await within(dialog).findByText(/No customers match/)).toBeTruthy();
    expect(within(dialog).queryByRole("option")).toBeNull();
  });

  it("asks for a business when none is open, without querying", async () => {
    renderTopbar(paths.businesses);

    const dialog = await openPalette();
    expect(
      within(dialog).getByText(/No business is open/),
    ).toBeTruthy();
    expect(customersApi.queryCustomers).not.toHaveBeenCalled();
  });
});
