import { Link, useNavigate } from "react-router-dom";
import { DataTable, type Column } from "@/components/app/DataTable";
import { Money } from "@/components/app/Money";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { paths } from "@/lib/paths";
import { useActivityFeed } from "../hooks";
import type { ActivityFeedItem } from "../api";

/**
 * L-06 / U-04 — Day book: the last 10 entries as a compact DataTable,
 * newest first, from the same scoped read.
 * Columns: Date (fit), Customer (fill: link, note, "by ..." folded),
 * Charged (fit), Paid (fit). Row click opens the transaction.
 */
export function DayBook({ businessId }: { businessId: string }) {
  const navigate = useNavigate();
  const query = useActivityFeed(businessId);
  const items = query.data;

  const columns: Column<ActivityFeedItem>[] = [
    {
      key: "date",
      header: "Date",
      width: "fit",
      render: (item) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDate(item.occurred_at)}
        </span>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      width: "fill",
      render: (item) => (
        <div className="min-w-0">
          <Link
            to={paths.customerDetail(businessId, item.customer_id)}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {item.customer_name}
          </Link>
          {item.note && (
            <span className="block text-xs text-muted-foreground">
              {item.note}
            </span>
          )}
          <span className="mt-0.5 hidden text-xs text-muted-foreground md:block">
            by {item.creator_name ?? "Former member"}
          </span>
        </div>
      ),
    },
    {
      key: "charged",
      header: "Charged",
      align: "right",
      width: "fit",
      render: (item) =>
        item.type === "charge" ? (
          <Money amount={item.amount} className="text-receivable" />
        ) : null,
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      width: "fit",
      render: (item) =>
        item.type === "payment" ? (
          <Money amount={item.amount} className="text-credit" />
        ) : null,
    },
  ];

  return (
    <Card className="p-6 min-w-0" data-slot="card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">Day book</h2>
        <Link
          to={paths.transactions(businessId)}
          className="text-sm font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </div>

      <DataTable
        density="compact"
        columns={columns}
        rows={items ?? []}
        getRowKey={(item) => item.id}
        loading={query.isPending}
        error={
          query.isError
            ? query.error instanceof Error
              ? query.error.message
              : "Recent activity could not be loaded."
            : null
        }
        onRetry={() => void query.refetch()}
        onRowClick={(item) =>
          navigate(paths.transactionDetail(businessId, item.id))
        }
        emptyState={
          <p className="mt-3 text-sm text-muted-foreground">
            No activity yet — the entries you record will appear here.
          </p>
        }
        mobile={(item) => ({
          title: (
            <Link
              to={paths.customerDetail(businessId, item.customer_id)}
              onClick={(e) => e.stopPropagation()}
              className="font-medium text-primary hover:underline"
            >
              {item.customer_name}
            </Link>
          ),
          subtitle: item.note ?? undefined,
          trailing: (
            <Money
              amount={item.amount}
              className={
                item.type === "charge" ? "text-receivable" : "text-credit"
              }
            />
          ),
          meta: `${formatDate(item.occurred_at)} · by ${
            item.creator_name ?? "Former member"
          }`,
        })}
      />
    </Card>
  );
}
