import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { paths, routePatterns } from "@/lib/paths";
import { SettingsPage } from "@/features/business/pages/SettingsPage";
import { downloadBusinessBackup } from "@/features/import-export/exports";
import type { Memberships } from "@/features/business/api";

// S-39 — the backup paths: Settings offers Download backup for every
// member (Viewers included), and the S-19 delete dialog links to it
// right where the delete happens (C-6).

const exportsApi = vi.hoisted(() => ({ downloadBusinessBackup: vi.fn() }));
const businessApi = vi.hoisted(() => ({
  getMemberships: vi.fn(),
  getBusiness: vi.fn(),
  updateBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
  getBusinessImpact: vi.fn(),
}));

vi.mock("@/features/import-export/exports", () => exportsApi);
vi.mock("@/features/business/api", () => businessApi);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

function membershipsFor(role: "owner" | "editor" | "viewer"): Memberships {
  return {
    businesses: [
      {
        id: "b1",
        name: "Rahim Traders",
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

function renderSettings(role: "owner" | "editor" | "viewer") {
  businessApi.getMemberships.mockImplementation(async () =>
    membershipsFor(role),
  );
  return renderApp(
    <Routes>
      <Route path={routePatterns.settings} element={<SettingsPage />} />
    </Routes>,
    { session, route: paths.settings("b1") },
  );
}

beforeEach(() => {
  businessApi.getBusiness.mockImplementation(async () => ({
    id: "b1",
    name: "Rahim Traders",
    business_type: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
  }));
  businessApi.getBusinessImpact.mockImplementation(async () => ({
    customerCount: 2,
    transactionCount: 5,
    memberCount: 1,
    invitationCount: 0,
  }));
  businessApi.updateBusiness.mockImplementation(async () => ({}));
  businessApi.deleteBusiness.mockImplementation(async () => ({}));
  exportsApi.downloadBusinessBackup.mockImplementation(async () => {});
});

describe("Settings backup (S-39)", () => {
  it("a Viewer sees the Backup section and can download it", async () => {
    renderSettings("viewer");

    expect(await screen.findByText("Backup")).toBeTruthy();
    // The viewer gets read-only details and NO save form.
    expect(screen.queryByText("Save changes")).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "Download backup" }),
    );
    expect(downloadBusinessBackup).toHaveBeenCalledWith(
      "b1",
      expect.any(Function),
    );
  });

  it("the delete dialog offers the backup before deleting (C-6)", async () => {
    renderSettings("owner");

    await userEvent.click(
      await screen.findByRole("button", { name: "Delete business" }),
    );
    const dialog = await screen.findByRole("dialog");

    expect(
      within(dialog).getByText("Keep a copy of this data first."),
    ).toBeTruthy();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Download backup" }),
    );
    expect(downloadBusinessBackup).toHaveBeenCalledWith(
      "b1",
      expect.any(Function),
    );
    // The dialog stays open — a backup is not a delete.
    expect(businessApi.deleteBusiness).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("the delete dialog is still owner-only", async () => {
    renderSettings("viewer");

    await screen.findByText("Backup");
    expect(
      screen.queryByRole("button", { name: "Delete business" }),
    ).toBeNull();
  });
});
