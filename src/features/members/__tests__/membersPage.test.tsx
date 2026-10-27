import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { MembersPage } from "@/features/members/pages/MembersPage";
import { routePatterns } from "@/lib/paths";
import type { BusinessRole, Memberships } from "@/features/business/api";

const membersApi = vi.hoisted(() => ({
  getMembers: vi.fn(),
  getBusinessInvitations: vi.fn(),
}));
const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
}));

vi.mock("@/features/members/api", () => ({
  getMembers: membersApi.getMembers,
  getBusinessInvitations: membersApi.getBusinessInvitations,
}));

// usePermissions reads the URL business's role from the memberships list.
vi.mock("@/features/business/api", () => ({
  getMemberships: businessApi.getMemberships,
  // The business hooks module imports the rest; none are called here.
  createBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
  getBusiness: vi.fn(),
  getBusinessImpact: vi.fn(),
  updateBusiness: vi.fn(),
}));

const session = {
  user: { id: "u-owner", email: "asha@example.com" },
} as unknown as Session;

/** Mutable "server" state, like settingsPage.test.tsx uses. */
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
  invitations: [] as {
    id: string;
    email: string;
    role: BusinessRole;
    createdAt: string;
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
      userId: "u-editor",
      role: "editor" as BusinessRole,
      fullName: "Eli the Editor",
      email: "eli@example.com",
      avatarUrl: null,
      joinedAt: "2026-02-01T12:00:00Z",
    },
    {
      userId: "u-viewer",
      role: "viewer" as BusinessRole,
      fullName: null,
      email: "vic@example.com",
      avatarUrl: null,
      joinedAt: "2026-03-01T12:00:00Z",
    },
  ];
}

function renderMembers() {
  return renderApp(
    <Routes>
      <Route path={routePatterns.members} element={<MembersPage />} />
    </Routes>,
    { session, route: "/b/b1/members" },
  );
}

beforeEach(() => {
  server.role = "owner";
  server.members = freshMembers();
  server.invitations = [];
  membersApi.getMembers.mockReset();
  membersApi.getBusinessInvitations.mockReset();
  businessApi.getMemberships.mockReset();
  membersApi.getMembers.mockImplementation(async () => server.members);
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

describe("S-22 member list", () => {
  it("shows avatar, name, email, role badge and joined date with the Owner first", async () => {
    renderMembers();

    // Rows are present in owner-first order.
    const names = await screen.findAllByText(/Asha Verma|Eli the Editor|vic@example.com/);
    expect(names.length).toBeGreaterThanOrEqual(3);

    // The Owner badge sits on Asha's row; Editor/Viewer on the others.
    expect(screen.getByText("Owner")).toBeTruthy();
    expect(screen.getByText("Editor")).toBeTruthy();
    expect(screen.getByText("Viewer")).toBeTruthy();

    // Joined dates come from the formatter (formatDate output).
    expect(screen.getByText("1 Jan 2026")).toBeTruthy();

    // Avatars fall back to aria-hidden initials spans.
    expect(screen.getByText("AV")).toBeTruthy();
    expect(screen.getByText("EE")).toBeTruthy();
  });

  it("puts the owner row first", async () => {
    // Return the members unsorted — the page must sort owner first.
    server.members = [...freshMembers()].reverse();

    renderMembers();

    await screen.findByText("Asha Verma");
    const rows = screen.getAllByRole("row");
    // row 0 is the header
    expect(rows[1]?.textContent).toContain("Asha Verma");
  });
});

describe("S-22 only the owner sees management controls", () => {
  it("an editor sees no Invite button and no invitations section", async () => {
    server.role = "editor";
    server.invitations = [
      { id: "i1", email: "new@example.com", role: "viewer", createdAt: "2026-04-01T12:00:00Z" },
    ];

    renderMembers();

    await screen.findByText("Asha Verma");
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
    expect(screen.queryByText("Pending invitations")).toBeNull();
  });

  it("a viewer sees the same read-only list", async () => {
    server.role = "viewer";

    renderMembers();

    await screen.findByText("Asha Verma");
    expect(screen.queryByRole("button", { name: "Invite" })).toBeNull();
  });
});

describe("S-22 only-owner state", () => {
  it("an owner with nobody else sees the invite EmptyState with an Invite button", async () => {
    server.members = [freshMembers()[0]!];

    renderMembers();

    expect(
      await screen.findByText("Invite someone to share this business"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Invite" })).toBeTruthy();
  });
});

describe("S-22 pending invitations", () => {
  it("the owner sees email, role and date for each pending invitation", async () => {
    server.invitations = [
      { id: "i1", email: "new@example.com", role: "viewer", createdAt: "2026-04-01T12:00:00Z" },
      { id: "i2", email: "friend@example.com", role: "editor", createdAt: "2026-04-02T12:00:00Z" },
    ];

    renderMembers();

    expect(await screen.findByText("Pending invitations")).toBeTruthy();
    expect(screen.getByText("new@example.com")).toBeTruthy();
    expect(screen.getByText("friend@example.com")).toBeTruthy();
    // Each invitation row carries its role badge too.
    expect(screen.getAllByText("Viewer").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Editor").length).toBeGreaterThanOrEqual(1);
  });

  it("an owner with no pending invitations sees no section", async () => {
    renderMembers();

    await screen.findByText("Asha Verma");
    expect(screen.queryByText("Pending invitations")).toBeNull();
  });
});

describe("S-22 standard states", () => {
  it("shows a skeleton while loading", async () => {
    membersApi.getMembers.mockImplementation(() => new Promise(() => {}));

    renderMembers();

    // DataTable renders skeleton rows; the heading is there immediately.
    expect(screen.getByRole("heading", { name: "Members" })).toBeTruthy();
    // L-05: the PageHeader title is the page's only level-1 heading.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByText("Asha Verma")).toBeNull();
  });

  it("shows the shared error state with retry", async () => {
    membersApi.getMembers.mockRejectedValue(new Error("network down"));

    renderMembers();

    expect(await screen.findByText("Could not load members. Try again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});
