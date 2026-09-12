import { useEffect, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateTransaction,
  updateTransactionStatus,
} from "@/lib/transactions";
import type { Transaction, TransactionType } from "@/types";

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
  const amountRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<TransactionType>(transaction.type);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [date, setDate] = useState(
    transaction.occurred_at.split("T")[0] ?? "",
  );
  const [note, setNote] = useState(transaction.note ?? "");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setType(transaction.type);
      setAmount(String(transaction.amount));
      setDate(transaction.occurred_at.split("T")[0] ?? "");
      setNote(transaction.note ?? "");
      setAmountError(null);
      setDateError(null);
      setSaveError(null);
      setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [open, transaction]);

  const validate = (): boolean => {
    let valid = true;

    const amountNum = Number(amount.replace(/[₹,\s]/g, ""));
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setAmountError("Amount must be greater than zero");
      valid = false;
    } else {
      setAmountError(null);
    }

    if (!date) {
      setDateError("Date is required");
      valid = false;
    } else {
      const selected = new Date(date);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (selected > today) {
        setDateError("Date cannot be in the future");
        valid = false;
      } else {
        setDateError(null);
      }
    }

    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setSaveError(null);

    try {
      const amountNum = Number(amount.replace(/[₹,\s]/g, ""));
      await updateTransaction(transaction.id, {
        type,
        amount: amountNum,
        occurred_at: new Date(date).toISOString(),
        note: note.trim() || null,
      });
      onTransactionUpdated();
      onOpenChange(false);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async () => {
    try {
      await updateTransactionStatus(transaction.id, "voided");
      setVoidConfirmOpen(false);
      onTransactionUpdated();
      onOpenChange(false);
    } catch (err) {
      setSaveError(
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
            {saveError && (
              <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {saveError}
              </div>
            )}

            <div className="space-y-2">
              <Label id="edit-type-label">Type *</Label>
              <div
                role="radiogroup"
                aria-labelledby="edit-type-label"
                className="flex gap-1"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={type === "charge"}
                  onClick={() => setType("charge")}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    type === "charge"
                      ? "bg-receivable text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Charge
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={type === "payment"}
                  onClick={() => setType("payment")}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    type === "payment"
                      ? "bg-credit text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  Payment
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-amount">Amount *</Label>
              <Input
                id="edit-amount"
                ref={amountRef}
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                aria-invalid={!!amountError}
                aria-describedby={amountError ? "edit-amount-error" : undefined}
              />
              {amountError && (
                <p id="edit-amount-error" className="text-sm text-destructive" role="alert">
                  {amountError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-date">Date *</Label>
              <Input
                id="edit-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!dateError}
                aria-describedby={dateError ? "edit-date-error" : undefined}
              />
              {dateError && (
                <p id="edit-date-error" className="text-sm text-destructive" role="alert">
                  {dateError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-note">Note</Label>
              <Input
                id="edit-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note"
              />
            </div>

            <SheetFooter>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setVoidConfirmOpen(true)}
                disabled={saving}
              >
                Void
              </Button>
              <div className="flex-1" />
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
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
