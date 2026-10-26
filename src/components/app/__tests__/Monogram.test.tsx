import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Monogram } from "@/components/app/Monogram";
import { renderApp } from "@/test/app-render";

describe("Monogram (L-04)", () => {
  it("takes the initials of a two-word name", () => {
    renderApp(<Monogram name="Asha Verma" />);
    expect(screen.getByText("AV")).toBeTruthy();
  });

  it("takes the single initial of a one-word name", () => {
    renderApp(<Monogram name="Rahim" />);
    expect(screen.getByText("R")).toBeTruthy();
  });

  it("is decorative and hidden from assistive tech", () => {
    renderApp(<Monogram name="Asha Verma" />);
    expect(screen.getByText("AV").getAttribute("aria-hidden")).toBe("true");
  });

  it("tones by balance direction", () => {
    const { container } = renderApp(
      <div>
        <Monogram name="A B" tone="receivable" />
        <Monogram name="C D" tone="credit" />
        <Monogram name="E F" />
      </div>,
    );
    const spans = container.querySelectorAll("span");
    expect(spans[0]!.className).toContain("bg-receivable/10");
    expect(spans[0]!.className).toContain("dark:bg-receivable/8");
    expect(spans[1]!.className).toContain("bg-credit/10");
    expect(spans[1]!.className).toContain("dark:bg-credit/8");
    expect(spans[2]!.className).toContain("bg-muted");
  });

  it("grows to the large size", () => {
    const { container } = renderApp(<Monogram name="A B" size="lg" />);
    expect(container.querySelector("span")!.className).toContain("size-14");
  });
});
