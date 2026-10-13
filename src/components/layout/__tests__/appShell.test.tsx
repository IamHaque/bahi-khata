import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { AppShell } from "@/components/layout/AppShell";
import { buildNavItems } from "@/components/layout/navConfig";
import { paths, routePatterns } from "@/lib/paths";

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

// The shell renders inside /b/:businessId (S-17); route is the pathname
// under test.
function renderShell(options: { route?: string } = {}) {
  return renderApp(
    <Routes>
      <Route path={routePatterns.business} element={<AppShell />}>
        <Route index element={<div>page</div>} />
        <Route path="customers" element={<div>customers</div>} />
        <Route path="customers/:customerId" element={<div>customer</div>} />
        <Route path="transactions" element={<div>transactions</div>} />
      </Route>
    </Routes>,
    { session, route: options.route ?? "/b/biz1" },
  );
}

describe("app shell", () => {
  it("renders sidebar navigation, business slot and top bar", () => {
    renderShell();

    // Business switcher slot shows the app name until S-26
    expect(screen.getByText("BahiKhata")).toBeTruthy();

    // Sidebar nav — visible items only
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeTruthy();
    expect(screen.getAllByText("Dashboard").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Customers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Transactions").length).toBeGreaterThan(0);

    // Members and Settings hidden until their stories ship
    expect(screen.queryByText("Members")).toBeNull();
    expect(screen.queryByText("Settings")).toBeNull();

    // Top bar controls
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
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
    ]);
  });

  it("shows the page title for the current route", () => {
    renderShell({ route: "/b/biz1/customers/c-1" });
    expect(screen.getByRole("heading", { name: "Customers" })).toBeTruthy();
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
  it("is one array with Members and Settings hidden", () => {
    const navItems = buildNavItems("biz1");
    expect(navItems).toHaveLength(5);
    const visible = navItems.filter((item) => item.visible);
    expect(visible.map((item) => item.label)).toEqual([
      "Dashboard",
      "Customers",
      "Transactions",
    ]);
  });

  it("shows no in-business links without a businessId", () => {
    const navItems = buildNavItems(null);
    expect(navItems.filter((item) => item.visible)).toHaveLength(0);
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
