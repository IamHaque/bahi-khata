import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { LedgerEntryRow } from "../components/LedgerEntryRow";

const createTxMock = vi.fn();
const balanceMock = vi.fn();

vi.mock("@/features/transactions/hooks", () => ({
  useCreateTransaction: () => ({
    mutateAsync: createTxMock,
    isPending: false,
  }),
  useCustomerBalance: () => ({
    data: balanceMock(),
  }),
}));

function renderRow(props?: Partial<React.ComponentProps<typeof LedgerEntryRow>>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <table>
        <tbody>
          <LedgerEntryRow
            businessId="b1"
            customerId="c1"
            initialBalance={100}
            {...props}
          />
        </tbody>
      </table>
    </QueryClientProvider>,
  );
}

describe("LedgerEntryRow (U-08 / L-12)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    balanceMock.mockReturnValue(100);
    createTxMock.mockResolvedValue({ id: "tx-123" });
  });

  it("renders 6 table cells with inputs and buttons", () => {
    renderRow();
    expect(screen.getByLabelText("Particulars")).toBeTruthy();
    expect(screen.getByLabelText("Charged amount")).toBeTruthy();
    expect(screen.getByLabelText("Paid amount")).toBeTruthy();
    const saveBtn = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    expect(screen.getByText("after: ₹100.00")).toBeTruthy();
  });

  it("charge flow: typing in Charged updates preview balance and enables Save", async () => {
    const user = userEvent.setup();
    renderRow();

    const chargedInput = screen.getByLabelText("Charged amount");
    await user.type(chargedInput, "50.50");

    // Balance preview increases
    expect(screen.getByText("after: ₹150.50")).toBeTruthy();
    const saveBtn = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(false);
  });

  it("payment flow: typing in Paid clears Charged and reduces preview balance", async () => {
    const user = userEvent.setup();
    renderRow();

    const chargedInput = screen.getByLabelText("Charged amount") as HTMLInputElement;
    const paidInput = screen.getByLabelText("Paid amount") as HTMLInputElement;

    await user.type(chargedInput, "50");
    expect(chargedInput.value).toBe("50");

    await user.type(paidInput, "25");
    expect(paidInput.value).toBe("25");
    expect(chargedInput.value).toBe("");
    expect(screen.getByText("after: ₹75.00")).toBeTruthy();
  });

  it("both filled: shows error message and disables Save", () => {
    renderRow({ initialCharged: "50", initialPaid: "25" });

    expect(screen.getByRole("alert").textContent).toContain("Enter either Charged or Paid");
    const saveBtn = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it("saves on button click and calls onSuccess with new id", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderRow({ onSuccess });

    await user.type(screen.getByLabelText("Particulars"), "Lunch bill");
    await user.type(screen.getByLabelText("Charged amount"), "200");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(createTxMock).toHaveBeenCalledTimes(1);
    });

    expect(createTxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: "c1",
        type: "charge",
        amount: 200,
        note: "Lunch bill",
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith("tx-123");
    // Row cleared
    expect((screen.getByLabelText("Particulars") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Charged amount") as HTMLInputElement).value).toBe("");
  });

  it("saves on Enter in amount input and clears row", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderRow({ onSuccess });

    const paidInput = screen.getByLabelText("Paid amount");
    await user.type(paidInput, "100{enter}");

    await waitFor(() => {
      expect(createTxMock).toHaveBeenCalledTimes(1);
    });

    expect(createTxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: "c1",
        type: "payment",
        amount: 100,
      }),
    );
    expect(onSuccess).toHaveBeenCalledWith("tx-123");
  });

  it("Escape key clears all fields", async () => {
    const user = userEvent.setup();
    renderRow();

    const noteInput = screen.getByLabelText("Particulars") as HTMLInputElement;
    const chargedInput = screen.getByLabelText("Charged amount") as HTMLInputElement;

    await user.type(noteInput, "Some draft");
    await user.type(chargedInput, "75");
    expect(noteInput.value).toBe("Some draft");
    expect(chargedInput.value).toBe("75");

    await user.keyboard("{Escape}");
    expect(noteInput.value).toBe("");
    expect(chargedInput.value).toBe("");
  });

  it("change date button has accessible label", () => {
    renderRow();
    expect(screen.getByRole("button", { name: "Change date" })).toBeTruthy();
  });
});
