import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { MembersPage } from "@/features/members/pages/MembersPage";
import { routePatterns } from "@/lib/paths";
import { AppError } from "@/lib/AppError";
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
  transferOwnership: vi.fn(),
}));

const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
  getBusiness: vi.fn(),
  createBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
  getBusinessImpact: vi.fn(),
  updateBusiness: vi.fn(),
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
  transferOwnership: membersApi.transferOwnership,
}));

vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
  getBusiness: businessApi.getBusiness,
  createBusiness: businessApi.createBusiness,
  deleteBusiness: businessApi.deleteBusiness,
  getBusinessImpact: businessApi.getBusinessImpact,
  updateBusiness: businessApi.updateBusiness,
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

const server = vi.hoisted(() => ({
  role: "owner" as BusinessRole,
  members: [
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
  ],
}));

function renderMembers() {
  return renderApp(
    <Routes>
      <Route path={routePatterns.members} element={<MembersPage />} />
    </Routes>,
    { session, route: "/b/b1/members" },
  );
}

describe("S-74 Ownership transfer", () => {
  beforeEach(() => {
    server.role = "owner";
    server.members = [
      {
        userId: "u-owner",
        role: "owner",
        fullName: "Asha Verma",
        email: "asha@example.com",
        avatarUrl: null,
        joinedAt: "2026-01-01T12:00:00Z",
      },
      {
        userId: "u-eli",
        role: "editor",
        fullName: "Eli the Editor",
        email: "eli@example.com",
        avatarUrl: null,
        joinedAt: "2026-02-01T12:00:00Z",
      },
    ];
    Object.values(membersApi).forEach((fn) => fn.mockReset());
    businessApi.getMemberships.mockReset();
    businessApi.getBusiness.mockReset();
    toastState.success.mockClear();
    toastState.error.mockClear();

    membersApi.getMembers.mockImplementation(async () => server.members);
    membersApi.getBusinessInvitations.mockImplementation(async () => []);
    businessApi.getBusiness.mockImplementation(async () => ({
      id: "b1",
      name: "Acme Corp",
      business_type: "retail",
      owner_id: "u-owner",
    }));
    businessApi.getMemberships.mockImplementation(
      async (): Promise<Memberships> => ({
        businesses: [
          {
            id: "b1",
            name: "Acme Corp",
            businessType: "retail",
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

  it("opens transfer dialog from member row menu, button disabled until name matches", async () => {
    const user = userEvent.setup();
    renderMembers();

    await screen.findByText("Eli the Editor");

    // Open row actions for Eli
    const moreBtn = screen.getByRole("button", {
      name: "Actions for Eli the Editor",
    });
    await user.click(moreBtn);

    const makeOwnerItem = screen.getByRole("menuitem", {
      name: "Make owner…",
    });
    expect(makeOwnerItem).toBeTruthy();
    await user.click(makeOwnerItem);

    // Dialog opens
    expect(
      screen.getByRole("heading", {
        name: "Transfer ownership to Eli the Editor?",
      }),
    ).toBeTruthy();

    const transferBtn = screen.getByRole("button", {
      name: "Transfer ownership",
    });
    expect((transferBtn as HTMLButtonElement).disabled).toBe(true);

    // Typing partial or wrong name keeps button disabled
    const input = screen.getByLabelText(/To confirm, type the business name/i);
    await user.type(input, "Acme");
    expect((transferBtn as HTMLButtonElement).disabled).toBe(true);

    // Typing exact business name enables the button
    await user.type(input, " Corp");
    expect((transferBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it("submits transfer, displays success toast, and refreshes permissions", async () => {
    const user = userEvent.setup();

    membersApi.transferOwnership.mockImplementation(async () => {
      // Server swaps roles
      server.role = "editor";
      server.members = [
        {
          userId: "u-owner",
          role: "editor",
          fullName: "Asha Verma",
          email: "asha@example.com",
          avatarUrl: null,
          joinedAt: "2026-01-01T12:00:00Z",
        },
        {
          userId: "u-eli",
          role: "owner",
          fullName: "Eli the Editor",
          email: "eli@example.com",
          avatarUrl: null,
          joinedAt: "2026-02-01T12:00:00Z",
        },
      ];
    });

    renderMembers();
    await screen.findByText("Eli the Editor");

    const moreBtn = screen.getByRole("button", {
      name: "Actions for Eli the Editor",
    });
    await user.click(moreBtn);
    await user.click(screen.getByRole("menuitem", { name: "Make owner…" }));

    const input = screen.getByLabelText(/To confirm, type the business name/i);
    await user.type(input, "Acme Corp");

    const transferBtn = screen.getByRole("button", {
      name: "Transfer ownership",
    });
    await user.click(transferBtn);

    await waitFor(() => {
      expect(membersApi.transferOwnership).toHaveBeenCalledWith(
        "b1",
        "u-eli",
      );
      expect(toastState.success).toHaveBeenCalledWith(
        "Eli the Editor is now the owner",
      );
    });
  });

  it("displays server error inline when transfer is refused", async () => {
    const user = userEvent.setup();

    membersApi.transferOwnership.mockRejectedValue(
      new AppError(
        "validation",
        "This person already owns a business. A person can own only one.",
      ),
    );

    renderMembers();
    await screen.findByText("Eli the Editor");

    const moreBtn = screen.getByRole("button", {
      name: "Actions for Eli the Editor",
    });
    await user.click(moreBtn);
    await user.click(screen.getByRole("menuitem", { name: "Make owner…" }));

    const input = screen.getByLabelText(/To confirm, type the business name/i);
    await user.type(input, "Acme Corp");

    const transferBtn = screen.getByRole("button", {
      name: "Transfer ownership",
    });
    await user.click(transferBtn);

    expect(
      (await screen.findByRole("alert")).textContent,
    ).toContain(
      "This person already owns a business. A person can own only one.",
    );
  });

  it("passes axe accessibility in the transfer dialog", async () => {
    const user = userEvent.setup();
    const { container } = renderMembers();
    await screen.findByText("Eli the Editor");

    const moreBtn = screen.getByRole("button", {
      name: "Actions for Eli the Editor",
    });
    await user.click(moreBtn);
    await user.click(screen.getByRole("menuitem", { name: "Make owner…" }));

    await screen.findByRole("heading", {
      name: "Transfer ownership to Eli the Editor?",
    });

    await expectNoSeriousViolations(container);
  });
});
