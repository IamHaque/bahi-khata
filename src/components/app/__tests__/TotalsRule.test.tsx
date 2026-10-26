import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { TotalsRule } from "@/components/app/TotalsRule";
import { renderApp } from "@/test/app-render";

// The single-above/double-below rule is the .totals-rule utility from
// L-01 (border-top 1px, border-bottom 6px double).
describe("TotalsRule (L-04)", () => {
  it("renders its children inside the ruled container", () => {
    renderApp(
      <TotalsRule>
        <span>Net position</span>
      </TotalsRule>,
    );
    const text = screen.getByText("Net position");
    const container = text.closest(".totals-rule");
    expect(container).toBeTruthy();
    expect(container!.className).toContain("py-3");
  });
});
