import { Money } from "@/components/app/Money";

export interface TransactionTotalsValue {
  entries: number;
  total_charged: number;
  total_paid: number;
  net: number;
}

/**
 * L-09 — the totals strip under both views, inside the table's own
 * bordered container: the RPC's ungrouped rollup row, so the figures
 * cover every matching entry, not only the visible page. The
 * `totals-rule` double line is a bookkeeper's total rule; until the
 * rollup answers, every figure is an em dash.
 */
export function TransactionTotals({
  total,
}: {
  total?: TransactionTotalsValue | null;
}) {
  return (
    <section
      aria-label="Totals for the current filter"
      className="totals-rule flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
    >
      <span className="text-muted-foreground">
        Totals for this filter
        {total ? ` · ${total.entries} entries` : ""}
      </span>
      <span className="flex flex-wrap items-center gap-4">
        <span className="tabular-nums">
          Charged{" "}
          {total ? (
            <Money amount={total.total_charged} className="text-receivable" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
        <span className="tabular-nums">
          Paid{" "}
          {total ? (
            <Money amount={total.total_paid} className="text-credit" />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
        <span className="tabular-nums">
          Net{" "}
          {total ? (
            <Money
              amount={Math.abs(total.net)}
              className={total.net >= 0 ? "text-receivable" : "text-credit"}
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      </span>
    </section>
  );
}
