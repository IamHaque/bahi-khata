import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { SettingsPage } from "@/features/business/pages/SettingsPage";
import { AppError } from "@/lib/AppError";
import type {
  Business,
  BusinessRole,
  BusinessSummary,
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

// Mutable "server" state: getMemberships reads the list, deleteBusiness
// removes the owned business from it — so the post-delete refetch
// decides where the user lands.
const server = vi.hoisted(() => ({
  business: {
    id: "b1",
    owner_id: "u1",
    name: "Rahim Traders",
    business_type: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
  } as Business,
  role: "owner" as BusinessRole,
  // The user's memberships; deleting b1 removes it from this list.
  businesses: [] as BusinessSummary[],
}));
function freshBusiness(): Business {
  return {
    id: "b1",
    owner_id: "u1",
    name: "Rahim Traders",
    business_type: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    created_at: "2026-01-01T00:00:00Z",
  };
}

function summary(overrides: Partial<BusinessSummary> = {}): BusinessSummary {
  return {
    id: "b1",
    name: "Rahim Traders",
    businessType: null,
    ownerId: "u1",
    ownerName: "Asha Verma",
    ownerEmail: "asha@example.com",
    role: "owner",
    isOwner: true,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderSettings() {
  return renderApp(
    <>
      <LocationProbe />
      <Routes>
        <Route path="/b/:businessId/settings" element={<SettingsPage />} />
        <Route path="/businesses" element={<div>businesses</div>} />
        <Route path="/onboarding/business" element={<div>onboarding</div>} />
      </Routes>
    </>,
    { session, route: "/b/b1/settings" },
  );
}

async function openDialog() {
  const trigger = await screen.findByRole("button", {
    name: "Delete business",
  });
  await userEvent.click(trigger);
  return screen.findByRole("dialog");
}

beforeEach(() => {
  server.business = freshBusiness();
  server.businesses = [summary()];
  businessApi.createBusiness.mockReset();
  businessApi.getMemberships.mockReset();
  businessApi.getBusiness.mockReset();
  businessApi.getBusinessImpact.mockReset();
  businessApi.updateBusiness.mockReset();
  businessApi.deleteBusiness.mockReset();
  businessApi.getMemberships.mockImplementation(
    async (): Promise<Memberships> => ({
      businesses: [...server.businesses],
      invitations: [],
    }),
  );
  businessApi.getBusiness.mockImplementation(async () => server.business);
  businessApi.getBusinessImpact.mockResolvedValue({
    customerCount: 58,
    transactionCount: 340,
    memberCount: 3,
    invitationCount: 1,
  });
  businessApi.deleteBusiness.mockImplementation(async () => {
    // The cascade removes b1 from everything, including memberships.
    server.businesses = server.businesses.filter((b) => b.id !== "b1");
    return undefined;
  });
  toastState.success.mockClear();
  toastState.error.mockClear();
});

describe("S-19 delete business", () => {
  it("hides the Danger zone from non-owners", async () => {
    server.businesses = [summary({ role: "viewer", isOwner: false })];
    renderSettings();

    expect(await screen.findByText("Rahim Traders")).toBeTruthy();
    expect(screen.queryByText("Danger zone")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Delete business" }),
    ).toBeNull();
  });

  it("states the impact and that it cannot be undone", async () => {
    renderSettings();

    const dialog = await openDialog();

    expect(dialog.textContent).toContain("Rahim Traders");
    expect(dialog.textContent).toContain("58 customers");
    expect(dialog.textContent).toContain("340 transactions");
    expect(dialog.textContent).toContain("3 members");
    expect(dialog.textContent).toContain("1 pending invitation");
    expect(dialog.textContent).toContain("cannot be undone");
    // The confirmation field asks for the exact name
    expect(screen.getByLabelText(/Type Rahim Traders to confirm/)).toBeTruthy();
  });

  it("keeps Delete disabled until the exact name is typed", async () => {
    renderSettings();

    const dialog = await openDialog();
    const deleteButton = within(dialog).getByRole("button", {
      name: "Delete",
    });
    expect(deleteButton).toHaveProperty("disabled", true);

    // Close enough is not enough
    const confirmation = screen.getByLabelText(/Type Rahim Traders to confirm/);
    await userEvent.type(confirmation, "Rahim Trader");
    expect(deleteButton).toHaveProperty("disabled", true);

    await userEvent.type(confirmation, "s");
    expect(deleteButton).toHaveProperty("disabled", false);
  });

  it("deletes everything in one operation and confirms with a toast", async () => {
    renderSettings();

    const dialog = await openDialog();
    await userEvent.type(
      screen.getByLabelText(/Type Rahim Traders to confirm/),
      "Rahim Traders",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() =>
      expect(businessApi.deleteBusiness).toHaveBeenCalledWith("b1"),
    );
    expect(toastState.success).toHaveBeenCalledWith("Business deleted");
    // Still belongs to another business? Then My businesses is next.
  });

  it("sends the user to My businesses when they still belong elsewhere", async () => {
    server.businesses = [
      summary(),
      summary({ id: "b2", name: "Rahim and Sons", role: "viewer", isOwner: false }),
    ];
    renderSettings();

    const dialog = await openDialog();
    await userEvent.type(
      screen.getByLabelText(/Type Rahim Traders to confirm/),
      "Rahim Traders",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    // The delete removed b1; the other membership survives, so My
    // businesses is next.
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/businesses"),
    );
  });

  it("sends the user to onboarding when nothing is left", async () => {
    renderSettings();

    const dialog = await openDialog();
    await userEvent.type(
      screen.getByLabelText(/Type Rahim Traders to confirm/),
      "Rahim Traders",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    // Nothing remains — start again from onboarding
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe(
        "/onboarding/business",
      ),
    );
  });

  it("stays open and shows the error when deletion fails", async () => {
    businessApi.deleteBusiness.mockRejectedValue(
      new AppError(
        "forbidden",
        "You do not have permission to delete this business, or it no longer exists.",
      ),
    );
    renderSettings();

    const dialog = await openDialog();
    await userEvent.type(
      screen.getByLabelText(/Type Rahim Traders to confirm/),
      "Rahim Traders",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    // Nothing is removed; the dialog stays open and shows why.
    expect(
      await screen.findByText(/permission to delete/),
    ).toBeTruthy();
    expect(toastState.success).not.toHaveBeenCalled();
    expect(screen.getByTestId("location").textContent).toBe(
      "/b/b1/settings",
    );
  });
});
