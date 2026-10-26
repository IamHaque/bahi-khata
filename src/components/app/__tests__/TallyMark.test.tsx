import { describe, expect, it } from "vitest";
import { TallyMark } from "@/components/app/TallyMark";
import { renderApp } from "@/test/app-render";

describe("TallyMark (L-04)", () => {
  it("renders the four-by-one tally as a decorative svg", () => {
    const { container } = renderApp(<TallyMark className="size-8" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg.querySelector("path")!.getAttribute("d")).toContain("M5 4v16");
  });

  it("passes its className through for sizing", () => {
    const { container } = renderApp(
      <TallyMark className="mb-3 size-8 text-muted-foreground" />,
    );
    const svg = container.querySelector("svg")!;
    expect(svg.className.baseVal ?? svg.getAttribute("class")).toContain("size-8");
  });
});
