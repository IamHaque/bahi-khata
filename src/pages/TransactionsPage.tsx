import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/DataTable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSort } from "@/hooks/useSort";
import { getAllTransactions } from "@/lib/transactions";
import type { TransactionWithCustomer } from "@/types";

type ViewMode = "detailed" | "summarized";
type FilterType = "all" | "charge" | "payment";
type GroupBy = "day" | "week" | "month";

interface PeriodSummary {
  label: string;
  count: number;
  charges: number;
  payments: number;
  net: number;
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getThisWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(now);
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getThisMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function groupTransactions(
  txs: TransactionWithCustomer[],
  groupBy: GroupBy,
): PeriodSummary[] {
  const groups = new Map<string, PeriodSummary>();

  for (const tx of txs) {
    const date = new Date(tx.occurred_at);
    let key: string;
    let label: string;

    if (groupBy === "day") {
      key = date.toISOString().split("T")[0] ?? "";
      label = date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } else if (groupBy === "week") {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay() + 1);
      key = weekStart.toISOString().split("T")[0] ?? "";
      label = `Week of ${weekStart.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      label = date.toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      });
    }

    if (!groups.has(key)) {
      groups.set(key, {
        label,
        count: 0,
        charges: 0,
        payments: 0,
        net: 0,
      });
    }

    const group = groups.get(key)!;
    group.count++;
    if (tx.type === "charge") {
      group.charges += tx.amount;
      group.net += tx.amount;
    } else {
      group.payments += tx.amount;
      group.net -= tx.amount;
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    b.label.localeCompare(a.label),
  );
}

const detailedColumns: Column<TransactionWithCustomer & { occurredAtMs: number }>[] = [
  {
    key: "date",
    header: "Date",
    sortable: true,
    render: (row) => (
      <span className="tabular-nums">
        {new Date(row.occurred_at).toLocaleDateString("en-IN")}
      </span>
    ),
    sortValue: (row) => row.occurredAtMs,
  },
  {
    key: "customer",
    header: "Customer",
    render: (row) => (
      <Link
        to={`/customers/${row.customer_id}`}
        className="font-medium text-foreground hover:underline"
      >
        {row.customer_name}
      </Link>
    ),
  },
  {
    key: "type",
    header: "Type",
    render: (row) => (
      <span
        className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
          row.type === "charge"
            ? "bg-receivable/10 text-receivable"
            : "bg-credit/10 text-credit"
        }`}
      >
        {row.type === "charge" ? "Charge" : "Payment"}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    sortable: true,
    render: (row) => (
      <span
        className={`tabular-nums ${
          row.type === "charge" ? "text-receivable" : "text-credit"
        }`}
      >
        {row.type === "charge" ? "+" : "-"}₹
        {row.amount.toLocaleString("en-IN")}
      </span>
    ),
    sortValue: (row) => row.amount,
  },
  {
    key: "note",
    header: "Note",
    render: (row) => (
      <span className="truncate text-muted-foreground max-w-[200px]">
        {row.note ?? "—"}
      </span>
    ),
  },
  {
    key: "source",
    header: "Source",
    render: (row) => (
      <span className="text-xs text-muted-foreground">
        {row.source === "import" ? "Import" : "Manual"}
      </span>
    ),
  },
];

const summaryColumns: Column<PeriodSummary & { index: number }>[] = [
  {
    key: "label",
    header: "Period",
    render: (row) => <span className="font-medium">{row.label}</span>,
  },
  {
    key: "count",
    header: "Transactions",
    align: "center",
    render: (row) => <span className="tabular-nums">{row.count}</span>,
  },
  {
    key: "charges",
    header: "Charges",
    align: "right",
    render: (row) => (
      <span className="tabular-nums text-receivable">
        ₹{row.charges.toLocaleString("en-IN")}
      </span>
    ),
  },
  {
    key: "payments",
    header: "Payments",
    align: "right",
    render: (row) => (
      <span className="tabular-nums text-credit">
        ₹{row.payments.toLocaleString("en-IN")}
      </span>
    ),
  },
  {
    key: "net",
    header: "Net",
    align: "right",
    render: (row) => (
      <span
        className={`tabular-nums ${row.net >= 0 ? "text-receivable" : "text-credit"}`}
      >
        {row.net >= 0 ? "+" : ""}₹
        {Math.abs(row.net).toLocaleString("en-IN")}
      </span>
    ),
  },
];

