import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function BulkActionBar({
  selectedCount,
  onClear,
  children,
  className,
}: BulkActionBarProps) {
  useEffect(() => {
    if (selectedCount === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClear();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedCount, onClear]);

  if (selectedCount === 0) return null;

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className={cn(
        "fixed bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] left-4 right-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-lg",
        "sm:sticky sm:bottom-auto sm:top-0 sm:left-auto sm:right-auto sm:shadow-sm",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-live="polite"
          className="text-sm font-medium text-foreground"
        >
          {selectedCount} selected
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground touch-target"
        >
          Clear
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}
