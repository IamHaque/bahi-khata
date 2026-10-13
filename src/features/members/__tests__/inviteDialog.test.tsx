import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { MembersPage } from "@/features/members/pages/MembersPage";
import { routePatterns } from "@/lib/paths";
import type { BusinessRole, Memberships } from "@/features/business/api";

const membersApi = vi.hoisted(() => ({
  getMembers: vi.fn(),
  getBusinessInvitations: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
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
  user: { id: "u-owner", email: "asha@example.com" },
} as unknown as Session;

const server = vi.hoisted(() => ({
  role: "owner" as BusinessRole,
  invitations: [] as {
    id: string;
    email: string;
    role: BusinessRole;
    createdAt: string;
  }[],
}));

const owner = {
  userId: "u-owner",
  role: "owner" as BusinessRole,
  fullName: "Asha Verma",
  email: "asha@example.com",
  avatarUrl: null,
  joinedAt: "2026-01-01T12:00:00Z",
};

function renderMembers() {
  return renderApp(
    <Routes>
      <Route path={routePatterns.members} element={<MembersPage />} />
    </Routes>,
    { session, route: "/b/b1/members" },
  );
}

async function openInviteDialog() {
  await userEvent.click(await screen.findByRole("button", { name: "Invite" }));
  return screen.findByRole("dialog");
}

/** The dialog's own submit button (the page header has one too). */
function dialogInviteButton(dialog: HTMLElement) {
  return dialog.querySelector('button[type="submit"]') as HTMLButtonElement;
}

beforeEach(() => {
  server.role = "owner";
  server.invitations = [];
  Object.values(membersApi).forEach((fn) => fn.mockReset());
  businessApi.getMemberships.mockReset();
  toastState.success.mockClear();
  toastState.error.mockClear();
  membersApi.getMembers.mockResolvedValue([owner]);
  membersApi.getBusinessInvitations.mockImplementation(
    async () => server.invitations,
  );
  businessApi.getMemberships.mockImplementation(async (): Promise<Memberships> => ({
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
  }));
});

describe("S-23 send an invitation", () => {
  it("creates a lowercased pending invitation with the chosen role", async () => {
    membersApi.createInvitation.mockResolvedValue({
      id: "i1",
      email: "vic@example.com",
      role: "viewer",
      createdAt: "2026-04-01T12:00:00Z",
    });

    renderMembers();
    const dialog = await openInviteDialog();

    // The dialog explains the no-email flow up front.
    expect(
      screen.getByText(
        /They will see the invitation after signing in with this Google account\. No email is sent\./,
      ),
    ).toBeTruthy();

    await userEvent.type(screen.getByLabelText("Google email"), "Vic@Example.com");
    await userEvent.click(dialogInviteButton(dialog));

    await waitFor(() =>
      expect(membersApi.createInvitation).toHaveBeenCalledWith("b1", {
        email: "vic@example.com",
        role: "viewer",
      }),
    );
  });

  it("offers a Copy app link button that copies the origin", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    renderMembers();
    await openInviteDialog();

    const copyButton = screen.getByRole("button", { name: "Copy app link" });
    expect(screen.getByText(window.location.origin)).toBeTruthy();

    await userEvent.click(copyButton);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.origin));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });
});

describe("S-23 role choice", () => {
  it("offers Editor and Viewer with one-line descriptions, defaulting to Viewer", async () => {
    renderMembers();
    await openInviteDialog();

    // The select shows the default (viewer) before any choice.
    const trigger = screen.getByRole("combobox", { name: /role/i });
    expect(trigger.textContent?.toLowerCase()).toContain("viewer");

    await userEvent.click(trigger);
    expect(
      await screen.findByText("Editor — can record customers and transactions"),
    ).toBeTruthy();
    expect(screen.getByText("Viewer — can only see the data")).toBeTruthy();
  });
});

describe("S-23 invalid invitations are blocked inline", () => {
  it("rejects a malformed email with the shared message", async () => {
    renderMembers();
    const dialog = await openInviteDialog();

    await userEvent.type(screen.getByLabelText("Google email"), "not-an-email");
    await userEvent.click(dialogInviteButton(dialog));

    expect(
      await screen.findByText("Enter a valid email address"),
    ).toBeTruthy();
    expect(membersApi.createInvitation).not.toHaveBeenCalled();
  });

  it("refuses your own email — you are already the owner", async () => {
    renderMembers();
    const dialog = await openInviteDialog();

    await userEvent.type(screen.getByLabelText("Google email"), "Asha@Example.com");
    await userEvent.click(dialogInviteButton(dialog));

    expect(await screen.findByText("You are already the owner")).toBeTruthy();
    expect(membersApi.createInvitation).not.toHaveBeenCalled();
  });

  it("refuses an existing member", async () => {
    membersApi.getMembers.mockResolvedValue([
      owner,
      {
        userId: "u-2",
        role: "viewer" as BusinessRole,
        fullName: "Vic",
        email: "vic@example.com",
        avatarUrl: null,
        joinedAt: "2026-02-01T12:00:00Z",
      },
    ]);

    renderMembers();
    const dialog = await openInviteDialog();

    await userEvent.type(screen.getByLabelText("Google email"), "vic@example.com");
    await userEvent.click(dialogInviteButton(dialog));

    expect(
      await screen.findByText("This person is already a member"),
    ).toBeTruthy();
    expect(membersApi.createInvitation).not.toHaveBeenCalled();
  });

  it("refuses an email that already has a pending invitation", async () => {
    server.invitations = [
      { id: "i1", email: "vic@example.com", role: "viewer", createdAt: "2026-04-01T12:00:00Z" },
    ];

    renderMembers();
    const dialog = await openInviteDialog();

    await userEvent.type(screen.getByLabelText("Google email"), "vic@example.com");
    await userEvent.click(dialogInviteButton(dialog));

    expect(
      await screen.findByText("An invitation is already pending"),
    ).toBeTruthy();
    expect(membersApi.createInvitation).not.toHaveBeenCalled();
  });

  it("surfaces the database unique-index backstop as the same inline error", async () => {
    // A race: someone else invited between the list load and the insert.
    membersApi.createInvitation.mockRejectedValue(
      Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
      }),
    );

    renderMembers();
    const dialog = await openInviteDialog();

    await userEvent.type(screen.getByLabelText("Google email"), "vic@example.com");
    await userEvent.click(dialogInviteButton(dialog));

    // toAppError maps 23505 to the shared validation message.
    expect(
      await screen.findByText("A record with these details already exists."),
    ).toBeTruthy();
  });
});

describe("S-23 revoke", () => {
  it("confirms, revokes, and the invitation leaves the pending list", async () => {
    server.invitations = [
      { id: "i1", email: "vic@example.com", role: "viewer", createdAt: "2026-04-01T12:00:00Z" },
    ];
    membersApi.revokeInvitation.mockImplementation(async () => {
      server.invitations = [];
      return undefined;
    });

    renderMembers();

    await userEvent.click(
      await screen.findByRole("button", { name: "Actions for vic@example.com" }),
    );
    await userEvent.click(await screen.findByRole("menuitem", { name: "Revoke" }));

    // Confirmation dialog before anything happens.
    expect(
      await screen.findByText("Revoke the invitation to vic@example.com?"),
    ).toBeTruthy();
    expect(membersApi.revokeInvitation).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(membersApi.revokeInvitation).toHaveBeenCalledWith("i1"),
    );
    // The row disappears once the list refetches (mocked to empty).
    await waitFor(() =>
      expect(screen.queryByText("vic@example.com")).toBeNull(),
    );
    expect(toastState.success).toHaveBeenCalled();
  });
});
