import { beforeEach, expect, it, vi } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { CustomerCombobox } from "../CustomerCombobox";
import { paths, routePatterns } from "@/lib/paths";

const api = vi.hoisted(() => ({ queryCustomers: vi.fn(), getCustomer: vi.fn() }));
vi.mock("@/features/customers/api", () => ({ queryCustomers: api.queryCustomers, getCustomer: api.getCustomer }));
beforeEach(() => {
  api.queryCustomers.mockReset();
  api.getCustomer.mockReset();
});

async function openPicker() {
  renderApp(<Routes><Route path={routePatterns.business} element={<CustomerCombobox value={null} onSelect={vi.fn()} onAddNew={vi.fn()} />} /></Routes>, { route: paths.business("b1") });
  await userEvent.click(screen.getByRole("button", { name: "Select customer..." }));
}

it("shows a load error, then retries without offering duplicate creation", async () => {
  api.queryCustomers.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue({ items: [{ id: "c1", name: "Asha", phone: null }], total: 1, allTotal: 1 });
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
  api.queryCustomers.mockResolvedValue({ items: [], total: 0, allTotal: 0 });
  await openPicker();
  expect(await screen.findByText("No customers yet.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add your first customer" })).toBeTruthy();
});

it("debounces server search and finds a customer beyond the initial window", async () => {
  let searchedAt = 0;
  api.queryCustomers.mockImplementation(async (_businessId, params) => {
    if (params.search === "Beyond") searchedAt = Date.now();
    return {
      items: params.search === "Beyond" ? [{ id: "c1001", name: "Beyond", phone: null }] : [],
      total: 1, allTotal: 1001,
    };
  });
  await openPicker();
  expect(await screen.findByText("Type to search all customers")).toBeTruthy();
  const typedAt = Date.now();
  fireEvent.change(screen.getByPlaceholderText("Search customers..."), { target: { value: "Beyond" } });
  expect(api.queryCustomers).not.toHaveBeenCalledWith("b1", expect.objectContaining({ search: "Beyond" }));
  expect(await screen.findByRole("option", { name: "Beyond" })).toBeTruthy();
  expect(searchedAt - typedAt).toBeGreaterThanOrEqual(300);
  expect(api.queryCustomers).toHaveBeenCalledWith("b1", { search: "Beyond", status: "all", page: 1, pageSize: 20, sort: "name", dir: "asc" });
  expect(screen.queryByText("No customers yet.")).toBeNull();
});

it("resolves the selected customer by id outside the current search window", async () => {
  api.queryCustomers.mockResolvedValue({ items: [], total: 0, allTotal: 1001 });
  api.getCustomer.mockResolvedValue({ id: "c1001", name: "Selected outside window", phone: null });
  renderApp(<Routes><Route path={routePatterns.business} element={<CustomerCombobox value="c1001" onSelect={vi.fn()} onAddNew={vi.fn()} />} /></Routes>, { route: paths.business("b1") });
  await userEvent.click(await screen.findByRole("button", { name: "Selected outside window" }));
  fireEvent.change(screen.getByPlaceholderText("Search customers..."), { target: { value: "Other" } });
  await waitFor(() => expect(api.queryCustomers).toHaveBeenCalledWith("b1", expect.objectContaining({ search: "Other" })));
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Selected outside window" })).toBeTruthy();
  expect(api.getCustomer).toHaveBeenCalledWith("c1001", "b1");
});
