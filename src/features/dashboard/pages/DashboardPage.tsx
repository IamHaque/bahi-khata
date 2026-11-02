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
import { ChaseList } from "../components/ChaseList";
import { TrendChart } from "../components/TrendChart";

/**
 * S-36 / L-06 / U-07 — the dashboard as a ledger page: every figure from the
 * dashboard_summary RPC (one scoped read: receivables, credit, open
 * accounts, today's count/net — voided transactions and archived
 * customers excluded at the source). Row 1 is PositionSheet ("Where you stand")
 * and ChaseList ("Who to chase", replacing TopOutstanding).
 * Row 2 is TrendChart (Activity), and Row 3 is DayBook.
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
          <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-64 animate-pulse rounded-lg border border-border bg-card" />
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

          {/* U-07 (L-13) row 1: Where you stand, then Who to chase */}
          <div className="grid gap-6 lg:grid-cols-2">
            <PositionSheet
              openAccounts={data.open_accounts}
              totalReceivable={data.total_receivable}
              totalCredit={data.total_credit}
              todayCount={data.today_count}
              todayNet={data.today_net}
              todayHref={todayHref}
            />
            <ChaseList
              businessId={businessId}
              customers={data.top_debtors}
            />
          </div>
        </>
      )}

      {/* U-06 (D-34): Row 2 is Activity, full width */}
      <TrendChart businessId={businessId} />

      {/* U-06 (D-34): Row 3 is Day book, full width */}
      <DayBook businessId={businessId} />

      <CustomerFormDialog
        open={customerFormOpen}
        onOpenChange={setCustomerFormOpen}
        businessId={businessId}
        mode="add"
      />
    </div>
  );
}
