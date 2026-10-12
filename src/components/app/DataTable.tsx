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
}

export interface RowActionItem {
  label: string;
  onSelect: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
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
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1">
        <ul role="menu" aria-label={triggerLabel}>
          {items.map((item, i) => (
            <li key={item.label} role="none">
              <button
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={cn(
                  "flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted disabled:opacity-50",
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
    <div className={cn("overflow-x-auto rounded-lg border border-border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => {
              const isActive = sortBy === col.key;
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
                    "sticky top-0 z-10 bg-background",
                    col.sortable &&
                      (isActive
                        ? "cursor-pointer bg-accent-wash font-medium text-primary"
                        : "cursor-pointer hover:bg-accent-wash"),
                  )}
                  {...(col.sortable
                    ? {
                        onClick: () => handleSort(col.key),
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
            {renderRowActions && <TableHead className="sticky top-0 z-10 w-10 bg-background" />}
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
                  )}
                >
                  {col.render(row)}
                </TableCell>
              ))}
              {renderRowActions && (
                <TableCell className="w-10 text-right">
                  {renderRowActions(row)}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-2">
      <p className="sr-only" role="status">
        Showing {rows.length} of {showingCount}
      </p>

      {loading ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key} className="sticky top-0 z-10 bg-background">
                    {col.header}
                  </TableHead>
                ))}
                {renderRowActions && <TableHead className="sticky top-0 z-10 w-10 bg-background" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }, (_, i) => (
                <TableRow key={i}>
                  {columns.map((col) => (
                    <TableCell key={col.key}>
                      <Skeleton className="h-4" />
                    </TableCell>
                  ))}
                  {renderRowActions && <TableCell />}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : rows.length === 0 && emptyState ? (
        emptyState
      ) : rows.length === 0 && noResultsState ? (
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
      ) : isMobile && renderMobileCard ? (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={getRowKey(row)}>{renderMobileCard(row)}</div>
          ))}
        </div>
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
