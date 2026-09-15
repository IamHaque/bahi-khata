import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { listCustomers } from "@/lib/customers";
import type { Customer } from "@/types";

interface CustomerComboboxProps {
  value: string | null;
  onSelect: (customer: Customer) => void;
  onAddNew: (query: string) => void;
  disabled?: boolean;
}

function PickerContent({
  customers,
  loading,
  search,
  setSearch,
  value,
  onSelect,
  onAddNew,
  inputRef,
  listRef,
}: {
  customers: Customer[];
  loading: boolean;
  search: string;
  setSearch: (v: string) => void;
  value: string | null;
  onSelect: (customer: Customer) => void;
  onAddNew: (query: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  const filtered = search.trim()
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.phone && c.phone.includes(search)),
      )
    : customers;

  const noMatches = search.trim() && filtered.length === 0;
  const showAddNew = !loading && noMatches;

  return (
    <div className="flex flex-col">
      <div className="border-b border-border p-2">
        <Input
          ref={inputRef}
          placeholder="Search customers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              const first = listRef.current?.querySelector("[data-customer-item]");
              (first as HTMLElement)?.focus();
            }
          }}
        />
      </div>

      <div ref={listRef} className="max-h-72 overflow-y-auto p-1 sm:max-h-72">
        {loading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Loading customers...
          </div>
        )}

        {!loading && customers.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-sm text-muted-foreground">No customers yet.</p>
            <button
              type="button"
              className="text-sm font-medium text-foreground underline hover:no-underline"
              onClick={() => onAddNew("")}
            >
              Add your first customer
            </button>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul role="listbox" aria-label="Customers">
            {filtered.map((customer) => (
              <li
                key={customer.id}
                role="option"
                aria-selected={customer.id === value}
                data-customer-item
                tabIndex={-1}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
                onClick={() => onSelect(customer)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onSelect(customer);
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    (e.currentTarget.nextElementSibling as HTMLElement)?.focus();
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    (e.currentTarget.previousElementSibling as HTMLElement)?.focus();
                  }
                }}
              >
                <div className="flex flex-col">
                  <span>{customer.name}</span>
                  {customer.phone && (
                    <span className="text-xs text-muted-foreground">
                      {customer.phone}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {showAddNew && (
          <div className="border-t border-border p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
              onClick={() => onAddNew(search)}
            >
              <Plus className="size-4" />
              <span>Add &ldquo;{search}&rdquo; as a new customer</span>
            </button>
          </div>
        )}

        {!loading && !noMatches && customers.length > 0 && (
          <div className="border-t border-border p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-muted focus:bg-muted"
              onClick={() => onAddNew(search)}
            >
              <Plus className="size-4" />
              <span>Add new customer</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CustomerCombobox({
  value,
  onSelect,
  onAddNew,
  disabled,
}: CustomerComboboxProps) {
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isDesktop = useMediaQuery("(min-width: 640px)");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch("");
    listCustomers()
      .then(setCustomers)
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const selected = customers.find((c) => c.id === value);

  const pickerProps = {
    customers,
    loading,
    search,
    setSearch,
    value,
    onSelect: (customer: Customer) => {
      onSelect(customer);
      setOpen(false);
    },
    onAddNew: (query: string) => {
      setOpen(false);
      onAddNew(query);
    },
    inputRef,
    listRef,
  };

  if (isDesktop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start font-normal"
              disabled={disabled}
            />
          }
        >
          {selected ? (
            <span className="truncate">{selected.name}</span>
          ) : (
            <span className="text-muted-foreground">Select customer...</span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <PickerContent {...pickerProps} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start font-normal"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {selected ? (
          <span className="truncate">{selected.name}</span>
        ) : (
          <span className="text-muted-foreground">Select customer...</span>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[80vh]">
          <SheetTitle className="sr-only">Select customer</SheetTitle>
          <PickerContent {...pickerProps} />
        </SheetContent>
      </Sheet>
    </>
  );
}
