import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/app-render";
import { __setMatchMedia } from "@/test/setup";
import {
  DataTable,
  RowActionsMenu,
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
    sortable: true,
    render: (row) => <span>{row.name}</span>,
    sortValue: (row) => row.name,
  },
  {
    key: "amount",
    header: "Amount",
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
          renderMobileCard={(row) => <p>{row.name} card</p>}
        />,
      );
      await waitFor(() => expect(screen.getByText("Asha card")).toBeTruthy());
      expect(screen.queryByRole("columnheader")).toBeNull();
    } finally {
      __setMatchMedia(false);
    }
  });
});

describe("RowActionsMenu", () => {
  const items = [
    { label: "Edit", onSelect: () => {} },
    { label: "Archive", onSelect: () => {} },
  ];

  it("opens with arrow keys and moves through items", async () => {
    renderApp(<RowActionsMenu items={items} triggerLabel="Actions for Asha" />);

    const trigger = screen.getByRole("button", { name: "Actions for Asha" });
    await userEvent.click(trigger);

    const edit = await screen.findByRole("menuitem", { name: "Edit" });
    expect(edit === document.activeElement).toBe(true);

    await userEvent.keyboard("{ArrowDown}");
    const archive = screen.getByRole("menuitem", { name: "Archive" });
    expect(archive === document.activeElement).toBe(true);

    await userEvent.keyboard("{ArrowUp}");
    expect(edit === document.activeElement).toBe(true);
  });

  it("selects an item with Enter and closes", async () => {
    const onSelect = vi.fn();
    renderApp(
      <RowActionsMenu
        items={[{ label: "Edit", onSelect }]}
        triggerLabel="Actions for Asha"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Actions for Asha" }));
    await userEvent.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem")).toBeNull();
  });

  it("closes on Escape", async () => {
    renderApp(<RowActionsMenu items={items} triggerLabel="Actions for Asha" />);
    await userEvent.click(screen.getByRole("button", { name: "Actions for Asha" }));
    await screen.findByRole("menuitem", { name: "Edit" });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem")).toBeNull();
  });
});
