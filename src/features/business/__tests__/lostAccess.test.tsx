import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useReducer } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { BusinessGuard } from "@/features/business/components/BusinessGuard";
import { SettingsPage } from "@/features/business/pages/SettingsPage";
import { useMemberships } from "@/features/business/hooks";
import { AppError } from "@/lib/AppError";
import { paths, routePatterns } from "@/lib/paths";
import type { Business, BusinessSummary } from "@/features/business/api";

const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
  getBusiness: vi.fn(),
  getBusinessImpact: vi.fn(),
  updateBusiness: vi.fn(),
  createBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
  businessExists: vi.fn(),
}));
const toastState = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
  getBusiness: businessApi.getBusiness,
  getBusinessImpact: businessApi.getBusinessImpact,
  updateBusiness: businessApi.updateBusiness,
  createBusiness: businessApi.createBusiness,
  deleteBusiness: businessApi.deleteBusiness,
  businessExists: businessApi.businessExists,
}));

vi.mock("sonner", () => ({
  toast: { success: toastState.success, error: toastState.error },
}));

const session = {
  user: { id: "u1", email: "asha@example.com" },
} as unknown as Session;

const b1: BusinessSummary = {
  id: "b1",
  name: "Bahi Khata",
  businessType: null,
  ownerId: "u1",
  ownerName: "Asha Verma",
  ownerEmail: "asha@example.com",
  role: "owner",
  isOwner: true,
};

// Mutable "server" state: getMemberships and businessExists read it, so
// removing me or deleting the business shows up on the next refetch
// exactly like a real backend would.
const server = vi.hoisted(() => ({
  businesses: [] as BusinessSummary[],
  existing: new Set<string>(),
}));

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

/** Seeds one cached business query and mirrors whether it is still cached. */
function CacheProbe() {
  const queryClient = useQueryClient();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    queryClient.setQueryData(["business", "b1"], { name: "Bahi Khata" });
    return queryClient.getQueryCache().subscribe(rerender);
  }, [queryClient, rerender]);
  const cached = queryClient.getQueryData(["business", "b1"]);
  return <p data-testid="cache">{cached ? "cached" : "purged"}</p>;
}

function MembershipsProbe() {
  const { isPending, isError } = useMemberships();
  if (isPending) return <p>loading memberships</p>;
  return <p>{isError ? "memberships refused" : "memberships ready"}</p>;
}

function renderGuard(options: { route?: string } = {}) {
  return renderApp(
    <>
      <LocationProbe />
      <CacheProbe />
      <Routes>
        <Route path={routePatterns.business} element={<BusinessGuard />}>
          <Route index element={<div>dashboard</div>} />
        </Route>
        <Route
          path={routePatterns.businesses}
          element={<div>businesses page</div>}
        />
        <Route path={routePatterns.root} element={<div>landing resolver</div>} />
      </Routes>
    </>,
    { session, route: options.route ?? paths.business("b1") },
  );
}

// This react-query version re-evaluates focus on `visibilitychange`
// (the tab became visible again) — the browser's real "user came back"
// signal.
function windowRefocus() {
  window.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  server.businesses = [b1];
  server.existing = new Set(["b1"]);
  businessApi.getMemberships.mockImplementation(async () => ({
    businesses: server.businesses,
    invitations: [],
  }));
  businessApi.businessExists.mockImplementation(async (id: string) =>
    server.existing.has(id),
  );
  businessApi.getBusiness.mockImplementation(async (id: string) =>
    freshBusiness({ id }),
  );
  businessApi.getBusinessImpact.mockImplementation(async () => ({}));
  businessApi.updateBusiness.mockImplementation(async () => {
    throw new AppError("forbidden", "You do not have permission to do this.");
  });
  toastState.error.mockReset();
  toastState.success.mockReset();
});

