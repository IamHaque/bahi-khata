import { useState } from "react";
import { toast } from "sonner";
import { Ban, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { RowActionCluster } from "@/components/app/DataTable";
import type { RowActionItem } from "@/components/app/DataTable";
import { IconButton } from "@/components/app/IconButton";
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
      const items: RowActionItem[] = [
        {
          label: `Restore ${row.type} of ${formatMoney(row.amount)}`,
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
      return (
        <RowActionCluster items={items} triggerLabel="Ledger actions">
          <IconButton
            icon={<RotateCcw className="size-4" />}
            label="Restore"
            ariaLabel={`Restore ${row.type} of ${formatMoney(row.amount)}`}
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
          />
        </RowActionCluster>
      );
    }

    const items: RowActionItem[] = [
      {
        label: `Edit ${row.type} of ${formatMoney(row.amount)}`,
        onSelect: () => openTransactionEdit(row, sheetCustomer),
      },
      {
        label: `Void ${row.type} of ${formatMoney(row.amount)}`,
        onSelect: () => setVoidTx(row),
      },
    ];
    if (canDelete && !archived) {
      items.push({
        label: `Delete ${row.type} of ${formatMoney(row.amount)}`,
        onSelect: () => setDeleteTx(row),
        variant: "destructive",
        separator: true,
      });
    }

    return (
      <RowActionCluster items={items} triggerLabel="Ledger actions">
        <IconButton
          icon={<Pencil className="size-4" />}
          label="Edit"
          ariaLabel={`Edit ${row.type} of ${formatMoney(row.amount)}`}
          onClick={(e) => {
            e.stopPropagation();
            openTransactionEdit(row, sheetCustomer);
          }}
        />
        <IconButton
          icon={<Ban className="size-4" />}
          label="Void"
          ariaLabel={`Void ${row.type} of ${formatMoney(row.amount)}`}
          onClick={(e) => {
            e.stopPropagation();
            setVoidTx(row);
          }}
        />
        {/* v3 (S-54): after a divider — destructive, owner-only, and
            never on an archived customer (no writes until restored). */}
        {canDelete && !archived && (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
            <IconButton
              icon={<Trash2 className="size-4" />}
              label="Delete"
              ariaLabel={`Delete ${row.type} of ${formatMoney(row.amount)}`}
              tone="destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleteTx(row);
              }}
            />
          </>
        )}
      </RowActionCluster>
    );
  };

  return { renderLedgerActions, voidTx, setVoidTx, deleteTx, setDeleteTx };
}
