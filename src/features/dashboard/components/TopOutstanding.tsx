import { Link } from "react-router-dom";
import { LeaderRow } from "@/components/app/LeaderRow";
import { Monogram } from "@/components/app/Monogram";
import { Card } from "@/components/ui/card";
import { paths } from "@/lib/paths";
import type { DashboardTopDebtor } from "@/features/transactions/api";

/**
 * L-06 — the money map: up to 5 customers carrying the biggest debts
 * as leader rows, each showing its share of the total receivable.
 * dashboard_summary's `top_debtors` is already filtered to balance > 0
 * and sorted descending in SQL; the component shows at most 5 and
 * never re-derives balances client-side. An empty set is the calm
 * "All settled" state.
 */
export function TopOutstanding({
  businessId,
  customers,
  total,
}: {
  businessId: string;
  customers: DashboardTopDebtor[];
  total: number;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-bold">
          Top outstanding balances
        </h2>
        <Link
          to={paths.customers(businessId)}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
        >
          View all
        </Link>
      </div>

      {customers.length === 0 ? (
        <div className="mt-3 rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
          All settled — no outstanding balances.
        </div>
      ) : (
        <div className="mt-1" role="list" aria-label="Top outstanding balances">
          {customers.slice(0, 5).map((customer) => {
            const share = Math.round(
              (customer.balance / Math.max(total, 1)) * 100,
            );
            return (
              <LeaderRow
                key={customer.id}
                size="lg"
                tone="receivable"
                leading={<Monogram name={customer.name} tone="receivable" />}
                label={
                  <Link
                    to={paths.customerDetail(businessId, customer.id)}
                    className="underline-offset-4 hover:text-primary hover:underline"
                  >
                    {customer.name}
                  </Link>
                }
                sub={`${share}% of the total`}
                amount={customer.balance}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
}
