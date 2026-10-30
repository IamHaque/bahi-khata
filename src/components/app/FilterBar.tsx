import { X } from "lucide-react";
import type { ReactNode } from "react";

export interface FilterChip {
  label: string;
  onRemove: () => void;
}

interface FilterBarProps {
  chips: FilterChip[];
  onClearAll: () => void;
  children?: ReactNode;
}

export function FilterBar({ chips, onClearAll, children }: FilterBarProps) {
  if (chips.length === 0 && !children) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove filter ${chip.label}`}
            className="rounded-full p-0.5 transition-colors hover:bg-muted pointer-coarse:min-h-11 pointer-coarse:min-w-11"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      {chips.length > 0 && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground pointer-coarse:min-h-11"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