export function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const initialPreset = searchParams.get("range") === "today"
    ? "today"
    : searchParams.get("range") === "this-week"
      ? "this-week"
      : "this-month";

  const [view, setView] = useState<ViewMode>("detailed");
  const [datePreset, setDatePreset] = useState(initialPreset);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [customerSearch, setCustomerSearch] = useState("");
  const { sortBy, sortDir, toggleSort } = useSort("date", "desc");
  const [groupBy, setGroupBy] = useState<GroupBy>("day");

  const [transactions, setTransactions] = useState<TransactionWithCustomer[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(customerSearch, 200);

  const dateRange = useMemo(() => {
    switch (datePreset) {
      case "today":
        return getTodayRange();
      case "this-week":
        return getThisWeekRange();
      case "this-month":
        return getThisMonthRange();
      case "custom":
        return customStart && customEnd
          ? {
              start: new Date(customStart).toISOString(),
              end: new Date(
                new Date(customEnd).setHours(23, 59, 59, 999),
              ).toISOString(),
            }
          : null;
      default:
        return null;
    }
  }, [datePreset, customStart, customEnd]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const txsWithNames = await getAllTransactions({
        dateRange,
        typeFilter,
      });

      setTransactions(txsWithNames);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load transactions",
      );
    } finally {
      setLoading(false);
    }
  }, [dateRange, typeFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => void fetchData();
    window.addEventListener("transaction-saved", handler);
    return () => window.removeEventListener("transaction-saved", handler);
  }, [fetchData]);

  const filtered = useMemo(() => {
    let result = transactions;

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.customer_name?.toLowerCase().includes(q) ||
          tx.customer_phone?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [transactions, debouncedSearch]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === "date") {
        const cmp =
          new Date(a.occurred_at).getTime() -
          new Date(b.occurred_at).getTime();
        return sortDir === "desc" ? -cmp : cmp;
      }
      const cmp = a.amount - b.amount;
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [filtered, sortBy, sortDir]);

  const detailedWithMs = useMemo(
    () => sorted.map((tx) => ({ ...tx, occurredAtMs: new Date(tx.occurred_at).getTime() })),
    [sorted],
  );

  const grouped = useMemo(
    () => groupTransactions(filtered, groupBy),
    [filtered, groupBy],
  );

  const groupedWithIndex = useMemo(
    () => grouped.map((g, i) => ({ ...g, index: i })),
    [grouped],
  );

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        Transactions
      </h2>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Label htmlFor="view-toggle" className="sr-only">
            View mode
          </Label>
          <Button
            variant={view === "detailed" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("detailed")}
          >
            Detailed
          </Button>
          <Button
            variant={view === "summarized" ? "default" : "ghost"}
            size="sm"
            onClick={() => setView("summarized")}
          >
            Summarized
          </Button>
        </div>

        <div className="h-6 w-px bg-border" />

        <div className="flex items-center gap-2">
          <Label htmlFor="date-preset" className="text-xs text-muted-foreground">
            Date
          </Label>
          <Select value={datePreset} onValueChange={(v) => { if (v) setDatePreset(v); }}>
            <SelectTrigger id="date-preset" className="w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this-week">This Week</SelectItem>
              <SelectItem value="this-month">This Month</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {datePreset === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="w-[150px]"
              aria-label="Start date"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="w-[150px]"
              aria-label="End date"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Label htmlFor="type-filter" className="text-xs text-muted-foreground">
            Type
          </Label>
          <Select value={typeFilter} onValueChange={(v) => { if (v) setTypeFilter(v as FilterType); }}>
            <SelectTrigger id="type-filter" className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="charge">Charge</SelectItem>
              <SelectItem value="payment">Payment</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="relative">
          <Label htmlFor="customer-search-tx" className="sr-only">
            Search by customer
          </Label>
          <Input
            id="customer-search-tx"
            type="search"
            placeholder="Search customer..."
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            className="w-[180px]"
          />
        </div>
      </div>

      {view === "summarized" && (
        <div className="flex items-center gap-2">
          <Label htmlFor="group-by" className="text-xs text-muted-foreground">
            Group by
          </Label>
          <Select value={groupBy} onValueChange={(v) => { if (v) setGroupBy(v as GroupBy); }}>
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

      <div className="text-xs text-muted-foreground" aria-live="polite">
        {filtered.length} of {transactions.length} transactions
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
          <button
            type="button"
            onClick={() => void fetchData()}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {view === "detailed" && (
        <DataTable
          columns={detailedColumns}
          rows={detailedWithMs}
          getRowKey={(row) => row.id}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={toggleSort}
          loading={loading}
          emptyState={
            transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No transactions exist yet. Add a transaction from a customer&apos;s
                page to get started.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No transactions match these filters.
              </p>
            )
          }
        />
      )}

      {view === "summarized" && (
        <DataTable
          columns={summaryColumns}
          rows={groupedWithIndex}
          getRowKey={(row) => String(row.index)}
          loading={loading}
          emptyState={
            transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No transactions exist yet. Add a transaction from a customer&apos;s
                page to get started.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                No transactions match these filters.
              </p>
            )
          }
        />
      )}
    </div>
  );
}
