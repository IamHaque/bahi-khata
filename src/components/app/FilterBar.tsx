import { X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "@/components/app/IconButton";

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
          className="inline-flex items-center gap-1 rounded-full bg-secondary pl-2.5 pr-1 py-0.5 text-xs font-medium text-secondary-foreground"
        >
          {chip.label}
          <IconButton
            icon={<X className="size-3" />}
            label="Remove filter"
            ariaLabel={`Remove filter ${chip.label}`}
            size="icon-xs"
            onClick={chip.onRemove}
            className="rounded-full p-0.5"
          />
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
