import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "@/test/app-render";
import { DataTable, type Column } from "@/components/DataTable";

interface Row {
  id: string;
  name: string;
}

const columns: Column<Row>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true,
    render: (row) => <span>{row.name}</span>,
    sortValue: (row) => row.name,
  },
  {
    key: "phone",
    header: "Phone",
    render: (row) => <span>{row.id === "1" ? "9876543210" : "9876543211"}</span>,
  },
];

const rows: Row[] = [
  { id: "1", name: "Asha Verma" },
  { id: "2", name: "Rahim Traders" },
];

describe("sample component test (harness proof)", () => {
  it("renders rows through the app-providers helper", () => {
    renderApp(
      <DataTable columns={columns} rows={rows} getRowKey={(row) => row.id} />,
    );

    expect(screen.getByText("Asha Verma")).toBeTruthy();
    expect(screen.getByText("Rahim Traders")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: /name/i })).toBeTruthy();
  });

  it("emits sort changes when a sortable header is clicked", async () => {
    const onSortChange = vi.fn();
    renderApp(
      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        sortBy="name"
        sortDir="asc"
        onSortChange={onSortChange}
      />,
    );

    await userEvent.click(screen.getByRole("columnheader", { name: /name/i }));
    expect(onSortChange).toHaveBeenCalledWith("name", "desc");
  });

  it("renders the empty state slot when there are no rows", () => {
    renderApp(
      <DataTable
        columns={columns}
        rows={[]}
        getRowKey={(row) => row.id}
        emptyState={<p>No customers found</p>}
      />,
    );

    expect(screen.getByText("No customers found")).toBeTruthy();
  });
});
