import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { listCustomers } from "@/lib/customers";
import type { Customer } from "@/types";

interface CustomerComboboxProps {
  value: string | null;
  onSelect: (customer: Customer) => void;
  onAddNew: (query: string) => void;
  disabled?: boolean;
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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listCustomers()
      .then(setCustomers)
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, [open]);

  const selected = customers.find((c) => c.id === value);

  const filtered = search.trim()
    ? customers.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.phone && c.phone.includes(search)),
      )
    : customers;

  const noMatches = search.trim() && filtered.length === 0;

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
        <Command>
          <CommandInput
            placeholder="Search customers..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {loading && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Loading customers...
              </div>
            )}

            {!loading && customers.length === 0 && (
              <CommandEmpty>
                <div className="flex flex-col items-center gap-2 py-2">
                  <p className="text-sm text-muted-foreground">No customers yet.</p>
                  <button
                    type="button"
                    className="text-sm font-medium text-foreground underline hover:no-underline"
                    onClick={() => {
                      setOpen(false);
                      onAddNew("");
                    }}
                  >
                    Add your first customer
                  </button>
                </div>
              </CommandEmpty>
            )}

            {!loading && customers.length > 0 && (
              <CommandGroup heading="Customers">
                {filtered.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    value={customer.name}
                    onSelect={() => {
                      onSelect(customer);
                      setOpen(false);
                      setSearch("");
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
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {!loading && noMatches && (
              <div className="border-t border-border p-1">
                <CommandItem
                  value={`add-new-${search}`}
                  onSelect={() => {
                    setOpen(false);
                    onAddNew(search);
                    setSearch("");
                  }}
                >
                  <Plus className="size-4" />
                  <span>Add &ldquo;{search}&rdquo; as a new customer</span>
                </CommandItem>
              </div>
            )}

            {!loading && !noMatches && customers.length > 0 && (
              <div className="border-t border-border p-1">
                <CommandItem
                  value="add-new"
                  onSelect={() => {
                    setOpen(false);
                    onAddNew(search);
                    setSearch("");
                  }}
                >
                  <Plus className="size-4" />
                  <span>Add new customer</span>
                </CommandItem>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
