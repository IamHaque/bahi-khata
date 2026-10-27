import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/app/PageHeader";
import { buildNavItems } from "@/components/layout/navConfig";
import { paths, routePatterns } from "@/lib/paths";

const businessApi = vi.hoisted(() => ({ getMemberships: vi.fn() }));
vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
}));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

// The owner fixture makes the role gates observable: with it live, the
// Import and Recently deleted links appear, proving permissions resolved.
const ownerMemberships = {
  businesses: [
    { id: "biz1", name: "Rahim Traders", role: "owner", isOwner: true },
  ],
  invitations: [],
};

// The shell renders inside /b/:businessId (S-17); route is the pathname
// under test.
function renderShell(options: { route?: string } = {}) {
  return renderApp(
    <Routes>
      <Route path={routePatterns.business} element={<AppShell />}>
        {/* The index route carries a real PageHeader so the one-h1
            assertion sees the page's own heading (L-05). */}
        <Route index element={<PageHeader title="Dashboard" />} />
        <Route path="customers" element={<div>customers</div>} />
        <Route path="customers/:customerId" element={<div>customer</div>} />
        <Route
          path="customers/:customerId/statement"
          element={<div>statement</div>}
        />
        <Route path="customers/import" element={<div>import</div>} />
        <Route path="transactions" element={<div>transactions</div>} />
        <Route path="transactions/:transactionId" element={<div>tx</div>} />
        <Route path="deleted" element={<div>deleted</div>} />
        <Route path="members" element={<div>members</div>} />
        <Route path="settings" element={<div>settings</div>} />
      </Route>
      <Route path={routePatterns.businesses} element={<AppShell />} />
    </Routes>,
    { session, route: options.route ?? "/b/biz1" },
  );
}

beforeEach(() => {
  businessApi.getMemberships.mockReset();
  businessApi.getMemberships.mockResolvedValue({
    businesses: [],
    invitations: [],
  });
});

describe("app shell", () => {
  it("renders sidebar navigation, business slot and top bar", () => {
    renderShell();

    // The switcher falls back to the app name while memberships are
    // unavailable (S-26); the brand row always carries the wordmark
    // (L-05), so scope the fallback to the trigger.
    expect(
      within(
        screen.getByRole("button", {
          name: "Switch business: BahiKhata Business",
        }),
      ).getByText("BahiKhata"),
    ).toBeTruthy();

    // Sidebar nav — visible items only
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeTruthy();
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Customers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Transactions").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Members").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Settings").length).toBeGreaterThan(0);

    // Top bar controls. L-05: the title is a paragraph in the bar, not
    // a heading - the page's PageHeader owns the h1.
    const banner = within(screen.getByRole("banner"));
    expect(banner.getByText("Dashboard")).toBeTruthy();
    expect(banner.getByText("Dashboard").tagName).toBe("P");
    expect(screen.getByLabelText("Search (Ctrl+K)")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "User menu" })).toBeTruthy();
  });

  it("builds every nav link from the businessId in the URL", () => {
    renderShell();

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    const links = within(nav)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(links).toEqual([
      paths.business("biz1"),
      paths.customers("biz1"),
      paths.transactions("biz1"),
      paths.members("biz1"),
      paths.settings("biz1"),
    ]);
  });

  it("titles the top bar for every route, most specific first (L-05)", () => {
    const cases: Array<[route: string, title: string]> = [
      ["/b/biz1/customers/import", "Import"],
      ["/b/biz1/customers/c-1/statement", "Statement"],
      ["/b/biz1/customers/c-1", "Customer"],
      ["/b/biz1/customers", "Customers"],
      ["/b/biz1/transactions/t-1", "Transaction"],
      ["/b/biz1/transactions", "Transactions"],
      ["/b/biz1/deleted", "Recently deleted"],
      ["/b/biz1/members", "Members"],
      ["/b/biz1/settings", "Settings"],
      ["/b/biz1", "Dashboard"],
      ["/businesses", "My businesses"],
    ];
    for (const [route, expected] of cases) {
      const rendered = renderShell({ route });
      const banner = within(screen.getByRole("banner"));
      expect(banner.getByText(expected).tagName).toBe("P");
      rendered.unmount();
    }
  });

  it("never titles the Import page Customers (L-05)", () => {
    renderShell({ route: "/b/biz1/customers/import" });
    const banner = within(screen.getByRole("banner"));
    expect(banner.getByText("Import")).toBeTruthy();
    expect(banner.queryByText("Customers")).toBeNull();
  });

  it("renders exactly one level-1 heading - the page's own (L-05)", () => {
    renderShell();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]!.textContent).toBe("Dashboard");
  });

  it("keeps one primary Add transaction: off in the bar on Dashboard, on elsewhere (L-05)", async () => {
    businessApi.getMemberships.mockResolvedValue(ownerMemberships);

    // Dashboard: permissions are demonstrably live (the owner sees the
    // Import link) yet the top bar carries no Add transaction - the
    // page's PageHeader owns the primary action.
    const dashboard = renderShell({ route: "/b/biz1" });
    await screen.findByRole("link", { name: "Import" });
    expect(
      within(screen.getByRole("banner")).queryByLabelText(
        "Add transaction",
      ),
    ).toBeNull();
    dashboard.unmount();

    // Customers: the top bar shows the one Add transaction.
    renderShell({ route: "/b/biz1/customers" });
    await screen.findByRole("link", { name: "Import" });
    expect(
      within(screen.getByRole("banner")).getByLabelText("Add transaction"),
    ).toBeTruthy();
  });

  it("is free of serious accessibility violations (L-05)", async () => {
    const { container } = renderShell();
    await expectNoSeriousViolations(container);
  });

  it("collapses the desktop sidebar to an icon rail", async () => {
    renderShell();

    await userEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );

    // Labels leave the rail; the expand control appears
    expect(screen.queryByText("Transactions")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
  });

  it("opens the mobile drawer from the hamburger", async () => {
    renderShell();

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));

    // The drawer (a modal dialog) carries the same navigation;
    // the desktop sidebar is aria-hidden while it is open.
    const drawer = await screen.findByRole("dialog");
    expect(drawer.textContent).toContain("Navigation menu");
    const nav = within(drawer).getByRole("navigation", {
      name: "Main navigation",
    });
    expect(within(nav).getByText("Customers")).toBeTruthy();
    expect(within(nav).getByText("Transactions")).toBeTruthy();
  });

  it("offers Sign out in the user menu", async () => {
    renderShell();

    await userEvent.click(screen.getByRole("button", { name: "User menu" }));
    expect(await screen.findByText("asha@example.com")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  });
});

