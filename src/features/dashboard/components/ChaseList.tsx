import { Link } from "react-router-dom";
import { LeaderRow } from "@/components/app/LeaderRow";
import { Monogram } from "@/components/app/Monogram";
import { AgeFlag } from "@/components/app/AgeFlag";
import { Card } from "@/components/ui/card";
import { paths } from "@/lib/paths";
import { CHASE_AFTER_DAYS, formatLastPaymentSub } from "../chase";
import { useLastPayments } from "../hooks";
import type { DashboardTopDebtor } from "@/features/transactions/api";

export interface ChaseListProps {
  businessId: string;
  customers: DashboardTopDebtor[];
  lastPaymentsOverride?: Record<string, string | null>;
}

export function ChaseList({
  businessId,
  customers,
  lastPaymentsOverride,
}: ChaseListProps) {
  const topDebtors = customers.slice(0, 5);
  const ids = topDebtors.map((c) => c.id);

  const { data: queriedPayments } = useLastPayments(
    businessId,
    lastPaymentsOverride ? [] : ids,
  );
  const payments = lastPaymentsOverride ?? queriedPayments ?? {};

  return (
    <Card className="p-6 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading text-xl font-bold">Who to chase</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Largest balances first. Flagged when nothing was paid for {CHASE_AFTER_DAYS} days.
      </p>

      {topDebtors.length === 0 ? (
        <div className="mt-3 rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
          All settled — no outstanding balances.
        </div>
      ) : (
        <>
          <div className="mt-1" role="list" aria-label="Who to chase">
            {topDebtors.map((customer) => {
              const lastPaymentAt = payments[customer.id];
              const { sub, days } = formatLastPaymentSub(lastPaymentAt);

              return (
                <LeaderRow
                  key={customer.id}
                  size="lg"
                  tone="receivable"
                  leading={<Monogram name={customer.name} tone="receivable" />}
                  label={
                    <Link
                      to={paths.customerDetail(businessId, customer.id)}
                      className="block w-full truncate underline-offset-4 hover:text-primary hover:underline pointer-coarse:before:absolute pointer-coarse:before:inset-0 pointer-coarse:min-h-11 pointer-coarse:flex pointer-coarse:items-center"
                    >
                      {customer.name}
                    </Link>
                  }
                  sub={sub}
                  trailing={<AgeFlag days={days} />}
                  amount={customer.balance}
                  className="relative"
                />
              );
            })}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            <Link
              to={`${paths.customers(businessId)}?sort=balance-desc`}
              className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground touch-target"
            >
              See all customers who owe &rarr;
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
