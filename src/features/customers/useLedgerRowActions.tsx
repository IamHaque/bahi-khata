import { useState } from "react";
import { toast } from "sonner";
import { openTransactionEdit } from "@/features/transactions/sheetStore";
import { useRestoreTransaction } from "@/features/transactions/hooks";
import type { CustomerLedgerRow } from "@/features/transactions/api";
import type { LedgerEntry } from "@/features/customers/components/LedgerTable";
import { formatMoney } from "@/lib/format";

interface LedgerRowActionsOptions {
  businessId: string;
  sheetCustomer: { id: string; name: string };
  /** manageTransactions and not archived (the page computes it). */
  canWrite: boolean;
  /** deleteTransaction (owner-only, S-54). */
  canDelete: boolean;
  archived: boolean;
}

/**
 * L-07 (Do.1): the ledger row's actions — Edit in the shared sheet,
 * Void with its confirmation and optional reason, Restore (direct: it
 * only ever adds history back, so it confirms nothing) and the owner's
 * Delete (S-54) — kept in a small hook so the page stays under 450
 * lines. The void/delete dialogs hold their row in this state; the
 * page renders the dialogs themselves. Viewers and archived customers
 * have no actions at all.
 */
export function useLedgerRowActions({
  businessId,
  sheetCustomer,
  canWrite,
  canDelete,
  archived,
}: LedgerRowActionsOptions) {
  const restore = useRestoreTransaction(businessId);
  const [voidTx, setVoidTx] = useState<CustomerLedgerRow | null>(null);
  const [deleteTx, setDeleteTx] = useState<CustomerLedgerRow | null>(null);

  const renderLedgerActions = (entry: LedgerEntry) => {
    // The page hands its own rows to the table, so the audit columns
    // (updated_by_name) ride along.
    const row = entry as CustomerLedgerRow;
    if (!canWrite) return null;

    if (row.status === "voided") {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            restore.mutate(
              { id: row.id },
              {
                onSuccess: () => toast.success("Transaction restored."),
                onError: () =>
                  toast.error(
                    "Could not restore the transaction. Try again.",
                  ),
              },
            );
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Restore ${row.type} of ${formatMoney(row.amount)}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </button>
      );
    }

    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openTransactionEdit(row, sheetCustomer);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Edit ${row.type} of ${formatMoney(row.amount)}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setVoidTx(row);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Void ${row.type} of ${formatMoney(row.amount)}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </button>
        {/* v3 (S-54): after a divider — destructive, owner-only, and
            never on an archived customer (no writes until restored). */}
        {canDelete && !archived && (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTx(row);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Delete ${row.type} of ${formatMoney(row.amount)}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" />
              </svg>
            </button>
          </>
        )}
      </div>
    );
  };

  return { renderLedgerActions, voidTx, setVoidTx, deleteTx, setDeleteTx };
}
