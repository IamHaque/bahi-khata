import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState, type ReactElement } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { MembersPage } from "@/features/members/pages/MembersPage";
import { useChangeMemberRole, useLeaveBusiness } from "../hooks";
import { routePatterns } from "@/lib/paths";
import { toAppError } from "@/lib/AppError";
import type { BusinessRole, Memberships } from "@/features/business/api";

const membersApi = vi.hoisted(() => ({
  getMembers: vi.fn(),
  getBusinessInvitations: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  getMyInvitations: vi.fn(),
  respondToInvitation: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
  leaveBusiness: vi.fn(),
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
  changeMemberRole: membersApi.changeMemberRole,
  removeMember: membersApi.removeMember,
  leaveBusiness: membersApi.leaveBusiness,
}));

// usePermissions reads the URL business's role from the memberships list.
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
  user: { id: "u-owner", email: "asha@example.com" },
} as unknown as Session;

/** Mutable "server" state, like membersPage.test.tsx uses. */
const server = vi.hoisted(() => ({
  role: "owner" as BusinessRole,
  members: [] as {
    userId: string;
    role: BusinessRole;
    fullName: string | null;
    email: string;
    avatarUrl: string | null;
    joinedAt: string;
  }[],
}));

function freshMembers() {
  return [
    {
      userId: "u-owner",
      role: "owner" as BusinessRole,
      fullName: "Asha Verma",
      email: "asha@example.com",
      avatarUrl: null,
      joinedAt: "2026-01-01T12:00:00Z",
    },
    {
      userId: "u-eli",
      role: "editor" as BusinessRole,
      fullName: "Eli the Editor",
      email: "eli@example.com",
      avatarUrl: null,
      joinedAt: "2026-02-01T12:00:00Z",
    },
    {
      userId: "u-vic",
      role: "viewer" as BusinessRole,
      fullName: "Vic",
      email: "vic@example.com",
      avatarUrl: null,
      joinedAt: "2026-03-01T12:00:00Z",
    },
  ];
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderMembers() {
  return renderApp(
    <>
      <LocationProbe />
      <Routes>
        <Route path={routePatterns.members} element={<MembersPage />} />
        <Route path={routePatterns.businesses} element={<div>list</div>} />
      </Routes>
    </>,
    { session, route: "/b/b1/members" },
  );
}

/** The row-actions trigger on the named member's row. */
async function openRowMenu(name: string): Promise<HTMLElement> {
  const trigger = await screen.findByRole("button", {
    name: `Actions for ${name}`,
  });
  await userEvent.click(trigger);
  return trigger.closest("tr") as HTMLElement;
}

beforeEach(() => {
  server.role = "owner";
  server.members = freshMembers();
  Object.values(membersApi).forEach((fn) => fn.mockReset());
  businessApi.getMemberships.mockReset();
  toastState.success.mockClear();
  toastState.error.mockClear();
  membersApi.getMembers.mockImplementation(async () => server.members);
  membersApi.getBusinessInvitations.mockImplementation(async () => []);
  // The "server" applies the write before the invalidation-driven refetch.
  membersApi.changeMemberRole.mockImplementation(
    async (_businessId: string, userId: string, newRole: BusinessRole) => {
      server.members = server.members.map((m) =>
        m.userId === userId ? { ...m, role: newRole } : m,
      );
    },
  );
  membersApi.removeMember.mockImplementation(
    async (_businessId: string, userId: string) => {
      server.members = server.members.filter((m) => m.userId !== userId);
    },
  );
  membersApi.leaveBusiness.mockResolvedValue(undefined);
  businessApi.getMemberships.mockImplementation(
    async (): Promise<Memberships> => ({
      businesses: [
        {
          id: "b1",
          name: "Bahi Khata",
          businessType: null,
          ownerId: "u-owner",
          ownerName: "Asha Verma",
          ownerEmail: "asha@example.com",
          role: server.role,
          isOwner: server.role === "owner",
        },
      ],
      invitations: [],
    }),
  );
});

describe("S-25 owner changes a role", () => {
  it("changes Eli from Editor to Viewer from the row menu and confirms with a toast", async () => {
    renderMembers();

    await openRowMenu("Eli the Editor");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Change to Viewer" }),
    );

    await waitFor(() =>
      expect(membersApi.changeMemberRole).toHaveBeenCalledWith(
        "b1",
        "u-eli",
        "viewer",
      ),
    );
    expect(toastState.success).toHaveBeenCalledWith(
      "Eli the Editor is now a Viewer",
    );

    // The table reflects it: the refetch after invalidation reports the
    // new role, and no Editor badge remains (Eli was the only editor).
    await waitFor(() => expect(screen.queryByText("Editor")).toBeNull());
    expect(screen.getAllByText("Viewer").length).toBeGreaterThanOrEqual(2);
  });

  it("offers the opposite role on a Viewer row", async () => {
    renderMembers();

    await openRowMenu("Vic");

    expect(
      await screen.findByRole("menuitem", { name: "Change to Editor" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("menuitem", { name: "Change to Viewer" }),
    ).toBeNull();
  });

  it("the owner row has no role change or remove actions", async () => {
    renderMembers();

    // Rows are present…
    await screen.findByText("Eli the Editor");
    // …but the owner's row carries no actions trigger.
    expect(
      screen.queryByRole("button", { name: "Actions for Asha Verma" }),
    ).toBeNull();
  });
});

describe("S-25 owner removes a member", () => {
  it("removes Vic after confirming 'Remove Vic' and says so in a toast", async () => {
    renderMembers();

    await openRowMenu("Vic");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );

    // The confirmation names the person (scenario: confirm 'Remove Vic').
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Remove Vic?")).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Remove Vic" }),
    );

    await waitFor(() =>
      expect(membersApi.removeMember).toHaveBeenCalledWith("b1", "u-vic"),
    );
    expect(toastState.success).toHaveBeenCalledWith("Vic was removed");

    // Vic disappears from the list on the refetch after invalidation.
    await waitFor(() => expect(screen.queryByText("Vic")).toBeNull());
  });

  it("cancelling the confirmation removes nothing", async () => {
    renderMembers();

    await openRowMenu("Vic");
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );

    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );

    expect(membersApi.removeMember).not.toHaveBeenCalled();
  });
});

