import { Link } from "react-router-dom";
import { ErrorState } from "@/components/app/ErrorState";
import { formatMoney, formatRelative } from "@/lib/format";
import { paths } from "@/lib/paths";
import { useActivityFeed } from "../hooks";

/**
 * S-37 — recent activity: the last 10 entries as sentences ("Eli
 * recorded a payment of ₹500.00 from Asha Verma, 2 hr ago") with the
 * customer's name linking to their detail page. The feed mirrors the
 * dashboard's figures — voided rows gone, archived customers gone —
 * and a creator who has since left reads "Former member" (the S-25 /
 * 0002c data contract the transactions list already uses).
 */
export function ActivityFeed({ businessId }: { businessId: string }) {
  const query = useActivityFeed(businessId);
  const items = query.data;

  return (
    <section
      aria-label="Recent activity"
      className="rounded-xl border border-border bg-card p-4"
    >
      <h3 className="text-sm font-medium text-foreground">Recent activity</h3>

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
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {item.creator_name ?? "Former member"}
              </span>{" "}
              recorded a{" "}
              <span
                className={
                  item.type === "charge" ? "text-receivable" : "text-credit"
                }
              >
                {item.type === "charge" ? "charge" : "payment"}
              </span>{" "}
              of {formatMoney(item.amount)} from{" "}
              <Link
                to={paths.customerDetail(businessId, item.customer_id)}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {item.customer_name}
              </Link>
              , {formatRelative(item.occurred_at)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
