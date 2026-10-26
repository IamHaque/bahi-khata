import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { TypeBadge } from "@/components/app/TypeBadge";
import { renderApp } from "@/test/app-render";

// Colour meaning is unchanged from v2 (D-10): charge = receivable
// (green), payment = credit (red-orange).
describe("TypeBadge (L-04)", () => {
  it("labels a charge with the receivable tint and an up-right arrow", () => {
    renderApp(<TypeBadge type="charge" />);
    const badge = screen.getByText("Charge");
    expect(badge.className).toContain("bg-receivable/10");
    expect(badge.className).toContain("dark:bg-receivable/8");
    expect(badge.className).toContain("text-receivable");
    expect(badge.querySelector("svg")).toBeTruthy();
  });

  it("labels a payment with the credit tint and a down-left arrow", () => {
    renderApp(<TypeBadge type="payment" />);
    const badge = screen.getByText("Payment");
    expect(badge.className).toContain("bg-credit/10");
    expect(badge.className).toContain("dark:bg-credit/8");
    expect(badge.className).toContain("text-credit");
    expect(badge.querySelector("svg")).toBeTruthy();
  });

  it("hides its icon from assistive tech", () => {
    renderApp(<TypeBadge type="charge" />);
    expect(
      screen.getByText("Charge").querySelector("svg")!.getAttribute("aria-hidden"),
    ).toBe("true");
  });
});
