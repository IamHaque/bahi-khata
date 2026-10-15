import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useRestoreTransaction, useVoidTransaction } from "../hooks";
import type { TransactionType } from "@/types";

/** The slice of a row the dialog needs: identity, direction, size. */
export interface VoidableTransaction {
  id: string;
  type: TransactionType;
  amount: number;
}

interface VoidTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  /** The row being voided; null while the dialog is closed. */
  transaction: VoidableTransaction | null;
}

/**
 * S-34 — "Void instead of erase". ConfirmDialog closes itself the
 * moment confirm is pressed, so the mutation resolves behind the
 * scenes: a success shows the "Transaction voided" toast with an Undo
 * action for 8 seconds (the S-30 archive pattern), a failure shows an
 * error toast and the row simply stays where it was. The reason is
 * optional and capped at 200 characters by the input itself.
 */
export function VoidTransactionDialog({
  open,
  onOpenChange,
  businessId,
  transaction,
}: VoidTransactionDialogProps) {
  const [reason, setReason] = useState("");
  const voidTx = useVoidTransaction(businessId);
  const restore = useRestoreTransaction(businessId);

  // Every opening starts with no reason (the typed-state reset rule).
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        transaction
          ? `Void this ${transaction.type} of ₹${transaction.amount}?`
          : ""
      }
      description="The row stays on the ledger with a Voided badge and stops counting towards balances and totals. Restore brings it back any time."
      confirmLabel="Void transaction"
      onConfirm={() => {
        if (!transaction) return;
        voidTx.mutate(
          { id: transaction.id, reason: reason.trim() || null },
          {
            onSuccess: () => {
              toast.success("Transaction voided.", {
                duration: 8000,
                action: {
                  label: "Undo",
                  onClick: () => restore.mutate({ id: transaction.id }),
                },
              });
            },
            onError: () => {
              toast.error("Could not void the transaction. Try again.");
            },
          },
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="void-reason">Reason (optional)</Label>
        <Input
          id="void-reason"
          value={reason}
          maxLength={200}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Up to 200 characters"
        />
      </div>
    </ConfirmDialog>
  );
}
