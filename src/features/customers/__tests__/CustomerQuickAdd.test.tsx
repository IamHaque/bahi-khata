import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { CustomerQuickAdd } from "@/features/customers/components/CustomerQuickAdd";
import { AppError } from "@/lib/AppError";

const transactionsApi = vi.hoisted(() => ({
  createTransaction: vi.fn(),
  createTransactionsBatch: vi.fn(),
  getAllCustomerBalances: vi.fn(async () => ({})),
  queryTransactions: vi.fn(async () => ({ rows: [], total: 0 })),
  transactionRollup: vi.fn(async () => []),
  getCustomerBalance: vi.fn(),
  getCustomerLedger: vi.fn(),
  getDashboardSummary: vi.fn(),
  getTransactionById: vi.fn(),
  restoreTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  voidTransaction: vi.fn(),
}));

vi.mock("@/features/transactions/api", () => ({
  createTransaction: transactionsApi.createTransaction,
  createTransactionsBatch: transactionsApi.createTransactionsBatch,
  getAllCustomerBalances: transactionsApi.getAllCustomerBalances,
  queryTransactions: transactionsApi.queryTransactions,
  transactionRollup: transactionsApi.transactionRollup,
  getCustomerBalance: transactionsApi.getCustomerBalance,
  getCustomerLedger: transactionsApi.getCustomerLedger,
  getDashboardSummary: transactionsApi.getDashboardSummary,
  getTransactionById: transactionsApi.getTransactionById,
  restoreTransaction: transactionsApi.restoreTransaction,
  updateTransaction: transactionsApi.updateTransaction,
  voidTransaction: transactionsApi.voidTransaction,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/** Rahim's page per the PRD scenario: the balance reads ₹2,37,439.00. */
function renderQuickAdd() {
  return renderApp(<CustomerQuickAdd customerId="c1" businessId="b1" />);
}

/** An ISO day in the LOCAL timezone (the form speaks local wall clock). */
function isoDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The local ISO day an instant falls on. */
function localDay(when: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  transactionsApi.getCustomerBalance.mockImplementation(async () => 237439);
  transactionsApi.createTransaction.mockImplementation(async () => ({}));
});

describe("CustomerQuickAdd (L-07)", () => {
  it("records a charge dated today: create is called, the toast fires, the amount clears and refocuses, the balance refetches", async () => {
    renderQuickAdd();

    await userEvent.type(screen.getByLabelText("Amount"), "15000");
    await userEvent.click(screen.getByRole("button", { name: "Add charge" }));

    await waitFor(() =>
      expect(transactionsApi.createTransaction).toHaveBeenCalledTimes(1),
    );
    const [input, businessId] =
      transactionsApi.createTransaction.mock.calls[0]!;
    expect(input).toMatchObject({
      customer_id: "c1",
      type: "charge",
      amount: 15000,
    });
    expect(businessId).toBe("b1");
    // Dated today: the local day — exactly as the sheet maps a no-time
    // entry, the start of that day.
    const when = new Date((input as { occurred_at: string }).occurred_at);
    expect(localDay(when)).toBe(isoDay(0));

    // The amount is empty and focused again; the choice stays Charged.
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("quickadd-money"),
    );
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe(
      "",
    );
    expect(
      screen
        .getByRole("radio", { name: "Charged" })
        .getAttribute("aria-checked"),
    ).toBe("true");

    // The toast confirms…
    expect(
      (toast.success as ReturnType<typeof vi.fn>).mock.calls.some(
        (call) => call[0] === "Charge added",
      ),
    ).toBe(true);
    // …and the money invalidation refetches the balance the preview
    // and the header read.
    await waitFor(() =>
      expect(transactionsApi.getCustomerBalance.mock.calls.length).toBeGreaterThan(
        1,
      ),
    );
  });

  it("previews the new balance: a charge adds, a payment subtracts", async () => {
    renderQuickAdd();

    await userEvent.type(screen.getByLabelText("Amount"), "15000");
    // Charged is the default choice…
    await waitFor(() => screen.getByText("New balance: ₹2,52,439.00"));
    // …and Paid previews the other direction from the same balance.
    await userEvent.click(screen.getByRole("radio", { name: "Paid" }));
    await waitFor(() => screen.getByText("New balance: ₹2,22,439.00"));
  });

  it("explains an invalid amount after touch and the button cannot submit it", async () => {
    renderQuickAdd();

    await userEvent.type(screen.getByLabelText("Amount"), "0");
    // Moving away touches the field: onTouched explains…
    await userEvent.tab();
    await screen.findByText("Amount must be above zero");
    // …and the submit never reaches the api.
    await userEvent.click(screen.getByRole("button", { name: "Add charge" }));
    expect(transactionsApi.createTransaction).not.toHaveBeenCalled();
  });

  it("keeps the choices 44 px tall, the button following the choice, and Change date revealing date and time", async () => {
    renderQuickAdd();

    const charged = screen.getByRole("radio", { name: "Charged" });
    const paid = screen.getByRole("radio", { name: "Paid" });
    // h-11 = 44 px — the phone-first touch target.
    expect(charged.className).toContain("h-11");
    expect(paid.className).toContain("h-11");
    screen.getByRole("radiogroup", { name: "Entry type" });
    expect(charged.getAttribute("aria-checked")).toBe("true");

    // The button spells the choice…
    await userEvent.click(paid);
    screen.getByRole("button", { name: "Add payment" });
    // …and Change date reveals the date and time fields.
    await userEvent.click(screen.getByRole("button", { name: "Change date" }));
    screen.getByLabelText("Date");
    screen.getByLabelText("Time");
  });

  it("keeps the values and toasts the message when saving fails", async () => {
    transactionsApi.createTransaction.mockImplementation(async () => {
      throw new AppError("network", "Could not reach the server.");
    });
    renderQuickAdd();

    await userEvent.type(screen.getByLabelText("Amount"), "1500");
    await userEvent.click(screen.getByRole("button", { name: "Add charge" }));

    await waitFor(() =>
      expect(
        (toast.error as ReturnType<typeof vi.fn>).mock.calls.some(
          (call) => call[0] === "Could not reach the server.",
        ),
      ).toBe(true),
    );
    // Nothing was lost: the amount is still there.
    expect((screen.getByLabelText("Amount") as HTMLInputElement).value).toBe(
      "1500",
    );
  });

  // L-14 — the quick-add card passes axe.
  it("the quick-add card passes axe", async () => {
    const { container } = renderQuickAdd();
    await screen.findByLabelText("Amount");
    await expectNoSeriousViolations(container);
  });
});
