import { Link } from "react-router-dom";
import { ErrorState } from "@/components/app/ErrorState";
import { Money } from "@/components/app/Money";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { paths } from "@/lib/paths";
import { useActivityFeed } from "../hooks";

/**
 * L-06 — the day book (replaces the activity feed): the last 10
 * entries as a ledger table, newest first, from the same scoped read —
 * voided rows gone, archived customers gone, a creator who has since
 * left reads "Former member" (the S-25 / 0002c data contract). A charge
 * lands in the Charged column, a payment in Paid; the loading, error
 * and empty states keep their original text.
 */
export function DayBook({ businessId }: { businessId: string }) {
  const query = useActivityFeed(businessId);
  const items = query.data;

  return (
    <Card className="p-6">
      <h2 className="font-heading text-xl font-bold">Day book</h2>

      {query.isPending && (
        <div
          role="status"
          aria-label="Loading recent activity"
          className="mt-3 space-y-2"
        >
          {[0, 1, 2].map((row) => (
            <div key={row} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="mt-3">
          <ErrorState
            message={
              query.error instanceof Error
                ? query.error.message
                : "Recent activity could not be loaded."
            }
            onRetry={() => void query.refetch()}
          />
        </div>
      )}

      {items !== undefined && items.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          No activity yet — the entries you record will appear here.
        </p>
      )}

      {items !== undefined && items.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th scope="col" className="py-2 pr-3 text-left font-medium">
                  Date
                </th>
                <th scope="col" className="py-2 pr-3 text-left font-medium">
                  Customer
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Charged
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Paid
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3 align-top whitespace-nowrap text-muted-foreground">
                    {formatDate(item.occurred_at)}
                  </td>
                  <td className="py-2 pr-3 align-top">
                    <Link
                      to={paths.customerDetail(businessId, item.customer_id)}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {item.customer_name}
                    </Link>
                    {item.note && (
                      <span className="block text-muted-foreground">
                        {item.note}
                      </span>
                    )}
                    <span className="mt-0.5 hidden text-xs text-muted-foreground md:block">
                      by {item.creator_name ?? "Former member"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 align-top text-right">
                    {item.type === "charge" ? (
                      <Money amount={item.amount} className="text-receivable" />
                    ) : null}
                  </td>
                  <td className="py-2 align-top text-right">
                    {item.type === "payment" ? (
                      <Money amount={item.amount} className="text-credit" />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
