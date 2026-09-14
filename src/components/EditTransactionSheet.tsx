import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { TransactionFormFields } from "@/components/TransactionFormFields";
import { useTransactionForm } from "@/hooks/useTransactionForm";
import {
  updateTransaction,
  updateTransactionStatus,
} from "@/lib/transactions";
import type { Transaction } from "@/types";

interface EditTransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction;
  onTransactionUpdated: () => void;
}

export function EditTransactionSheet({
  open,
  onOpenChange,
  transaction,
  onTransactionUpdated,
}: EditTransactionSheetProps) {
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const form = useTransactionForm({
    initialType: transaction.type,
    initialAmount: String(transaction.amount),
    initialDate: transaction.occurred_at.split("T")[0] ?? "",
    initialNote: transaction.note ?? "",
  });

  useEffect(() => {
    if (open) {
      form.reset({
        initialType: transaction.type,
        initialAmount: String(transaction.amount),
        initialDate: transaction.occurred_at.split("T")[0] ?? "",
        initialNote: transaction.note ?? "",
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.validate()) return;

    form.setSaving(true);
    form.setSaveError(null);

    try {
      await updateTransaction(transaction.id, {
        type: form.type,
        amount: form.getAmount(),
        occurred_at: form.getOccurredAt(),
        note: form.note.trim() || null,
      });
      toast.success("Transaction updated");
      onTransactionUpdated();
      onOpenChange(false);
    } catch (err) {
      form.setSaveError(
        err instanceof Error ? err.message : "Failed to save. Please try again.",
      );
    } finally {
      form.setSaving(false);
    }
  };

  const handleVoid = async () => {
    try {
      await updateTransactionStatus(transaction.id, "voided");
      toast.success("Transaction voided");
      onTransactionUpdated();
      onOpenChange(false);
    } catch (err) {
      form.setSaveError(
        err instanceof Error
          ? err.message
          : "Failed to void. Please try again.",
      );
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Edit Transaction</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
            {form.saveError && (
              <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {form.saveError}
              </div>
            )}

            <TransactionFormFields
              type={form.type}
              onTypeChange={form.setType}
              amount={form.amount}
              onAmountChange={form.setAmount}
              amountRef={form.amountRef}
              amountError={form.amountError}
              date={form.date}
              onDateChange={form.setDate}
              dateError={form.dateError}
              note={form.note}
              onNoteChange={form.setNote}
              idPrefix="edit"
            />

            <SheetFooter>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setVoidConfirmOpen(true)}
                disabled={form.saving}
              >
                Void
              </Button>
              <div className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={form.saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={form.saving}>
                {form.saving ? "Saving..." : "Save Changes"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void this transaction?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the transaction&apos;s effect on the balance but
              keep it visible in the history as a voided record. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleVoid}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Void Transaction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
