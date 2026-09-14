import { useEffect } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { TransactionFormFields } from "@/components/TransactionFormFields";
import { useTransactionForm } from "@/hooks/useTransactionForm";
import { createTransaction } from "@/lib/transactions";

interface AddTransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  currentBalance: number;
  onTransactionAdded: () => void;
}

export function AddTransactionSheet({
  open,
  onOpenChange,
  customerId,
  currentBalance,
  onTransactionAdded,
}: AddTransactionSheetProps) {
  const form = useTransactionForm();

  useEffect(() => {
    if (open) form.reset();
  }, [open, form]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.validate()) return;

    form.setSaving(true);
    form.setSaveError(null);

    try {
      await createTransaction({
        customer_id: customerId,
        type: form.type,
        amount: form.getAmount(),
        occurred_at: form.getOccurredAt(),
        note: form.note.trim() || undefined,
      });
      toast.success(
        form.type === "charge" ? "Charge added" : "Payment recorded",
      );
      onTransactionAdded();
      onOpenChange(false);
    } catch (err) {
      form.setSaveError(
        err instanceof Error ? err.message : "Failed to save. Please try again.",
      );
    } finally {
      form.setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add Transaction</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Current balance: </span>
            <span
              className={`font-medium tabular-nums ${
                currentBalance > 0
                  ? "text-receivable"
                  : currentBalance < 0
                    ? "text-credit"
                    : "text-muted-foreground"
              }`}
            >
              ₹{Math.abs(currentBalance).toLocaleString("en-IN")}
              {currentBalance > 0 && " owed"}
              {currentBalance < 0 && " credit"}
              {currentBalance === 0 && "Settled"}
            </span>
          </div>

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
            idPrefix="add"
          />

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={form.saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={form.saving}>
              {form.saving ? "Saving..." : "Save Transaction"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
