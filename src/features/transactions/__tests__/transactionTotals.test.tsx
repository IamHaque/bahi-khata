import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TransactionTotals } from "@/features/transactions/components/TransactionTotals";

/**
 * L-09 — the totals strip: the RPC's ungrouped rollup row under both
 * views, every figure a Money, and em dashes until the rollup answers.
 */

describe("L-09 TransactionTotals", () => {
  it("names its region and renders Charged, Paid and Net as Money figures", () => {
    render(
      <TransactionTotals
        total={{ entries: 42, total_charged: 5700, total_paid: 700, net: -250 }}
      />,
    );

    const region = screen.getByRole("region", {
      name: "Totals for the current filter",
    });
    expect(within(region).getByText(/42 entries/)).toBeTruthy();
    expect(within(region).getByText("₹5,700.00")).toBeTruthy();
    expect(within(region).getByText("₹700.00")).toBeTruthy();
    // The net keeps its magnitude; only its tone shows the direction.
    const net = within(region).getByText("₹250.00");
    expect(net.className).toContain("text-credit");
  });

  it("a positive net is toned receivable", () => {
    render(
      <TransactionTotals
        total={{ entries: 2, total_charged: 1500, total_paid: 300, net: 1200 }}
      />,
    );
    const region = screen.getByRole("region", {
      name: "Totals for the current filter",
    });
    const net = within(region).getByText("₹1,200.00");
    expect(net.className).toContain("text-receivable");
  });

  it("shows em dashes while the rollup has not answered", () => {
    render(<TransactionTotals total={null} />);

    const region = screen.getByRole("region", {
      name: "Totals for the current filter",
    });
    expect(within(region).getAllByText("—").length).toBe(3);
    expect(within(region).queryByText(/entries/)).toBeNull();
  });
});
