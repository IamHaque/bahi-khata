import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { AppError } from "@/lib/AppError";
import { toastError } from "@/lib/toast";
import { formatDate, formatMoney } from "@/lib/format";
import { useDeleteTransaction } from "../hooks";
import { useRestoreDeleted } from "@/features/deleted-items/hooks";
import type { TransactionType } from "@/types";

/** The slice of a row the dialog needs: identity, size, and the
 *  balance sentence's before/after when the caller has them. */
export interface DeletableTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  occurred_at: string;
  customer_name: string;
  /** The customer's balance before and after, for the sentence in the
   *  dialog. Null when the page does not hold the ledger row. */
  balance_before: number | null;
  balance_after: number | null;
}

interface DeleteTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  /** The row being deleted; null while the dialog is closed. */
  transaction: DeletableTransaction | null;
  /** Shown as a "Void instead" link; omit to hide it. */
  onVoidInstead?: (id: string) => void;
}

/**
 * v3 (S-54) — the owner's hard delete, with the escape hatch always in
 * view: the Void instead link for anyone who only wanted the row out of
 * the totals. ConfirmDialog closes the moment confirm is pressed, so
 * the mutation resolves behind the scenes; the success toast carries a
 * 10-second Undo wired to restore_deleted (the database's jsonb report
 * decides whether "Restored" is honest).
 */
export function DeleteTransactionDialog({
  open,
  onOpenChange,
  businessId,
  transaction,
  onVoidInstead,
}: DeleteTransactionDialogProps) {
  const [reason, setReason] = useState("");
  const remove = useDeleteTransaction(businessId);
  const restore = useRestoreDeleted(businessId);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!transaction) return null;

  const typeLabel = transaction.type === "charge" ? "Charge" : "Payment";
  const balanceSentence =
    transaction.balance_before !== null && transaction.balance_after !== null
      ? `, and ${transaction.customer_name}'s balance will change from ${formatMoney(transaction.balance_before)} to ${formatMoney(transaction.balance_after)}`
      : "";
  const description = `${typeLabel} of ${formatMoney(transaction.amount)} for ${transaction.customer_name} on ${formatDate(transaction.occurred_at)} will be removed${balanceSentence}. You can restore it from Recently deleted.`;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete this transaction?"
      description={description}
      confirmLabel="Delete transaction"
      cancelLabel="Keep it"
      tone="destructive"
      onConfirm={() => {
        const trimmed = reason.trim();
        remove.mutate(
          { id: transaction.id, reason: trimmed === "" ? null : trimmed },
          {
            onSuccess: (logId) => {
              toast.success("Transaction deleted", {
                duration: 10_000,
                action: {
                  label: "Undo",
                  onClick: () => {
                    restore.mutate(logId, {
                      onSuccess: () => toast.success("Restored"),
                      onError: () => toastError("restore the transaction"),
                    });
                  },
                },
              });
            },
            onError: (err) => {
              // The database's own message wins (e.g. the 22001
              // validation on a reason); anything else gets the shared
              // fallback form.
              if (err instanceof AppError) toast.error(err.message);
              else toastError("delete the transaction");
            },
          },
        );
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="delete-reason">Reason (optional)</Label>
        <Input
          id="delete-reason"
          value={reason}
          maxLength={200}
          placeholder="Why is this being deleted?"
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {onVoidInstead && (
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">
            Not sure? Void it instead. A voided entry stays visible, crossed
            out.
          </p>
          <button
            type="button"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => {
              onOpenChange(false);
              onVoidInstead(transaction.id);
            }}
          >
            Void instead
          </button>
        </div>
      )}
    </ConfirmDialog>
  );
}
