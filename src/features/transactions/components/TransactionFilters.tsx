import { useState } from "react";
import { Avatar } from "@/components/app/Avatar";
import { FilterBar, type FilterChip } from "@/components/app/FilterBar";
import { SearchInput } from "@/components/app/SearchInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Customer } from "@/types";
import { cn } from "@/lib/utils";

/**
 * L-09 — the transactions filter set, split out of the page: one row
 * of primary filters (Range, type tabs, search, customer, Include
 * voided) that wraps IN ORDER, the Detailed/Summarized text tabs
 * under it, and the selected-filter chips (FilterBar's own) inline.
 * The URL stays the page's job — every setter writes through
 * `updateParams`.
 */

export type ViewMode = "detailed" | "summarized";
export type FilterType = "all" | "charge" | "payment";
export type GroupBy = "day" | "week" | "month";
export type RangePreset =
  | "today"
  | "this-week"
  | "this-month"
  | "last-30-days"
  | "custom";

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  "this-week": "This week",
  "this-month": "This month",
  "last-30-days": "Last 30 days",
  custom: "Custom",
};

export const GROUP_LABELS: Record<GroupBy, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function nextDayStart(date: Date): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

/**
 * Ranges are half-open [start, end): "This month" ends at the 1st of
 * the next month, 00:00 — an entry at exactly midnight belongs to the
 * next month. Custom dates are whole days, end day included. An
 * incomplete custom range applies no bound (the inputs say so).
 */
export function buildRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
): { start: string; end: string } | null {
  const now = new Date();
  switch (preset) {
    case "today":
      return {
        start: startOfDay(now).toISOString(),
        end: nextDayStart(now).toISOString(),
      };
    case "this-week": {
      const monday = startOfDay(now);
      const day = monday.getDay();
      monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1));
      const end = new Date(monday);
      end.setDate(end.getDate() + 7);
      return { start: monday.toISOString(), end: end.toISOString() };
    }
    case "this-month":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        end: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
      };
    case "last-30-days": {
      const start = startOfDay(now);
      start.setDate(start.getDate() - 29);
      return {
        start: start.toISOString(),
        end: nextDayStart(now).toISOString(),
      };
    }
    case "custom":
      if (!customFrom || !customTo) return null;
      return {
        start: startOfDay(new Date(customFrom)).toISOString(),
        end: nextDayStart(new Date(customTo)).toISOString(),
      };
  }
}

export interface TransactionFiltersProps {
  view: ViewMode;
  rangePreset: RangePreset;
  customFrom: string;
  customTo: string;
  type: FilterType;
  q: string;
  customerId: string | null;
  /** The customer's LIVE name — a chip fossil must not say "…" forever. */
  customerName: string | null;
  /** The feed behind the customer picker — only id, name, phone read. */
  customers: Customer[];
  customersLoading: boolean;
  includeVoided: boolean;
  groupBy: GroupBy;
  chips: FilterChip[];
  onClearAll: () => void;
  updateParams: (
    patch: Record<string, string | null>,
    options?: { replace?: boolean },
  ) => void;
}

