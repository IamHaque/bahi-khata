import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { BalanceBadge } from "@/components/app/BalanceBadge";
import { Button } from "@/components/ui/button";
import { useBusiness } from "@/features/business/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { useCustomer } from "@/features/customers/hooks";
import { useCustomerLedger } from "@/features/transactions/hooks";
import type { CustomerLedgerRow } from "@/features/transactions/api";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import { paths } from "@/lib/paths";

// S-39 — the printable statement: business name, customer, a period
// selector, the ledger with the server's running balance and the
// closing balance. Every member may open and print it (Viewers
// included). The running balances come straight from the customer_ledger
// RPC (migration 0006) — `balance_after` is cumulative from the start
// of time, so the closing balance of a PERIOD is the last visible
// row's balance_after, and with no rows in the period it is the
// standing at the period's end (the last entry on or before `to`).

/** The entry's day in the BROWSER's timezone, matching the date inputs. */
function localDay(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

// A stable empty list: the memos below must not re-run just because
// the query has no data yet (a `?? []` would allocate every render).
const EMPTY_LEDGER: CustomerLedgerRow[] = [];

export function StatementPage() {
  const businessId = useScopedBusinessId() ?? "";
  const { customerId } = useParams<{ customerId: string }>();
  const businessQuery = useBusiness(businessId);
  const customerQuery = useCustomer(customerId ?? "", businessId);
  const ledgerQuery = useCustomerLedger(customerId ?? "", businessId);

  // The period: two date inputs (empty = open-ended), filtering the
  // already-fetched ledger — one customer's full history is one read.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = ledgerQuery.data ?? EMPTY_LEDGER;
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const day = localDay(row.occurred_at);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      }),
    [rows, from, to],
  );

  const closingBalance = useMemo(() => {
    if (visible.length > 0) {
      return visible[visible.length - 1]!.balance_after;
    }
    const asOf = to
      ? rows.filter((row) => localDay(row.occurred_at) <= to)
      : rows;
    return asOf.length > 0 ? (asOf[asOf.length - 1]?.balance_after ?? 0) : 0;
  }, [visible, rows, to]);

  if (ledgerQuery.isPending || businessQuery.isPending || customerQuery.isPending) {
    return (
      <div
        role="status"
        aria-label="Loading statement"
        className="mx-auto max-w-3xl space-y-4 px-4 py-6"
      >
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  if (ledgerQuery.isError || businessQuery.isError || customerQuery.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"
        >
          <p className="text-sm text-destructive">
            The statement could not be loaded.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              void ledgerQuery.refetch();
              void businessQuery.refetch();
              void customerQuery.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const businessName = businessQuery.data?.name ?? "";
  const customer = customerQuery.data;
  const periodLabel = `${from ? formatDate(from) : "the beginning"} — ${
    to ? formatDate(to) : "today"
  }`;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 print:max-w-none print:space-y-4 print:px-0 print:py-0">
      {/* Screen-only controls: back link, period selector, print. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to={paths.customerDetail(businessId, customerId ?? "")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground pointer-coarse:min-h-11"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to customer
        </Link>
        {/* S-41: the period controls wrap on narrow screens instead of
            pushing the page wider than the viewport. */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-muted-foreground" htmlFor="from">
            From
          </label>
          <input
            id="from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm pointer-coarse:min-h-11"
          />
          <label className="text-sm text-muted-foreground" htmlFor="to">
            To
          </label>
          <input
            id="to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm pointer-coarse:min-h-11"
          />
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Print
          </Button>
        </div>
      </div>

      {/* The printable statement itself. */}
      <article className="rounded-lg border border-border bg-card p-6 print:border-0 print:bg-white print:p-0 print:text-black">
        <h1 className="font-heading text-xl font-semibold">{businessName}</h1>
        <p className="mt-1 text-sm text-muted-foreground print:text-black">
          Statement for{" "}
          <span className="font-medium text-foreground">
            {customer?.name ?? ""}
          </span>
          {customer?.phone ? ` · ${customer.phone}` : ""}
        </p>
        <p className="text-sm text-muted-foreground print:text-black">
          Period: {periodLabel}
        </p>

        {visible.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground print:text-black">
            No entries in this period.
          </p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground print:border-black">
                <th scope="col" className="py-2 font-medium print:text-black">
                  Date
                </th>
                <th scope="col" className="py-2 font-medium print:text-black">
                  Type
                </th>
                <th
                  scope="col"
                  className="py-2 text-right font-medium print:text-black"
                >
                  Amount
                </th>
                <th scope="col" className="py-2 font-medium print:text-black">
                  Note
                </th>
                <th
                  scope="col"
                  className="py-2 text-right font-medium print:text-black"
                >
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const voided = row.status === "voided";
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-border/50 last:border-0 print:border-black/20",
                      voided && "text-muted-foreground",
                    )}
                  >
                    <td className="py-2 whitespace-nowrap print:text-black">
                      {formatDate(row.occurred_at)}
                    </td>
                    <td className="py-2 capitalize print:text-black">
                      {row.type}
                      {voided && " (voided)"}
                    </td>
                    <td className="py-2 text-right tabular-nums print:text-black">
                      {formatMoney(row.amount)}
                    </td>
                    <td className="py-2 print:text-black">
                      {row.note ?? "—"}
                    </td>
                    <td className="py-2 text-right font-medium tabular-nums print:text-black">
                      {formatMoney(row.balance_after)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4 print:border-black">
          <p className="text-sm text-muted-foreground print:text-black">
            Closing balance
          </p>
          <p className="text-lg font-semibold tabular-nums print:text-black">
            {formatMoney(closingBalance)}
          </p>
          <BalanceBadge balance={closingBalance} />
        </div>
      </article>
    </div>
  );
}
