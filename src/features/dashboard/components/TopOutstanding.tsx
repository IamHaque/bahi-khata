import { Link } from "react-router-dom";
import { Avatar } from "@/components/app/Avatar";
import { formatMoney } from "@/lib/format";
import { paths } from "@/lib/paths";
import type { DashboardTopDebtor } from "@/features/transactions/api";

/**
 * S-36 — the money map: up to 8 customers carrying the biggest credit
 * (they owe the business). The source is dashboard_summary's
 * `top_debtors`, which is already filtered to balance > 0, sorted
 * descending and capped at 8 in SQL — the component slices to 8 as a
 * belt, never re-derives balances client-side. Each row links to the
 * customer's detail page; an empty set is the calm "All settled" state.
 */
export function TopOutstanding({
  businessId,
  customers,
}: {
  businessId: string;
  customers: DashboardTopDebtor[];
}) {
  if (customers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
        All settled — no outstanding balances.
      </div>
    );
  }

  return (
    <div className="space-y-0" role="list" aria-label="Top outstanding balances">
      {customers.slice(0, 8).map((customer) => (
        <Link
          key={customer.id}
          to={paths.customerDetail(businessId, customer.id)}
          role="listitem"
          className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 transition-colors hover:bg-muted"
        >
          <span className="flex min-w-0 items-center gap-2">
            {/* Decorative initials — the name beside it carries the meaning. */}
            <Avatar name={customer.name} size="sm" />
            <span className="truncate text-sm font-medium text-foreground">
              {customer.name}
            </span>
          </span>
          <span className="ml-4 shrink-0 text-sm tabular-nums text-receivable">
            {formatMoney(customer.balance)}
          </span>
        </Link>
      ))}
    </div>
  );
}
