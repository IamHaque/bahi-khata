import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IconButton } from "../IconButton";
import { Pencil } from "lucide-react";

function renderWithTooltip(ui: React.ReactNode) {
  return render(
    <TooltipProvider delay={0} closeDelay={0}>
      {ui}
    </TooltipProvider>,
  );
}

describe("IconButton", () => {
  it("renders with accessible label and opens tooltip on hover", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithTooltip(
      <IconButton
        icon={<Pencil />}
        label="Edit"
        ariaLabel="Edit customer"
        onClick={onClick}
      />,
    );

    const button = screen.getByRole("button", { name: "Edit customer" });
    expect(button).toBeTruthy();

    await user.hover(button);
    expect(await screen.findByText("Edit")).toBeTruthy();

    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("handles disabledReason on disabled button with single accessible control", async () => {
    const user = userEvent.setup();
    renderWithTooltip(
      <IconButton
        icon={<Pencil />}
        label="Edit"
        ariaLabel="Edit customer"
        disabled
        disabledReason="Only owners can edit"
      />,
    );

    // Only one accessible button control is exposed to the accessibility tree
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);

    const trigger = buttons[0]!;
    expect(trigger.getAttribute("aria-disabled")).toBe("true");
    expect(trigger.getAttribute("aria-label")).toBe(
      "Edit customer: Only owners can edit",
    );

    // Hover reveals tooltip combining label and reason
    await user.hover(trigger);
    expect(
      await screen.findByText("Edit: Only owners can edit"),
    ).toBeTruthy();

    // Inner button is hidden from accessibility tree
    const innerButton = trigger.querySelector("button");
    expect(innerButton?.getAttribute("aria-hidden")).toBe("true");
    expect(innerButton?.getAttribute("tabindex")).toBe("-1");
    expect(innerButton?.hasAttribute("aria-label")).toBe(false);
  });
});
