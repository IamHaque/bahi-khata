import { useState } from "react";
import { toast } from "sonner";
import { Ban, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { RowActions, type RowAction } from "@/components/app/RowActions";
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
 * L-07 / U-04: the ledger row's actions — Edit in the shared sheet,
 * Void with its confirmation and optional reason, Restore and the owner's
 * Delete (S-54) via RowActions.
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
    const row = entry as CustomerLedgerRow;
    if (!canWrite) return null;

    if (row.status === "voided") {
      const actions: RowAction[] = [
        {
          id: "restore",
          label: `Restore ${row.type} of ${formatMoney(row.amount)}`,
          icon: RotateCcw,
          onSelect: () =>
            restore.mutate(
              { id: row.id },
              {
                onSuccess: () => toast.success("Transaction restored."),
                onError: () =>
                  toast.error("Could not restore the transaction. Try again."),
              },
            ),
        },
      ];
      return <RowActions actions={actions} triggerLabel="Ledger actions" />;
    }

    const actions: RowAction[] = [
      {
        id: "edit",
        label: `Edit ${row.type} of ${formatMoney(row.amount)}`,
        icon: Pencil,
        onSelect: () => openTransactionEdit(row, sheetCustomer),
      },
      {
        id: "void",
        label: `Void ${row.type} of ${formatMoney(row.amount)}`,
        icon: Ban,
        onSelect: () => setVoidTx(row),
      },
      ...(canDelete && !archived
        ? [
            {
              id: "delete",
              label: `Delete ${row.type} of ${formatMoney(row.amount)}`,
              icon: Trash2,
              destructive: true,
              onSelect: () => setDeleteTx(row),
            },
          ]
        : []),
    ];

    return <RowActions actions={actions} triggerLabel="Ledger actions" />;
  };

  return { renderLedgerActions, voidTx, setVoidTx, deleteTx, setDeleteTx };
}
