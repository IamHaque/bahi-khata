import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { listCustomers } from "@/lib/customers";
import { getAllCustomerBalances, getTodayActivity } from "@/lib/transactions";
import type { CustomerWithBalance } from "@/types";

export function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalReceivable, setTotalReceivable] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [topDebtors, setTopDebtors] = useState<CustomerWithBalance[]>([]);
  const [openBalanceCount, setOpenBalanceCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [todayNet, setTodayNet] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [customers, balances, todayActivity] = await Promise.all([
        listCustomers(),
        getAllCustomerBalances(),
        getTodayActivity(),
      ]);

      const customersWithBalance: CustomerWithBalance[] = customers.map((c) => ({
        ...c,
        balance: balances[c.id] ?? 0,
      }));

      let receivable = 0;
      let credit = 0;
      let openCount = 0;

      for (const c of customersWithBalance) {
        if (c.balance > 0) {
          receivable += c.balance;
          openCount++;
        } else if (c.balance < 0) {
          credit += Math.abs(c.balance);
          openCount++;
        }
      }

      setTotalReceivable(receivable);
      setTotalCredit(credit);
      setOpenBalanceCount(openCount);

      const sorted = [...customersWithBalance]
        .filter((c) => c.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10);
      setTopDebtors(sorted);

      setTodayCount(todayActivity.count);
      setTodayNet(todayActivity.net);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load dashboard",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => void fetchData();
    window.addEventListener("transaction-saved", handler);
    return () => window.removeEventListener("transaction-saved", handler);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-8" role="status" aria-label="Loading dashboard">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-12 w-40 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-12 w-40 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="h-48 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Total Receivable</p>
          <p
            className="text-4xl font-semibold tabular-nums text-receivable"
            aria-label={`Total amount owed to the business: ₹${totalReceivable.toLocaleString("en-IN")}`}
          >
            ₹{totalReceivable.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-muted-foreground">
            Customers owe the business
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Total Credit</p>
          <p
            className="text-4xl font-semibold tabular-nums text-credit"
            aria-label={`Total amount the business owes customers: ₹${totalCredit.toLocaleString("en-IN")}`}
          >
            ₹{totalCredit.toLocaleString("en-IN")}
          </p>
          <p className="text-xs text-muted-foreground">
            Business owes customers
          </p>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{openBalanceCount}</span>{" "}
        customer{openBalanceCount !== 1 ? "s" : ""} with outstanding balances
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">
            Top Outstanding Balances
          </h3>
          <Link
            to="/customers"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all
          </Link>
        </div>

        {topDebtors.length === 0 ? (
          <div className="mt-3 rounded-md border border-border bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            All settled — no outstanding balances.
          </div>
        ) : (
          <div className="mt-3 space-y-1" role="list" aria-label="Top outstanding balances">
            {topDebtors.map((customer) => (
              <Link
                key={customer.id}
                to={`/customers/${customer.id}`}
                role="listitem"
                className="flex items-center justify-between rounded-md px-3 py-2 transition-colors hover:bg-muted"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {customer.name}
                </span>
                <span className="ml-4 text-sm tabular-nums text-receivable">
                  ₹{customer.balance.toLocaleString("en-IN")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-foreground">
          Today&apos;s Activity
        </h3>
        {todayCount === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No activity yet today.
          </p>
        ) : (
          <Link
            to="/transactions"
            className="mt-2 block rounded-md border border-border px-4 py-3 text-sm transition-colors hover:bg-muted"
          >
            <span className="font-medium text-foreground">{todayCount}</span>{" "}
            transaction{todayCount !== 1 ? "s" : ""} today, net{" "}
            <span
              className={`tabular-nums ${
                todayNet >= 0 ? "text-receivable" : "text-credit"
              }`}
            >
              {todayNet >= 0 ? "+" : ""}₹
              {Math.abs(todayNet).toLocaleString("en-IN")}
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
