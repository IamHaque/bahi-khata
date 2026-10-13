import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Routes,
  Route,
  useLocation,
  MemoryRouter,
} from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import {
  renderApp,
  __setMockSession,
} from "@/test/app-render";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/Login";
import { LandingResolver } from "@/features/business/pages/LandingResolver";
import { BusinessesPage } from "@/features/business/pages/BusinessesPage";
import type { Memberships } from "@/features/business/api";

const membershipState = vi.hoisted(() => ({
  impl: null as null | (() => Promise<Memberships>),
}));
const activeBusinessState = vi.hoisted(() => ({
  status: "none" as "loading" | "ready" | "none" | "forbidden",
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
    business: null,
    role: null,
    isOwner: activeBusinessState.status === "ready",
    status: activeBusinessState.status,
  }),
  useBusinessContext: () => ({
    status: activeBusinessState.status,
    business: null,
    role: null,
    isOwner: false,
    error: null,
  }),
}));

vi.mock("@/pages/Dashboard", () => ({
  DashboardPage: () => <div data-testid="dashboard" />,
}));

const session = {
  user: { id: "u1", email: "asha@example.com" },
} as unknown as Session;

const ownerMemberships: Memberships = {
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

const memberOnlyMemberships: Memberships = {
  businesses: [ownerMemberships.businesses[1]!],
  invitations: [],
};

const invitedOnlyMemberships: Memberships = {
  businesses: [],
  invitations: [
    {
      id: "i1",
      businessId: "b3",
      businessName: "City Mart",
      role: "editor",
      createdAt: "2026-01-01T00:00:00Z",
    },
  ],
};

const nowhereMemberships: Memberships = { businesses: [], invitations: [] };

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
  activeBusinessState.status = "none";
});

describe("S-16 landing resolver", () => {
  it("sends an owner to their dashboard (stays at /)", async () => {
    activeBusinessState.status = "ready";
    membershipState.impl = async () => ownerMemberships;

    renderApp(
      <>
        <LocationProbe />
        <LandingResolver />
      </>,
      { session },
    );

    expect(await screen.findByTestId("dashboard")).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/");
  });

  it("sends a member elsewhere to /businesses", async () => {
    activeBusinessState.status = "none";
    membershipState.impl = async () => memberOnlyMemberships;

    renderApp(
      <>
        <LocationProbe />
        <LandingResolver />
      </>,
      { session },
    );

    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/businesses"),
    );
  });

  it("sends a user with only a pending invitation to /businesses", async () => {
    activeBusinessState.status = "none";
    membershipState.impl = async () => invitedOnlyMemberships;

    renderApp(
      <>
        <LocationProbe />
        <LandingResolver />
      </>,
      { session },
    );

    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/businesses"),
    );
  });

  it("sends a user who belongs nowhere to onboarding", async () => {
    activeBusinessState.status = "none";
    membershipState.impl = async () => nowhereMemberships;

    renderApp(
      <>
        <LocationProbe />
        <LandingResolver />
      </>,
      { session },
    );

    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/onboarding/business",
      ),
    );
  });

  it("shows only the skeleton while deciding — no intermediate page", async () => {
    activeBusinessState.status = "loading";
    membershipState.impl = async () => nowhereMemberships;

    renderApp(
      <>
        <LocationProbe />
        <LandingResolver />
      </>,
      { session },
    );

    expect(
      screen.getByRole("status", { name: "Loading your businesses" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("dashboard")).toBeNull();
    expect(screen.getByTestId("location").textContent).toBe("/");
  });
});

describe("S-16 minimal My businesses page", () => {
  it("lists memberships with name and role, Open only for the owned business", async () => {
    membershipState.impl = async () => ownerMemberships;

    renderApp(
      <>
        <LocationProbe />
        <BusinessesPage />
      </>,
      { session },
    );

    expect(await screen.findByText("Bahi Khata")).toBeTruthy();
    expect(screen.getByText("Rahim Traders")).toBeTruthy();
    expect(screen.getByText("Owner")).toBeTruthy();
    expect(screen.getByText("Viewer")).toBeTruthy();

    const openButtons = screen.getAllByRole("button", { name: "Open" });
    expect(openButtons).toHaveLength(1);
    await userEvent.click(openButtons[0]!);
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/"),
    );
  });

  it("shows an empty state with a create shortcut when there are no businesses", async () => {
    membershipState.impl = async () => nowhereMemberships;

    renderApp(
      <>
        <LocationProbe />
        <BusinessesPage />
      </>,
      { session },
    );

    expect(await screen.findByText("No businesses yet")).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: /Create business/ }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/onboarding/business",
      ),
    );
  });
});

describe("S-16 guards", () => {
  it("sends signed-out users to /login, remembering the URL", async () => {
    __setMockSession(null);

    function LoginStub() {
      const location = useLocation();
      return <span data-testid="login">{JSON.stringify(location.state)}</span>;
    }

    renderApp(
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/customers" element={<div data-testid="target" />} />
        </Route>
        <Route path="/login" element={<LoginStub />} />
      </Routes>,
      { route: "/customers?range=today" },
    );

    const login = await screen.findByTestId("login");
    expect(JSON.parse(login.textContent ?? "{}")).toEqual({
      from: { pathname: "/customers", search: "?range=today" },
    });
  });

  function renderLogin(state: unknown) {
    __setMockSession(session);
    // LoginPage must live inside <Routes> like the real app: after it
    // navigates away from /login it unmounts, so it cannot re-run its
    // own redirect with the (now state-less) new location.
    return render(
      <AuthProvider>
        <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
          <LocationProbe />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<div data-testid="landed" />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  }

  it("returns a deep link after login when the user may access it", async () => {
    activeBusinessState.status = "ready";
    renderLogin({ from: { pathname: "/customers", search: "?range=today" } });

    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/customers?range=today",
      ),
    );
  });

  it("falls back to the resolver when the user may not access the deep link", async () => {
    activeBusinessState.status = "none";
    renderLogin({ from: { pathname: "/customers" } });

    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/"),
    );
  });

  it("goes to the resolver when there is no deep link", async () => {
    activeBusinessState.status = "none";
    renderLogin(null);

    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/"),
    );
  });
});
