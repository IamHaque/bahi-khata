import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/app-render";
import { Switch } from "@/components/ui/switch";
import { expectNoSeriousViolations } from "@/test/a11y";

// L-14 (F2 regression guard) — the switch must keep its compact visual
// pill (h-5 w-9 = 20x36) and rely on the shared .touch-target pseudo for
// its 44x44 tap area on coarse pointers. Inflating the element itself with
// pointer-coarse:min-h-11 / min-w-11 distorted it into a 44x44 circle on
// touch, so this pins BOTH: the real box stays small, and the touch
// enlargement comes from .touch-target (never from a min-* size utility).
describe("Switch (L-14 F2: compact pill + touch-target, no distortion)", () => {
  it("keeps the visual pill at h-5 w-9 and carries .touch-target", () => {
    renderApp(<Switch checked={false} onCheckedChange={() => {}} />);

    const cls = screen.getByRole("switch").className;
    expect(cls).toContain("h-5");
    expect(cls).toContain("w-9");
    // The 44px tap area comes from the shared pseudo, not a size utility.
    expect(cls).toContain("touch-target");
  });

  it("does NOT inflate the pill with pointer-coarse min-h-11 / min-w-11", () => {
    renderApp(<Switch checked onCheckedChange={() => {}} />);

    const cls = screen.getByRole("switch").className;
    expect(cls).not.toContain("pointer-coarse:min-h-11");
    expect(cls).not.toContain("pointer-coarse:min-w-11");
    expect(cls).not.toMatch(/\bmin-h-11\b/);
    expect(cls).not.toMatch(/\bmin-w-11\b/);
  });

  it("exposes the switch role, state and toggles on click", async () => {
    const onCheckedChange = vi.fn();
    renderApp(<Switch checked={false} onCheckedChange={onCheckedChange} />);

    const sw = screen.getByRole("switch");
    expect(sw.getAttribute("role")).toBe("switch");
    expect(sw.getAttribute("aria-checked")).toBe("false");

    await userEvent.click(sw);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("passes axe (named switch, checked and unchecked)", async () => {
    const { container } = renderApp(
      <>
        <Switch checked={false} onCheckedChange={() => {}} aria-label="Include voided" />
        <Switch checked onCheckedChange={() => {}} aria-label="Dark mode" disabled />
      </>,
    );

    await expectNoSeriousViolations(container);
  });
});
