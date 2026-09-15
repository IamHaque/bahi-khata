import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { listCustomers } from "@/lib/customers";
import { getAllCustomerBalances, getTodayActivity, getTodayTransactions } from "@/lib/transactions";
import type { CustomerWithBalance } from "@/types";

interface TodayTx {
  id: string;
  type: "charge" | "payment";
  amount: number;
  occurred_at: string;
  customer_id: string;
  customer_name: string;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalReceivable, setTotalReceivable] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [topDebtors, setTopDebtors] = useState<CustomerWithBalance[]>([]);
  const [openBalanceCount, setOpenBalanceCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [todayTransactions, setTodayTransactions] = useState<TodayTx[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [customers, balances, todayActivity, todayTxs] = await Promise.all([
        listCustomers(),
        getAllCustomerBalances(),
        getTodayActivity(),
        getTodayTransactions(5),
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
      setTodayTransactions(todayTxs);
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
      <div className="space-y-6" role="status" aria-label="Loading dashboard">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="space-y-2">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-12 w-40 animate-pulse rounded bg-muted" />
          </div>
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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Welcome{user?.email ? `, ${user.email.split("@")[0]}` : ""}
        </p>
      </div>

      <div className="rounded-lg bg-accent-wash p-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Receivable</p>
            <p
              className="text-4xl font-bold tabular-nums tracking-tight text-receivable"
              style={{ letterSpacing: "-0.02em" }}
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
              className="text-4xl font-bold tabular-nums tracking-tight text-credit"
              style={{ letterSpacing: "-0.02em" }}
              aria-label={`Total amount the business owes customers: ₹${totalCredit.toLocaleString("en-IN")}`}
            >
              ₹{totalCredit.toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-muted-foreground">
              Business owes customers
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Net Position</p>
            <p
              className={`text-4xl font-bold tabular-nums tracking-tight ${
                totalReceivable - totalCredit >= 0
                  ? "text-receivable"
                  : "text-credit"
              }`}
              style={{ letterSpacing: "-0.02em" }}
              aria-label={`Net position: ₹${Math.abs(totalReceivable - totalCredit).toLocaleString("en-IN")} ${totalReceivable - totalCredit >= 0 ? "receivable" : "payable"}`}
            >
              {totalReceivable - totalCredit >= 0 ? "+" : "-"}₹
              {Math.abs(totalReceivable - totalCredit).toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-muted-foreground">
              {totalReceivable - totalCredit >= 0
                ? "Net amount owed to business"
                : "Net amount owed to customers"}
            </p>
          </div>
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
          <div className="mt-3 space-y-0" role="list" aria-label="Top outstanding balances">
            {topDebtors.map((customer) => (
              <Link
                key={customer.id}
                to={`/customers/${customer.id}`}
                role="listitem"
                className="flex items-center justify-between border-b border-border px-3 py-2 transition-colors hover:bg-muted"
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
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">
            Today&apos;s Activity
          </h3>
          {todayCount > 0 && (
            <Link
              to="/transactions?range=today"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          )}
        </div>
        {todayCount === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No activity yet today.
          </p>
        ) : (
          <div className="mt-2 space-y-0 rounded-md border border-border">
            {todayTransactions.map((tx) => (
              <Link
                key={tx.id}
                to={`/customers/${tx.customer_id}`}
                className="flex items-center justify-between border-b border-border px-3 py-2 transition-colors hover:bg-muted last:border-0"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-foreground">
                    {tx.customer_name}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {tx.type === "charge" ? "Charge" : "Payment"}
                  </span>
                </div>
                <span
                  className={`ml-4 text-sm tabular-nums ${
                    tx.type === "charge" ? "text-receivable" : "text-credit"
                  }`}
                >
                  {tx.type === "charge" ? "+" : "-"}₹
                  {tx.amount.toLocaleString("en-IN")}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
