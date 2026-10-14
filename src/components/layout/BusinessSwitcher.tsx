import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useMemberships } from "@/features/business/hooks";
import { paths } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface BusinessSwitcherProps {
  collapsed?: boolean;
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

/**
 * The business switcher (S-26): the sidebar's top shows the current
 * business and my role; the menu lists my own businesses first, then
 * shared businesses, then All businesses — plus Create business when I
 * own none. Picking a business navigates to its dashboard; query keys
 * are business-scoped (S-20), so nothing from the previous business can
 * remain visible after the switch.
 *
 * Keyboard: the trigger is a button, so Enter and Space open the menu;
 * arrows move between items; the selected business is a checked
 * menuitemradio, which screen readers announce as selected.
 */
export function BusinessSwitcher({ collapsed }: BusinessSwitcherProps) {
  const navigate = useNavigate();
  const { businessId } = useParams();
  const { data: memberships } = useMemberships();
  const businesses = memberships?.businesses ?? [];
  const current = businesses.find((b) => b.id === businessId) ?? null;

  // Own businesses first, then shared ones (S-26).
  const owned = businesses.filter((b) => b.isOwner);
  const shared = businesses.filter((b) => !b.isOwner);
  const ordered = [...owned, ...shared];
  // Only once memberships are known: a member of none may create one.
  const ownsNone = memberships !== undefined && owned.length === 0;

  const [open, setOpen] = useState(false);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const totalItems = ordered.length + 1 + (ownsNone ? 1 : 0);
  // Focus the selected business (or the first item) when the menu opens.
  const initialIndex = Math.max(
    ordered.findIndex((b) => b.id === businessId),
    0,
  );
  const initialIndexRef = useRef(initialIndex);
  initialIndexRef.current = initialIndex;

  const focusItem = (index: number) => {
    const clamped = (index + totalItems) % totalItems;
    itemRefs.current[clamped]?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      itemRefs.current[initialIndexRef.current]?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
    }
  };

  const onItemKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusItem(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(index - 1);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const pick = (id: string) => {
    setOpen(false);
    // The dashboard is the business's landing page (S-17).
    navigate(paths.business(id));
  };

  const triggerLabel = current
    ? `Switch business: ${current.name} (${roleLabel(current.role)})`
    : "Switch business: BahiKhata Business";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            className={cn(
              "h-auto w-full justify-start gap-2 px-3 py-2",
              collapsed && "justify-center px-0",
            )}
            aria-label={triggerLabel}
            onKeyDown={onTriggerKeyDown}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-4" />
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-sm font-semibold">
                    {current?.name ?? "BahiKhata"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {current ? roleLabel(current.role) : "Business"}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
              </>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" side="bottom" className="w-64 p-1">
        <ul role="menu" aria-label="Switch business" className="space-y-0.5">
          {ordered.map((business, index) => (
            <li key={business.id} role="none">
              <button
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={business.id === businessId}
                onClick={() => pick(business.id)}
                onKeyDown={(event) => onItemKeyDown(event, index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus:bg-muted",
                  business.id === businessId && "font-medium",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{business.name}</span>
                <span className="text-xs text-muted-foreground">
                  {roleLabel(business.role)}
                </span>
                {business.id === businessId && (
                  <Check className="size-4 shrink-0" aria-hidden="true" />
                )}
              </button>
            </li>
          ))}
          <li role="none">
            <button
              ref={(el) => {
                itemRefs.current[ordered.length] = el;
              }}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate(paths.businesses);
              }}
              onKeyDown={(event) => onItemKeyDown(event, ordered.length)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus:bg-muted"
            >
              All businesses
            </button>
          </li>
          {ownsNone && (
            <li role="none">
              <button
                ref={(el) => {
                  itemRefs.current[ordered.length + 1] = el;
                }}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate(paths.onboardingBusiness);
                }}
                onKeyDown={(event) =>
                  onItemKeyDown(event, ordered.length + 1)
                }
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus:bg-muted"
              >
                <Plus className="size-4 shrink-0" aria-hidden="true" />
                Create business
              </button>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
