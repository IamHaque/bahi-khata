import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/app-render";
import { __setMatchMedia } from "@/test/setup";
import {
  DataTable,
  type Column,
} from "@/components/app/DataTable";

interface Row {
  id: string;
  name: string;
  amount: number;
}

const rows: Row[] = [
  { id: "1", name: "Asha", amount: 500 },
  { id: "2", name: "Rahim", amount: 1200 },
];

const columns: Column<Row>[] = [
  {
    key: "name",
    header: "Name",
    width: "fill",
    sortable: true,
    render: (row) => <span>{row.name}</span>,
    sortValue: (row) => row.name,
  },
  {
    key: "amount",
    header: "Amount",
    width: "fit",
    align: "right",
    sortable: true,
    render: (row) => <span>₹{row.amount}</span>,
    sortValue: (row) => row.amount,
  },
];

const baseProps = {
  columns,
  rows,
  getRowKey: (row: Row) => row.id,
};

describe("DataTable", () => {
  it("renders columns and rows", () => {
    renderApp(<DataTable {...baseProps} />);
    expect(screen.getByText("Asha")).toBeTruthy();
    expect(screen.getByText("Rahim")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeTruthy();
  });

  it("has a sticky header", () => {
    renderApp(<DataTable {...baseProps} />);
    const header = screen.getByRole("columnheader", { name: /name/i });
    expect(header.className).toContain("sticky");
    expect(header.className).toContain("top-0");
  });

  it("emits sort changes and announces the sort direction", async () => {
    const onSortChange = vi.fn();
    renderApp(<DataTable {...baseProps} sortBy="name" sortDir="asc" onSortChange={onSortChange} />);

    const header = screen.getByRole("columnheader", { name: /name/i });
    expect(header.getAttribute("aria-sort")).toBe("ascending");

    await userEvent.click(header);
    expect(onSortChange).toHaveBeenCalledWith("name", "desc");
  });

  it("starts a new column sort as ascending", async () => {
    const onSortChange = vi.fn();
    renderApp(<DataTable {...baseProps} onSortChange={onSortChange} />);

    await userEvent.click(screen.getByRole("columnheader", { name: /amount/i }));
    expect(onSortChange).toHaveBeenCalledWith("amount", "asc");
  });

  it("shows skeleton rows while loading", () => {
    renderApp(<DataTable {...baseProps} loading />);
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("Asha")).toBeNull();
  });

  it("shows the empty state slot when there are no rows", () => {
    renderApp(
      <DataTable {...baseProps} rows={[]} emptyState={<p>No customers yet</p>} />,
    );
    expect(screen.getByText("No customers yet")).toBeTruthy();
  });

  it("shows the no-results slot with a Clear filters action", () => {
    const onClearFilters = vi.fn();
    renderApp(
      <DataTable
        {...baseProps}
        rows={[]}
        noResultsState={<p>No matches</p>}
        onClearFilters={onClearFilters}
      />,
    );
    expect(screen.getByText("No matches")).toBeTruthy();
    return userEvent
      .click(screen.getByRole("button", { name: /clear filters/i }))
      .then(() => expect(onClearFilters).toHaveBeenCalledTimes(1));
  });

  it("shows ErrorState with retry on error", async () => {
    const onRetry = vi.fn();
    renderApp(
      <DataTable {...baseProps} rows={[]} error="Could not load" onRetry={onRetry} />,
    );
    expect(screen.getByText("Could not load")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("calls onRowClick when a row is clicked", async () => {
    const onRowClick = vi.fn();
    renderApp(<DataTable {...baseProps} onRowClick={onRowClick} />);
    await userEvent.click(screen.getByText("Asha"));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it("announces the result count in a live region", () => {
    renderApp(<DataTable {...baseProps} totalCount={340} pageSize={10} page={1} />);
    expect(screen.getByRole("status").textContent).toContain("Showing 2 of 340");
  });

  it("renders pagination controls and emits page changes", async () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    renderApp(
      <DataTable
        {...baseProps}
        totalCount={340}
        pageSize={10}
        page={2}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    expect(screen.getByText("Showing 11–20 of 340")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);

    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("renders rows as cards on narrow screens", async () => {
    __setMatchMedia(true);
    try {
      renderApp(
        <DataTable
          {...baseProps}
          mobile={(row) => ({ title: `${row.name} card` })}
        />,
      );
      await waitFor(() => expect(screen.getByText("Asha card")).toBeTruthy());
      expect(screen.queryByRole("columnheader")).toBeNull();
    } finally {
      __setMatchMedia(false);
    }
  });
});

describe("DataTable v2 (U-02)", () => {
  it("applies fit and fill column classes", () => {
    const v2Cols: Column<Row>[] = [
      { key: "name", header: "Name", width: "fill", render: (r) => r.name },
      { key: "amount", header: "Amount", width: "fit", render: (r) => `₹${r.amount}` },
    ];
    renderApp(<DataTable {...baseProps} columns={v2Cols} />);
    const nameHeader = screen.getByRole("columnheader", { name: "Name" });
    const amountHeader = screen.getByRole("columnheader", { name: "Amount" });

    expect(nameHeader.className).toContain("w-full");
    expect(amountHeader.className).toContain("w-px");
  });

  it("applies priority hiding classes and folds hidden column content into the fill column", () => {
    const v2Cols: Column<Row>[] = [
      { key: "name", header: "Name", width: "fill", render: (r) => r.name },
      {
        key: "amount",
        header: "Amount",
        priority: 2,
        render: (r) => `₹${r.amount}`,
        fold: (r) => `Folded amount: ₹${r.amount}`,
      },
    ];
    renderApp(<DataTable {...baseProps} columns={v2Cols} />);
    const amountHeader = screen.getByRole("columnheader", { name: "Amount" });
    expect(amountHeader.className).toContain("hidden lg:table-cell");

    expect(screen.getByText("Folded amount: ₹500")).toBeTruthy();
  });

  it("renders topRow and totals slots inside the table", () => {
    renderApp(
      <DataTable
        {...baseProps}
        topRow={<tr data-testid="test-top-row"><td>Top</td></tr>}
        totals={<tr data-testid="test-totals"><td>Totals</td></tr>}
      />,
    );
    expect(screen.getByTestId("test-top-row")).toBeTruthy();
    expect(screen.getByTestId("test-totals")).toBeTruthy();
  });

  it("renders compact density padding when requested", () => {
    renderApp(<DataTable {...baseProps} density="compact" />);
    const cell = screen.getByText("Asha").closest("td");
    expect(cell?.className).toContain("py-1.5");
  });

  it("supports selectable rows and select-all checkbox", async () => {
    const user = userEvent.setup();
    const onSelectChange = vi.fn();
    renderApp(
      <DataTable
        {...baseProps}
        selectable={{
          getId: (r) => r.id,
          selected: ["1"],
          onChange: onSelectChange,
        }}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(3);
    expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
    expect((checkboxes[2] as HTMLInputElement).checked).toBe(false);

    await user.click(checkboxes[2]!);
    expect(onSelectChange).toHaveBeenCalledWith(["1", "2"]);
  });

  it("renders TableFooter in more mode", () => {
    const onShowMore = vi.fn();
    renderApp(
      <DataTable
        {...baseProps}
        totalCount={10}
        footerMode="more"
        hasMore={true}
        onShowMore={onShowMore}
      />,
    );
    expect(screen.getAllByText("Showing 2 of 10").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Show more" })).toBeTruthy();
  });

  describe("fill column invariant", () => {
    it("throws an error when zero columns have width fill", () => {
      const zeroFillCols: Column<Row>[] = [
        { key: "a", header: "A", width: "fit", render: (r) => r.name },
        { key: "b", header: "B", width: "fit", render: (r) => r.amount },
      ];
      expect(() =>
        renderApp(<DataTable {...baseProps} columns={zeroFillCols} />),
      ).toThrow("DataTable must have exactly one fill column");
    });

    it("throws an error when two columns have width fill", () => {
      const twoFillCols: Column<Row>[] = [
        { key: "a", header: "A", width: "fill", render: (r) => r.name },
        { key: "b", header: "B", width: "fill", render: (r) => r.amount },
      ];
      expect(() =>
        renderApp(<DataTable {...baseProps} columns={twoFillCols} />),
      ).toThrow("DataTable must have exactly one fill column");
    });

    it("renders successfully when exactly one column has width fill and stamps data-width", () => {
      renderApp(<DataTable {...baseProps} />);
      const nameTh = screen.getByRole("columnheader", { name: /name/i });
      const amountTh = screen.getByRole("columnheader", { name: /amount/i });
      expect(nameTh.getAttribute("data-width")).toBe("fill");
      expect(amountTh.getAttribute("data-width")).toBe("fit");
    });
  });
});
