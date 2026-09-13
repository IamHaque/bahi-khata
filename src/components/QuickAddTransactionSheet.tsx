import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { CustomerCombobox } from "@/components/CustomerCombobox";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { createTransaction, getCustomerBalance } from "@/lib/transactions";
import { createCustomer } from "@/lib/customers";
import type { Customer, TransactionType } from "@/types";

interface QuickAddTransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function todayString(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

export function QuickAddTransactionSheet({
  open,
  onOpenChange,
}: QuickAddTransactionSheetProps) {
  const amountRef = useRef<HTMLInputElement>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [type, setType] = useState<TransactionType>("charge");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayString());
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Add new customer dialog state
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedCustomer(null);
      setCurrentBalance(null);
      setType("charge");
      setAmount("");
      setDate(todayString());
      setNote("");
      setAmountError(null);
      setDateError(null);
      setSaveError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCurrentBalance(null);
      return;
    }
    getCustomerBalance(selectedCustomer.id)
      .then(setCurrentBalance)
      .catch(() => setCurrentBalance(0));
  }, [selectedCustomer]);

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
    if (!selectedCustomer || !validate()) return;

    setSaving(true);
    setSaveError(null);

    try {
      const amountNum = Number(amount.replace(/[₹,\s]/g, ""));
      await createTransaction({
        customer_id: selectedCustomer.id,
        type,
        amount: amountNum,
        occurred_at: new Date(date).toISOString(),
        note: note.trim() || undefined,
      });
      toast.success(
        type === "charge" ? "Charge added" : "Payment recorded",
      );
      window.dispatchEvent(new CustomEvent("transaction-saved"));
      onOpenChange(false);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleAddNewCustomer = async (data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  }) => {
    const newCustomer = await createCustomer(data);
    setSelectedCustomer(newCustomer);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Add Transaction</SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <CustomerCombobox
                value={selectedCustomer?.id ?? null}
                onSelect={setSelectedCustomer}
                onAddNew={(query) => {
                  setNewCustomerName(query);
                  setAddCustomerOpen(true);
                }}
              />
            </div>

            {selectedCustomer && currentBalance !== null && (
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
            )}

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
                  disabled={!selectedCustomer}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    type === "charge"
                      ? "bg-receivable text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  } disabled:opacity-50`}
                >
                  Charge
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={type === "payment"}
                  onClick={() => setType("payment")}
                  disabled={!selectedCustomer}
                  className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                    type === "payment"
                      ? "bg-credit text-white"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  } disabled:opacity-50`}
                >
                  Payment
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-amount">Amount *</Label>
              <Input
                id="quick-amount"
                ref={amountRef}
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={!selectedCustomer}
                aria-invalid={!!amountError}
                aria-describedby={amountError ? "quick-amount-error" : undefined}
              />
              {amountError && (
                <p id="quick-amount-error" className="text-sm text-destructive" role="alert">
                  {amountError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-date">Date *</Label>
              <Input
                id="quick-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={!selectedCustomer}
                aria-invalid={!!dateError}
                aria-describedby={dateError ? "quick-date-error" : undefined}
              />
              {dateError && (
                <p id="quick-date-error" className="text-sm text-destructive" role="alert">
                  {dateError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="quick-note">Note</Label>
              <Input
                id="quick-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note"
                disabled={!selectedCustomer}
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
              <Button type="submit" disabled={saving || !selectedCustomer}>
                {saving ? "Saving..." : "Save Transaction"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <CustomerFormDialog
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        onSubmit={handleAddNewCustomer}
        mode="add"
        initialData={{ id: "", name: newCustomerName, phone: null, email: null, address: null, alternate_contact_name: null, alternate_contact_phone: null, tags: null, notes: null, created_at: "", updated_at: "" }}
      />
    </>
  );
}
