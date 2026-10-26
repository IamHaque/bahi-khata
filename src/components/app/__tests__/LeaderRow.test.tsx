import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { LeaderRow } from "@/components/app/LeaderRow";
import { Monogram } from "@/components/app/Monogram";
import { AgeFlag } from "@/components/app/AgeFlag";
import { renderApp } from "@/test/app-render";

describe("LeaderRow (L-04)", () => {
  it("reads in order: label, sub, then the amount, with the dots hidden", () => {
    renderApp(
      <div role="list">
        <LeaderRow label="Rahim Uddin" sub="paid today" amount={237439} />
      </div>,
    );
    const item = screen.getByRole("listitem");
    // The dots are decorative.
    const dots = item.querySelector(".leader-dots");
    expect(dots?.getAttribute("aria-hidden")).toBe("true");
    // Reading order: label then sub-line then the full formatted amount.
    expect(item.textContent).toContain("Rahim Uddin");
    expect(item.textContent).toContain("paid today");
    expect(item.textContent).toContain("₹2,37,439.00");
    expect(screen.getByText("Rahim Uddin").compareDocumentPosition(
      screen.getByText("paid today"),
    ) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("tones the amount receivable / credit / neutral", () => {
    renderApp(
      <div role="list">
        <LeaderRow label="A" amount={100} tone="receivable" />
        <LeaderRow label="B" amount={-100} tone="credit" />
        <LeaderRow label="C" amount={0} />
      </div>,
    );
    const [a, b, c] = screen.getAllByRole("listitem");
    expect(within(a!).getByText("₹100.00").className).toContain("text-receivable");
    expect(within(b!).getByText("-₹100.00").className).toContain("text-credit");
    expect(within(c!).getByText("₹0.00").className).toContain("text-foreground");
  });

  it("truncates a long name but never the amount", () => {
    renderApp(
      <div role="list">
        <LeaderRow
          label="Ashfafamazing Rahman Chowdhury of Dhaka"
          amount={12345678.9}
        />
      </div>,
    );
    expect(screen.getByText("Ashfafamazing Rahman Chowdhury of Dhaka").className).toContain(
      "truncate",
    );
    const amount = screen.getByText("₹1,23,45,678.90");
    expect(amount.className).not.toContain("truncate");
    expect(amount.textContent).toBe("₹1,23,45,678.90");
  });

  it("shows the leading Monogram and trailing AgeFlag", () => {
    renderApp(
      <div role="list">
        <LeaderRow
          label="Rahim Uddin"
          amount={1}
          leading={<Monogram name="Rahim Uddin" tone="receivable" />}
          trailing={<AgeFlag days={41} />}
        />
      </div>,
    );
    const item = screen.getByRole("listitem");
    expect(within(item).getByText("RU")).toBeTruthy();
    expect(within(item).getByText("40+ days")).toBeTruthy();
  });
});
