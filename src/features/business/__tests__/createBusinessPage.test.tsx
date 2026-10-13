import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useLocation } from "react-router-dom";
import { renderApp } from "@/test/app-render";
import { CreateBusinessPage } from "@/features/business/pages/CreateBusinessPage";
import { AppError } from "@/lib/AppError";

const businessApi = vi.hoisted(() => ({
  createBusiness: vi.fn(),
  getMemberships: vi.fn(),
}));
const activeBusinessState = vi.hoisted(() => ({
  status: "none" as "loading" | "ready" | "none" | "forbidden",
}));
const toastState = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/features/business/api", () => ({
  createBusiness: businessApi.createBusiness,
  getMemberships: businessApi.getMemberships,
}));

vi.mock("@/contexts/BusinessContext", () => ({
  BusinessProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useActiveBusiness: () => ({
    business: null,
    role: null,
    isOwner: activeBusinessState.status === "ready",
    status: activeBusinessState.status,
  }),
  useBusinessContext: () => ({
    status: activeBusinessState.status,
    business: null,
    role: null,
    isOwner: false,
    error: null,
  }),
}));

vi.mock("@/lib/toast", () => ({
  toastSuccess: toastState.success,
  toastError: toastState.error,
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderPage() {
  return renderApp(
    <>
      <LocationProbe />
      <CreateBusinessPage />
    </>,
    { session: { user: { id: "u1" } } as never },
  );
}

beforeEach(() => {
  businessApi.createBusiness.mockReset();
  activeBusinessState.status = "none";
  toastState.success.mockClear();
  toastState.error.mockClear();
});

describe("S-15 create business page", () => {
  it("creates with the minimum, keyboard only, and lands on the dashboard", async () => {
    businessApi.createBusiness.mockResolvedValue({ id: "b1" });
    renderPage();

    // Keyboard only: autofocus is on Name, type and press Enter.
    await userEvent.keyboard("Rahim Traders{Enter}");

    await waitFor(() =>
      expect(businessApi.createBusiness).toHaveBeenCalledTimes(1),
    );
    // Optional details empty — never blocks saving.
    expect(businessApi.createBusiness).toHaveBeenCalledWith(
      {
        name: "Rahim Traders",
        businessType: undefined,
        phone: undefined,
        email: undefined,
        address: undefined,
        notes: undefined,
      },
      // react-query passes mutation context as a second argument
      expect.anything(),
    );
    expect(toastState.success).toHaveBeenCalledWith("Business created");
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/"),
    );
  });

  it("rejects an invalid name with an inline error and saves nothing", async () => {
    renderPage();

    await userEvent.click(
      screen.getByRole("button", { name: "Create business" }),
    );
    expect(
      await screen.findByText("Name must be at least 2 characters"),
    ).toBeTruthy();

    // Too long
    await userEvent.type(screen.getByLabelText("Name"), "x".repeat(81));
    await userEvent.click(
      screen.getByRole("button", { name: "Create business" }),
    );
    expect(
      await screen.findByText("Name must be at most 80 characters"),
    ).toBeTruthy();

    expect(businessApi.createBusiness).not.toHaveBeenCalled();
  });

  it("keeps input on failure and offers a retry that succeeds", async () => {
    businessApi.createBusiness
      .mockRejectedValueOnce(
        new AppError(
          "network",
          "Network error. Check your connection and try again.",
        ),
      )
      .mockResolvedValueOnce({ id: "b1" });
    renderPage();

    await userEvent.type(screen.getByLabelText("Name"), "Rahim Traders");
    await userEvent.click(
      screen.getByRole("button", { name: "Create business" }),
    );

    const banner = await screen.findByRole("alert");
    expect(banner.textContent).toContain(
      "Network error. Check your connection and try again.",
    );
    expect(
      (screen.getByLabelText("Name") as HTMLInputElement).value,
    ).toBe("Rahim Traders");

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(businessApi.createBusiness).toHaveBeenCalledTimes(2),
    );
    expect(toastState.success).toHaveBeenCalledWith("Business created");
  });

  it("redirects a user who already owns a business, with a notice", async () => {
    activeBusinessState.status = "ready";
    renderPage();

    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toBe("/"),
    );
    expect(toastState.success).toHaveBeenCalledWith(
      "You already own a business",
    );
    expect(businessApi.createBusiness).not.toHaveBeenCalled();
  });

  it("creates only one business on a double submit", async () => {
    let resolve!: (v: unknown) => void;
    businessApi.createBusiness.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    renderPage();

    await userEvent.type(screen.getByLabelText("Name"), "Rahim Traders");
    const submit = screen.getByRole("button", { name: "Create business" });
    await userEvent.click(submit);

    // Spinner state: the button is disabled, a second click is a no-op.
    expect(
      screen.getByRole("button", { name: "Create business" }),
    ).toHaveProperty("disabled", true);
    await userEvent.click(
      screen.getByRole("button", { name: "Create business" }),
    );
    expect(businessApi.createBusiness).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ id: "b1" });
    });
    expect(toastState.success).toHaveBeenCalledWith("Business created");
  });

  it("keeps optional details under a collapsible More details section", async () => {
    renderPage();

    expect(screen.queryByLabelText("Phone")).toBeNull();
    expect(screen.queryByLabelText("Business type")).toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: /More details/ }),
    );

    expect(screen.getByLabelText("Phone")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Business type")).toBeTruthy();
    expect(screen.getByLabelText("Address")).toBeTruthy();
    expect(screen.getByLabelText("Notes")).toBeTruthy();
  });
});
