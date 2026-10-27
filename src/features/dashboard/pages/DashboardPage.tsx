import { useState } from "react";
import { ErrorState } from "@/components/app/ErrorState";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/features/business/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { CustomerFormDialog } from "@/features/customers/components/CustomerFormDialog";
import { useDashboardSummary } from "@/features/transactions/hooks";
import { openTransactionSheet } from "@/features/transactions/sheetStore";
import { transactionsPath } from "@/lib/paths";
import { DayBook } from "../components/DayBook";
import { FirstRunCard } from "../components/FirstRunCard";
import { PositionSheet } from "../components/PositionSheet";
import { TopOutstanding } from "../components/TopOutstanding";
import { TrendChart } from "../components/TrendChart";

/**
 * S-36 / L-06 — the dashboard as a ledger page: every figure from the
 * dashboard_summary RPC (one scoped read: receivables, credit, open
 * accounts, today's count/net — voided transactions and archived
 * customers excluded at the source). The four stat tiles are gone
 * (F-16: the text-4xl total clipped); the page is now two sheets —
 * Where you stand and Top outstanding balances — over a row with the
 * day book and the week chart, each of the latter two an independent
 * read with its own states. The Today line opens Transactions filtered
 * to today with identical figures.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const businessId = useScopedBusinessId() ?? "";
  const { can, isOwner } = usePermissions();
  const summary = useDashboardSummary(businessId);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);

  const data = summary.data;
  const userEmail = user?.email ? `, ${user.email.split("@")[0]}` : "";
  const userName = user?.user_metadata?.name ? `, ${user?.user_metadata?.name}` : "";
  // The v2 "Today's activity" href, kept byte for byte.
  const todayHref = transactionsPath(businessId, { range: "today" });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome${userName || userEmail}`}
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
            Add transaction
          </Button>
        )}
      </PageHeader>

      {summary.isPending && (
        <div className="space-y-6" role="status" aria-label="Loading dashboard">
          <div className="grid gap-6 lg:grid-cols-2">
            {[0, 1].map((slot) => (
              <div
                key={slot}
                className="rounded-lg border border-border bg-card p-6"
              >
                <div className="h-5 w-36 animate-pulse rounded bg-muted" />
                <div className="mt-4 space-y-3">
                  <div className="h-9 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-9 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="h-56 animate-pulse rounded-lg border border-border bg-card" />
            <div className="h-56 animate-pulse rounded-lg border border-border bg-card" />
          </div>
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

          {/* L-06 row 1: where you stand, then the second sheet. Gate
              G-A1 is pending, so Top outstanding balances is this
              slot's final content. */}
          <div className="grid gap-6 lg:grid-cols-2">
            <PositionSheet
              openAccounts={data.open_accounts}
              totalReceivable={data.total_receivable}
              totalCredit={data.total_credit}
              todayCount={data.today_count}
              todayNet={data.today_net}
              todayHref={todayHref}
            />
            <TopOutstanding
              businessId={businessId}
              customers={data.top_debtors}
              total={data.total_receivable}
            />
          </div>
        </>
      )}

      {/* L-06 row 2: the day book and the week chart — two independent
          reads, each with its own states; they render even when the
          summary above failed. */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <DayBook businessId={businessId} />
        <TrendChart businessId={businessId} />
      </div>

      <CustomerFormDialog
        open={customerFormOpen}
        onOpenChange={setCustomerFormOpen}
        businessId={businessId}
        mode="add"
      />
    </div>
  );
}
