import { describe, it, expect } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { AppShell } from "@/components/layout/AppShell";
import { navItems } from "@/components/layout/navConfig";
import { routePatterns } from "@/lib/paths";

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

describe("app shell", () => {
  it("renders sidebar navigation, business slot and top bar", () => {
    renderApp(<AppShell />, { session });

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

  it("shows the page title for the current route", () => {
    renderApp(<AppShell />, { session, route: "/customers/abc" });
    expect(screen.getByRole("heading", { name: "Customers" })).toBeTruthy();
  });

  it("collapses the desktop sidebar to an icon rail", async () => {
    renderApp(<AppShell />, { session });

    await userEvent.click(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );

    // Labels leave the rail; the expand control appears
    expect(screen.queryByText("Transactions")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
  });

  it("opens the mobile drawer from the hamburger", async () => {
    renderApp(<AppShell />, { session });

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
    renderApp(<AppShell />, { session });

    await userEvent.click(screen.getByRole("button", { name: "User menu" }));
    expect(await screen.findByText("asha@example.com")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
  });
});

describe("navigation configuration", () => {
  it("is one array with Members and Settings hidden", () => {
    expect(navItems).toHaveLength(5);
    const visible = navItems.filter((item) => item.visible);
    expect(visible.map((item) => item.label)).toEqual([
      "Dashboard",
      "Customers",
      "Transactions",
    ]);
  });
});

describe("centralized paths", () => {
  it("keeps the v1 URLs exactly (no URL change)", () => {
    expect(routePatterns.login).toBe("/login");
    expect(routePatterns.dashboard).toBe("/");
    expect(routePatterns.customers).toBe("/customers");
    expect(routePatterns.customerDetail).toBe("/customers/:id");
    expect(routePatterns.importCustomers).toBe("/customers/import");
    expect(routePatterns.transactions).toBe("/transactions");
    expect(routePatterns.transactionDetail).toBe("/transactions/:id");
  });
});
