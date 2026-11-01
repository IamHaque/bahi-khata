import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/app-render";
import { expectNoSeriousViolations } from "@/test/a11y";
import { BulkActionBar } from "@/components/app/BulkActionBar";
import { BulkConfirmDialog } from "@/components/app/BulkConfirmDialog";
import { DataTable, type Column } from "@/components/app/DataTable";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface TestRow {
  id: string;
  name: string;
  amount: number;
}

const testRows: TestRow[] = [
  { id: "1", name: "Alpha", amount: 100 },
  { id: "2", name: "Beta", amount: 200 },
  { id: "3", name: "Gamma", amount: 300 },
  { id: "4", name: "Delta", amount: 400 },
  { id: "5", name: "Epsilon", amount: 500 },
];

const testColumns: Column<TestRow>[] = [
  { key: "name", header: "Name", width: "fill", render: (r) => r.name },
  { key: "amount", header: "Amount", width: "fit", render: (r) => r.amount },
];

describe("BulkActionBar", () => {
  it("renders count in aria-live polite region and clears on Escape", async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    const { container } = renderApp(
      <BulkActionBar selectedCount={3} onClear={onClear}>
        <Button size="sm">Action</Button>
      </BulkActionBar>,
    );

    const liveRegion = screen.getByText("3 selected");
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");

    const clearButton = screen.getByRole("button", { name: "Clear" });
    await user.click(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onClear).toHaveBeenCalledTimes(2);

    await expectNoSeriousViolations(container);
  });

  it("does not render when selectedCount is 0", () => {
    const { container } = renderApp(
      <BulkActionBar selectedCount={0} onClear={vi.fn()}>
        <Button size="sm">Action</Button>
      </BulkActionBar>,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("BulkConfirmDialog", () => {
  it("shows up to 5 items, 'and n more', and disables confirm until typed match", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const items = [
      "Item 1",
      "Item 2",
      "Item 3",
      "Item 4",
      "Item 5",
      "Item 6",
      "Item 7",
    ];

    const { container } = renderApp(
      <BulkConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete items?"
        items={items}
        totalSummary="Total: 7 items"
        confirmLabel="Delete 7 items"
        tone="destructive"
        requireTypedConfirmation={true}
        expectedConfirmation="DELETE 7"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Selected 7 items:")).toBeTruthy();
    expect(screen.getByText("Item 1")).toBeTruthy();
    expect(screen.getByText("Item 5")).toBeTruthy();
    expect(screen.getByText("and 2 more")).toBeTruthy();
    expect(screen.getByText("Total: 7 items")).toBeTruthy();

    const confirmBtn = screen.getByRole("button", { name: "Delete 7 items" }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    const input = screen.getByLabelText(/To confirm, type/);
    await user.type(input, "DELETE 6");
    expect(confirmBtn.disabled).toBe(true);

    await user.clear(input);
    await user.type(input, "DELETE 7");
    expect(confirmBtn.disabled).toBe(false);

    await user.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await expectNoSeriousViolations(container);
  });
});

describe("DataTable Bulk Selection", () => {
  function SelectableTable() {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <div>
        <DataTable
          columns={testColumns}
          rows={testRows}
          getRowKey={(r) => r.id}
          selectable={{
            getId: (r) => r.id,
            selected,
            onChange: setSelected,
            getRowLabel: (r) => r.name,
          }}
        />
        <div data-testid="selected-ids">{selected.join(",")}</div>
      </div>
    );
  }

  it("selects all rows via header checkbox and updates indeterminate state", async () => {
    const user = userEvent.setup();
    const { container } = renderApp(<SelectableTable />);

    const checkboxes = screen.getAllByRole("checkbox");
    // header checkbox + 5 rows = 6 checkboxes
    expect(checkboxes.length).toBe(6);

    const headerCheckbox = checkboxes[0]!;
    expect(headerCheckbox.getAttribute("aria-checked")).toBe("false");

    // Click row 1
    await user.click(checkboxes[1]!);
    expect(screen.getByTestId("selected-ids").textContent).toBe("1");
    expect(headerCheckbox.getAttribute("aria-checked")).toBe("mixed");

    // Click header checkbox to select all
    await user.click(headerCheckbox);
    expect(screen.getByTestId("selected-ids").textContent).toBe("1,2,3,4,5");
    expect(headerCheckbox.getAttribute("aria-checked")).toBe("true");

    // Click header checkbox again to deselect all
    await user.click(headerCheckbox);
    expect(screen.getByTestId("selected-ids").textContent).toBe("");
    expect(headerCheckbox.getAttribute("aria-checked")).toBe("false");

    await expectNoSeriousViolations(container);
  });

  it("supports Shift+click range selection across rows", async () => {
    const user = userEvent.setup();
    renderApp(<SelectableTable />);

    const checkboxes = screen.getAllByRole("checkbox");
    // Click row 2 (index 1 in rows, index 2 in checkboxes)
    await user.click(checkboxes[2]!);
    expect(screen.getByTestId("selected-ids").textContent).toBe("2");

    // Shift+click row 4 (index 3 in rows, index 4 in checkboxes)
    await user.keyboard("{Shift>}");
    await user.click(checkboxes[4]!);
    await user.keyboard("{/Shift}");

    // Should now contain rows 2, 3, 4
    expect(screen.getByTestId("selected-ids").textContent).toBe("2,3,4");
  });
});
