import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CustomerCombobox } from "@/components/CustomerCombobox";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { TransactionFormFields } from "@/components/TransactionFormFields";
import { useTransactionForm } from "@/hooks/useTransactionForm";
import { useCreateCustomer } from "@/features/customers/hooks";
import {
  useCreateTransaction,
  useCustomerBalance,
} from "@/features/transactions/hooks";
import type { Customer } from "@/types";

interface QuickAddTransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickAddTransactionSheet({
  open,
  onOpenChange,
}: QuickAddTransactionSheetProps) {
  const form = useTransactionForm();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const createCustomer = useCreateCustomer();
  const createTransaction = useCreateTransaction();
  const { data: currentBalance = 0 } = useCustomerBalance(
    selectedCustomer?.id ?? "",
  );

  useEffect(() => {
    if (open) {
      form.reset();
      setSelectedCustomer(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !form.validate()) return;

    form.setSaving(true);
    form.setSaveError(null);

    try {
      await createTransaction.mutateAsync({
        customer_id: selectedCustomer.id,
        type: form.type,
        amount: form.getAmount(),
        occurred_at: form.getOccurredAt(),
        note: form.note.trim() || undefined,
      });
      toast.success(
        form.type === "charge" ? "Charge added" : "Payment recorded",
      );
      onOpenChange(false);
    } catch (err) {
      form.setSaveError(
        err instanceof Error ? err.message : "Failed to save. Please try again.",
      );
    } finally {
      form.setSaving(false);
    }
  };

  const handleAddNewCustomer = async (data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  }) => createCustomer.mutate(data);

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

            {selectedCustomer && (
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
                  {currentBalance === 0 && " Settled"}
                </span>
              </div>
            )}

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
              disabled={!selectedCustomer}
              idPrefix="quick"
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
              <Button type="submit" disabled={form.saving || !selectedCustomer}>
                {form.saving ? "Saving..." : "Save Transaction"}
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