describe("navigation configuration", () => {
  it("is one array with every in-business link visible", () => {
    const navItems = buildNavItems("biz1");
    // S-38 added Import and S-51 added Recently deleted (7 entries), but
    // the bare call keeps both hidden — exactly five links, as before.
    expect(navItems).toHaveLength(7);
    const visible = navItems.filter((item) => item.visible);
    expect(visible.map((item) => item.label)).toEqual([
      "Dashboard",
      "Customers",
      "Transactions",
      "Members",
      "Settings",
    ]);
  });

  it("shows no in-business links without a businessId", () => {
    const navItems = buildNavItems(null);
    expect(navItems.filter((item) => item.visible)).toHaveLength(0);
  });

  it("adds the Import link only for roles that may import (S-38)", () => {
    const owner = buildNavItems("biz1", { canImport: true });
    expect(owner).toHaveLength(7);
    const importItem = owner.find((item) => item.label === "Import");
    expect(importItem?.path).toBe("/b/biz1/customers/import");
    expect(importItem?.visible).toBe(true);

    // Viewer (or memberships not loaded): the item exists in the config
    // but stays hidden — five links, exactly as before S-38.
    const viewer = buildNavItems("biz1", { canImport: false });
    expect(viewer).toHaveLength(7);
    expect(viewer.filter((item) => item.visible)).toHaveLength(5);
    expect(
      viewer.find((item) => item.label === "Import")?.visible,
    ).toBe(false);
  });

  it("shows Recently deleted only for owners, between Import and Settings (S-51)", () => {
    const owner = buildNavItems("biz1", {
      canImport: true,
      canViewDeleted: true,
    });
    const deleted = owner.find((item) => item.label === "Recently deleted");
    expect(deleted?.path).toBe("/b/biz1/deleted");
    expect(deleted?.visible).toBe(true);
    // Position: after Import, before Settings.
    const labels = owner.map((item) => item.label);
    expect(labels.indexOf("Recently deleted")).toBeGreaterThan(
      labels.indexOf("Import"),
    );
    expect(labels.indexOf("Recently deleted")).toBeLessThan(
      labels.indexOf("Settings"),
    );

    // A non-owner (editor/viewer) must not see it.
    const nonOwner = buildNavItems("biz1", {
      canImport: true,
      canViewDeleted: false,
    });
    expect(
      nonOwner.find((item) => item.label === "Recently deleted")?.visible,
    ).toBe(false);
    expect(nonOwner.filter((item) => item.visible)).toHaveLength(6);
  });
});

describe("centralized paths", () => {
  it("keeps the unscoped URLs exactly", () => {
    expect(routePatterns.login).toBe("/login");
    expect(routePatterns.businesses).toBe("/businesses");
    expect(routePatterns.onboardingBusiness).toBe("/onboarding/business");
  });

  it("scopes every data page under /b/:businessId", () => {
    expect(routePatterns.business).toBe("/b/:businessId");
    expect(routePatterns.customers).toBe("/b/:businessId/customers");
    expect(routePatterns.importCustomers).toBe(
      "/b/:businessId/customers/import",
    );
    expect(routePatterns.customerDetail).toBe(
      "/b/:businessId/customers/:customerId",
    );
    expect(routePatterns.transactions).toBe("/b/:businessId/transactions");
    expect(routePatterns.transactionDetail).toBe(
      "/b/:businessId/transactions/:transactionId",
    );
    // S-51: the owner's trash page.
    expect(routePatterns.deletedItems).toBe("/b/:businessId/deleted");
    expect(paths.deletedItems("b1")).toBe("/b/b1/deleted");
  });

  it("keeps the v1 URLs as redirect patterns (S-17)", () => {
    expect(routePatterns.legacyCustomers).toBe("/customers");
    expect(routePatterns.legacyCustomerDetail).toBe("/customers/:customerId");
    expect(routePatterns.legacyImport).toBe("/customers/import");
    expect(routePatterns.legacyTransactions).toBe("/transactions");
    expect(routePatterns.legacyTransactionDetail).toBe(
      "/transactions/:transactionId",
    );
  });
});
