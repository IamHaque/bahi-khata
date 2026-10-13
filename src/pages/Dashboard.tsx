import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { paths, transactionsPath } from "@/lib/paths";
import { Button } from "@/components/ui/button";
import { QuickAddTransactionSheet } from "@/components/QuickAddTransactionSheet";
import { useCustomers } from "@/features/customers/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import {
  useAllCustomerBalances,
  useTodayActivity,
  useTodayTransactions,
} from "@/features/transactions/hooks";
import type { CustomerWithBalance } from "@/types";

export function DashboardPage() {
  const { user } = useAuth();
  // "" only happens in tests that render the page outside /b/:businessId;
  // falsy businessId behaves unscoped (v1 transitional), same as undefined.
  const businessId = useScopedBusinessId() ?? "";
  const { data: customers = [], isLoading, error, refetch } =
    useCustomers(businessId);
  const { data: balances = {} } = useAllCustomerBalances(businessId);
  const { data: todayActivity } = useTodayActivity(businessId);
  const { data: todayTransactions = [] } = useTodayTransactions(5, businessId);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const customersWithBalance: CustomerWithBalance[] = useMemo(
    () =>
      customers.map((c) => ({
        ...c,
        balance: balances[c.id] ?? 0,
      })),
    [customers, balances],
  );

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

  const topDebtors = useMemo(
    () =>
      [...customersWithBalance]
        .filter((c) => c.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 10),
    [customersWithBalance],
  );

  const todayCount = todayActivity?.count ?? 0;

  if (isLoading) {
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
        {error.message}
        <button
          type="button"
          onClick={() => void refetch()}
          className="ml-3 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Dashboard
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome{user?.email ? `, ${user.email.split("@")[0]}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setQuickAddOpen(true)}>Add Transaction</Button>
        </div>
      </div>

      <div className="rounded-lg bg-accent-wash p-6">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Total Receivable</p>
            <p
              className="text-4xl font-bold tabular-nums tracking-tight text-receivable"
              style={{ letterSpacing: "-0.02em" }}
              aria-label={`Total amount owed to the business: ₹${receivable.toLocaleString("en-IN")}`}
            >
              ₹{receivable.toLocaleString("en-IN")}
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
              aria-label={`Total amount the business owes customers: ₹${credit.toLocaleString("en-IN")}`}
            >
              ₹{credit.toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-muted-foreground">
              Business owes customers
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Net Position</p>
            <p
              className={`text-4xl font-bold tabular-nums tracking-tight ${
                receivable - credit >= 0
                  ? "text-receivable"
                  : "text-credit"
              }`}
              style={{ letterSpacing: "-0.02em" }}
              aria-label={`Net position: ₹${Math.abs(receivable - credit).toLocaleString("en-IN")} ${receivable - credit >= 0 ? "receivable" : "payable"}`}
            >
              {receivable - credit >= 0 ? "+" : "-"}₹
              {Math.abs(receivable - credit).toLocaleString("en-IN")}
            </p>
            <p className="text-xs text-muted-foreground">
              {receivable - credit >= 0
                ? "Net amount owed to business"
                : "Net amount owed to customers"}
            </p>
          </div>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{openCount}</span>{" "}
        customer{openCount !== 1 ? "s" : ""} with outstanding balances
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">
            Top Outstanding Balances
          </h3>
          <Link
            to={paths.customers(businessId)}
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
                to={paths.customerDetail(businessId, customer.id)}
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
              to={transactionsPath(businessId, { range: "today" })}
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
                to={paths.customerDetail(businessId, tx.customer_id)}
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

      <QuickAddTransactionSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
    </div>
  );
}
