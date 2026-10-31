import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { MoreHorizontal } from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { IconButton } from "@/components/app/IconButton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface RowAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  hidden?: boolean;
  ariaLabel?: string;
}

export interface RowActionsProps {
  actions: RowAction[];
  triggerLabel?: string;
  inCard?: boolean;
}

export function RowActions({
  actions,
  triggerLabel = "More actions",
  inCard = false,
}: RowActionsProps) {
  const isCoarse = useMediaQuery("(pointer: coarse)");
  const isSmallScreen = useMediaQuery("(max-width: 767px)");
  const forceSingleMenu = inCard || isCoarse || isSmallScreen;

  const [open, setOpen] = useState(false);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Filter visible actions
  const visible = actions.filter((a) => !a.hidden);

  // Split into non-destructive and destructive actions
  const nonDestructive = visible.filter((a) => !a.destructive);
  const destructive = visible.filter((a) => a.destructive);

  // If forceSingleMenu: all actions in the menu
  // Otherwise: first 2 non-destructive inline, rest in menu
  let inlineActions: RowAction[] = [];
  let menuActions: RowAction[] = [];

  if (forceSingleMenu) {
    inlineActions = [];
    menuActions = [...nonDestructive, ...destructive];
  } else {
    if (visible.length <= 2 && destructive.length === 0) {
      inlineActions = nonDestructive;
      menuActions = [];
    } else {
      inlineActions = nonDestructive.slice(0, 2);
      menuActions = [...nonDestructive.slice(2), ...destructive];
    }
  }

  const focusItem = (index: number) => {
    if (menuActions.length === 0) return;
    const clamped = (index + menuActions.length) % menuActions.length;
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

  if (visible.length === 0) return null;

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
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {inlineActions.map((action) => {
        const Icon = action.icon;
        return (
          <IconButton
            key={action.id}
            icon={<Icon className="size-4" />}
            label={action.label}
            ariaLabel={action.ariaLabel ?? action.label}
            disabled={action.disabled}
            tone={action.destructive ? "destructive" : "default"}
            onClick={(e) => {
              e.stopPropagation();
              action.onSelect();
            }}
          />
        );
      })}

      {menuActions.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <IconButton
                icon={<MoreHorizontal className="size-4" />}
                label={triggerLabel}
                ariaLabel={triggerLabel}
                onKeyDown={onTriggerKeyDown}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((o) => !o);
                }}
              />
            }
          />
          <PopoverContent className="w-44 p-1" align="end">
            <ul role="menu" aria-label={triggerLabel}>
              {menuActions.map((action, i) => {
                const Icon = action.icon;
                const showDivider = action.destructive && (i > 0 && !menuActions[i - 1]?.destructive);
                return (
                  <li key={action.id} role="none">
                    {showDivider && (
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
                      disabled={action.disabled}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted disabled:opacity-50 pointer-coarse:min-h-11",
                        action.destructive && "text-destructive hover:text-destructive",
                      )}
                      onClick={() => {
                        setOpen(false);
                        action.onSelect();
                      }}
                      onKeyDown={(e) => onItemKeyDown(e, i)}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{action.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
