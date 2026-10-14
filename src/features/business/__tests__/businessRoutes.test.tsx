import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { BusinessGuard } from "@/features/business/components/BusinessGuard";
import { LegacyBusinessRedirect } from "@/features/business/components/LegacyBusinessRedirect";
import { CustomersPage } from "@/features/customers/pages/CustomersPage";
import { paths, routePatterns } from "@/lib/paths";
import type { BusinessSummary, Memberships } from "@/features/business/api";

const membershipState = vi.hoisted(() => ({
  impl: null as null | (() => Promise<Memberships>),
}));
const activeBusinessState = vi.hoisted(() => ({
  business: null as BusinessSummary | null,
}));
const customersApi = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  queryCustomers: vi.fn(async () => ({ items: [], total: 0, allTotal: 0 })),
}));

vi.mock("@/features/business/api", () => ({
  createBusiness: vi.fn(),
  getMemberships: () => {
    if (!membershipState.impl) throw new Error("membershipState.impl unset");
    return membershipState.impl();
  },
}));

vi.mock("@/contexts/BusinessContext", () => ({
  BusinessProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useActiveBusiness: () => ({
    business: activeBusinessState.business,
    role: activeBusinessState.business?.role ?? null,
    isOwner: false,
    status: activeBusinessState.business ? "ready" : "none",
  }),
  useBusinessContext: () => ({
    status: activeBusinessState.business ? "ready" : "none",
    business: activeBusinessState.business,
    role: activeBusinessState.business?.role ?? null,
    isOwner: false,
    error: null,
  }),
}));

vi.mock("@/features/customers/api", () => ({
  listCustomers: customersApi.listCustomers,
  queryCustomers: customersApi.queryCustomers,
  createCustomer: vi.fn(),
  getCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}));

// The page's hooks import the full transactions api surface.
vi.mock("@/features/transactions/api", () => ({
  createTransaction: vi.fn(),
  createTransactionsBatch: vi.fn(),
  getAllCustomerBalances: vi.fn(async () => ({})),
  queryTransactions: vi.fn(async () => ({ rows: [], total: 0 })),
  transactionRollup: vi.fn(async () => []),
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

const session = {
  user: { id: "u1", email: "asha@example.com" },
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

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
    </span>
  );
}

beforeEach(() => {
  membershipState.impl = null;
  activeBusinessState.business = null;
  customersApi.listCustomers.mockReset();
  customersApi.listCustomers.mockResolvedValue([]);
});

describe("S-17 business guard", () => {
  function renderGuard(route: string) {
    return renderApp(
      <Routes>
        <Route path={routePatterns.business} element={<BusinessGuard />}>
          <Route index element={<div data-testid="inside" />} />
        </Route>
        <Route
          path={routePatterns.businesses}
          element={<div data-testid="businesses" />}
        />
      </Routes>,
      { session, route },
    );
  }

  it("lets a member into their business", async () => {
    membershipState.impl = async () => memberships;

    renderGuard("/b/b1");

    expect(await screen.findByTestId("inside")).toBeTruthy();
  });

  it("blocks a business the user is not a member of, with one page and no data", async () => {
    membershipState.impl = async () => memberships;

    renderGuard("/b/someone-elses");

    // The same page for unknown and forbidden (RLS filters the list)…
    expect(
      await screen.findByText(
        "Business not found or you do not have access",
      ),
    ).toBeTruthy();
    // …with a link to My businesses, and no child page (and no data
    // call) ever mounts.
    const link = screen.getByRole("link", { name: "Go to My businesses" });
    expect(link.getAttribute("href")).toBe(paths.businesses);
    expect(screen.queryByTestId("inside")).toBeNull();
    expect(customersApi.listCustomers).not.toHaveBeenCalled();
  });

  it("shows only the skeleton while memberships are still loading", async () => {
    membershipState.impl = () => new Promise(() => {});

    renderGuard("/b/b1");

    expect(
      screen.getByRole("status", { name: "Loading your businesses" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("inside")).toBeNull();
  });
});

describe("S-17 legacy URLs keep working", () => {
  function renderLegacy(route: string) {
    return renderApp(
      <>
        <LocationProbe />
        <Routes>
        <Route
          path={routePatterns.legacyCustomers}
          element={
            <LegacyBusinessRedirect
              to={(businessId) => paths.customers(businessId)}
            />
          }
        />
        <Route
          path={routePatterns.legacyCustomerDetail}
          element={
            <LegacyBusinessRedirect
              to={(businessId, params) =>
                paths.customerDetail(businessId, params.customerId ?? "")
              }
            />
          }
        />
        <Route
          path={routePatterns.businesses}
          element={<div data-testid="businesses" />}
        />
        <Route
          path={routePatterns.customers}
          element={<div data-testid="scoped-customers" />}
        />
        <Route
          path={routePatterns.customerDetail}
          element={<div data-testid="scoped-detail" />}
        />
        </Routes>
      </>,
      { session, route },
    );
  }

  it("redirects /customers to the same page under the active business", async () => {
    activeBusinessState.business = memberships.businesses[0]!;

    renderLegacy("/customers");

    expect(await screen.findByTestId("scoped-customers")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe(
      "/b/b1/customers",
    );
  });

  it("redirects /customers/:customerId with the id intact", async () => {
    activeBusinessState.business = memberships.businesses[0]!;

    renderLegacy("/customers/c-99");

    expect(await screen.findByTestId("scoped-detail")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe(
      "/b/b1/customers/c-99",
    );
  });

  it("sends a user with no business to My businesses", async () => {
    activeBusinessState.business = null;

    renderLegacy("/customers");

    expect(await screen.findByTestId("businesses")).toBeTruthy();
  });
});

describe("S-17 URLs are the single source of truth", () => {
  function renderCustomersTab(route: string) {
    return renderApp(
      <Routes>
        <Route
          path={routePatterns.customers}
          element={<CustomersPage />}
        />
      </Routes>,
      { session, route },
    );
  }

  it("scopes every data call to the businessId in each tab's URL", async () => {
    // Tab A
    const tabA = renderCustomersTab("/b/tab-a/customers");
    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith(
        "tab-a",
        expect.anything(),
      ),
    );
    tabA.unmount();

    // Tab B — same user, different URL, different business
    const tabB = renderCustomersTab("/b/tab-b/customers");
    await waitFor(() =>
      expect(customersApi.queryCustomers).toHaveBeenCalledWith(
        "tab-b",
        expect.anything(),
      ),
    );
    tabB.unmount();
  });
});
