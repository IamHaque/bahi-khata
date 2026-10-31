import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  LedgerTable,
  type LedgerEntry,
} from "@/features/customers/components/LedgerTable";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { __setMatchMedia } from "@/test/setup";

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/** A ledger entry with sensible defaults. */
function entry(
  overrides: Partial<LedgerEntry> & { id: string },
): LedgerEntry {
  return {
    occurred_at: daysAgo(1),
    note: null,
    type: "charge",
    amount: 100,
    status: "active",
    balance_after: 100,
    ...overrides,
  };
}

function bodyRows() {
  return Array.from(
    document.querySelectorAll<HTMLTableRowElement>("tbody tr"),
  );
}

function totalsRow() {
  const row = document.querySelector<HTMLTableRowElement>("tfoot tr");
  if (!row) throw new Error("no totals row");
  return row;
}

function rowActions() {
  return <button type="button">Row actions</button>;
}

describe("LedgerTable (L-07)", () => {
  it("columns in order, tone colours, the margin rule and a sr-only caption", () => {
    renderApp(
      <LedgerTable
        entries={[
          entry({
            id: "p",
            type: "payment",
            amount: 500,
            balance_after: 4500,
            note: "Part payment",
            occurred_at: daysAgo(2),
          }),
          entry({
            id: "c",
            amount: 5000,
            balance_after: 5000,
            note: "Advance",
            occurred_at: daysAgo(3),
          }),
        ]}
      />,
    );

    // The PRD's columns, in order, with the screen-reader caption.
    expect(
      screen.getAllByRole("columnheader").map((el) => el.textContent),
    ).toEqual(["Date", "Particulars", "Charged", "Paid", "Balance", "Actions"]);
    expect(screen.getByText("Ledger").tagName).toBe("CAPTION");

    // Newest first: the payment (2 days) before the charge (3 days),
    // each amount in its own column and its own tone colour.
    const [payment, charge] = bodyRows();
    expect(payment!.cells[1]!.textContent).toContain("Part payment");
    expect(payment!.cells[2]!.textContent).toBe("");
    expect(payment!.cells[3]!.textContent).toBe("₹500.00");
    expect(payment!.cells[3]!.firstElementChild?.className).toContain(
      "text-credit",
    );
    expect(charge!.cells[2]!.textContent).toBe("₹5,000.00");
    expect(charge!.cells[2]!.firstElementChild?.className).toContain(
      "text-receivable",
    );
    // The margin rule runs down the Particulars column.
    expect(charge!.cells[1]!.className).toContain("margin-rule");
    // Balance is the plain medium-weight number.
    expect(charge!.cells[4]!.firstElementChild?.className).toContain(
      "font-medium",
    );
  });

  it("a voided entry stays visible, muted and struck through, out of the totals", () => {
    renderApp(
      <LedgerTable
        entries={[
          entry({
            id: "v",
            amount: 300,
            status: "voided",
            balance_after: 4500,
            note: "Duplicate",
          }),
          entry({ id: "p", type: "payment", amount: 500, balance_after: 4500 }),
          entry({ id: "c", amount: 5000, balance_after: 5000 }),
        ]}
      />,
    );

    const [voided] = bodyRows();
    expect(voided!.className).toContain("text-muted-foreground");
    expect(within(voided!).getByText("Voided").className).toContain(
      "bg-warning/10",
    );
    expect(voided!.cells[2]!.firstElementChild?.className).toContain(
      "line-through",
    );
    // Its balance is the live one, not its own amount.
    expect(voided!.cells[4]!.textContent).toBe("₹4,500.00");

    // The totals sum every non-voided entry — the voided 300 is out —
    // and every totals cell carries the double rule.
    const totals = totalsRow();
    expect(totals.cells[0]!.getAttribute("colspan")).toBe("2");
    expect(totals.cells[2]!.className).toContain("border-double");
    within(totals).getByText("₹5,000.00"); // charged
    within(totals).getByText("₹500.00"); // paid
    within(totals).getByText("₹4,500.00"); // final
    screen.getByText(/Voided entries stay visible but do not count\./);
  });

  it("sums all 120 entries in Totals while showing the newest 50, paging by Show earlier entries", async () => {
    renderApp(
      <LedgerTable
        entries={[
          ...Array.from({ length: 119 }, (_, i) =>
            entry({
              id: `c${i}`,
              amount: 100,
              balance_after: 100 * (119 - i),
              occurred_at: daysAgo(i + 2),
            }),
          ),
          entry({
            id: "p",
            type: "payment",
            amount: 300,
            balance_after: 11600,
            occurred_at: daysAgo(121),
          }),
        ]}
      />,
    );

    // The newest 50 rows plus the paging button's own row.
    expect(bodyRows()).toHaveLength(51);
    // Totals cover every entry, shown or not.
    within(totalsRow()).getByText("₹11,900.00"); // 119 × 100 charged
    within(totalsRow()).getByText("₹300.00"); // the one payment
    within(totalsRow()).getByText("₹11,600.00"); // the difference

    // The button reveals the next 50…
    await userEvent.click(
      screen.getByRole("button", { name: "Show earlier entries (70)" }),
    );
    expect(bodyRows()).toHaveLength(101);
    screen.getByRole("button", { name: "Show earlier entries (20)" });
    // …and the totals do not move.
    within(totalsRow()).getByText("₹11,900.00");
  });

  it("footers read '1 entry' for a single row", () => {
    renderApp(<LedgerTable entries={[entry({ id: "only" })]} />);
    screen.getByText(/1 entry ·/);
    expect(screen.queryByText("1 entries")).toBeNull();
  });

  it("topRow renders first in the desktop tbody", () => {
    renderApp(
      <LedgerTable
        entries={[entry({ id: "e" })]}
        topRow={
          <tr data-testid="top-row">
            <td colSpan={6}>New entry row</td>
          </tr>
        }
      />,
    );
    expect(bodyRows()[0]?.getAttribute("data-testid")).toBe("top-row");
  });

  it("under 768 px: two-line list rows with their column word, a totals block — and no topRow", () => {
    __setMatchMedia(true);
    try {
      renderApp(
        <LedgerTable
          entries={[
            entry({ id: "c", amount: 5000, balance_after: 5000, note: "Advance" }),
            entry({
              id: "p",
              type: "payment",
              amount: 500,
              balance_after: 4500,
              note: "Part payment",
            }),
          ]}
          renderActions={rowActions}
          topRow={
            <tr data-testid="top-row">
              <td colSpan={6}>New entry row</td>
            </tr>
          }
        />,
      );

      // No table — list rows instead, each carrying its column word.
      expect(screen.queryByRole("table")).toBeNull();
      const [charge, payment] = screen.getAllByRole("listitem");
      within(charge!).getByText("Charged");
      within(charge!).getByText(/balance/);
      within(payment!).getByText("Paid");
      // Line 2 carries the actions…
      within(charge!).getByRole("button", { name: "Row actions" });
      // …the totals keep the double rule…
      screen.getByText("Totals");
      // …and the desktop-only <tr> never lands in the <ul>.
      expect(screen.queryByTestId("top-row")).toBeNull();
    } finally {
      __setMatchMedia(false);
    }
  });

  it("passes the accessibility gate on both layouts", async () => {
    const entries = [
      entry({ id: "v", amount: 300, status: "voided", balance_after: 4500 }),
      entry({ id: "p", type: "payment", amount: 500, balance_after: 4500 }),
      entry({ id: "c", amount: 5000, balance_after: 5000 }),
    ];

    const desktop = renderApp(
      <LedgerTable entries={entries} renderActions={rowActions} />,
    );
    await expectNoSeriousViolations(desktop.container);

    __setMatchMedia(true);
    try {
      const mobile = renderApp(
        <LedgerTable entries={entries} renderActions={rowActions} />,
      );
      await expectNoSeriousViolations(mobile.container);
    } finally {
      __setMatchMedia(false);
    }
  });
});
