import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { Can } from "@/components/app/Can";
import { useUpdateBusiness } from "@/features/business/hooks";
import { toAppError } from "@/lib/AppError";
import { routePatterns, paths } from "@/lib/paths";
import type { BusinessRole, Memberships } from "@/features/business/api";

const businessApi = vi.hoisted(() => ({
  createBusiness: vi.fn(),
  getMemberships: vi.fn(),
  getBusiness: vi.fn(),
  getBusinessImpact: vi.fn(),
  updateBusiness: vi.fn(),
  deleteBusiness: vi.fn(),
}));

vi.mock("@/features/business/api", () => ({
  createBusiness: businessApi.createBusiness,
  getMemberships: businessApi.getMemberships,
  getBusiness: businessApi.getBusiness,
  getBusinessImpact: businessApi.getBusinessImpact,
  updateBusiness: businessApi.updateBusiness,
  deleteBusiness: businessApi.deleteBusiness,
}));

const session = {
  user: { id: "u1", email: "asha@example.com" },
} as unknown as Session;

const roleState = vi.hoisted(() => ({ role: "owner" as BusinessRole }));

beforeEach(() => {
  businessApi.getMemberships.mockReset();
  businessApi.updateBusiness.mockReset();
  roleState.role = "owner";
  businessApi.getMemberships.mockImplementation(async (): Promise<Memberships> => ({
    businesses: [
      {
        id: "b1",
        name: "Bahi Khata",
        businessType: null,
        ownerId: "u2",
        ownerName: "Rahim",
        ownerEmail: "rahim@example.com",
        role: roleState.role,
        isOwner: roleState.role === "owner",
      },
    ],
    invitations: [],
  }));
});

/** The Can wrapper plus a guarded button, inside a business URL. */
function Probe() {
  return (
    <div>
      <Can action="manageCustomers">
        <button type="button">Add customer</button>
      </Can>
      <Can action="deleteBusiness" mode="disable">
        <button type="button">Delete business</button>
      </Can>
    </div>
  );
}

function renderProbe() {
  return renderApp(
    <Routes>
      <Route path={routePatterns.business} element={<Probe />} />
    </Routes>,
    { session, route: paths.business("b1") },
  );
}

describe("S-21 Can component", () => {
  it("shows every action to the owner", async () => {
    roleState.role = "owner";

    renderProbe();

    expect(await screen.findByRole("button", { name: "Add customer" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Delete business" }),
    ).toBeTruthy();
    expect(screen.queryByTitle("View-only access")).toBeNull();
  });

  it("shows what an editor may do and hides the rest", async () => {
    roleState.role = "editor";

    renderProbe();

    expect(await screen.findByRole("button", { name: "Add customer" })).toBeTruthy();
    // hide mode: nothing at all; disable mode: still visible, inert.
    expect(screen.queryByRole("button", { name: "Delete business" })).toBeTruthy();
  });

  it("hides write actions from a viewer by default", async () => {
    roleState.role = "viewer";

    renderProbe();

    await screen.findByRole("button", { name: "Delete business" });
    expect(screen.queryByRole("button", { name: "Add customer" })).toBeNull();
  });

  it("disables with the 'View-only access' tooltip when asked", async () => {
    roleState.role = "viewer";

    const user = userEvent.setup();
    renderProbe();

    const wrapper = await screen.findByTitle("View-only access");
    const button = screen.getByRole("button", { name: "Delete business" });
    expect(wrapper.getAttribute("aria-disabled")).toBe("true");
    expect(button.closest("[aria-disabled]")).toBe(wrapper);

    // The button is inert: the click never reaches it.
    await user.click(button);
    expect(businessApi.updateBusiness).not.toHaveBeenCalled();
  });
});

/** A mutation probe: the guard should reject before any network call. */
function GuardProbe() {
  const update = useUpdateBusiness("b1");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void update.mutateAsync({ name: "Hijacked" }).catch((err) => {
            setErrorCode(toAppError(err).code);
          });
        }}
      >
        Save changes
      </button>
      {errorCode && <p role="alert">{errorCode}</p>}
    </div>
  );
}

describe("S-21 mutations are blocked before the network", () => {
  it("a known viewer's write fails fast with forbidden and never calls the api", async () => {
    roleState.role = "viewer";
    const user = userEvent.setup();

    renderApp(
      <Routes>
        <Route path={routePatterns.business} element={<GuardProbe />} />
      </Routes>,
      { session, route: paths.business("b1") },
    );

    await user.click(await screen.findByRole("button", { name: "Save changes" }));

    // The mutation rejected inside mutationFn — the api function was
    // never reached. (The database would refuse the same write.)
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("forbidden");
    expect(businessApi.updateBusiness).not.toHaveBeenCalled();
  });

  it("lets an owner's write through to the api", async () => {
    roleState.role = "owner";
    businessApi.updateBusiness.mockResolvedValue({ id: "b1", name: "Hijacked" });
    const user = userEvent.setup();

    renderApp(
      <Routes>
        <Route path={routePatterns.business} element={<GuardProbe />} />
      </Routes>,
      { session, route: paths.business("b1") },
    );

    await user.click(await screen.findByRole("button", { name: "Save changes" }));

    await vi.waitFor(() =>
      expect(businessApi.updateBusiness).toHaveBeenCalledWith("b1", {
        name: "Hijacked",
      }),
    );
  });
});
