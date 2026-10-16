import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { Route, Routes } from "react-router-dom";
import { renderApp } from "@/test/app-render";
import { Sidebar } from "@/components/layout/Sidebar";
import { paths, routePatterns } from "@/lib/paths";
import type { Memberships } from "@/features/business/api";

const businessApi = vi.hoisted(() => ({ getMemberships: vi.fn() }));
vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
}));
// The switcher is its own feature with its own reads; this suite is
// about the nav list's active state, not the business picker.
vi.mock("@/components/layout/BusinessSwitcher", () => ({
  BusinessSwitcher: () => null,
}));

const session = {
  user: { email: "ollie@example.com" },
} as unknown as Session;

function membershipsFor(role: "owner" | "editor" | "viewer"): Memberships {
  return {
    businesses: [
      {
        id: "b1",
        name: "Bahi Khata",
        businessType: null,
        ownerId: "u1",
        ownerName: "Ollie Owner",
        ownerEmail: "ollie@example.com",
        role,
        isOwner: role === "owner",
      },
    ],
    invitations: [],
  };
}

function renderSidebar(route: string) {
  return renderApp(
    <Routes>
      <Route
        path={`${routePatterns.business}/*`}
        element={<Sidebar collapsed={false} />}
      />
    </Routes>,
    { session, route },
  );
}

/** The one link carrying aria-current="page", by its visible label. */
function activeItem(): string | null {
  const active = screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page");
  // The regression this suite pins: prefix matching used to light up
  // two or three items at once.
  expect(active).toHaveLength(1);
  return active[0]!.textContent;
}

beforeEach(() => {
  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor("owner"),
  );
});

describe("Sidebar active state", () => {
  it("highlights only Dashboard on the business root", () => {
    renderSidebar(paths.business("b1"));

    expect(activeItem()).toBe("Dashboard");
  });

  it("highlights only Customers on the customers list", () => {
    renderSidebar(paths.customers("b1"));

    expect(activeItem()).toBe("Customers");
  });

  it("keeps Customers highlighted on a customer detail page", () => {
    renderSidebar(`${paths.customers("b1")}/c9`);

    expect(activeItem()).toBe("Customers");
  });

  it("highlights only Import on the import page — not Dashboard or Customers", async () => {
    renderSidebar(paths.importCustomers("b1"));
    // Import is role-gated: it only exists once memberships resolve.
    await screen.findByRole("link", { name: "Import" });

    expect(activeItem()).toBe("Import");
  });

  it("highlights only Transactions on the transactions page", () => {
    renderSidebar(paths.transactions("b1"));

    expect(activeItem()).toBe("Transactions");
  });
});
