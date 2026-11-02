import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface TableFooterProps {
  mode?: "pagination" | "more";
  page?: number;
  pageSize?: number;
  totalCount?: number;
  displayedCount?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizes?: number[];
  onShowMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  showMoreLabel?: string;
  className?: string;
}

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

export function TableFooter({
  mode = "pagination",
  page = 1,
  pageSize = 10,
  totalCount = 0,
  displayedCount,
  onPageChange,
  onPageSizeChange,
  pageSizes = DEFAULT_PAGE_SIZES,
  onShowMore,
  hasMore = false,
  loadingMore = false,
  showMoreLabel,
  className,
}: TableFooterProps) {
  if (totalCount === 0) return null;

  if (mode === "more") {
    const count = displayedCount ?? Math.min(page * pageSize, totalCount);
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground",
          className,
        )}
      >
        <span>
          Showing {count} of {totalCount}
        </span>
        {hasMore && onShowMore && (
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={onShowMore}
          >
            {loadingMore ? "Loading…" : (showMoreLabel ?? "Show more")}
          </Button>
        )}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = Math.min((page - 1) * pageSize + 1, totalCount);
  const rangeEnd = Math.min(page * pageSize, totalCount);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <label htmlFor="table-page-size" className="text-xs">
          Rows per page
        </label>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange?.(Number(v))}
        >
          <SelectTrigger
            id="table-page-size"
            className="h-8 w-[70px]"
            aria-label="Rows per page"
          >
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
        <span aria-hidden="true">
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
  );
}
