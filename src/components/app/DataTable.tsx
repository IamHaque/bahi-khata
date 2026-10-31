import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, MoreHorizontal, SearchX } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ErrorState } from "./ErrorState";
import { Skeleton } from "./Skeleton";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  /** Classes for the header cell and its body cells — responsive
   *  column hiding (`hidden md:table-cell`) rides here (L-08). */
  className?: string;
  /** Sort identity when it differs from the cell key: Charged and
   *  Paid both sort by the one stored amount (L-09). */
  sortKey?: string;
}

export interface RowActionItem {
  label: string;
  onSelect: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
  /** Render a divider above this item (e.g. destructive, set apart). */
  separator?: boolean;
}

export function RowActionsMenu({
  items,
  triggerLabel = "Row actions",
}: {
  items: RowActionItem[];
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusItem = (index: number) => {
    const clamped = (index + items.length) % items.length;
    itemRefs.current[clamped]?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => itemRefs.current[0]?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(index + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(index - 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={triggerLabel}
            onKeyDown={onTriggerKeyDown}
            onClick={(event) => event.stopPropagation()}
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1">
        <ul role="menu" aria-label={triggerLabel}>
          {items.map((item, i) => (
            <li key={item.label} role="none">
              {item.separator && (
                <div
                  className="my-1 border-t border-border"
                  role="separator"
                  aria-orientation="horizontal"
                />
              )}
              <button
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={cn(
                  "flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted disabled:opacity-50 pointer-coarse:min-h-11",
                  item.variant === "destructive" && "text-destructive",
                )}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                onKeyDown={(e) => onItemKeyDown(e, i)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** L-14 (F2): the row-action cluster. On a fine pointer it renders the
 *  passed `children` (the usual inline icon buttons). On a COARSE pointer
 *  those individual icon buttons collapse into ONE 44x44 "More actions"
 *  menu, so a dense action row never balloons into several 44px targets
 *  that widen the table/card. The menu items carry the same labels and
 *  handlers, so accessible names and behaviour are identical. */
export function RowActionCluster({
  items,
  triggerLabel,
  children,
}: {
  items: RowActionItem[];
  triggerLabel: string;
  children: React.ReactNode;
}) {
  const isCoarse = useMediaQuery("(pointer: coarse)");
  if (items.length === 0) return null;
  if (isCoarse) return <RowActionsMenu items={items} triggerLabel={triggerLabel} />;
  return <div className="flex items-center gap-1">{children}</div>;
}

const DEFAULT_PAGE_SIZES = [10, 25, 50];

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
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
  resultCount?: number;
  className?: string;
  /** Rendered under the rows — inside the bordered container when one
   *  is drawn (L-09's totals strip, one per branch). */
  footer?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  loading = false,
  error,
  onRetry,
  emptyState,
  noResultsState,
  onClearFilters,
  sortBy,
  sortDir,
  onSortChange,
  page = 1,
  pageSize = 10,
  totalCount,
  onPageChange,
  onPageSizeChange,
  pageSizes = DEFAULT_PAGE_SIZES,
  onRowClick,
  renderRowActions,
  renderMobileCard,
  resultCount,
  className,
  footer,
}: DataTableProps<T>) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    const newDir = sortBy === key && sortDir === "asc" ? "desc" : "asc";
    onSortChange(key, newDir);
  };

  const showingCount = resultCount ?? totalCount ?? rows.length;
  const rangeStart = totalCount !== undefined ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = totalCount !== undefined ? Math.min(page * pageSize, totalCount) : rows.length;
  const totalPages = totalCount !== undefined ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

  const table = (
    // L-14 (F1): the one container designed to scroll sideways. A wide
    // ledger table scrolls HERE (never the page), and it can never clip an
    // amount the way overflow-hidden would — the audit's truncated-amount
    // check stays clean while the page itself never scrolls horizontally.
    <div className={cn("overflow-x-auto rounded-lg border border-border bg-card", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => {
              // Two columns may share one sort key (L-09: Charged and
              // Paid both sort the stored amount).
              const sortId = col.sortKey ?? col.key;
              const isActive = sortBy === sortId;
              const ariaSort = isActive
                ? sortDir === "asc"
                  ? ("ascending" as const)
                  : ("descending" as const)
                : ("none" as const);

              return (
                <TableHead
                  key={col.key}
                  className={cn(
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    "sticky top-0 z-10 bg-muted/60 text-xs font-medium text-muted-foreground",
                    col.sortable &&
                      (isActive
                        ? "cursor-pointer bg-accent-wash font-medium text-primary"
                        : "cursor-pointer hover:bg-accent-wash"),
                    col.className,
                  )}
                  {...(col.sortable
                    ? {
                        onClick: () => handleSort(sortId),
                        role: "columnheader" as const,
                        "aria-sort": ariaSort,
                      }
                    : { scope: "col" as const })}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable &&
                      isActive &&
                      (sortDir === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3" />
                      ))}
                  </span>
                </TableHead>
              );
            })}
            {renderRowActions && <TableHead className="sticky top-0 z-10 w-10 bg-muted/60" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={getRowKey(row)}
              {...(onRowClick
                ? { onClick: () => onRowClick(row), className: "cursor-pointer" }
                : {})}
            >
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn(
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.className,
                  )}
                >
                  {col.render(row)}
                </TableCell>
              ))}
              {renderRowActions && (
                // Row actions must not activate the row itself: without
                // this a click on the menu trigger also fires onRowClick
                // and navigates away before the menu opens (surfaced by
                // S-28, the first page to combine both).
                <TableCell
                  className="w-10 text-right"
                  onClick={(event) => event.stopPropagation()}
                >
                  {renderRowActions(row)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {footer}
    </div>
  );

  return (
    <div className="space-y-2">
      {/* S-40: result counts AND sort changes reach screen readers. */}
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

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "sticky top-0 z-10 bg-muted/60 text-xs font-medium text-muted-foreground",
                      col.className,
                    )}
                  >
                    {col.header}
                  </TableHead>
                ))}
                {renderRowActions && <TableHead className="sticky top-0 z-10 w-10 bg-muted/60" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      <Skeleton className="h-4" />
                    </TableCell>
                  ))}
                  {renderRowActions && <TableCell />}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {footer}
        </div>
      ) : error ? (
        <>
          <ErrorState message={error} onRetry={onRetry} />
          {footer}
        </>
      ) : rows.length === 0 && emptyState ? (
        <>
          {emptyState}
          {footer}
        </>
      ) : rows.length === 0 && noResultsState ? (
        <>
          <div className="space-y-3">
            {noResultsState}
            {onClearFilters && (
              <div>
                <Button variant="outline" size="sm" onClick={onClearFilters}>
                  <SearchX className="size-4" />
                  Clear filters
                </Button>
              </div>
            )}
          </div>
          {footer}
        </>
      ) : isMobile && renderMobileCard ? (
        <>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={getRowKey(row)}>{renderMobileCard(row)}</div>
            ))}
          </div>
          {footer}
        </>
      ) : (
        table
      )}

      {totalCount !== undefined && !loading && !error && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <label
              htmlFor="page-size"
              className="text-xs text-muted-foreground"
            >
              Rows per page
            </label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange?.(Number(v))}
            >
              <SelectTrigger id="page-size" className="h-8 w-[70px]" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              Showing {rangeStart}–{rangeEnd} of {totalCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange?.(page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange?.(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
