import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/app-render";
import { useCustomers, useCreateCustomer } from "../hooks";
import { customerKeys } from "@/lib/queryKeys";
import type { CustomerInput } from "../api";
import type { Customer } from "@/types";

const mocks = vi.hoisted(() => ({
  listCustomers: vi.fn(),
  createCustomer: vi.fn(),
}));

vi.mock("../api", () => ({
  listCustomers: (...args: unknown[]) => mocks.listCustomers(...args),
  getCustomer: vi.fn(),
  createCustomer: (...args: unknown[]) => mocks.createCustomer(...args),
  updateCustomer: vi.fn(),
}));

const ash = { id: "1", name: "Asha" } as Customer;

function Probe() {
  const { data, isLoading } = useCustomers("b1");
  const create = useCreateCustomer("b1");

  if (isLoading) return <p>loading</p>;

  return (
    <div>
      <ul>
        {data?.map((c) => (
          <li key={c.id}>{c.name}</li>
        ))}
      </ul>
      <button onClick={() => create.mutate({ name: "New" } as CustomerInput)}>
        add
      </button>
    </div>
  );
}

describe("customer hooks", () => {
  it("reads through useQuery with the shared query key", async () => {
    mocks.listCustomers.mockResolvedValue([ash]);

    renderApp(<Probe />);

    expect(await screen.findByText("Asha")).toBeTruthy();
    expect(mocks.listCustomers).toHaveBeenCalledTimes(1);
  });

  it("a successful create mutation invalidates the customer list", async () => {
    mocks.listCustomers.mockResolvedValue([ash]);
    mocks.createCustomer.mockResolvedValue({ id: "2", name: "New" } as Customer);

    renderApp(<Probe />);
    await screen.findByText("Asha");

    await userEvent.click(screen.getByRole("button", { name: "add" }));

    await waitFor(() =>
      expect(mocks.createCustomer).toHaveBeenCalledWith({ name: "New" }, "b1"),
    );
    await waitFor(() => expect(mocks.listCustomers).toHaveBeenCalledTimes(2));
  });
});

describe("query key factories", () => {
  it("unscoped keys use the plain prefix", () => {
    expect(customerKeys.list()).toEqual(["customers", "list"]);
    expect(customerKeys.detail("c1")).toEqual(["customers", "c1"]);
  });

  it("business-scoped keys start with the business id", () => {
    expect(customerKeys.list("b1")).toEqual(["business", "b1", "customers", "list"]);
    expect(customerKeys.detail("c1", "b1")).toEqual(["business", "b1", "customers", "c1"]);
    expect(customerKeys.balance("c1", "b1")).toEqual([
      "business",
      "b1",
      "customers",
      "balances",
      "c1",
    ]);
  });
});
