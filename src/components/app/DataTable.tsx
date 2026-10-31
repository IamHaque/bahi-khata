import * as React from "react";
import { ArrowDown, ArrowUp, SearchX } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { TableCard, type TableCardSpec } from "./TableCard";
import { TableFooter } from "./TableFooter";
import { ErrorState } from "./ErrorState";
import { Skeleton } from "./Skeleton";
import { cn } from "@/lib/utils";

// Re-export RowActionsMenu and RowActionCluster for backwards compatibility (PRD U-02)
export {
  RowActions,
  type RowAction,
  type RowActionsProps,
} from "./RowActions";
export {
  RowActionsMenu,
  RowActionCluster,
  type RowActionItem,
} from "./RowActionsCompat";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  width?: "fit" | "fill";
  priority?: 1 | 2 | 3;
  fold?: (row: T) => React.ReactNode;
  sortable?: boolean;
  sortKey?: string;
  sortValue?: (row: T) => string | number;
  className?: string;
  render: (row: T) => React.ReactNode;
}

export interface TableSelectable<T> {
  getId: (row: T) => string;
  selected: Set<string> | string[];
  onChange: (selected: string[]) => void;
  canSelect?: (row: T) => boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  density?: "comfortable" | "compact";
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyState?: React.ReactNode;
  noResultsState?: React.ReactNode;
  onClearFilters?: () => void;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: string, dir: "asc" | "desc") => void;
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizes?: number[];
  onRowClick?: (row: T) => void;
  renderRowActions?: (row: T) => React.ReactNode;
  renderMobileCard?: (row: T) => React.ReactNode;
  mobile?: (row: T) => TableCardSpec;
  selectable?: TableSelectable<T>;
  topRow?: React.ReactNode;
  totals?: React.ReactNode;
  footer?: React.ReactNode;
  footerMode?: "pagination" | "more";
  onShowMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  resultCount?: number;
  className?: string;
}

function getPriorityClass(priority?: 1 | 2 | 3): string {
  if (priority === 3) return "hidden xl:table-cell";
  if (priority === 2) return "hidden lg:table-cell";
  return "";
}

