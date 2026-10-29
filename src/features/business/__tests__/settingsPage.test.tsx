import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { SettingsPage } from "@/features/business/pages/SettingsPage";
import { BusinessSwitcher } from "@/components/layout/BusinessSwitcher";
import { AppError } from "@/lib/AppError";
import type {
  Business,
  BusinessSummary,
  BusinessRole,
  Memberships,
} from "@/features/business/api";

const businessApi = vi.hoisted(() => ({
  createBusiness: vi.fn(),
  getMemberships: vi.fn(),
  getBusiness: vi.fn(),
  getBusinessImpact: vi.fn(),
  updateBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
}));
const toastState = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/features/business/api", () => ({
  createBusiness: businessApi.createBusiness,
  getMemberships: businessApi.getMemberships,
  getBusiness: businessApi.getBusiness,
  getBusinessImpact: businessApi.getBusinessImpact,
  updateBusiness: businessApi.updateBusiness,
  deleteBusiness: businessApi.deleteBusiness,
}));

vi.mock("@/lib/toast", () => ({
  toastSuccess: toastState.success,
  toastError: toastState.error,
}));

vi.mock("sonner", () => ({
  toast: { success: toastState.success, error: toastState.error },
}));

const session = {
  user: { id: "u1", email: "asha@example.com" },
} as unknown as Session;

// Mutable "server" state: getMemberships/getBusiness read it and
// updateBusiness writes to it — so an invalidated refetch shows the
// rename the way a real backend would.
const server = vi.hoisted(() => ({
  business: {
    id: "b1",
    owner_id: "u1",
    name: "Bahi Khata",
    business_type: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
  } as Business,
  role: "owner" as BusinessRole,
}));

function freshBusiness(): Business {
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
  };
}

function renderSettings(options: { withSwitcher?: boolean } = {}) {
  const settings = <SettingsPage />;
  return renderApp(
    <Routes>
      <Route
        path="/b/:businessId/settings"
        element={
          options.withSwitcher ? (
            <>
              <BusinessSwitcher />
              {settings}
            </>
          ) : (
            settings
          )
        }
      />
    </Routes>,
    { session, route: "/b/b1/settings" },
  );
}

beforeEach(() => {
  server.business = freshBusiness();
  server.role = "owner";
  businessApi.createBusiness.mockReset();
  businessApi.getMemberships.mockReset();
  businessApi.getBusiness.mockReset();
  businessApi.getBusinessImpact.mockReset();
  businessApi.updateBusiness.mockReset();
  businessApi.deleteBusiness.mockReset();
  businessApi.getMemberships.mockImplementation(async (): Promise<Memberships> => {
    const summary: BusinessSummary = {
      id: server.business.id,
      name: server.business.name,
      businessType: server.business.business_type,
      ownerId: server.business.owner_id,
      ownerName: "Asha Verma",
      ownerEmail: "asha@example.com",
      role: server.role,
      isOwner: server.role === "owner",
    };
    return { businesses: [summary], invitations: [] };
  });
  businessApi.getBusiness.mockImplementation(async () => server.business);
  businessApi.updateBusiness.mockImplementation(
    async (
      _businessId: string,
      input: {
        name: string;
        businessType?: string;
        phone?: string;
        email?: string;
        address?: string;
        notes?: string;
      },
    ) => {
      server.business = {
        ...server.business,
        name: input.name,
        business_type: input.businessType ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
      };
      return server.business;
    },
  );
  toastState.success.mockClear();
  toastState.error.mockClear();
});

describe("S-18 business settings page", () => {
  it("lets the owner rename the business and confirms with a toast", async () => {
    renderSettings();

    // Wait for the details to load before editing (the form re-syncs
    // from the server state).
    const nameField = await screen.findByDisplayValue("Bahi Khata");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Rahim and Sons");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(businessApi.updateBusiness).toHaveBeenCalledWith("b1", {
        name: "Rahim and Sons",
        businessType: undefined,
        phone: undefined,
        email: undefined,
        address: undefined,
        notes: undefined,
      }),
    );
    expect(toastState.success).toHaveBeenCalledWith("Business updated");
  });

  it("shows the same inline name error as creation and saves nothing", async () => {
    renderSettings();

    const nameField = await screen.findByDisplayValue("Bahi Khata");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "x");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("Name must be at least 2 characters"),
    ).toBeTruthy();
    expect(businessApi.updateBusiness).not.toHaveBeenCalled();
  });

  it("shows read-only details with no Save button for non-owners", async () => {
    server.role = "viewer";

    renderSettings();

    expect(await screen.findByText("Bahi Khata")).toBeTruthy();
    expect(screen.getByText("Phone")).toBeTruthy();
    expect(
      screen.getByText("Only the owner can change these details."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    // No editable fields either
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("keeps everything and shows a clear toast when the database refuses", async () => {
    businessApi.updateBusiness.mockRejectedValue(
      new AppError(
        "forbidden",
        "You do not have permission to change this business, or it no longer exists.",
      ),
    );

    renderSettings();

    const nameField = await screen.findByDisplayValue("Bahi Khata");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Hacked Name");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(toastState.error).toHaveBeenCalled());
    const [title, options] = toastState.error.mock.calls[0]!;
    expect(title).toBe("Could not update business");
    expect((options as { description: string }).description).toContain(
      "permission",
    );
    // The form keeps what was typed and the "server" never changed.
    expect(screen.getByLabelText("Name")).toHaveProperty(
      "value",
      "Hacked Name",
    );
    expect(server.business.name).toBe("Bahi Khata");
  });

  it("updates the sidebar business name immediately after a rename", async () => {
    renderSettings({ withSwitcher: true });

    expect(await screen.findByText("Bahi Khata")).toBeTruthy();

    const nameField = screen.getByLabelText("Name");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Rahim and Sons");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    // The rename lands in the shared memberships cache and the sidebar
    // re-renders without a page reload.
    expect(await screen.findByText("Rahim and Sons")).toBeTruthy();
  });

  it("reads as sections: title on the left column, form on the right (L-11)", async () => {
    renderSettings();

    // Business details: the two-column grid, the title in the left
    // column and the form inside the same section.
    const detailsHeading = await screen.findByText("Business details");
    const detailsSection = detailsHeading.closest("section");
    expect(detailsSection).toBeTruthy();
    expect(detailsSection?.className).toContain(
      "lg:grid-cols-[16rem_1fr]",
    );
    expect(detailsSection?.className).toContain("border-t");
    expect(detailsSection?.className).toContain("py-6");
    expect(
      within(detailsSection as HTMLElement).getByRole("button", {
        name: "Save changes",
      }),
    ).toBeTruthy();

    // Backup mirrors the same layout, with its own description left
    // and its button right.
    const backupHeading = await screen.findByText("Backup");
    const backupSection = backupHeading.closest("section");
    expect(backupSection).toBeTruthy();
    expect(backupSection?.className).toContain("lg:grid-cols-[16rem_1fr]");
    expect(
      within(backupSection as HTMLElement).getByRole("button", {
        name: "Download backup",
      }),
    ).toBeTruthy();
  });
});
