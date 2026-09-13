import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { listCustomers, createCustomer } from "@/lib/customers";
import { getAllCustomerBalances } from "@/lib/transactions";
import type { Customer, CustomerWithBalance } from "@/types";

type FilterStatus = "all" | "owes" | "credit" | "settled";
type SortOption = "name" | "balance-desc" | "balance-asc" | "recent";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function formatBalance(balance: number): string {
  if (balance === 0) return "Settled";
  const abs = Math.abs(balance);
  return balance > 0 ? `₹${abs.toLocaleString("en-IN")}` : `₹${abs.toLocaleString("en-IN")}`;
}

function getBalanceClass(balance: number): string {
  if (balance > 0) return "text-receivable";
  if (balance < 0) return "text-credit";
  return "text-muted-foreground";
}

function getBalanceLabel(balance: number): string {
  if (balance > 0) return "Owes";
  if (balance < 0) return "Credit";
  return "Settled";
}

export function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [sort, setSort] = useState<SortOption>("name");

  const debouncedSearch = useDebounce(search, 200);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      setError(null);
      const [customersData, balancesData] = await Promise.all([
        listCustomers(),
        getAllCustomerBalances(),
      ]);
      setCustomers(customersData);
      setBalances(balancesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCustomers();
  }, []);

  useEffect(() => {
    const handler = () => void fetchCustomers();
    window.addEventListener("transaction-saved", handler);
    return () => window.removeEventListener("transaction-saved", handler);
  }, [fetchCustomers]);

  const customersWithBalance: CustomerWithBalance[] = useMemo(
    () =>
      customers.map((c) => ({
        ...c,
        balance: balances[c.id] ?? 0,
      })),
    [customers, balances],
  );

  const filtered = useMemo(() => {
    let result = customersWithBalance;

    if (debouncedSearch.trim()) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q)),
      );
    }

    if (filter === "owes") {
      result = result.filter((c) => c.balance > 0);
    } else if (filter === "credit") {
      result = result.filter((c) => c.balance < 0);
    } else if (filter === "settled") {
      result = result.filter((c) => c.balance === 0);
    }

    result = [...result].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "balance-desc":
          return b.balance - a.balance;
        case "balance-asc":
          return a.balance - b.balance;
        case "recent":
          return (
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
          );
        default:
          return 0;
      }
    });

    return result;
  }, [customersWithBalance, debouncedSearch, filter, sort]);

  const handleAddCustomer = async (data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  }) => {
    const newCustomer = await createCustomer(data);
    setCustomers((prev) => [...prev, newCustomer]);
  };

  const hasCustomers = customers.length > 0;
  const noSearchResults = hasCustomers && filtered.length === 0 && debouncedSearch.trim();
  const noFilterResults = hasCustomers && filtered.length === 0 && filter !== "all" && !debouncedSearch.trim();
  const trueEmpty = !loading && !hasCustomers;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Customers
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/customers/import")}>
            Import CSV
          </Button>
          <Button onClick={() => setDialogOpen(true)}>Add Customer</Button>
        </div>
      </div>

      {hasCustomers && (
        <div className="sticky top-0 z-10 space-y-3 bg-background pb-2 pt-1">
          <div className="relative">
            <Label htmlFor="customer-search" className="sr-only">
              Search customers
            </Label>
            <Input
              id="customer-search"
              type="search"
              placeholder="Search by name or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-4"
              aria-label="Search customers by name or phone"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="filter-status" className="text-xs text-muted-foreground">
                Filter
              </Label>
              <Select
                value={filter}
                onValueChange={(v) => setFilter(v as FilterStatus)}
              >
                <SelectTrigger
                  id="filter-status"
                  className="w-[140px]"
                  aria-label="Filter by balance status"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="owes">Owes us</SelectItem>
                  <SelectItem value="credit">We owe them</SelectItem>
                  <SelectItem value="settled">Settled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Label htmlFor="sort-by" className="text-xs text-muted-foreground">
                Sort
              </Label>
              <Select
                value={sort}
                onValueChange={(v) => setSort(v as SortOption)}
              >
                <SelectTrigger
                  id="sort-by"
                  className="w-[160px]"
                  aria-label="Sort customers"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="balance-desc">Balance (high–low)</SelectItem>
                  <SelectItem value="balance-asc">Balance (low–high)</SelectItem>
                  <SelectItem value="recent">Recently added</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <span className="text-xs text-muted-foreground" aria-live="polite">
              {filtered.length} of {customers.length} customers
            </span>
          </div>
        </div>
      )}

      {loading && (
        <div className="space-y-3" role="status" aria-label="Loading customers">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
          <button
            type="button"
            onClick={() => void fetchCustomers()}
            className="ml-3 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {trueEmpty && (
        <div className="rounded-md border border-border bg-muted/50 px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No customers yet. Add your first customer to get started.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setDialogOpen(true)}
          >
            Add Customer
          </Button>
        </div>
      )}

      {noSearchResults && (
        <div className="rounded-md border border-border bg-muted/50 px-6 py-8 text-center text-sm text-muted-foreground">
          No customers match &ldquo;{debouncedSearch}&rdquo;
        </div>
      )}

      {noFilterResults && (
        <div className="rounded-md border border-border bg-muted/50 px-6 py-8 text-center text-sm text-muted-foreground">
          {filter === "owes" && "No customers currently owe you money."}
          {filter === "credit" && "You don't owe any customers money."}
          {filter === "settled" && "No customers are fully settled yet."}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-1" role="list" aria-label="Customer list">
          {filtered.map((customer) => (
            <button
              key={customer.id}
              type="button"
              role="listitem"
              onClick={() => navigate(`/customers/${customer.id}`)}
              className="flex w-full items-center justify-between rounded-md px-4 py-3 text-left transition-colors hover:bg-muted"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {customer.name}
                </p>
                {customer.phone && (
                  <p className="truncate text-sm text-muted-foreground">
                    {customer.phone}
                  </p>
                )}
              </div>
              <div className="ml-4 text-right">
                <p className={`text-sm tabular-nums ${getBalanceClass(customer.balance)}`}>
                  {formatBalance(customer.balance)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {getBalanceLabel(customer.balance)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleAddCustomer}
        mode="add"
      />
    </div>
  );
}
