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
import { DataTable, type Column } from "@/components/DataTable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSort } from "@/hooks/useSort";
import { listCustomers, createCustomer } from "@/lib/customers";
import { getAllCustomerBalances } from "@/lib/transactions";
import type { Customer, CustomerWithBalance } from "@/types";

type FilterStatus = "all" | "owes" | "credit" | "settled";

function formatBalance(balance: number): string {
  if (balance === 0) return "Settled";
  return `₹${Math.abs(balance).toLocaleString("en-IN")}`;
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

const columns: Column<CustomerWithBalance>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true,
    render: (row) => (
      <div>
        <p className="font-medium text-foreground">{row.name}</p>
        {row.phone && (
          <p className="text-sm text-muted-foreground">{row.phone}</p>
        )}
      </div>
    ),
    sortValue: (row) => row.name,
  },
  {
    key: "balance",
    header: "Balance",
    align: "right",
    sortable: true,
    render: (row) => (
      <div>
        <p className={`text-sm tabular-nums ${getBalanceClass(row.balance)}`}>
          {formatBalance(row.balance)}
        </p>
        <p className="text-xs text-muted-foreground">
          {getBalanceLabel(row.balance)}
        </p>
      </div>
    ),
    sortValue: (row) => row.balance,
  },
];

export function CustomersPage() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const { sortBy, sortDir, toggleSort } = useSort("name", "asc");

  const debouncedSearch = useDebouncedValue(search, 200);

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
      const aVal = sortBy === "name" ? a.name : a.balance;
      const bVal = sortBy === "name" ? b.name : b.balance;
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });

    return result;
  }, [customersWithBalance, debouncedSearch, filter, sortBy, sortDir]);

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

  let emptyMessage: React.ReactNode = null;
  if (!loading && !hasCustomers) {
    emptyMessage = (
      <>
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
      </>
    );
  } else if (hasCustomers && filtered.length === 0 && debouncedSearch.trim()) {
    emptyMessage = <>No customers match &ldquo;{debouncedSearch}&rdquo;</>;
  } else if (hasCustomers && filtered.length === 0 && filter !== "all") {
    emptyMessage = (
      <>
        {filter === "owes" && "No customers currently owe you money."}
        {filter === "credit" && "You don't owe any customers money."}
        {filter === "settled" && "No customers are fully settled yet."}
      </>
    );
  }

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

            <span className="text-xs text-muted-foreground" aria-live="polite">
              {filtered.length} of {customers.length} customers
            </span>
          </div>
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

      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(row) => row.id}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={toggleSort}
        onRowClick={(row) => navigate(`/customers/${row.id}`)}
        loading={loading}
        loadingRowCount={5}
        emptyState={emptyMessage}
      />

      <CustomerFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleAddCustomer}
        mode="add"
      />
    </div>
  );
}
