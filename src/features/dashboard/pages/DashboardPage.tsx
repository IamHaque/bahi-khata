import { useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState } from "@/components/app/ErrorState";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/features/business/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { CustomerFormDialog } from "@/features/customers/components/CustomerFormDialog";
import { useDashboardSummary } from "@/features/transactions/hooks";
import { openTransactionSheet } from "@/features/transactions/sheetStore";
import { formatMoney } from "@/lib/format";
import { paths, transactionsPath } from "@/lib/paths";
import { FirstRunCard } from "../components/FirstRunCard";
import { TopOutstanding } from "../components/TopOutstanding";
import { TrendChart } from "../components/TrendChart";
import { ActivityFeed } from "../components/ActivityFeed";

/**
 * S-36 — the business at a glance, every figure from the
 * dashboard_summary RPC (one scoped read): receivables, credit, open
 * accounts and today's count/net — voided transactions and archived
 * customers excluded at the source. The receivable is the number the
 * business came for, so it is the largest card; the Today card opens
 * the transactions page filtered to today with identical figures. The
 * v1 page's client-side sums and its today list are gone: this page
 * interprets nothing, it displays what the database computed. S-37
 * adds the trend chart and the activity feed as independent sections
 * below the summary, each with its own states.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const businessId = useScopedBusinessId() ?? "";
  const { can, isOwner } = usePermissions();
  const summary = useDashboardSummary(businessId);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);

  const data = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome${
          user?.email ? `, ${user.email.split("@")[0]}` : ""
        }`}
      >
        {/* S-36 quick actions: Owners and Editors only — a Viewer
            reads the numbers, never the writes (S-21). */}
        {can("manageCustomers") && (
          <Button variant="outline" onClick={() => setCustomerFormOpen(true)}>
            Add customer
          </Button>
        )}
        {can("manageTransactions") && (
          <Button onClick={() => openTransactionSheet()}>
            Add Transaction
          </Button>
        )}
      </PageHeader>

      {summary.isPending && (
        <div className="space-y-6" role="status" aria-label="Loading dashboard">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((slot) => (
              <div
                key={slot}
                className="space-y-2 rounded-xl border border-border bg-card p-4"
              >
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-8 w-32 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
        </div>
      )}

      {summary.isError && (
        <ErrorState
          message={
            summary.error instanceof Error
              ? summary.error.message
              : "The dashboard could not be loaded."
          }
          onRetry={() => void summary.refetch()}
        />
      )}

      {data && (
        <>
          {data.customer_count === 0 && (
            <FirstRunCard
              businessId={businessId}
              canAddCustomer={can("manageCustomers")}
              canAddTransaction={can("manageTransactions")}
              isOwner={isOwner}
              onAddCustomer={() => setCustomerFormOpen(true)}
              onAddTransaction={() => openTransactionSheet()}
            />
          )}

          <section
            aria-label="Key figures"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {/* The receivable is the largest card — the PRD pins it as
                the figure the business came for. */}
            <StatCard
              label="Total owes you"
              value={formatMoney(data.total_receivable)}
              hint="Customers owe the business"
              valueClassName="text-4xl text-receivable"
            />
            <StatCard
              label="Total you owe"
              value={formatMoney(data.total_credit)}
              hint="Business owes customers"
              valueClassName="text-credit"
            />
            <StatCard
              label="Open accounts"
              value={data.open_accounts}
              hint="Customers with a non-zero balance"
            />
            {/* S-36 "Today links through": the card itself opens the
                transactions page filtered to today — both sides read
                the same count and net (same exclusions at the source:
                voided out, archived customers out). */}
            <Link
              to={transactionsPath(businessId, { range: "today" })}
              className="group block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <StatCard
                label="Today's activity"
                value={data.today_count}
                hint={`Net ${formatMoney(data.today_net)}`}
                className="transition-colors group-hover:border-ring"
              />
            </Link>
          </section>

          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-foreground">
                Top outstanding balances
              </h3>
              <Link
                to={paths.customers(businessId)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                View all
              </Link>
            </div>
            <div className="mt-3">
              <TopOutstanding
                businessId={businessId}
                customers={data.top_debtors}
              />
            </div>
          </div>
        </>
      )}

      {/* S-37: two independent reads, each with its own states — they
          render even when the summary above failed. */}
      <TrendChart businessId={businessId} />
      <ActivityFeed businessId={businessId} />

      <CustomerFormDialog
        open={customerFormOpen}
        onOpenChange={setCustomerFormOpen}
        businessId={businessId}
        mode="add"
      />
    </div>
  );
}