describe("S-27 lost access", () => {
  it("sends me to My businesses when my membership disappears while viewing", async () => {
    renderGuard();

    expect(await screen.findByText("dashboard")).toBeTruthy();
    expect(screen.getByTestId("cache").textContent).toBe("cached");

    // The owner removes me; the next memberships refresh discovers it.
    server.businesses = [];
    windowRefocus();

    await waitFor(() =>
      expect(toastState.error).toHaveBeenCalledWith(
        "You no longer have access to Bahi Khata",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(paths.businesses),
    );
    // Cached data for the business is purged (S-27).
    expect(screen.getByTestId("cache").textContent).toBe("purged");
    // The probe asked about the business in the URL.
    expect(businessApi.businessExists).toHaveBeenCalledWith("b1");
  });

  it("sends me to the landing resolver when the business was deleted", async () => {
    renderGuard();
    expect(await screen.findByText("dashboard")).toBeTruthy();

    // Deleted while I view it: no membership AND no row left.
    server.businesses = [];
    server.existing.delete("b1");
    windowRefocus();

    await waitFor(() =>
      expect(toastState.error).toHaveBeenCalledWith(
        "This business no longer exists",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(paths.root),
    );
    expect(screen.getByTestId("cache").textContent).toBe("purged");
  });

  it("keeps the static denied page for a business that was never mine", async () => {
    server.businesses = [];

    renderGuard({ route: paths.business("b99") });

    expect(
      await screen.findByText("Business not found or you do not have access"),
    ).toBeTruthy();
    // No toast, no probe, no navigation: this is S-17's deep-link page.
    expect(toastState.error).not.toHaveBeenCalled();
    expect(businessApi.businessExists).not.toHaveBeenCalled();
    expect(screen.getByTestId("location").textContent).toBe(
      paths.business("b99"),
    );
  });

  it("falls back to the access-lost message when the probe itself fails", async () => {
    renderGuard();
    expect(await screen.findByText("dashboard")).toBeTruthy();

    server.businesses = [];
    businessApi.businessExists.mockRejectedValue(
      new AppError("network", "Network error."),
    );
    windowRefocus();

    await waitFor(() =>
      expect(toastState.error).toHaveBeenCalledWith(
        "You no longer have access to Bahi Khata",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(paths.businesses),
    );
  });

  it("refetches memberships after any forbidden error", async () => {
    function ForbiddenProbe() {
      const { isError } = useQuery({
        queryKey: ["business", "b1", "summary"],
        queryFn: async () => {
          throw new AppError(
            "forbidden",
            "You do not have permission to do this.",
          );
        },
      });
      return <p>{isError ? "refused" : "asking"}</p>;
    }

    renderApp(
      <>
        <MembershipsProbe />
        <ForbiddenProbe />
      </>,
      { session },
    );

    expect(await screen.findByText("refused")).toBeTruthy();
    // The initial load, plus the refetch the forbidden error triggered.
    await waitFor(() =>
      expect(businessApi.getMemberships).toHaveBeenCalledTimes(2),
    );
  });

  it("does not refetch memberships in reaction to their own forbidden error", async () => {
    businessApi.getMemberships.mockRejectedValue(
      new AppError("forbidden", "You do not have permission to do this."),
    );

    renderApp(<MembershipsProbe />, { session });

    expect(await screen.findByText("memberships refused")).toBeTruthy();
    // Give a (wrong) invalidation time to fire, then prove it did not:
    // only the initial mount ever called the API.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(businessApi.getMemberships).toHaveBeenCalledTimes(1);
  });

  it("refetches memberships when the window regains focus", async () => {
    renderApp(<MembershipsProbe />, { session });

    expect(await screen.findByText("memberships ready")).toBeTruthy();
    expect(businessApi.getMemberships).toHaveBeenCalledTimes(1);

    windowRefocus();

    await waitFor(() =>
      expect(businessApi.getMemberships).toHaveBeenCalledTimes(2),
    );
  });

  it("fails a downgraded role's save with a forbidden toast and turns the UI read-only", async () => {
    renderApp(
      <>
        <LocationProbe />
        <Routes>
          <Route path={routePatterns.settings} element={<SettingsPage />} />
          <Route
            path={routePatterns.businesses}
            element={<div>businesses page</div>}
          />
        </Routes>
      </>,
      { session, route: paths.settings("b1") },
    );

    // The owner form shows while my cached role still says owner.
    const save = await screen.findByRole("button", { name: "Save changes" });

    // The owner demotes me to viewer; my next save is refused by the
    // backend (zero rows under RLS -> forbidden).
    server.businesses = [{ ...b1, role: "viewer", isOwner: false }];
    await userEvent.click(save);

    await waitFor(() =>
      expect(toastState.error).toHaveBeenCalledWith(
        "Could not update business",
        { description: "You do not have permission to do this." },
      ),
    );
    // The forbidden error refetched memberships: the role is fresh and
    // the page is read-only.
    expect(
      await screen.findByText("Only the owner can change these details."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
});
