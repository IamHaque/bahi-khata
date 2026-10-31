import { useState, type ReactNode } from "react";
import { DataTable, type Column } from "@/components/app/DataTable";
import { Money } from "@/components/app/Money";
import { EditedBadge } from "@/features/transactions/components/EditedBadge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TransactionStatus, TransactionType } from "@/types";

export interface LedgerEntry {
  id: string;
  occurred_at: string;
  note: string | null;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  balance_after: number | null;
  /** S-33 audit columns */
  updated_by_name?: string | null;
  updated_at?: string | null;
}

interface LedgerTableProps {
  /** Newest first, as customer_ledger returns them. */
  entries: LedgerEntry[];
  renderActions?: (entry: LedgerEntry) => ReactNode;
  /** An entry row (L-12), rendered first in tbody. */
  topRow?: ReactNode;
}

const PAGE_SIZE = 50;

/**
 * L-07 — the customer ledger as a real table via DataTable: Date, Particulars
 * (with the margin rule), Charged, Paid, Balance, actions.
 * S-70 / U-04 migration: replaced raw table and mobile <ul> with DataTable.
 */
export function LedgerTable({
  entries,
  renderActions,
  topRow,
}: LedgerTableProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  const shown = entries.slice(0, limit);
  const remaining = entries.length - shown.length;

  const charged = entries
    .filter((entry) => entry.type === "charge" && entry.status !== "voided")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const paid = entries
    .filter((entry) => entry.type === "payment" && entry.status !== "voided")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const finalBalance = charged - paid;

  const voidedChip = (entry: LedgerEntry) =>
    entry.status === "voided" ? (
      <span className="ml-2 rounded-sm bg-warning/10 px-1.5 py-0.5 text-xs font-semibold text-warning dark:bg-warning/8">
        Voided
      </span>
    ) : null;

  const editedBadge = (entry: LedgerEntry) =>
    entry.status === "edited" ? (
      <EditedBadge
        editorName={entry.updated_by_name}
        updatedAt={entry.updated_at}
        className="ml-2 align-middle"
      />
    ) : null;

  const columns: Column<LedgerEntry>[] = [
    {
      key: "date",
      header: "Date",
      width: "fit",
      render: (entry) => (
        <span
          className={cn(
            "tabular-nums",
            entry.status === "voided" && "text-muted-foreground",
          )}
        >
          {formatDate(entry.occurred_at)}
        </span>
      ),
    },
    {
      key: "particulars",
      header: "Particulars",
      width: "fill",
      className: "margin-rule",
      render: (entry) => (
        <div className="min-w-0">
          <span>{entry.note ?? "—"}</span>
          {editedBadge(entry)}
          {voidedChip(entry)}
        </div>
      ),
    },
    {
      key: "charged",
      header: "Charged",
      align: "right",
      width: "fit",
      render: (entry) =>
        entry.type === "charge" ? (
          <Money
            amount={entry.amount}
            className={cn(
              "text-receivable",
              entry.status === "voided" && "line-through",
            )}
          />
        ) : null,
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      width: "fit",
      render: (entry) =>
        entry.type === "payment" ? (
          <Money
            amount={entry.amount}
            className={cn(
              "text-credit",
              entry.status === "voided" && "line-through",
            )}
          />
        ) : null,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      width: "fit",
      render: (entry) => (
        <Money
          amount={entry.balance_after ?? 0}
          className="font-medium"
        />
      ),
    },
  ];

  const totals = (
    <tr>
      <td
        colSpan={2}
        className="border-t border-foreground border-b-[6px] border-double px-3 py-2 text-sm font-medium"
      >
        Totals
      </td>
      <td className="border-t border-foreground border-b-[6px] border-double px-2 py-2 text-right text-sm">
        <Money amount={charged} className="text-receivable" />
      </td>
      <td className="border-t border-foreground border-b-[6px] border-double px-2 py-2 text-right text-sm">
        <Money amount={paid} className="text-credit" />
      </td>
      <td className="border-t border-foreground border-b-[6px] border-double px-2 py-2 text-right text-sm">
        <Money amount={finalBalance} className="font-medium" />
      </td>
      <td className="border-t border-foreground border-b-[6px] border-double px-2 py-2 text-sm" />
    </tr>
  );

  const mobileTotals = (
    <div className="border-t border-foreground border-b-[6px] border-double px-4 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">Totals</span>
        <span className="flex items-baseline gap-3">
          <Money amount={charged} className="text-receivable" />
          <Money amount={paid} className="text-credit" />
          <Money amount={finalBalance} className="font-medium" />
        </span>
      </div>
    </div>
  );

  const footer = (
    <p className="px-4 py-3 text-sm text-muted-foreground">
      {entries.length} {entries.length === 1 ? "entry" : "entries"} · Voided
      entries stay visible but do not count.
    </p>
  );

  return (
    <DataTable
      caption="Ledger"
      columns={columns}
      rows={shown}
      getRowKey={(entry) => entry.id}
      getRowClassName={(entry) =>
        entry.status === "voided" ? "text-muted-foreground" : undefined
      }
      topRow={topRow}
      totals={totals}
      mobileTotals={mobileTotals}
      footer={footer}
      renderRowActions={renderActions ? (entry) => renderActions(entry) : () => null}
      footerMode="more"
      totalCount={entries.length}
      hasMore={remaining > 0}
      onShowMore={() => setLimit((cur) => cur + PAGE_SIZE)}
      showMoreLabel={`Show earlier entries (${remaining})`}
      mobile={(entry) => {
        const voided = entry.status === "voided";
        return {
          title: (
            <span className="min-w-0">
              {entry.note ?? "—"}
              {editedBadge(entry)}
              {voidedChip(entry)}
            </span>
          ),
          trailing: (
            <span className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground">
                {entry.type === "charge" ? "Charged" : "Paid"}
              </span>
              <Money
                amount={entry.amount}
                className={cn(
                  entry.type === "charge" ? "text-receivable" : "text-credit",
                  voided && "line-through",
                )}
              />
            </span>
          ),
          subtitle: `${formatDate(entry.occurred_at)} · balance `,
          meta: (
            <Money
              amount={entry.balance_after ?? 0}
              className="font-medium inline"
            />
          ),
        };
      }}
    />
  );
}
