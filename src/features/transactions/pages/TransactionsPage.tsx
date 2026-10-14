import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Avatar } from "@/components/app/Avatar";
import {
  DataTable,
  type Column,
} from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { FilterBar, type FilterChip } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { SearchInput } from "@/components/app/SearchInput";
import { StatusBadge } from "@/components/app/StatusBadge";
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
import { Toggle } from "@/components/ui/toggle";
import { useSort } from "@/hooks/useSort";
import { usePermissions } from "@/features/business/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { useCustomer, useCustomers } from "@/features/customers/hooks";
import { exportTransactionsCsv } from "@/features/import-export/exports";
import { useExportRunner } from "@/features/import-export/hooks";
import { EditedBadge } from "@/features/transactions/components/EditedBadge";
import { VoidTransactionDialog } from "@/features/transactions/components/VoidTransactionDialog";
import {
  useRestoreTransaction,
  useTransactionList,
  useTransactionRollup,
} from "@/features/transactions/hooks";
import type {
  TransactionListRow,
  TransactionListParams,
  TransactionRollupParams,
} from "@/features/transactions/api";
import {
  openTransactionEdit,
  openTransactionSheet,
} from "@/features/transactions/sheetStore";
import { formatDate, formatDayMonth, formatMoney, formatMonthYear } from "@/lib/format";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";

/**
 * S-35 — the transactions page: every entry across customers, scoped
 * to the active business. Two views share one filter set:
 *
 * - Detailed — a server-paged DataTable (Date, linked Customer, Type,
 *   Note, Amount, Recorded by, status/source badges) with row actions
 *   that follow the role; voided rows stay out unless included.
 * - Summarized — day/week/month rows computed BY THE DATABASE
 *   (migration 0006b's `transaction_rollup`), never reduced in the
 *   browser; the totals footer under both views is the same RPC's
 *   ungrouped row, so it covers everything matching the filter — not
 *   only the visible page.
 *
 * Every filter, the view, the grouping and the page live in the query
 * string: a link reproduces the exact screen, and the dashboard's
 * "Today" card can open this page with `?range=today`.
 */

type ViewMode = "detailed" | "summarized";
type FilterType = "all" | "charge" | "payment";
type GroupBy = "day" | "week" | "month";
type RangePreset = "today" | "this-week" | "this-month" | "last-30-days" | "custom";

