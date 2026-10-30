import { useState } from "react";
import {
  FormProvider,
  useForm,
  useWatch,
  type FieldValues,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/app/fields/MoneyField";
import { TextField } from "@/components/app/fields/TextField";
import { DateField } from "@/components/app/fields/DateField";
import {
  useCreateTransaction,
  useCustomerBalance,
} from "@/features/transactions/hooks";
import {
  transactionFormValues,
  transactionSchema,
} from "@/features/transactions/schemas";
import { toastSuccess } from "@/lib/toast";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CustomerQuickAddProps {
  customerId: string;
  businessId: string;
}

/**
 * L-07's baseline quick-add card (D-24): a charge or payment in one
 * line — type, amount, note — with the new balance previewed before
 * the button is pressed. Built from the same pieces as
 * TransactionSheet (same schema, resolver and fields), so validation
 * and the stored instant behave identically. Gate G-A2 is pending:
 * when it approves, L-12's entry row takes this slot and the card
 * stays on as the mobile control.
 */
export function CustomerQuickAdd({
  customerId,
  businessId,
}: CustomerQuickAddProps) {
  const [showDate, setShowDate] = useState(false);
  const create = useCreateTransaction(businessId);
  const { data: balance = 0 } = useCustomerBalance(customerId, businessId);

  const form = useForm({
    resolver: zodResolver(
      transactionSchema as z.ZodType<FieldValues, FieldValues>,
    ) as Resolver<FieldValues>,
    defaultValues: {
      customer_id: customerId,
      type: "charge",
      amount: "",
      // Today as the schema computes it (the user's timezone day);
      // the entry lands at the start of that day until a time is set.
      occurred_on: transactionFormValues(customerId).occurred_on as string,
      occurred_at_time: "",
      note: "",
    } as FieldValues,
    mode: "onTouched",
  });

  const type = useWatch({ control: form.control, name: "type" });
  const amount = useWatch({ control: form.control, name: "amount" });
  const isCharge = type !== "payment";

  // The preview follows the same rule as the ledger: a charge adds, a
  // payment subtracts — and it only speaks when the amount is valid.
  const numericAmount = typeof amount === "number" ? amount : Number(amount);
  const amountValid = Number.isFinite(numericAmount) && numericAmount > 0;
  const after = balance + (isCharge ? numericAmount : -numericAmount);

  const onSubmit = async (values: FieldValues) => {
    try {
      await create.mutateAsync({
        customer_id: values.customer_id,
        type: values.type,
        amount: values.amount,
        // Exactly as the sheet maps it: the local wall clock of that
        // day, an unset time falling back to the start of the day.
        occurred_at: new Date(
          `${values.occurred_on}T${values.occurred_at_time || "00:00"}`,
        ).toISOString(),
        note: String(values.note ?? "").trim() || undefined,
      });
      toastSuccess(isCharge ? "Charge added" : "Payment added");
      // Reset the amount and note, keep the choice, focus the amount.
      form.setValue("amount", "");
      form.setValue("note", "");
      document.getElementById("quickadd-money")?.focus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <Card role="region" aria-label="New entry" className="p-4">
      <FormProvider {...form}>
        <CardTitle>New entry</CardTitle>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-3">
        <div
          role="radiogroup"
          aria-label="Entry type"
          className="flex gap-1 rounded-lg border border-border p-1"
        >
          {(["charge", "payment"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={type === option}
              onClick={() => form.setValue("type", option)}
              className={cn(
                "h-11 flex-1 rounded-md px-3 text-sm font-medium",
                type === option
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-input",
              )}
            >
              {option === "charge" ? "Charged" : "Paid"}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-32 flex-1">
            {/* idPrefix: the sheet keeps the plain `amount` ids — two
                forms with the same field names share the page. */}
            <MoneyField name="amount" label="Amount" idPrefix="quickadd" />
          </div>
          <div className="min-w-48 flex-[2]">
            <TextField
              name="note"
              label="Note"
              placeholder="What was it for?"
              idPrefix="quickadd"
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            {isCharge ? "Add charge" : "Add payment"}
          </Button>
        </div>

        {amountValid && (
          <p aria-live="polite" className="mt-3 text-sm text-muted-foreground">
            New balance: {formatMoney(after)}
          </p>
        )}

        <div className="mt-2">
          {showDate ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <DateField name="occurred_on" label="Date" idPrefix="quickadd" />
              <TextField
                name="occurred_at_time"
                label="Time"
                type="time"
                idPrefix="quickadd"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDate(true)}
              className="text-sm text-muted-foreground underline hover:text-foreground pointer-coarse:min-h-11"
            >
              Change date
            </button>
          )}
        </div>
        </form>
      </FormProvider>
    </Card>
  );
}
