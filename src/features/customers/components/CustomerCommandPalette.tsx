import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar } from "@/components/app/Avatar";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { useCustomerList } from "@/features/customers/hooks";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";

const PALETTE_PAGE_SIZE = 8;

/**
 * S-28 global search: find a customer in the active business and jump to
 * her detail page. Ctrl/Cmd+K or the top bar's search button opens it
 * (the keybinding lives in Topbar, which owns this component's open
 * state). Results come from the same server-side query as the list page,
 * so search behaves identically in both places.
 */
export function CustomerCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const businessId = useScopedBusinessId();
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const debouncedTerm = useDebouncedValue(term, 200);

  const { data, isPending } = useCustomerList(
    businessId ?? "",
    { search: debouncedTerm, pageSize: PALETTE_PAGE_SIZE },
    { enabled: open },
  );

  // While the debounce is in flight the old result set is the wrong
  // answer to the current question — show nothing until it settles.
  const settled = term === debouncedTerm;
  const results = open && businessId && settled ? (data?.items ?? []) : [];

  // Closing clears the search; a new term starts at the top result.
  useEffect(() => {
    if (!open) {
      setTerm("");
      setActive(0);
    }
  }, [open]);
  useEffect(() => {
    setActive(0);
  }, [debouncedTerm]);

  const choose = (customerId: string) => {
    if (!businessId) return;
    onOpenChange(false);
    navigate(paths.customerDetail(businessId, customerId));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const chosen = results[active];
      if (chosen) choose(chosen.id);
    }
  };

  const showSearching =
    !!businessId && (!settled || (isPending && results.length === 0));
  const showNoMatch =
    !!businessId && settled && !isPending && term !== "" && results.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Search customers</DialogTitle>
        </DialogHeader>

        <div>
          <Label htmlFor="customer-palette-input" className="sr-only">
            Search customers by name or phone
          </Label>
          <Input
            id="customer-palette-input"
            autoFocus
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="customer-palette-list"
            aria-activedescendant={
              results[active] ? `customer-palette-option-${results[active].id}` : undefined
            }
            placeholder="Search by name or phone…"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>

        {!businessId ? (
          <p className="py-2 text-sm text-muted-foreground">
            No business is open. Open a business to search its customers.
          </p>
        ) : results.length > 0 ? (
          <ul
            id="customer-palette-list"
            role="listbox"
            aria-label="Customers"
            className="max-h-72 overflow-y-auto"
          >
            {results.map((customer, index) => (
              <li
                key={customer.id}
                id={`customer-palette-option-${customer.id}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(customer.id)}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-2 py-2",
                  index === active && "bg-muted",
                )}
              >
                <Avatar name={customer.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {customer.name}
                  </span>
                  {customer.phone && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {customer.phone}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : showSearching ? (
          <p className="py-2 text-sm text-muted-foreground">Searching…</p>
        ) : showNoMatch ? (
          <p className="py-2 text-sm text-muted-foreground">
            No customers match &ldquo;{term}&rdquo;.
          </p>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">
            Type a name or phone number to find a customer.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