const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  "this-week": "This week",
  "this-month": "This month",
  "last-30-days": "Last 30 days",
  custom: "Custom",
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
function buildRange(
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

/** The rollup hands back wall-clock dates cut in the browser's
 *  timezone; these are the same local formatters that label every
 *  other date in the app. */
function periodLabel(periodStart: string, groupBy: GroupBy): string {
  const date = new Date(periodStart);
  if (groupBy === "day") return formatDate(date);
  if (groupBy === "week") return `Week of ${formatDayMonth(date)}`;
  return formatMonthYear(date);
}

interface PeriodRow {
  key: string;
  label: string;
  entries: number;
  total_charged: number;
  total_paid: number;
  net: number;
}

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // "" only happens in tests that render the page outside /b/:businessId;
  // falsy businessId behaves unscoped (v1 transitional), same as undefined.
  const businessId = useScopedBusinessId() ?? "";
  const { can } = usePermissions();
  // S-39: exporting is every member's right — no role gate here.
  const { progress, run } = useExportRunner((message) =>
    toast.error(message),
  );

  // ---- URL state (the whole scenario "State in the URL") ----
  const view: ViewMode =
    searchParams.get("view") === "summarized" ? "summarized" : "detailed";
  const rangeParam = searchParams.get("range");
  const rangePreset: RangePreset =
    rangeParam === "today" ||
    rangeParam === "this-week" ||
    rangeParam === "last-30-days" ||
    rangeParam === "custom"
      ? rangeParam
      : "this-month"; // the default range
  const customFrom = searchParams.get("from") ?? "";
  const customTo = searchParams.get("to") ?? "";
  const typeParam = searchParams.get("type");
  const type: FilterType =
    typeParam === "charge" || typeParam === "payment" ? typeParam : "all";
  const customerId = searchParams.get("customer");
  const q = searchParams.get("q") ?? "";
  const includeVoided = searchParams.get("voided") === "1";
  const groupParam = searchParams.get("group");
  const groupBy: GroupBy =
    groupParam === "week" || groupParam === "month" ? groupParam : "day";
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;
  const [pageSize, setPageSize] = useState(25);

  // Local affordances the PRD does not put in the URL.
  const { sortBy, sortDir, toggleSort } = useSort("date", "desc");

  // SearchInput debounces its own callback (300 ms), so `q` is already
  // the settled value by the time it reaches the URL.
  const updateParams = useCallback(
    (
      patch: Record<string, string | null>,
      options?: { replace?: boolean },
    ) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          // Any change that is not itself a page change restarts at page 1.
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace: options?.replace ?? false },
      );
    },
    [setSearchParams],
  );

  const range = useMemo(
    () => buildRange(rangePreset, customFrom, customTo),
    [rangePreset, customFrom, customTo],
  );

  const listParams: TransactionListParams = useMemo(
    () => ({
      range,
      type,
      customerId: customerId || null,
      search: q,
      includeVoided,
      sort: sortBy === "amount" ? "amount" : "occurred_at",
      dir: sortDir,
      page,
      pageSize,
    }),
    [
      range,
      type,
      customerId,
      q,
      includeVoided,
      sortBy,
      sortDir,
      page,
      pageSize,
    ],
  );
  const rollupBase: Omit<TransactionRollupParams, "granularity"> = useMemo(
    () => ({
      range,
      type,
      customerId: customerId || null,
      search: q,
      includeVoided,
    }),
    [range, type, customerId, q, includeVoided],
  );

  const list = useTransactionList(businessId, listParams);
  // The footer is the RPC's ungrouped row — everything matching the
  // filter, not only the visible page. In the detailed view the
  // period query below IS this same query (identical key, deduped).
  const totals = useTransactionRollup(businessId, {
    ...rollupBase,
    granularity: null,
  });
  const periods = useTransactionRollup(businessId, {
    ...rollupBase,
    granularity: view === "summarized" ? groupBy : null,
  });

  // The chip and the picker speak the live name, not a URL fossil.
  const filterCustomer = useCustomer(
    customerId ?? "",
    businessId,
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const customerFeed = useCustomers(businessId);

  const restore = useRestoreTransaction(businessId);
  const [voidTx, setVoidTx] = useState<TransactionListRow | null>(null);

  const rows = list.data?.rows ?? [];
  // An old shared link with ?page= beyond the count lands on page 1
  // instead of a phantom empty page. During a page change list.data is
  // undefined (fresh key), so this cannot fire mid-load.
  useEffect(() => {
    if (list.data && rows.length === 0 && page > 1) {
      updateParams({ page: null });
    }
  }, [list.data, rows.length, page, updateParams]);

  const hasFilters =
    rangePreset !== "this-month" ||
    type !== "all" ||
    customerId !== null ||
    q !== "" ||
    includeVoided;

  const chips: FilterChip[] = [];
  if (rangePreset !== "this-month") {
    chips.push({
      label:
        rangePreset === "custom" && customFrom && customTo
          ? `Range: ${customFrom} → ${customTo}`
          : `Range: ${RANGE_LABELS[rangePreset]}`,
      onRemove: () => updateParams({ range: null, from: null, to: null }),
    });
  }
  if (type !== "all") {
    chips.push({
      label: `Type: ${type === "charge" ? "Charge" : "Payment"}`,
      onRemove: () => updateParams({ type: null }),
    });
  }
  if (customerId) {
    chips.push({
      label: `Customer: ${filterCustomer.data?.name ?? "…"}`,
      onRemove: () => updateParams({ customer: null }),
    });
  }
  if (q !== "") {
    chips.push({
      label: `Search: ${q}`,
      onRemove: () => updateParams({ q: null }),
    });
  }
  if (includeVoided) {
    chips.push({
      label: "Including voided",
      onRemove: () => updateParams({ voided: null }),
    });
  }
  const clearFilters = () =>
    updateParams({
      range: null,
      from: null,
      to: null,
      type: null,
      customer: null,
      q: null,
      voided: null,
    });

  const sheetCustomer = (row: TransactionListRow) => ({
    id: row.customer_id,
    name: row.customer.name,
  });

  // S-33/S-34 row actions, role-aware: the pencil edits in the shared
  // sheet, Void opens the confirmation, and a voided row offers
  // Restore. Viewers see none of them.
  const renderRowActions = (row: TransactionListRow) => {
    if (!can("manageTransactions")) return null;

    if (row.status === "voided") {
      return (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            restore.mutate(
              { id: row.id },
              {
                onSuccess: () => toast.success("Transaction restored."),
                onError: () =>
                  toast.error("Could not restore the transaction. Try again."),
              },
            );
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Restore ${row.type} of ₹${row.amount}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </button>
      );
    }

    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openTransactionEdit(row, sheetCustomer(row));
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Edit ${row.type} of ₹${row.amount}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setVoidTx(row);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Void ${row.type} of ₹${row.amount}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </button>
      </div>
    );
  };

  const typeBadge = (row: TransactionListRow) => (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        row.type === "charge"
          ? "bg-receivable/10 text-receivable"
          : "bg-credit/10 text-credit",
      )}
    >
      {row.type === "charge" ? "Charge" : "Payment"}
    </span>
  );

  const amountCell = (row: TransactionListRow) => (
    <span
      className={cn(
        "tabular-nums",
        row.type === "charge" ? "text-receivable" : "text-credit",
        row.status === "voided" && "line-through opacity-50",
      )}
    >
      {row.type === "charge" ? "+" : "-"}₹{row.amount.toLocaleString("en-IN")}
    </span>
  );

  // "status or source badges": the S-33 edit marker, the S-34 void
  // marker and the import provenance in one cell.
  const badgesCell = (row: TransactionListRow) => (
    <div className="flex items-center gap-1.5">
      {row.status === "edited" && (
        <EditedBadge
          editorName={row.updated_by_name ?? null}
          updatedAt={row.updated_at}
        />
      )}
      {row.status === "voided" && <StatusBadge label="Voided" tone="muted" />}
      {row.source === "import" && (
        <StatusBadge label="Import" tone="muted" />
      )}
    </div>
  );

  const customerCell = (row: TransactionListRow) => (
    <Link
      to={paths.customerDetail(businessId, row.customer_id)}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center gap-2 font-medium text-foreground hover:underline"
    >
      <Avatar name={row.customer.name} size="sm" />
      <span className="truncate">{row.customer.name}</span>
    </Link>
  );

  // The S-35 "Recorded by": the creator's avatar and name, or the
  // S-25/0002c fallback when the profile is gone.
  const recordedByCell = (row: TransactionListRow) => (
    <div className="flex items-center gap-2">
      <Avatar name={row.created_by_name ?? "Former member"} size="sm" />
      <span className="truncate text-sm text-muted-foreground">
        {row.created_by_name ?? "Former member"}
      </span>
    </div>
  );

  const detailedColumns: Column<TransactionListRow>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (row) => (
        <span className="tabular-nums">{formatDate(row.occurred_at)}</span>
      ),
      sortValue: (row) => new Date(row.occurred_at).getTime(),
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => customerCell(row),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => typeBadge(row),
    },
    {
      key: "note",
      header: "Note",
      render: (row) =>
        row.note ? (
          <span className="block max-w-[220px] truncate text-muted-foreground">
            {row.note}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      render: (row) => amountCell(row),
      sortValue: (row) => row.amount,
    },
    {
      key: "recordedBy",
      header: "Recorded by",
      render: (row) => recordedByCell(row),
    },
    {
      key: "badges",
      header: "Status",
      render: (row) => badgesCell(row),
    },
  ];

  const periodRows: PeriodRow[] = (periods.data ?? []).map((row) => ({
    key: row.period_start ?? "all",
    label: row.period_start
      ? periodLabel(row.period_start, groupBy)
      : "All matching",
    entries: row.entries,
    total_charged: row.total_charged,
    total_paid: row.total_paid,
    net: row.net,
  }));

  const periodColumns: Column<PeriodRow>[] = [
    {
      key: "period",
      header: "Period",
      render: (row) => <span className="font-medium">{row.label}</span>,
    },
    {
      key: "entries",
      header: "Entries",
      align: "right",
      render: (row) => <span className="tabular-nums">{row.entries}</span>,
    },
    {
      key: "charged",
      header: "Charges",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-receivable">
          {formatMoney(row.total_charged)}
        </span>
      ),
    },
    {
      key: "payments",
      header: "Payments",
      align: "right",
      render: (row) => (
        <span className="tabular-nums text-credit">
          {formatMoney(row.total_paid)}
        </span>
      ),
    },
    {
      key: "net",
      header: "Net",
      align: "right",
      render: (row) => (
        <span
          className={cn(
            "tabular-nums",
            row.net >= 0 ? "text-receivable" : "text-credit",
          )}
        >
          {row.net >= 0 ? "+" : "-"}
          {formatMoney(Math.abs(row.net))}
        </span>
      ),
    },
  ];

  const totalRow = totals.data?.[0];
  const net = totalRow?.net ?? 0;

  // "true empty" is the honest empty business; a filtered-out set is
  // "no results" and keeps its active filters visible above (the kit
  // renders its Clear filters action under the no-results node only).
  const trueEmptyNode = (
    <EmptyState
      title="No transactions yet"
      description="Record a charge or a payment and it will appear here."
    >
      {can("manageTransactions") && (
        <Button onClick={() => openTransactionSheet()}>Add Transaction</Button>
      )}
    </EmptyState>
  );
  const noResultsNode = (
    <EmptyState
      title="No transactions match these filters"
      description="Adjust or clear the filters above to widen the search."
    />
  );

  const filteredCustomers = (customerFeed.data ?? []).filter((customer) => {
    const term = customerSearch.trim().toLowerCase();
    if (!term) return true;
    return (
      customer.name.toLowerCase().includes(term) ||
      (customer.phone ?? "").includes(term)
    );
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Transactions" description="Every entry across customers">
        <Button
          variant="outline"
          disabled={Boolean(progress)}
          onClick={() =>
            void run((onProgress) =>
              exportTransactionsCsv(
                businessId,
                {
                  range,
                  type,
                  customerId: customerId || null,
                  search: q,
                  includeVoided,
                  sort: sortBy === "amount" ? "amount" : "occurred_at",
                  dir: sortDir,
                },
                onProgress,
              ),
            )
          }
        >
          <Download className="size-4" />
          {progress
            ? `Exporting… ${progress.done}/${progress.total}`
            : "Export CSV"}
        </Button>
        {can("manageTransactions") && (
          <Button onClick={() => openTransactionSheet()}>Add Transaction</Button>
        )}
      </PageHeader>

      <FilterBar chips={chips} onClearAll={clearFilters}>
        <div className="flex items-center gap-2">
          <Label htmlFor="range-preset" className="text-xs text-muted-foreground">
            Range
          </Label>
          <Select
            value={rangePreset}
            onValueChange={(value) => {
              if (!value) return;
              updateParams({
                range: value === "this-month" ? null : value,
                from: null,
                to: null,
              });
            }}
          >
            <SelectTrigger id="range-preset" className="w-[140px]">
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
                "rounded-full border px-3 py-1 text-sm transition-colors",
                type === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent-wash hover:text-foreground",
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
          value={q}
          onValueChange={(value) => updateParams({ q: value || null }, { replace: true })}
        />

        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Filter by customer"
              />
            }
          >
            {customerId && filterCustomer.data
              ? `Customer: ${filterCustomer.data.name}`
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
              {customerFeed.isLoading && (
                <p className="px-2 py-1 text-sm text-muted-foreground">
                  Loading…
                </p>
              )}
              {customerId && (
                <button
                  type="button"
                  onClick={() => updateParams({ customer: null })}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent-wash"
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
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent-wash",
                    customer.id === customerId && "bg-accent-wash",
                  )}
                >
                  <Avatar name={customer.name} size="sm" />
                  <span className="truncate">{customer.name}</span>
                </button>
              ))}
              {!customerFeed.isLoading && filteredCustomers.length === 0 && (
                <p className="px-2 py-1 text-sm text-muted-foreground">
                  No customers match.
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <Toggle
          variant="outline"
          pressed={includeVoided}
          onPressedChange={(next) =>
            updateParams({ voided: next ? "1" : null })
          }
        >
          Include voided
        </Toggle>

        {view === "summarized" && (
          <div className="flex items-center gap-2">
            <Label htmlFor="group-by" className="text-xs text-muted-foreground">
              Group by
            </Label>
            <Select
              value={groupBy}
              onValueChange={(value) => {
                if (!value) return;
                updateParams({ group: value === "day" ? null : value });
              }}
            >
              <SelectTrigger id="group-by" className="w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="month">Month</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </FilterBar>

      {/* The view switch reads from and writes to the URL like
          everything else. */}
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
              updateParams({ view: option.value === "detailed" ? null : option.value })
            }
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              view === option.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-accent-wash hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {view === "detailed" ? (
        <DataTable
          columns={detailedColumns}
          rows={rows}
          getRowKey={(row) => row.id}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={toggleSort}
          onRowClick={(row) =>
            navigate(paths.transactionDetail(businessId, row.id))
          }
          loading={list.isPending}
          error={list.error ? list.error.message : null}
          onRetry={() => list.refetch()}
          renderRowActions={renderRowActions}
          renderMobileCard={(row) => {
            const actions = renderRowActions(row);
            return (
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatDate(row.occurred_at)}
                  </span>
                  {badgesCell(row)}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  {customerCell(row)}
                  {typeBadge(row)}
                </div>
                {/* Amounts are never truncated on mobile (S-35). */}
                <div className="mt-2 flex items-baseline justify-between gap-3">
                  <span className="text-base font-semibold">
                    {amountCell(row)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {row.created_by_name ?? "Former member"}
                  </span>
                </div>
                {row.note && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.note}
                  </p>
                )}
                {actions && (
                  <div className="mt-2 flex justify-end gap-1">{actions}</div>
                )}
              </div>
            );
          }}
          emptyState={hasFilters ? undefined : trueEmptyNode}
          noResultsState={hasFilters ? noResultsNode : undefined}
          onClearFilters={clearFilters}
          page={page}
          pageSize={pageSize}
          totalCount={list.data?.total}
          onPageChange={(next) => updateParams({ page: String(next) })}
          onPageSizeChange={(size) => setPageSize(size)}
        />
      ) : (
        <DataTable
          columns={periodColumns}
          rows={periodRows}
          getRowKey={(row) => row.key}
          loading={periods.isPending}
          error={periods.error ? periods.error.message : null}
          onRetry={() => periods.refetch()}
          emptyState={hasFilters ? undefined : trueEmptyNode}
          noResultsState={hasFilters ? noResultsNode : undefined}
          onClearFilters={clearFilters}
        />
      )}

      {/* Totals for the CURRENT FILTER — the RPC's ungrouped row, so
          the figures cover every matching entry, not only this page. */}
      <section
        aria-label="Totals for the current filter"
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm"
      >
        <span className="text-muted-foreground">
          Totals for this filter
          {totalRow ? ` · ${totalRow.entries} entries` : ""}
        </span>
        <span className="flex flex-wrap items-center gap-4">
          <span className="tabular-nums">
            Charges{" "}
            <b className="text-receivable">
              {totalRow ? formatMoney(totalRow.total_charged) : "—"}
            </b>
          </span>
          <span className="tabular-nums">
            Payments{" "}
            <b className="text-credit">
              {totalRow ? formatMoney(totalRow.total_paid) : "—"}
            </b>
          </span>
          <span className="tabular-nums">
            Net{" "}
            <b className={net >= 0 ? "text-receivable" : "text-credit"}>
              {totalRow ? formatMoney(Math.abs(net)) : "—"}
            </b>
          </span>
        </span>
      </section>

      {/* S-34: the void confirmation; its own toast carries Undo. */}
      <VoidTransactionDialog
        open={!!voidTx}
        onOpenChange={(open) => {
          if (!open) setVoidTx(null);
        }}
        businessId={businessId}
        transaction={voidTx}
      />
    </div>
  );
}
