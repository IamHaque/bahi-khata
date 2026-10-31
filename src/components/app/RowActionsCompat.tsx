import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { IconButton } from "@/components/app/IconButton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface RowActionItem {
  label: string;
  onSelect: () => void;
  variant?: "default" | "destructive";
  disabled?: boolean;
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
    if (items.length === 0) return;
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
          <IconButton
            icon={<MoreHorizontal className="size-4" />}
            label={triggerLabel}
            ariaLabel={triggerLabel}
            onKeyDown={onTriggerKeyDown}
            onClick={(event) => {
              event.stopPropagation();
              setOpen((o) => !o);
            }}
          />
        }
      />
      <PopoverContent className="w-44 p-1" align="end">
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
                  item.variant === "destructive" && "text-destructive hover:text-destructive",
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
