import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTransaction } from "@/lib/transactions";
import type { TransactionType } from "@/types";

interface AddTransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  currentBalance: number;
  onTransactionAdded: () => void;
}

function todayString(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

export function AddTransactionSheet({
  open,
  onOpenChange,
  customerId,
  currentBalance,
  onTransactionAdded,
}: AddTransactionSheetProps) {
  const amountRef = useRef<HTMLInputElement>(null);
  const [type, setType] = useState<TransactionType>("charge");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType("charge");
      setAmount("");
      setDate(todayString());
      setNote("");
      setAmountError(null);
      setDateError(null);
      setSaveError(null);
      setTimeout(() => amountRef.current?.focus(), 50);
    }
  }, [open]);

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
      await createTransaction({
        customer_id: customerId,
        type,
        amount: amountNum,
        occurred_at: new Date(date).toISOString(),
        note: note.trim() || undefined,
      });
      onTransactionAdded();
      onOpenChange(false);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save. Please try again.",
      );
    } finally {
      setSaving(false);
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

          {saveError && (
            <div role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {saveError}
            </div>
          )}

          <div className="space-y-2">
            <Label id="transaction-type-label">Type *</Label>
            <div
              role="radiogroup"
              aria-labelledby="transaction-type-label"
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
            <Label htmlFor="transaction-amount">Amount *</Label>
            <Input
              id="transaction-amount"
              ref={amountRef}
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              aria-invalid={!!amountError}
              aria-describedby={amountError ? "amount-error" : undefined}
            />
            {amountError && (
              <p id="amount-error" className="text-sm text-destructive" role="alert">
                {amountError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="transaction-date">Date *</Label>
            <Input
              id="transaction-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!dateError}
              aria-describedby={dateError ? "date-error" : undefined}
            />
            {dateError && (
              <p id="date-error" className="text-sm text-destructive" role="alert">
                {dateError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="transaction-note">Note</Label>
            <Input
              id="transaction-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note"
            />
          </div>

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Transaction"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
