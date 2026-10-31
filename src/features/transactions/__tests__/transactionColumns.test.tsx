import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  buildDetailColumns,
  buildSummaryColumns,
  transactionMobileCard,
} from "@/features/transactions/components/transactionColumns";
import type { TransactionListRow } from "@/features/transactions/api";

/**
 * L-09 — the day book's column builders: the right money cell is
 * filled per type, both money headers share the amount sort key, and
 * the destructive Delete rides on `can("deleteTransaction")` (S-54).
 */

function seedRow(
  overrides: Partial<TransactionListRow> = {},
): TransactionListRow {
  return {
    id: "t1",
    customer_id: "c1",
    type: "charge",
    amount: 249.5,
    occurred_at: "2026-10-12T10:00:00+00:00",
    note: null,
    status: "active",
    source: "manual",
    created_by: "u1",
    created_at: "2026-10-12T10:00:00+00:00",
    updated_at: "2026-10-12T10:00:00+00:00",
    customer: { id: "c1", name: "Asha Verma", phone: null },
    created_by_name: "Eli Hassan",
    updated_by_name: null,
    ...overrides,
  };
}

function build(allowed: string[]) {
  return buildDetailColumns({
    can: (action) => allowed.includes(action),
    businessId: "b1",
    onEdit: vi.fn(),
    onVoid: vi.fn(),
    onRestore: vi.fn(),
    onDelete: vi.fn(),
    navigate: vi.fn(),
  });
}

describe("L-09 buildDetailColumns", () => {
  it("a charge fills Charged and leaves Paid an em dash; a payment the reverse", () => {
    const { columns } = build(["manageTransactions", "deleteTransaction"]);
    const charged = columns.find((column) => column.key === "charged")!;
    const paid = columns.find((column) => column.key === "paid")!;

    const charge = seedRow({ type: "charge", amount: 249.5 });
    const { unmount } = render(
      <MemoryRouter>
        {charged.render(charge)}
        {paid.render(charge)}
      </MemoryRouter>,
    );
    expect(screen.getByText("₹249.50")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBe(1); // only Paid
    unmount();

    const payment = seedRow({ type: "payment", amount: 1016.9 });
    render(
      <MemoryRouter>
        {charged.render(payment)}
        {paid.render(payment)}
      </MemoryRouter>,
    );
    expect(screen.getByText("₹1,016.90")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBe(1); // only Charged
  });

  it("both money columns hand the table the ONE amount sort key", () => {
    const { columns } = build(["manageTransactions"]);
    const charged = columns.find((column) => column.key === "charged")!;
    const paid = columns.find((column) => column.key === "paid")!;
    expect(charged.sortKey).toBe("amount");
    expect(paid.sortKey).toBe("amount");
  });

  it("Delete appears only with can('deleteTransaction'), after the divider", () => {
    const editor = build(["manageTransactions"]);
    const { unmount } = render(
      <MemoryRouter>{editor.renderRowActions(seedRow())}</MemoryRouter>,
    );
    expect(
      screen.getByRole("button", { name: "Edit charge of ₹249.50" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Void charge of ₹249.50" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Delete charge of ₹249.50" }),
    ).toBeNull();
    unmount();

    const owner = build(["manageTransactions", "deleteTransaction"]);
    render(<MemoryRouter>{owner.renderRowActions(seedRow())}</MemoryRouter>);
    expect(
      screen.getByRole("button", { name: "Delete charge of ₹249.50" }),
    ).toBeTruthy();
  });

  it("a viewer gets no actions at all", () => {
    const viewer = build([]);
    render(<MemoryRouter>{viewer.renderRowActions(seedRow())}</MemoryRouter>);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("L-09 buildSummaryColumns", () => {
  it("labels the restyled rollup Period/Entries/Charged/Paid/Net", () => {
    const headers = buildSummaryColumns().map((column) => column.header);
    expect(headers).toEqual(["Period", "Entries", "Charged", "Paid", "Net"]);
  });
});

describe("L-09 transactionMobileCard (V-HV3)", () => {
  it("renders customer, type badge, date, note, recorder and amount", () => {
    const row = seedRow({
      type: "charge",
      amount: 450,
      note: "Weekly groceries",
      created_by_name: "Asha",
    });
    render(
      <MemoryRouter>
        {transactionMobileCard(row, "b1", <button type="button">Actions</button>)}
      </MemoryRouter>,
    );
    expect(screen.getByText("Asha Verma")).toBeTruthy();
    expect(screen.getByText("Charge")).toBeTruthy();
    expect(screen.getByText("Weekly groceries")).toBeTruthy();
    expect(screen.getByText("by Asha")).toBeTruthy();
    expect(screen.getByText("+₹450.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Actions" })).toBeTruthy();
  });

  it("voided card shows Voided chip and struck-through amount", () => {
    const row = seedRow({
      status: "voided",
      type: "charge",
      amount: 450,
    });
    const { container } = render(
      <MemoryRouter>
        {transactionMobileCard(row, "b1", null)}
      </MemoryRouter>,
    );
    expect(screen.getByText("Voided")).toBeTruthy();
    const amountEl = container.querySelector(".line-through");
    expect(amountEl).not.toBeNull();
  });

  it("import card shows Import chip", () => {
    const row = seedRow({
      source: "import",
    });
    render(
      <MemoryRouter>
        {transactionMobileCard(row, "b1", null)}
      </MemoryRouter>,
    );
    expect(screen.getByText("Import")).toBeTruthy();
  });
});
