import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useParams, Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { BusinessSwitcher } from "@/components/layout/BusinessSwitcher";
import { useBusiness } from "@/features/business/hooks";
import { paths, routePatterns } from "@/lib/paths";
import type { Business, Memberships } from "@/features/business/api";

const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
  getBusiness: vi.fn(),
}));

vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
  getBusiness: businessApi.getBusiness,
}));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

function ownerMemberships(): Memberships {
  return {
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
}

function memberOnlyMemberships(): Memberships {
  return { businesses: [ownerMemberships().businesses[1]!], invitations: [] };
}

function freshBusiness(overrides: Partial<Business>): Business {
  return {
    id: "b1",
    owner_id: "u1",
    name: "Bahi Khata",
    business_type: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

/**
 * Stands in for a business page: it reads the business from the URL and
 * shows a detail fetched with the business-scoped query key — the same
 * pattern every real page uses (S-17, S-20).
 */
function BusinessProbe() {
  const { businessId } = useParams();
  const { data } = useBusiness(businessId ?? "");
  return <p>Notes: {data?.notes ?? "none"}</p>;
}

function renderSwitcher(options: { route?: string } = {}) {
  return renderApp(
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
        <Route
          path={routePatterns.onboardingBusiness}
          element={<div>create business</div>}
        />
      </Routes>
    </>,
    { session, route: options.route ?? paths.business("b1") },
  );
}

beforeEach(() => {
  businessApi.getMemberships.mockImplementation(async () => ownerMemberships());
  businessApi.getBusiness.mockImplementation(async (id: string) =>
    freshBusiness({ id, notes: `${id} notes` }),
  );
});

describe("S-26 business switcher", () => {
  it("shows the current business name and my role in the sidebar", async () => {
    renderSwitcher();

    const trigger = await screen.findByRole("button", {
      name: "Switch business: Bahi Khata (Owner)",
    });
    expect(trigger.textContent).toContain("Bahi Khata");
    expect(trigger.textContent).toContain("Owner");
  });

  it("lists my business first, then shared businesses, then All businesses", async () => {
    renderSwitcher();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Switch business: Bahi Khata (Owner)",
      }),
    );

    const items = await screen.findAllByRole("menuitemradio");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Bahi Khata");
    expect(items[1]!.textContent).toContain("Rahim Traders");
    // The current business is checked — screen readers announce it.
    expect(items[0]!.getAttribute("aria-checked")).toBe("true");
    expect(items[1]!.getAttribute("aria-checked")).toBe("false");

    // Then All businesses — and no Create business (I own one).
    const actions = screen.getAllByRole("menuitem");
    expect(actions).toHaveLength(1);
    expect(actions[0]!.textContent).toBe("All businesses");
  });

  it("switching lands on that business's dashboard with no old data visible", async () => {
    renderSwitcher();

    // b1's detail is on screen first.
    expect(await screen.findByText("Notes: b1 notes")).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Switch business: Bahi Khata (Owner)" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: /Rahim Traders/ }),
    );

    // The new business's dashboard URL...
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        paths.business("b2"),
      ),
    );
    // ...showing only the new business's data: every query is keyed by
    // the business in the URL (S-20), so b1's detail cannot remain.
    expect(await screen.findByText("Notes: b2 notes")).toBeTruthy();
    expect(screen.queryByText("Notes: b1 notes")).toBeNull();
    // The sidebar slot now names the new business and role.
    expect(
      screen.getByRole("button", {
        name: "Switch business: Rahim Traders (Viewer)",
      }),
    ).toBeTruthy();
  });

  it("offers Create business in the menu when I own none", async () => {
    businessApi.getMemberships.mockImplementation(async () =>
      memberOnlyMemberships(),
    );

    // This user's only business is b2 — the URL is scoped there.
    renderSwitcher({ route: paths.business("b2") });

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Switch business: Rahim Traders (Viewer)",
      }),
    );

    // Only the shared business is a radio item; I own none.
    expect(await screen.findAllByRole("menuitemradio")).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("menuitem", { name: /Create business/ }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        paths.onboardingBusiness,
      ),
    );
  });

  it("opens with Enter, moving focus to the selected business", async () => {
    renderSwitcher();

    const trigger = await screen.findByRole("button", {
      name: "Switch business: Bahi Khata (Owner)",
    });
    trigger.focus();
    await userEvent.keyboard("{Enter}");

    const selected = await screen.findByRole("menuitemradio", {
      name: /Bahi Khata/,
    });
    await waitFor(() => expect(document.activeElement).toBe(selected));

    // Arrow keys move between items.
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(
      screen.getByRole("menuitemradio", { name: /Rahim Traders/ }),
    );
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(selected);
  });

  it("opens with Space", async () => {
    renderSwitcher();

    const trigger = await screen.findByRole("button", {
      name: "Switch business: Bahi Khata (Owner)",
    });
    trigger.focus();
    await userEvent.keyboard(" ");

    expect(
      await screen.findByRole("menuitemradio", { name: /Bahi Khata/ }),
    ).toBeTruthy();
  });
});