export function TransactionFilters({
  view,
  rangePreset,
  customFrom,
  customTo,
  type,
  q,
  customerId,
  customerName,
  customers,
  customersLoading,
  includeVoided,
  groupBy,
  chips,
  onClearAll,
  updateParams,
}: TransactionFiltersProps) {
  const [customerSearch, setCustomerSearch] = useState("");
  const filteredCustomers = customers.filter((customer) => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      customer.name.toLowerCase().includes(term) ||
      (customer.phone ?? "").includes(term)
    );
  });

  return (
    <>
      <FilterBar chips={chips} onClearAll={onClearAll}>
        <div className="flex items-center gap-2">
          <Label htmlFor="range-preset" className="text-xs text-muted-foreground">
            Range
          </Label>
          <Select
            value={rangePreset}
            // Base UI's SelectValue renders the raw value unless the
            // Root knows the labels — RANGE_LABELS is that map.
            items={RANGE_LABELS}
            onValueChange={(value) => {
              if (!value) return;
              updateParams({
                range: value === "this-month" ? null : value,
                from: null,
                to: null,
              });
            }}
          >
            <SelectTrigger id="range-preset" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RANGE_LABELS) as RangePreset[]).map((preset) => (
                <SelectItem key={preset} value={preset}>
                  {RANGE_LABELS[preset]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {rangePreset === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(event) =>
                updateParams(
                  { from: event.target.value || null },
                  { replace: true },
                )
              }
              className="w-[150px]"
              aria-label="Start date"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={customTo}
              onChange={(event) =>
                updateParams(
                  { to: event.target.value || null },
                  { replace: true },
                )
              }
              className="w-[150px]"
              aria-label="End date"
            />
          </div>
        )}

        <div
          role="group"
          aria-label="Filter by type"
          className="flex flex-wrap gap-1"
        >
          {(
            [
              { value: "all", label: "All" },
              { value: "charge", label: "Charge" },
              { value: "payment", label: "Payment" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={type === option.value}
              onClick={() =>
                updateParams({
                  type: option.value === "all" ? null : option.value,
                })
              }
              className={cn(
                "border-b-2 px-2 py-1.5 text-sm transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11",
                type === option.value
                  ? "border-foreground text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <SearchInput
          id="transaction-search"
          label="Search by customer, phone or note"
          placeholder="Search…"
          className="min-w-[12rem] flex-1"
          value={q}
          onValueChange={(value) =>
            updateParams({ q: value || null }, { replace: true })
          }
        />

        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-48 justify-between"
                aria-label="Filter by customer"
              />
            }
          >
            {customerId && customerName
              ? `Customer: ${customerName}`
              : "Customer"}
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <SearchInput
              id="customer-filter-search"
              label="Search customers"
              placeholder="Search customers…"
              value={customerSearch}
              onValueChange={setCustomerSearch}
            />
            <div className="mt-2 max-h-56 overflow-y-auto">
              {customersLoading && (
                <p className="px-2 py-1 text-sm text-muted-foreground">
                  Loading…
                </p>
              )}
              {customerId && (
                <button
                  type="button"
                  onClick={() => updateParams({ customer: null })}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent-wash pointer-coarse:min-h-11"
                >
                  All customers
                </button>
              )}
              {filteredCustomers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => updateParams({ customer: customer.id })}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent-wash pointer-coarse:min-h-11",
                    customer.id === customerId && "bg-accent-wash",
                  )}
                >
                  <Avatar name={customer.name} size="sm" />
                  <span className="truncate">{customer.name}</span>
                </button>
              ))}
              {!customersLoading && filteredCustomers.length === 0 && (
                <p className="px-2 py-1 text-sm text-muted-foreground">
                  No customers match.
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* "Include voided" is a real switch with a visible label
            (L-09) — a screen reader announces on/off, not pressed. */}
        <div className="flex items-center gap-2">
          <Switch
            id="include-voided"
            checked={includeVoided}
            onCheckedChange={(next) =>
              updateParams({ voided: next ? "1" : null })
            }
          />
          <Label
            htmlFor="include-voided"
            className="cursor-pointer text-sm text-muted-foreground"
          >
            Include voided
          </Label>
        </div>

        {view === "summarized" && (
          <div className="flex items-center gap-2">
            <Label htmlFor="group-by" className="text-xs text-muted-foreground">
              Group by
            </Label>
            <Select
              value={groupBy}
              items={GROUP_LABELS}
              onValueChange={(value) => {
                if (!value) return;
                updateParams({ group: value === "day" ? null : value });
              }}
            >
              <SelectTrigger id="group-by" className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(GROUP_LABELS) as GroupBy[]).map((group) => (
                  <SelectItem key={group} value={group}>
                    {GROUP_LABELS[group]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </FilterBar>

      {/* The view switch reads from and writes to the URL like
          everything else — L-04's text tabs. */}
      <div
        role="group"
        aria-label="View"
        className="flex flex-wrap items-center gap-1"
      >
        {(
          [
            { value: "detailed", label: "Detailed" },
            { value: "summarized", label: "Summarized" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={view === option.value}
            onClick={() =>
              updateParams({
                view: option.value === "detailed" ? null : option.value,
              })
            }
            className={cn(
              "border-b-2 px-2 py-1.5 text-sm transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11",
              view === option.value
                ? "border-foreground text-foreground font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}
