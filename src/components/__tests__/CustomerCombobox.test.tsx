import { beforeEach, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { CustomerCombobox } from "../CustomerCombobox";
import { paths, routePatterns } from "@/lib/paths";

const api = vi.hoisted(() => ({ listCustomers: vi.fn() }));
vi.mock("@/features/customers/api", () => ({ listCustomers: api.listCustomers }));
beforeEach(() => api.listCustomers.mockReset());

async function openPicker() {
  renderApp(<Routes><Route path={routePatterns.business} element={<CustomerCombobox value={null} onSelect={vi.fn()} onAddNew={vi.fn()} />} /></Routes>, { route: paths.business("b1") });
  await userEvent.click(screen.getByRole("button", { name: "Select customer..." }));
}

it("shows a load error, then retries without offering duplicate creation", async () => {
  api.listCustomers.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue([{ id: "c1", name: "Asha", phone: null }]);
  await openPicker();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Could not load customers");
  expect(screen.queryByText("No customers yet.")).toBeNull();
  expect(screen.queryByText("Add your first customer")).toBeNull();
  await expectNoSeriousViolations(alert);
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("option", { name: "Asha" })).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

it("shows the first-customer prompt only after a successful empty result", async () => {
  api.listCustomers.mockResolvedValue([]);
  await openPicker();
  expect(await screen.findByText("No customers yet.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add your first customer" })).toBeTruthy();
});
