import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IconButton } from "@/components/app/IconButton";
import { Pencil, Trash2 } from "lucide-react";

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "__tests__" && entry !== "node_modules" && entry !== "dist" && entry !== "dev") {
        files.push(...walk(full));
      }
    } else if (
      full.endsWith(".tsx") &&
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

export function findRawIconButtons(filePath: string, code: string): string[] {
  const sf = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);

  const lucideImports = new Set<string>();
  ts.forEachChild(sf, (node) => {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      node.moduleSpecifier.text === "lucide-react"
    ) {
      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const elem of namedBindings.elements) {
          lucideImports.add(elem.name.text);
        }
      }
    }
  });

  function getTagName(node: ts.Node): string {
    const tagNameNode = ts.isJsxElement(node)
      ? node.openingElement.tagName
      : ts.isJsxSelfClosingElement(node)
      ? node.tagName
      : null;
    return tagNameNode ? tagNameNode.getText(sf) : "";
  }

  function isInsideTooltipOrIconButton(node: ts.Node): boolean {
    let p = node.parent;
    while (p) {
      if (ts.isJsxElement(p) || ts.isJsxSelfClosingElement(p)) {
        const tag = getTagName(p);
        if (tag === "Tooltip" || tag === "TooltipTrigger" || tag === "IconButton") {
          return true;
        }
      }
      p = p.parent;
    }
    return false;
  }

  function hasIcon(node: ts.Node): boolean {
    let found = false;
    function visit(n: ts.Node) {
      if (found) return;
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
        const name = getTagName(n);
        if (
          name === "svg" ||
          name.endsWith("Icon") ||
          lucideImports.has(name) ||
          name === "Avatar"
        ) {
          found = true;
          return;
        }
      }
      ts.forEachChild(n, visit);
    }
    visit(node);
    return found;
  }

  function hasVisibleText(node: ts.JsxElement): boolean {
    let found = false;
    function visit(n: ts.Node) {
      if (found) return;
      if (ts.isJsxElement(n)) {
        const classAttr = n.openingElement.attributes.properties.find(
          (p) => ts.isJsxAttribute(p) && p.name.text === "className",
        );
        const classVal =
          classAttr && ts.isJsxAttribute(classAttr) && classAttr.initializer
            ? classAttr.initializer.getText(sf)
            : "";
        if (classVal.includes("sr-only") || classVal.includes("absolute")) {
          return;
        }
      }
      if (ts.isJsxText(n) && n.getText(sf).trim().length > 0) {
        found = true;
        return;
      }
      if (ts.isJsxExpression(n) && n.expression) {
        const exprText = n.expression.getText(sf);
        if (
          !exprText.startsWith("<") &&
          !exprText.includes("Icon") &&
          exprText !== "icon" &&
          !exprText.includes("invitationCount")
        ) {
          found = true;
          return;
        }
      }
      for (const c of (n as ts.JsxElement).children ?? []) {
        visit(c);
      }
    }
    for (const c of node.children ?? []) {
      visit(c);
    }
    return found;
  }

  const offenders: string[] = [];

  function check(node: ts.Node) {
    let isCandidate = false;
    if (ts.isJsxElement(node)) {
      const tag = getTagName(node);
      const targetTags = [
        "button",
        "Button",
        "PopoverTrigger",
        "DialogClose",
        "SheetClose",
        "DialogPrimitive.Close",
        "SheetPrimitive.Close",
      ];
      if (targetTags.includes(tag)) {
        isCandidate = true;
      } else {
        const renderAttr = node.openingElement.attributes.properties.find(
          (p) => ts.isJsxAttribute(p) && p.name.text === "render",
        );
        if (
          renderAttr &&
          ts.isJsxAttribute(renderAttr) &&
          renderAttr.initializer &&
          renderAttr.initializer.getText(sf).includes("Button")
        ) {
          isCandidate = true;
        }
      }

      if (isCandidate) {
        if (hasIcon(node) && !hasVisibleText(node) && !isInsideTooltipOrIconButton(node)) {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
          offenders.push(`${path.relative(srcDir, filePath)}:${line} (<${tag}>)`);
        }
      }
    }

    ts.forEachChild(node, check);
  }

  check(sf);
  return offenders;
}

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

  it("negative test: catches synthetic raw icon button without tooltip", () => {
    const syntheticCode = `
      import { X } from "lucide-react";
      export function Bad() {
        return <button type="button"><X /></button>;
      }
    `;
    const syntheticOffenders = findRawIconButtons("src/synthetic.tsx", syntheticCode);
    expect(syntheticOffenders.length).toBeGreaterThan(0);
  });

  it("no raw icon-only button in src lacks an accessible name or tooltip", () => {
    const allOffenders: string[] = [];
    for (const file of scannedFiles) {
      const content = readFileSync(file, "utf8");
      const fileOffenders = findRawIconButtons(file, content);
      allOffenders.push(...fileOffenders);
    }

    expect(allOffenders).toEqual([]);
  });
});
