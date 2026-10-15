import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { BusinessesPage } from "@/features/business/pages/BusinessesPage";
import { Topbar } from "@/components/layout/Topbar";
import { routePatterns, paths } from "@/lib/paths";
import { AppError } from "@/lib/AppError";
import type { Memberships } from "@/features/business/api";
import type { MyInvitation } from "@/features/members/api";

const membersApi = vi.hoisted(() => ({
  getMembers: vi.fn(),
  getBusinessInvitations: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  getMyInvitations: vi.fn(),
  respondToInvitation: vi.fn(),
}));
const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
}));
const toastState = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/features/members/api", () => ({
  getMembers: membersApi.getMembers,
  getBusinessInvitations: membersApi.getBusinessInvitations,
  createInvitation: membersApi.createInvitation,
  revokeInvitation: membersApi.revokeInvitation,
  getMyInvitations: membersApi.getMyInvitations,
  respondToInvitation: membersApi.respondToInvitation,
}));

vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
  createBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
  getBusiness: vi.fn(),
  getBusinessImpact: vi.fn(),
  updateBusiness: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastState.success, error: toastState.error },
}));

vi.mock("@/lib/toast", () => ({
  toastSuccess: toastState.success,
  toastError: toastState.error,
}));

const session = {
  user: { id: "u-vic", email: "vic@example.com" },
} as unknown as Session;

const acme: MyInvitation = {
  id: "inv-1",
  businessId: "b1",
  businessName: "Acme",
  inviterName: "Olivia",
  role: "viewer",
  createdAt: "2026-01-01T12:00:00Z",
};

const beta: MyInvitation = {
  id: "inv-2",
  businessId: "b2",
  businessName: "Beta Store",
  inviterName: "Eli",
  role: "editor",
  createdAt: "2026-01-02T12:00:00Z",
};

function memberships(): Memberships {
  return { businesses: [], invitations: [] };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderBusinesses() {
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
    { session, route: routePatterns.businesses },
  );
}

function renderBadge() {
  return renderApp(
    <>
      <LocationProbe />
      <Routes>
        <Route
          path={routePatterns.business}
          element={
            <Topbar
              title="Top"
              onToggleSidebar={() => {}}
              onOpenMenu={() => {}}
              collapsed={false}
            />
          }
        />
        <Route path={routePatterns.businesses} element={<div>list</div>} />
      </Routes>
    </>,
    { session, route: "/b/b1" },
  );
}

/** The invitation card containing the given business name. */
async function cardFor(businessName: string): Promise<HTMLElement> {
  const name = await screen.findByText(businessName);
  return name.closest("div.rounded-lg") as HTMLElement;
}

async function respond(
  businessName: string,
  action: "Accept" | "Decline",
): Promise<void> {
  const card = await cardFor(businessName);
  await userEvent.click(within(card).getByRole("button", { name: action }));
}

beforeEach(() => {
  Object.values(membersApi).forEach((fn) => fn.mockReset());
  businessApi.getMemberships.mockReset();
  toastState.success.mockClear();
  toastState.error.mockClear();
  businessApi.getMemberships.mockResolvedValue(memberships());
  membersApi.getMyInvitations.mockResolvedValue([acme, beta]);
});