describe("S-25 member leaves", () => {
  it("an editor sees Leave business, confirms, and lands on /businesses", async () => {
    server.role = "editor";

    renderMembers();

    await userEvent.click(
      await screen.findByRole("button", { name: "Leave business" }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Leave business" }),
    );

    await waitFor(() =>
      expect(membersApi.leaveBusiness).toHaveBeenCalledWith("b1"),
    );
    expect(toastState.success).toHaveBeenCalledWith("You left this business");
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        routePatterns.businesses,
      ),
    );
  });

  it("a viewer gets the same leave button", async () => {
    server.role = "viewer";

    renderMembers();

    expect(
      await screen.findByRole("button", { name: "Leave business" }),
    ).toBeTruthy();
  });
});

describe("S-25 owners cannot leave", () => {
  it("the owner sees the note instead of a Leave button", async () => {
    renderMembers();

    expect(
      await screen.findByText(
        "Owners cannot leave. Delete the business instead.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Leave business" }),
    ).toBeNull();
  });
});

describe("S-25 non-owners get no management controls", () => {
  it("an editor sees no row actions at all", async () => {
    server.role = "editor";

    renderMembers();

    await screen.findByText("Eli the Editor");
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });
});

/** Mutation probes: the guard should reject before any network call. */
function ChangeRoleProbe() {
  const changeRole = useChangeMemberRole("b1");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void changeRole
            .mutateAsync({ userId: "u-eli", newRole: "viewer" })
            .catch((err) => setErrorCode(toAppError(err).code));
        }}
      >
        Change role
      </button>
      {errorCode && <p role="alert">{errorCode}</p>}
    </div>
  );
}

function LeaveProbe() {
  const leave = useLeaveBusiness("b1");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void leave.mutateAsync().catch((err) => {
            setErrorCode(toAppError(err).code);
          });
        }}
      >
        Leave
      </button>
      {errorCode && <p role="alert">{errorCode}</p>}
    </div>
  );
}

function renderProbe(ui: ReactElement) {
  return renderApp(
    <Routes>
      <Route path={routePatterns.business} element={ui} />
    </Routes>,
    { session, route: "/b/b1" },
  );
}

describe("S-25 guards block before the network", () => {
  it("a known editor cannot change roles — forbidden, api never called", async () => {
    server.role = "editor";

    renderProbe(<ChangeRoleProbe />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Change role" }),
    );

    expect(await screen.findByRole("alert").then((n) => n.textContent)).toBe(
      "forbidden",
    );
    expect(membersApi.changeMemberRole).not.toHaveBeenCalled();
  });

  it("a known owner cannot leave — forbidden, api never called", async () => {
    renderProbe(<LeaveProbe />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Leave" }),
    );

    expect(await screen.findByRole("alert").then((n) => n.textContent)).toBe(
      "forbidden",
    );
    expect(membersApi.leaveBusiness).not.toHaveBeenCalled();
  });
});
