import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pencil, Ban, Trash2, RotateCcw } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RowActions, type RowAction } from "../RowActions";

function renderWithTooltip(ui: React.ReactNode) {
  return render(
    <TooltipProvider delay={0} closeDelay={0}>
      {ui}
    </TooltipProvider>,
  );
}

describe("RowActions (U-02)", () => {
  it("renders at most two non-destructive actions inline on a fine pointer", () => {
    const editFn = vi.fn();
    const voidFn = vi.fn();
    const actions: RowAction[] = [
      { id: "edit", label: "Edit", icon: Pencil, onSelect: editFn },
      { id: "void", label: "Void", icon: Ban, onSelect: voidFn },
    ];

    renderWithTooltip(<RowActions actions={actions} />);

    // Both inline buttons exist
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Void" })).toBeTruthy();
    // No More actions menu needed
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  });

  it("places destructive actions in the More actions menu after a divider", async () => {
    const user = userEvent.setup();
    const editFn = vi.fn();
    const deleteFn = vi.fn();
    const actions: RowAction[] = [
      { id: "edit", label: "Edit", icon: Pencil, onSelect: editFn },
      { id: "delete", label: "Delete", icon: Trash2, onSelect: deleteFn, destructive: true },
    ];

    renderWithTooltip(<RowActions actions={actions} />);

    // Non-destructive inline
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    // Destructive is inside the More menu
    const moreBtn = screen.getByRole("button", { name: "More actions" });
    expect(moreBtn).toBeTruthy();

    await user.click(moreBtn);
    const deleteItem = screen.getByRole("menuitem", { name: "Delete" });
    expect(deleteItem).toBeTruthy();
    expect(deleteItem.className).toContain("text-destructive");
  });

  it("renders first two non-destructive inline and remainder in More menu when >2", async () => {
    const user = userEvent.setup();
    const actions: RowAction[] = [
      { id: "edit", label: "Edit", icon: Pencil, onSelect: vi.fn() },
      { id: "void", label: "Void", icon: Ban, onSelect: vi.fn() },
      { id: "restore", label: "Restore", icon: RotateCcw, onSelect: vi.fn() },
      { id: "delete", label: "Delete", icon: Trash2, onSelect: vi.fn(), destructive: true },
    ];

    renderWithTooltip(<RowActions actions={actions} />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Void" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();

    const moreBtn = screen.getByRole("button", { name: "More actions" });
    await user.click(moreBtn);

    expect(screen.getByRole("menuitem", { name: "Restore" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();
  });

  it("collapses all actions into single More menu when inCard is true", async () => {
    const user = userEvent.setup();
    const actions: RowAction[] = [
      { id: "edit", label: "Edit", icon: Pencil, onSelect: vi.fn() },
      { id: "void", label: "Void", icon: Ban, onSelect: vi.fn() },
    ];

    renderWithTooltip(<RowActions actions={actions} inCard={true} />);

    // None inline
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Void" })).toBeNull();

    const moreBtn = screen.getByRole("button", { name: "More actions" });
    await user.click(moreBtn);

    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Void" })).toBeTruthy();
  });

  it("skips hidden actions completely", () => {
    const actions: RowAction[] = [
      { id: "edit", label: "Edit", icon: Pencil, onSelect: vi.fn(), hidden: true },
      { id: "void", label: "Void", icon: Ban, onSelect: vi.fn() },
    ];

    renderWithTooltip(<RowActions actions={actions} />);

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.getByRole("button", { name: "Void" })).toBeTruthy();
  });

  it("supports disabledReason inline and in the More actions menu", async () => {
    const user = userEvent.setup();
    const actions: RowAction[] = [
      {
        id: "edit",
        label: "Edit",
        icon: Pencil,
        onSelect: vi.fn(),
        disabled: true,
        disabledReason: "Entry is reconciled",
      },
      {
        id: "delete",
        label: "Delete",
        icon: Trash2,
        onSelect: vi.fn(),
        destructive: true,
        disabled: true,
        disabledReason: "Only owner can delete",
      },
    ];

    renderWithTooltip(<RowActions actions={actions} />);

    // Inline disabled action has reason in accessible name and tooltip
    const inlineTrigger = screen.getByRole("button", {
      name: "Edit: Entry is reconciled",
    });
    expect(inlineTrigger).toBeTruthy();
    expect(inlineTrigger.getAttribute("aria-disabled")).toBe("true");

    await user.hover(inlineTrigger);
    expect(await screen.findByText("Edit: Entry is reconciled")).toBeTruthy();

    // Menu disabled action displays reason as second line with aria-describedby
    const moreBtn = screen.getByRole("button", { name: "More actions" });
    await user.click(moreBtn);

    const deleteItem = screen.getByRole("menuitem", {
      name: /Delete.*Only owner can delete/,
    });
    expect(deleteItem).toBeTruthy();
    expect(deleteItem.getAttribute("aria-describedby")).toBe(
      "action-reason-delete",
    );

    const reasonEl = screen.getByText("Only owner can delete");
    expect(reasonEl.id).toBe("action-reason-delete");
    expect(reasonEl.className).toContain("text-muted-foreground");
  });

  it("keeps menuOnly actions in More menu even when fewer than 2 inline actions exist", async () => {
    const user = userEvent.setup();
    const editFn = vi.fn();
    const transferFn = vi.fn();
    const actions: RowAction[] = [
      { id: "edit", label: "Edit", icon: Pencil, onSelect: editFn },
      { id: "transfer", label: "Make owner…", icon: RotateCcw, onSelect: transferFn, menuOnly: true },
    ];

    renderWithTooltip(<RowActions actions={actions} />);

    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Make owner…" })).toBeNull();
    const moreBtn = screen.getByRole("button", { name: "More actions" });
    expect(moreBtn).toBeTruthy();

    await user.click(moreBtn);
    const transferItem = screen.getByRole("menuitem", { name: "Make owner…" });
    expect(transferItem).toBeTruthy();
  });
});
