import { ArrowDown, ArrowUp } from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: string, dir: "asc" | "desc") => void;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  loadingRowCount?: number;
  emptyState?: React.ReactNode;
  noResultsState?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  sortBy,
  sortDir,
  onSortChange,
  onRowClick,
  loading,
  loadingRowCount = 5,
  emptyState,
  noResultsState,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.align === "right" ? "text-right" : ""}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: loadingRowCount }, (_, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    <div className="h-4 animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (rows.length === 0 && emptyState) {
    return (
      <div className="rounded-md border border-border bg-muted/50 px-6 py-12 text-center">
        {emptyState}
      </div>
    );
  }

  if (rows.length === 0 && noResultsState) {
    return (
      <div className="rounded-md border border-border bg-muted/50 px-6 py-8 text-center text-sm text-muted-foreground">
        {noResultsState}
      </div>
    );
  }

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    const newDir = sortBy === key && sortDir === "asc" ? "desc" : "asc";
    onSortChange(key, newDir);
  };

  const handleKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleSort(key);
    }
  };

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => {
              const isActive = sortBy === col.key;
              const ariaSort = isActive
                ? sortDir === "asc"
                  ? "ascending"
                  : "descending"
                : "none";

              return (
                <TableHead
                  key={col.key}
                  className={`${col.align === "right" ? "text-right" : ""} ${
                    col.sortable
                      ? isActive
                        ? "cursor-pointer bg-accent-wash font-medium text-primary"
                        : "cursor-pointer hover:bg-accent-wash"
                      : ""
                  }`}
                  {...(col.sortable
                    ? {
                        onClick: () => handleSort(col.key),
                        onKeyDown: (e: React.KeyboardEvent) => handleKeyDown(e, col.key),
                        tabIndex: 0,
                        role: "columnheader" as const,
                        "aria-sort": ariaSort as "ascending" | "descending" | "none",
                      }
                    : { scope: "col" as const })}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && isActive && (
                      sortDir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      )
                    )}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={getRowKey(row)}
              {...(onRowClick
                ? {
                    onClick: () => onRowClick(row),
                    className: "cursor-pointer",
                  }
                : {})}
            >
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={col.align === "right" ? "text-right" : ""}
                >
                  {col.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
