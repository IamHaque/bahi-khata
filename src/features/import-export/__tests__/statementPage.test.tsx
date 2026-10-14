import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { renderApp } from "@/test/app-render";
import { paths, routePatterns } from "@/lib/paths";
import { StatementPage } from "@/features/import-export/pages/StatementPage";

// S-39 — the printable statement: business name, customer, a period
// selector, the ledger with the server's running balance and the
// closing balance. Every member may open and print it.

const businessApi = vi.hoisted(() => ({ getBusiness: vi.fn() }));
const customersApi = vi.hoisted(() => ({ getCustomer: vi.fn() }));
const transactionsApi = vi.hoisted(() => ({ getCustomerLedger: vi.fn() }));

vi.mock("@/features/business/api", () => businessApi);
vi.mock("@/features/customers/api", () => customersApi);
vi.mock("@/features/transactions/api", () => transactionsApi);
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const server = vi.hoisted(() => ({
  ledger: [] as Array<Record<string, unknown>>,
}));

const session = {
  user: { email: "asha@example.com" },
} as unknown as Session;

function ledgerFixture() {
  return [
    {
      id: "t1",
      occurred_at: "2024-01-15T10:00:00.000Z",
      type: "charge",
      amount: 1500,
      note: "Milk",
      status: "posted",
      balance_after: 1500,
    },
    {
      id: "t2",
      occurred_at: "2024-02-01T10:00:00.000Z",
      type: "payment",
      amount: 500,
      note: "bKash",
      status: "posted",
      balance_after: 1000,
    },
    {
      id: "t3",
      occurred_at: "2024-03-01T10:00:00.000Z",
      type: "charge",
      amount: 200,
      note: "",
      status: "voided",
      balance_after: 1000,
    },
  ];
}

function renderPage() {
  return renderApp(
    <Routes>
      <Route path={routePatterns.statement} element={<StatementPage />} />
    </Routes>,
    { session, route: paths.statement("b1", "c1") },
  );
}

beforeEach(() => {
  server.ledger = ledgerFixture();
  businessApi.getBusiness.mockImplementation(async () => ({
    id: "b1",
    name: "Rahim Traders",
  }));
  customersApi.getCustomer.mockImplementation(async () => ({
    id: "c1",
    name: "Asha Verma",
    phone: "01711 111111",
  }));
  transactionsApi.getCustomerLedger.mockImplementation(
    async () => server.ledger,
  );
});

describe("StatementPage (S-39)", () => {
  it("shows the business, the customer, the running ledger and the closing balance", async () => {
    renderPage();

    expect(await screen.findByText("Rahim Traders")).toBeTruthy();
    expect(screen.getByText("Asha Verma")).toBeTruthy();
    expect(screen.getByText(/01711 111111/)).toBeTruthy();

    // Every entry with its server-computed running balance (the first
    // entry's amount and its balance are both 1,500).
    expect(screen.getAllByText("₹1,500.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("₹1,000.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Milk")).toBeTruthy();
    expect(screen.getByText("bKash")).toBeTruthy();

    // A voided entry is marked in words, not by colour alone.
    expect(screen.getByText(/charge \(voided\)/)).toBeTruthy();

    // Closing balance = the last entry's running balance.
    expect(screen.getByText("Closing balance")).toBeTruthy();
  });

  it("filters by period and recomputes the closing balance", async () => {
    renderPage();
    await screen.findByText("Rahim Traders");

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2024-02-01" },
    });

    // The January charge is out of the period.
    expect(screen.queryByText("₹1,500.00")).toBeNull();
    expect(screen.getByText("bKash")).toBeTruthy();
    // Closing balance still the last visible entry's running balance.
    expect(screen.getByText("Closing balance")).toBeTruthy();
  });

  it("says so when the period has no entries, keeping a closing balance", async () => {
    renderPage();
    await screen.findByText("Rahim Traders");

    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "2030-01-01" },
    });

    expect(screen.getByText("No entries in this period.")).toBeTruthy();
    expect(screen.getByText("Closing balance")).toBeTruthy();
  });

  it("prints via the browser", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderPage();
    await screen.findByText("Rahim Traders");

    await userEvent.click(screen.getByRole("button", { name: /Print/ }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it("surfaces a load failure with a working retry", async () => {
    transactionsApi.getCustomerLedger.mockImplementationOnce(async () => {
      throw new Error("connection lost");
    });
    renderPage();

    expect(
      await screen.findByText("The statement could not be loaded."),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Rahim Traders")).toBeTruthy();
  });
});
