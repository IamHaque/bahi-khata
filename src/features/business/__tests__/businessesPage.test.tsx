import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { BusinessesPage } from "@/features/business/pages/BusinessesPage";
import { paths, routePatterns } from "@/lib/paths";
import type { Memberships } from "@/features/business/api";

const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
}));
const membersApi = vi.hoisted(() => ({
  getMyInvitations: vi.fn(),
  respondToInvitation: vi.fn(),
}));

vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
}));
vi.mock("@/features/members/api", () => ({
  getMyInvitations: membersApi.getMyInvitations,
  respondToInvitation: membersApi.respondToInvitation,
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

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderPage() {
  return renderApp(
    <>
      <LocationProbe />
      <Routes>
        <Route path={routePatterns.businesses} element={<BusinessesPage />} />
        <Route
          path={routePatterns.business}
          element={<div>business page</div>}
        />
      </Routes>
    </>,
    { session, route: paths.businesses },
  );
}

beforeEach(() => {
  businessApi.getMemberships.mockImplementation(async () => ownerMemberships());
  membersApi.getMyInvitations.mockImplementation(async () => []);
});

describe("S-26 businesses page", () => {
  it("shows three sections: My business, Shared with me, Invitations", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "My business" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Shared with me" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Invitations" })).toBeTruthy();
  });

  it("shows my owned business under My business and shared ones with owner name and role", async () => {
    renderPage();

    // My business: the owned card.
    expect(await screen.findByText("Bahi Khata")).toBeTruthy();
    expect(screen.getByText("You own this business")).toBeTruthy();

    // Shared with me: name, owner name and my role (S-26).
    expect(screen.getByText("Rahim Traders")).toBeTruthy();
    expect(screen.getByText("Owned by Rahim")).toBeTruthy();
    expect(screen.getByText("Viewer")).toBeTruthy();

    // Both cards open their own business dashboard (S-17).
    const openButtons = screen.getAllByRole("button", { name: "Open" });
    expect(openButtons).toHaveLength(2);
    await userEvent.click(openButtons[1]!);
    expect(screen.getByTestId("location").textContent).toBe(paths.business("b2"));
  });

  it("empty sections say what to do next (L-11)", async () => {
    // Only the owned business: nothing shared, no invitations pending.
    businessApi.getMemberships.mockImplementation(async () => ({
      businesses: [ownerMemberships().businesses[0]!],
      invitations: [],
    }));

    renderPage();

    expect(
      await screen.findByText("No businesses shared with you yet."),
    ).toBeTruthy();
    expect(
      screen.getByText("Ask an owner to invite your Google email."),
    ).toBeTruthy();
    expect(screen.getByText("No pending invitations.")).toBeTruthy();
  });
});
