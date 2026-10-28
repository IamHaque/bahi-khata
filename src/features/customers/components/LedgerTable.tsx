import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Money } from "@/components/app/Money";
import { useMediaQuery } from "@/hooks/useMediaQuery";
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
  /** S-33's audit columns: the Particulars cell renders the Edited
   *  marker from them (optional, so the minimal row shape still
   *  satisfies the interface). */
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
 * L-07 — the customer ledger as a real table: Date, Particulars (with
 * the margin rule), Charged, Paid, Balance, actions. A voided entry
 * stays visible, muted and struck through, out of the totals. The
 * newest 50 rows at a time ("Show earlier entries" reveals the next
 * 50), a tfoot Totals row under a double rule summed over every
 * non-voided entry — not only those shown — and a footer line that
 * says so. Under 768 px the same entries render as two-line list rows
 * carrying their column word.
 */
export function LedgerTable({
  entries,
  renderActions,
  topRow,
}: LedgerTableProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const shown = entries.slice(0, limit);
  const remaining = entries.length - shown.length;

  // The totals cover every entry that is not voided (voided rows leave
  // the totals exactly as they leave the balance view).
  const charged = entries
    .filter((entry) => entry.type === "charge" && entry.status !== "voided")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const paid = entries
    .filter((entry) => entry.type === "payment" && entry.status !== "voided")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const finalBalance = charged - paid;

  const footer = (
    <p className="px-4 py-3 text-sm text-muted-foreground">
      {entries.length} {entries.length === 1 ? "entry" : "entries"} · Voided
      entries stay visible but do not count.
    </p>
  );

  const showEarlierButton = (
    <button
      type="button"
      onClick={() => setLimit((current) => current + PAGE_SIZE)}
      className="w-full px-3 py-2.5 text-center text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      Show earlier entries ({remaining})
    </button>
  );

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

  if (isMobile) {
    return (
      <Card className="overflow-hidden">
        <ul className="px-4 pt-1">
          {shown.map((entry) => {
            const voided = entry.status === "voided";
            return (
              <li
                key={entry.id}
                className={cn(
                  "border-t border-border py-3 first:border-t-0",
                  voided && "text-muted-foreground",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm">
                    {entry.note ?? "—"}
                    {editedBadge(entry)}
                    {voidedChip(entry)}
                  </span>
                  <span className="flex shrink-0 items-baseline gap-1.5 text-sm">
                    <span className="text-xs text-muted-foreground">
                      {entry.type === "charge" ? "Charged" : "Paid"}
                    </span>
                    <Money
                      amount={entry.amount}
                      className={cn(
                        entry.type === "charge"
                          ? "text-receivable"
                          : "text-credit",
                        voided && "line-through",
                      )}
                    />
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {formatDate(entry.occurred_at)} · balance{" "}
                    <Money
                      amount={entry.balance_after ?? 0}
                      className="font-medium"
                    />
                  </span>
                  {renderActions?.(entry)}
                </div>
              </li>
            );
          })}
          {remaining > 0 && <li>{showEarlierButton}</li>}
        </ul>

        {/* The totals row replaces the first two stat cards here too. */}
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
        {footer}
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <caption className="sr-only">Ledger</caption>
          <thead>
            <tr className="bg-muted/60 text-xs font-medium text-muted-foreground">
              <th scope="col" className="w-24 px-2 py-2 text-left">
                Date
              </th>
              <th scope="col" className="py-2 pr-2 pl-3 text-left">
                Particulars
              </th>
              <th scope="col" className="w-36 px-2 py-2 text-right">
                Charged
              </th>
              <th scope="col" className="w-36 px-2 py-2 text-right">
                Paid
              </th>
              <th scope="col" className="w-36 px-2 py-2 text-right">
                Balance
              </th>
              <th scope="col" className="px-2 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {topRow}
            {shown.map((entry) => {
              const voided = entry.status === "voided";
              return (
                <tr
                  key={entry.id}
                  className={cn(
                    "h-14 border-t border-border",
                    voided && "text-muted-foreground",
                  )}
                >
                  <td className="px-2 text-sm text-muted-foreground">
                    {formatDate(entry.occurred_at)}
                  </td>
                  {/* The margin rule runs down this column. */}
                  <td className="margin-rule py-2 pr-2 pl-3 text-sm">
                    {entry.note ?? "—"}
                    {editedBadge(entry)}
                    {voidedChip(entry)}
                  </td>
                  <td className="px-2 text-right">
                    {entry.type === "charge" && (
                      <Money
                        amount={entry.amount}
                        className={cn(
                          "text-receivable",
                          voided && "line-through",
                        )}
                      />
                    )}
                  </td>
                  <td className="px-2 text-right">
                    {entry.type === "payment" && (
                      <Money
                        amount={entry.amount}
                        className={cn("text-credit", voided && "line-through")}
                      />
                    )}
                  </td>
                  <td className="px-2 text-right">
                    <Money
                      amount={entry.balance_after ?? 0}
                      className="font-medium"
                    />
                  </td>
                  <td className="px-2 text-right">{renderActions?.(entry)}</td>
                </tr>
              );
            })}
            {remaining > 0 && (
              <tr>
                <td colSpan={6} className="p-0">
                  {showEarlierButton}
                </td>
              </tr>
            )}
          </tbody>
          {/* The totals sum every non-voided entry, shown or not. */}
          <tfoot>
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
          </tfoot>
        </table>
      </div>
      {footer}
    </Card>
  );
}