function getWidthClass(width?: "fit" | "fill"): string {
  if (width === "fill") return "w-full";
  if (width === "fit") return "w-px whitespace-nowrap";
  return "";
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  density = "comfortable",
  loading = false,
  error,
  onRetry,
  emptyState,
  noResultsState,
  onClearFilters,
  sortBy,
  sortDir,
  onSortChange,
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizes,
  onRowClick,
  renderRowActions,
  renderMobileCard,
  mobile,
  selectable,
  topRow,
  totals,
  footer,
  footerMode = "pagination",
  onShowMore,
  hasMore = false,
  loadingMore = false,
  resultCount,
  className,
}: DataTableProps<T>) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  const handleSort = (column: Column<T>) => {
    if (!column.sortable || !onSortChange) return;
    const key = column.sortKey ?? column.key;
    const nextDir = sortBy === key && sortDir === "asc" ? "desc" : "asc";
    onSortChange(key, nextDir);
  };

  const showingCount = resultCount ?? totalCount ?? rows.length;

  // Sizing styles
  const cellPadding = density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";
  const cellTextSize = density === "compact" ? "text-xs" : "text-sm";

  // Folded columns (priority 2 and 3 columns that have a fold function)
  const foldedColumns = columns.filter(
    (col) => (col.priority === 2 || col.priority === 3) && typeof col.fold === "function",
  );

  // Selection helpers
  const isSelected = (row: T) => {
    if (!selectable) return false;
    const id = selectable.getId(row);
    if (selectable.selected instanceof Set) {
      return selectable.selected.has(id);
    }
    return (selectable.selected as string[]).includes(id);
  };

  const handleSelectRow = (row: T, checked: boolean) => {
    if (!selectable) return;
    const id = selectable.getId(row);
    const current = Array.from(selectable.selected);
    const next = checked ? [...current, id] : current.filter((x) => x !== id);
    selectable.onChange(next);
  };

  const selectableRows = selectable?.canSelect
    ? rows.filter(selectable.canSelect)
    : rows;
  const allSelected =
    selectableRows.length > 0 && selectableRows.every(isSelected);

  const handleSelectAll = (checked: boolean) => {
    if (!selectable) return;
    if (checked) {
      const allIds = Array.from(
        new Set([
          ...Array.from(selectable.selected),
          ...selectableRows.map(selectable.getId),
        ]),
      );
      selectable.onChange(allIds);
    } else {
      const pageIds = new Set(selectableRows.map(selectable.getId));
      const next = Array.from(selectable.selected).filter(
        (id) => !pageIds.has(id),
      );
      selectable.onChange(next);
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="h-9">
                {selectable && <TableHead className="w-px px-3 bg-muted/60" />}
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "sticky top-0 z-10 bg-muted/60 text-xs font-medium text-muted-foreground",
                      getPriorityClass(col.priority),
                      getWidthClass(col.width),
                      cellPadding,
                      col.className,
                    )}
                  >
                    {col.header}
                  </TableHead>
                ))}
                {renderRowActions && (
                  <TableHead className="sticky top-0 z-10 w-px bg-muted/60 px-3" />
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                  {selectable && (
                    <TableCell className="w-px px-3">
                      <Skeleton className="size-4" />
                    </TableCell>
                  )}
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        getPriorityClass(col.priority),
                        getWidthClass(col.width),
                        cellPadding,
                        col.className,
                      )}
                    >
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                  {renderRowActions && <TableCell className="w-px px-3" />}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {footer}
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-lg border border-border bg-card p-6">
          <ErrorState message={error} onRetry={onRetry} />
          {footer}
        </div>
      );
    }

    if (rows.length === 0 && emptyState) {
      return (
        <div className="rounded-lg border border-border bg-card p-6">
          {emptyState}
          {footer}
        </div>
      );
    }

    if (rows.length === 0 && noResultsState) {
      return (
        <div className="rounded-lg border border-border bg-card p-6 space-y-3">
          {noResultsState}
          {onClearFilters && (
            <div>
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                <SearchX className="size-4" />
                Clear filters
              </Button>
            </div>
          )}
          {footer}
        </div>
      );
    }

    // Mobile cards layout (< 768 px)
    if (isMobile && (mobile || renderMobileCard)) {
      return (
        <div className="space-y-2" role="list">
          {rows.map((row) => {
            const key = getRowKey(row);
            if (mobile) {
              const cardSpec = mobile(row);
              const cardWithActions = renderRowActions
                ? { ...cardSpec, actions: cardSpec.actions ?? renderRowActions(row) }
                : cardSpec;

              return (
                <TableCard
                  key={key}
                  card={cardWithActions}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  selected={isSelected(row)}
                  onSelectChange={
                    selectable
                      ? (checked) => handleSelectRow(row, checked)
                      : undefined
                  }
                  canSelect={
                    selectable?.canSelect ? selectable.canSelect(row) : !!selectable
                  }
                />
              );
            }
            return (
              <div key={key}>
                {renderMobileCard!(row)}
              </div>
            );
          })}
          {footer}
        </div>
      );
    }

    // Full table layout
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="h-9">
              {selectable && (
                <TableHead className="w-px px-3 bg-muted/60">
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="size-4 rounded border-input text-primary focus:ring-ring"
                  />
                </TableHead>
              )}
              {columns.map((col) => {
                const sortActive = (col.sortKey ?? col.key) === sortBy;
                return (
                  <TableHead
                    key={col.key}
                    aria-sort={
                      col.sortable
                        ? sortActive
                          ? sortDir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                        : undefined
                    }
                    className={cn(
                      "sticky top-0 z-10 bg-muted/60 text-xs font-medium text-muted-foreground",
                      col.sortable &&
                        (sortActive
                          ? "cursor-pointer bg-accent-wash font-medium text-primary"
                          : "cursor-pointer hover:bg-accent-wash"),
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      getPriorityClass(col.priority),
                      getWidthClass(col.width),
                      cellPadding,
                      col.className,
                    )}
                    {...(col.sortable
                      ? {
                          onClick: () => handleSort(col),
                          role: "columnheader" as const,
                          tabIndex: 0,
                          onKeyDown: (e: React.KeyboardEvent) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              handleSort(col);
                            }
                          },
                        }
                      : { scope: "col" as const })}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 font-medium",
                        col.align === "right" && "flex-row-reverse",
                      )}
                    >
                      {col.header}
                      {sortActive &&
                        (sortDir === "asc" ? (
                          <ArrowUp className="size-3 text-foreground" />
                        ) : (
                          <ArrowDown className="size-3 text-foreground" />
                        ))}
                    </span>
                  </TableHead>
                );
              })}
              {renderRowActions && (
                <TableHead className="sticky top-0 z-10 w-px bg-muted/60 px-3" />
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {topRow}
            {rows.map((row) => (
              <TableRow
                key={getRowKey(row)}
                className={cn(onRowClick && "cursor-pointer hover:bg-muted/30")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {selectable && (
                  <TableCell
                    className="w-px px-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected(row)}
                      disabled={
                        selectable.canSelect
                          ? !selectable.canSelect(row)
                          : false
                      }
                      onChange={(e) => handleSelectRow(row, e.target.checked)}
                      className="size-4 rounded border-input text-primary focus:ring-ring"
                    />
                  </TableCell>
                )}
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      cellPadding,
                      cellTextSize,
                      col.align === "right" && "text-right tabular-nums",
                      col.align === "center" && "text-center",
                      getPriorityClass(col.priority),
                      getWidthClass(col.width),
                      col.className,
                    )}
                  >
                    {col.render(row)}
                    {/* Priority folding: when col.width === 'fill', render folded secondary lines */}
                    {col.width === "fill" &&
                      foldedColumns.map((foldedCol) => (
                        <div
                          key={foldedCol.key}
                          className={cn(
                            "text-xs text-muted-foreground mt-0.5",
                            foldedCol.priority === 3
                              ? "block xl:hidden"
                              : "block lg:hidden",
                          )}
                        >
                          {foldedCol.fold!(row)}
                        </div>
                      ))}
                  </TableCell>
                ))}
                {renderRowActions && (
                  <TableCell
                    className="w-px whitespace-nowrap px-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {renderRowActions(row)}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
          {totals && <tfoot>{totals}</tfoot>}
        </Table>
        {footer}
      </div>
    );
  };

  const defaultFooter =
    totalCount !== undefined && !loading && !error ? (
      <TableFooter
        mode={footerMode}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        displayedCount={rows.length}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSizes={pageSizes}
        onShowMore={onShowMore}
        hasMore={hasMore}
        loadingMore={loadingMore}
      />
    ) : null;

  return (
    <div className={cn("space-y-2", className)}>
      {/* S-40: screen reader status announcement */}
      <p className="sr-only" role="status">
        Showing {rows.length} of {showingCount}
        {sortBy && onSortChange
          ? `, sorted by ${
              columns.find(
                (column) => (column.sortKey ?? column.key) === sortBy,
              )?.header ?? sortBy
            }, ${sortDir === "asc" ? "ascending" : "descending"}`
          : ""}
      </p>

      {renderContent()}
      {defaultFooter}
    </div>
  );
}
