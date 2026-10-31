import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IconButton } from "@/components/app/IconButton";
import { Pencil, Trash2 } from "lucide-react";

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules" && entry !== "dist") {
        files.push(...walk(full));
      }
    } else if (
      (full.endsWith(".tsx") || full.endsWith(".ts")) &&
      !full.includes(".test.") &&
      !full.includes("__tests__")
    ) {
      files.push(full);
    }
  }
  return files;
}

const srcDir = path.resolve(__dirname, "..");
const scannedFiles = walk(srcDir);

describe("IconButton and Tooltip Guard (U-01)", () => {
  it("renders an icon button with tooltip and accessible label", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delay={0} closeDelay={0}>
        <IconButton
          icon={<Pencil data-testid="pencil-icon" />}
          label="Edit"
          ariaLabel="Edit charge of ₹500.00"
          onClick={() => {}}
        />
      </TooltipProvider>,
    );

    const button = screen.getByRole("button", { name: "Edit charge of ₹500.00" });
    expect(button).toBeTruthy();
    expect(button.className).toContain("touch-target");

    await user.hover(button);
    const tooltip = await screen.findByText("Edit");
    expect(tooltip).toBeTruthy();
    expect(tooltip.className).toContain("bg-popover");
    expect(tooltip.className).toContain("border-border");
  });

  it("renders tooltip for disabled icon button", async () => {
    const user = userEvent.setup();
    render(
      <TooltipProvider delay={0} closeDelay={0}>
        <IconButton
          icon={<Pencil data-testid="pencil-icon" />}
          label="Disabled action"
          disabled
        />
      </TooltipProvider>,
    );

    // When disabled, the trigger wrapper remains accessible to hover/focus
    const trigger = screen.getByRole("button", { name: "Disabled action" });
    expect(trigger).toBeTruthy();

    await user.hover(trigger);
    const tooltip = await screen.findByText("Disabled action");
    expect(tooltip).toBeTruthy();
  });

  it("applies destructive tone styling", () => {
    render(
      <TooltipProvider delay={0} closeDelay={0}>
        <IconButton
          icon={<Trash2 data-testid="trash-icon" />}
          label="Delete"
          tone="destructive"
        />
      </TooltipProvider>,
    );

    const button = screen.getByRole("button", { name: "Delete" });
    expect(button.className).toContain("text-destructive");
  });

  it("no raw icon-only button in src lacks an accessible name or tooltip", () => {
    // Regex checking for buttons that render ONLY an icon/svg without text or aria-label
    // or aria-labelledby
    const rawIconButtonWithoutLabel =
      /<button\b(?![^>]*\b(aria-label|aria-labelledby)\b)[^>]*>\s*<([A-Z][a-zA-Z0-9]*|svg)\b[^>]*\/>\s*<\/button>/s;

    const offenders: string[] = [];
    for (const file of scannedFiles) {
      const content = readFileSync(file, "utf8");
      if (rawIconButtonWithoutLabel.test(content)) {
        offenders.push(path.relative(srcDir, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
