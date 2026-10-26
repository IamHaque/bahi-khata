import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { AgeFlag } from "@/components/app/AgeFlag";
import { renderApp } from "@/test/app-render";

describe("AgeFlag (L-04)", () => {
  it("shows nothing below 30 days", () => {
    const { container } = renderApp(<AgeFlag days={12} />);
    expect(container.textContent).toBe("");
    expect(screen.queryByText(/\+ days/)).toBeNull();
  });

  it("shows nothing for a null age", () => {
    const { container } = renderApp(<AgeFlag days={null} />);
    expect(container.textContent).toBe("");
  });

  it("rounds down to the decade at 30 days", () => {
    renderApp(<AgeFlag days={30} />);
    expect(screen.getByText("30+ days")).toBeTruthy();
  });

  it("rounds down to the decade at 41 days", () => {
    renderApp(<AgeFlag days={41} />);
    expect(screen.getByText("40+ days")).toBeTruthy();
  });

  it("uses the warning tint with its dark variant", () => {
    const { container } = renderApp(<AgeFlag days={95} />);
    const flag = container.querySelector("span")!;
    expect(flag.className).toContain("bg-warning/10");
    expect(flag.className).toContain("dark:bg-warning/8");
    expect(flag.className).toContain("text-warning");
    expect(screen.getByText("90+ days")).toBeTruthy();
  });
});