describe("S-24 I see my invitations", () => {
  it("lists each invitation with business name, inviter, role and Accept/Decline", async () => {
    renderBusinesses();

    expect(await screen.findByText("Acme")).toBeTruthy();
    expect(await screen.findByText("Beta Store")).toBeTruthy();
    expect(await screen.findByText("Invited by Olivia")).toBeTruthy();
    expect(await screen.findByText("Invited by Eli")).toBeTruthy();
    expect(await screen.findByText("Viewer")).toBeTruthy();
    expect(await screen.findByText("Editor")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Decline" })).toHaveLength(2);
  });

  it("the top bar shows an invitation count badge linking to the list", async () => {
    businessApi.getMemberships.mockResolvedValue({
      businesses: [],
      invitations: [
        {
          id: "inv-1",
          businessId: "b1",
          businessName: null,
          role: "viewer",
          createdAt: "2026-01-01T12:00:00Z",
        },
        {
          id: "inv-2",
          businessId: "b2",
          businessName: null,
          role: "editor",
          createdAt: "2026-01-02T12:00:00Z",
        },
      ],
    } satisfies Memberships);

    renderBadge();

    const badge = await screen.findByRole("button", {
      name: "Invitations (2 pending)",
    });
    expect(badge.textContent).toBe("2");

    await userEvent.click(badge);
    expect(screen.getByTestId("location").textContent).toBe(
      paths.businesses,
    );
  });

  it("hides the badge when no invitations are pending", async () => {
    renderBadge();
    await screen.findByRole("button", { name: "Search (Ctrl+K)" });
    expect(screen.queryByRole("button", { name: /Invitations/ })).toBeNull();
  });
});

describe("S-24 accept an invitation", () => {
  it("joins the business and offers an Open business action", async () => {
    membersApi.respondToInvitation.mockResolvedValue(undefined);
    renderBusinesses();

    await respond("Acme", "Accept");

    await waitFor(() =>
      expect(membersApi.respondToInvitation).toHaveBeenCalledWith("inv-1", true),
    );

    // Success toast carries the joined message and a navigation action.
    const lastCall =
      toastState.success.mock.calls[toastState.success.mock.calls.length - 1];
    expect(lastCall).toBeDefined();
    const message = String(lastCall?.[0]);
    const action = lastCall?.[1] as { label: string; onClick: () => void };
    expect(message).toBe("You joined Acme");
    expect(action.label).toBe("Open business");
    expect(toastState.error).not.toHaveBeenCalled();

    action.onClick();
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        paths.business("b1"),
      ),
    );
  });

  it("passes only the invitation id — email matching lives in the database", async () => {
    membersApi.respondToInvitation.mockResolvedValue(undefined);
    renderBusinesses();

    await respond("Acme", "Accept");

    await waitFor(() =>
      expect(membersApi.respondToInvitation).toHaveBeenCalledTimes(1),
    );
    const args = membersApi.respondToInvitation.mock.calls[0] ?? [];
    expect(args).toEqual(["inv-1", true]);
    // The client never sends an email: matching on the caller's JWT email
    // (case-insensitively) is the database's job — proven by SQL test 0002b.
    expect(args.some((a) => typeof a === "string" && a.includes("@"))).toBe(
      false,
    );
  });

  it("treats accepting while already a member as success without an error", async () => {
    // The RPC's insert is `on conflict do nothing`: a second accept resolves.
    membersApi.respondToInvitation.mockResolvedValue(undefined);
    renderBusinesses();

    await respond("Acme", "Accept");

    await waitFor(() =>
      expect(toastState.success).toHaveBeenCalledWith(
        "You joined Acme",
        expect.anything(),
      ),
    );
    expect(toastState.error).not.toHaveBeenCalled();
  });
});

describe("S-24 decline an invitation", () => {
  it("marks the invitation declined and removes it from the list", async () => {
    membersApi.respondToInvitation.mockResolvedValue(undefined);
    membersApi.getMyInvitations
      .mockResolvedValueOnce([acme, beta])
      .mockResolvedValueOnce([beta]);
    renderBusinesses();

    await respond("Acme", "Decline");

    await waitFor(() =>
      expect(membersApi.respondToInvitation).toHaveBeenCalledWith("inv-1", false),
    );
    expect(toastState.success).toHaveBeenCalledWith("Invitation declined");

    // The list refetches after the mutation, so the card disappears.
    await waitFor(() => expect(screen.queryByText("Acme")).toBeNull());
    expect(screen.getByText("Beta Store")).toBeTruthy();
  });
});

describe("S-24 stale invitation", () => {
  it("shows the database's message and the card disappears", async () => {
    membersApi.respondToInvitation.mockRejectedValue(
      new AppError("validation", "This invitation is no longer available."),
    );
    membersApi.getMyInvitations
      .mockResolvedValueOnce([acme, beta])
      .mockResolvedValueOnce([beta]);
    renderBusinesses();

    await respond("Acme", "Accept");

    await waitFor(() =>
      expect(toastState.error).toHaveBeenCalledWith(
        "This invitation is no longer available.",
      ),
    );

    // onSettled invalidation refetches; the gone invitation leaves the list.
    await waitFor(() => expect(screen.queryByText("Acme")).toBeNull());
    expect(screen.getByText("Beta Store")).toBeTruthy();
  });
});
