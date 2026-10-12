import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "../index.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} should exist`).toBeGreaterThan(-1);
  const end = css.indexOf("}", start);
  return css.slice(start, end);
}

const light = block(":root");
const dark = block(".dark");
const themeInline = block("@theme inline");

describe("theme tokens", () => {
  it("defines the financial semantic tokens in both themes", () => {
    for (const token of ["--receivable", "--credit", "--settled"]) {
      expect(light, `${token} in :root`).toContain(token);
      expect(dark, `${token} in .dark`).toContain(token);
    }
  });

  it("defines success and warning tokens in both themes", () => {
    for (const token of ["--success", "--warning"]) {
      expect(light, `${token} in :root`).toContain(token);
      expect(dark, `${token} in .dark`).toContain(token);
    }
  });

  it("defines chart tokens", () => {
    expect(light).toContain("--chart-1");
    expect(dark).toContain("--chart-1");
  });

  it("defines the radius scale from one radius variable", () => {
    expect(light).toContain("--radius:");
    expect(themeInline).toContain("--radius-lg: var(--radius)");
    expect(themeInline).toContain("--radius-xl: calc(var(--radius) * 1.4)");
  });

  it("enables dark mode via the .dark class", () => {
    expect(css).toContain("@custom-variant dark (&:is(.dark *))");
  });

  it("respects prefers-reduced-motion", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("loads exactly one UI font", () => {
    const fontImports = css.match(/@fontsource-variable\//g) ?? [];
    expect(fontImports).toHaveLength(1);
    expect(css).toContain("@fontsource-variable/public-sans");
  });

  it("enables tabular numerals for money", () => {
    expect(css).toContain("font-variant-numeric: tabular-nums");
  });
});
