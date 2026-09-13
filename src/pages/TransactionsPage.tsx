import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
import { supabase } from "@/lib/supabase";
import type { Transaction } from "@/types";

type ViewMode = "detailed" | "summarized";
type FilterType = "all" | "charge" | "payment";
type GroupBy = "day" | "week" | "month";

interface TransactionWithCustomer extends Transaction {
  customer_name: string;
  customer_phone: string;
}

interface PeriodSummary {
  label: string;
  count: number;
  charges: number;
  payments: number;
  net: number;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
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

export function TransactionsPage() {
  const [view, setView] = useState<ViewMode>("detailed");
  const [datePreset, setDatePreset] = useState("this-month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [customerSearch, setCustomerSearch] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [groupBy, setGroupBy] = useState<GroupBy>("day");

  const [transactions, setTransactions] = useState<TransactionWithCustomer[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedSearch = useDebounce(customerSearch, 200);

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

      let query = supabase
        .from("transactions")
        .select("*, customers(name, phone)")
        .in("status", ["active", "edited"]);

      if (dateRange) {
        query = query
          .gte("occurred_at", dateRange.start)
          .lt("occurred_at", dateRange.end);
      }

      if (typeFilter !== "all") {
        query = query.eq("type", typeFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const txsWithNames: TransactionWithCustomer[] = (
        data as Array<Transaction & { customers: { name: string; phone: string } | null }>
      ).map((tx) => ({
        ...tx,
        customer_name: tx.customers?.name ?? "Unknown",
        customer_phone: tx.customers?.phone ?? "",
      }));

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

    result = [...result].sort((a, b) => {
      if (sortBy === "date") {
        const cmp =
          new Date(a.occurred_at).getTime() -
          new Date(b.occurred_at).getTime();
        return sortDir === "desc" ? -cmp : cmp;
      }
      const cmp = a.amount - b.amount;
      return sortDir === "desc" ? -cmp : cmp;
    });

    return result;
  }, [transactions, debouncedSearch, sortBy, sortDir]);

  const grouped = useMemo(
    () => groupTransactions(filtered, groupBy),
    [filtered, groupBy],
  );

  const toggleSort = (col: "date" | "amount") => {
    if (sortBy === col) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };

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

      {loading && (
        <div className="space-y-2" role="status" aria-label="Loading transactions">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

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

      {!loading && !error && transactions.length === 0 && (
        <div className="rounded-md border border-border bg-muted/50 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No transactions exist yet. Add a transaction from a customer&apos;s
            page to get started.
          </p>
        </div>
      )}

      {!loading && !error && transactions.length > 0 && filtered.length === 0 && (
        <div className="rounded-md border border-border bg-muted/50 px-6 py-8 text-center text-sm text-muted-foreground">
          No transactions match these filters.
        </div>
      )}

      {!loading && !error && view === "detailed" && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th
                  className="cursor-pointer px-3 py-2 text-left font-medium hover:bg-muted"
                  onClick={() => toggleSort("date")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSort("date");
                    }
                  }}
                  tabIndex={0}
                  role="columnheader"
                  aria-sort={
                    sortBy === "date"
                      ? sortDir === "desc"
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  Date{" "}
                  {sortBy === "date" && (sortDir === "desc" ? "↓" : "↑")}
                </th>
                <th className="px-3 py-2 text-left font-medium" scope="col">
                  Customer
                </th>
                <th className="px-3 py-2 text-left font-medium" scope="col">
                  Type
                </th>
                <th
                  className="cursor-pointer px-3 py-2 text-right font-medium hover:bg-muted"
                  onClick={() => toggleSort("amount")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSort("amount");
                    }
                  }}
                  tabIndex={0}
                  role="columnheader"
                  aria-sort={
                    sortBy === "amount"
                      ? sortDir === "desc"
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  Amount{" "}
                  {sortBy === "amount" && (sortDir === "desc" ? "↓" : "↑")}
                </th>
                <th className="px-3 py-2 text-left font-medium" scope="col">
                  Note
                </th>
                <th className="px-3 py-2 text-center font-medium" scope="col">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2 tabular-nums">
                    {new Date(tx.occurred_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      to={`/customers/${tx.customer_id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {tx.customer_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                        tx.type === "charge"
                          ? "bg-receivable/10 text-receivable"
                          : "bg-credit/10 text-credit"
                      }`}
                    >
                      {tx.type === "charge" ? "Charge" : "Payment"}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      tx.type === "charge" ? "text-receivable" : "text-credit"
                    }`}
                  >
                    {tx.type === "charge" ? "+" : "-"}₹
                    {tx.amount.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">
                    {tx.note ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-muted-foreground">
                    {tx.source === "import" ? "Import" : "Manual"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && view === "summarized" && grouped.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left font-medium" scope="col">
                  Period
                </th>
                <th className="px-3 py-2 text-center font-medium" scope="col">
                  Transactions
                </th>
                <th className="px-3 py-2 text-right font-medium" scope="col">
                  Charges
                </th>
                <th className="px-3 py-2 text-right font-medium" scope="col">
                  Payments
                </th>
                <th className="px-3 py-2 text-right font-medium" scope="col">
                  Net
                </th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((group, i) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-3 py-2 font-medium">{group.label}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {group.count}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-receivable">
                    ₹{group.charges.toLocaleString("en-IN")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-credit">
                    ₹{group.payments.toLocaleString("en-IN")}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      group.net >= 0 ? "text-receivable" : "text-credit"
                    }`}
                  >
                    {group.net >= 0 ? "+" : ""}₹
                    {Math.abs(group.net).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
