import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { UiGallery } from "@/features/dev/UiGallery";

// The gallery must render every shared component without a single console
// error or warning - this is the "gallery cannot rot" guard from S-13.
function renderAndExpectNoConsoleErrors(theme: "light" | "dark") {
  localStorage.setItem("bahikhata-theme", theme);
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  const { unmount } = renderApp(<UiGallery />);
  expect(
    screen.getByRole("heading", { name: "UI Gallery" }),
  ).toBeTruthy();
  unmount();

  const errors = errorSpy.mock.calls.map((c) => c.map(String).join(" "));
  const warnings = warnSpy.mock.calls.map((c) => c.map(String).join(" "));
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  expect({ errors, warnings }).toEqual({ errors: [], warnings: [] });
}

describe("UI gallery cannot rot", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders in light theme with no console errors", () => {
    renderAndExpectNoConsoleErrors("light");
  });

  it("renders in dark theme with no console errors", () => {
    renderAndExpectNoConsoleErrors("dark");
  });

  // L-04: the gallery itself must clear the axe gate in both themes.
  // (Kept out of the console-error guard above: awaiting axe lets the
  // AuthProvider's async state land outside act(), which that guard
  // intentionally treats as a failure.)
  it("passes axe in light theme", async () => {
    localStorage.setItem("bahikhata-theme", "light");
    const { container, unmount } = renderApp(<UiGallery />);
    await expectNoSeriousViolations(container);
    unmount();
  });

  it("passes axe in dark theme", async () => {
    localStorage.setItem("bahikhata-theme", "dark");
    const { container, unmount } = renderApp(<UiGallery />);
    await expectNoSeriousViolations(container);
    unmount();
  });
});
