import { useEffect, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { EntityDialog } from "@/components/app/EntityDialog";
import { BalanceBadge } from "@/components/app/BalanceBadge";
import { SegmentedField } from "@/components/app/fields/SegmentedField";
import { MoneyField } from "@/components/app/fields/MoneyField";
import { DateField } from "@/components/app/fields/DateField";
import { TextAreaField } from "@/components/app/fields/TextAreaField";
import { Label } from "@/components/ui/label";
import { CustomerCombobox } from "@/components/CustomerCombobox";
import { CustomerFormDialog } from "@/features/customers/components/CustomerFormDialog";
import { toastSuccess } from "@/lib/toast";
import { useCreateTransaction, useCustomerBalance } from "../hooks";
import {
  transactionFormValues,
  transactionSchema,
  type TransactionForm,
} from "../schemas";
import type { SheetCustomer } from "../sheetStore";
import { getTransactionSheetState } from "../sheetStore";

interface TransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  /**
   * Preselected customer (ledger, row menu, the "Customer added" toast
   * action); null = the searchable picker appears first (top bar).
   */
  customer?: SheetCustomer | null;
}

/**
 * S-32 — record a charge or payment in seconds, on the shared form
 * kit (EntityDialog: zod validation before the network, inline errors,
 * a failed save keeps every keystroke, Escape/close asks before
 * discarding dirty input, focus returns to the trigger).
 *
 * The live preview reads the real balance through the
 * customer_balances view and shows what this charge/payment will make
 * it — the decision is made before saving, not after.
 */
export function TransactionSheet({
  open,
  onOpenChange,
  businessId,
  customer,
}: TransactionSheetProps) {
  const create = useCreateTransaction(businessId);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerQuery, setNewCustomerQuery] = useState("");

  // S-32 keyboard flow: focus returns to whatever opened the sheet.
  // The store remembered it at open time; the popup is already
  // unmounted by the time this close effect runs.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) {
      const { trigger } = getTransactionSheetState();
      if (trigger?.isConnected) trigger.focus();
    }
    wasOpen.current = open;
  }, [open]);

  const handleSubmit = async (values: Record<string, unknown>) => {
    const form = values as unknown as TransactionForm;
    await create.mutateAsync({
      customer_id: form.customer_id,
      type: form.type,
      amount: form.amount,
      // The date is an ISO day; the ledger stores the moment that day
      // began — exactly what the v1 sheets stored.
      occurred_at: new Date(form.occurred_on).toISOString(),
      note: form.note.trim() || undefined,
    });
    // EntityDialog closes itself once this resolves; a throw lands as
    // the sheet's root error with every value intact.
    toastSuccess(form.type === "charge" ? "Charge added" : "Payment recorded");
  };

  return (
    <>
      <EntityDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Add transaction"
        schema={transactionSchema}
        defaultValues={transactionFormValues(customer?.id)}
        submitLabel={<SubmitLabel />}
        onSubmit={handleSubmit}
      >
        <CustomerField
          customer={customer ?? null}
          onAddNew={(query) => {
            setNewCustomerQuery(query);
            setAddCustomerOpen(true);
          }}
        />
        <BalancePreview businessId={businessId} />
        <SegmentedField
          name="type"
          label="Type"
          options={[
            { value: "charge", label: "Charge" },
            { value: "payment", label: "Payment" },
          ]}
        />
        <MoneyField name="amount" label="Amount" autoFocus />
        <DateField name="occurred_on" label="Date" />
        <TextAreaField
          name="note"
          label="Note"
          placeholder="Optional — up to 500 characters"
        />
      </EntityDialog>

      {/* Inline "create the customer I was searching for": the v2 form
          dialog, prefilled with the combobox query (BACKLOG B-04's
          sibling stretch). Saving it refreshes the picker's list; the
          new customer shows up there to select. */}
      <CustomerFormDialog
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        businessId={businessId}
        mode="add"
        defaultName={newCustomerQuery}
      />
    </>
  );
}

/** The footer button speaks in the selected type: Add charge / Add payment. */
function SubmitLabel() {
  const { watch } = useFormContext();
  return <>{watch("type") === "payment" ? "Add payment" : "Add charge"}</>;
}

function CustomerField({
  customer,
  onAddNew,
}: {
  customer: SheetCustomer | null;
  onAddNew: (query: string) => void;
}) {
  const { control, setValue, formState } = useFormContext();
  const customerId = String(useWatch({ control, name: "customer_id" }) ?? "");
  const error = formState.errors.customer_id?.message as string | undefined;

  // The sheet can be handed a customer while it is already open (the
  // "Customer added" toast action) — the form value follows the prop.
  useEffect(() => {
    if (customer && customer.id !== customerId) {
      setValue("customer_id", customer.id);
    }
  }, [customer, customerId, setValue]);

  return (
    <div className="space-y-1.5">
      <Label>Customer</Label>
      <CustomerCombobox
        value={customerId || null}
        onSelect={(selected) => setValue("customer_id", selected.id)}
        onAddNew={onAddNew}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Live preview: the current balance and what this entry makes it.
 * Mounted only once a customer is chosen so the balance query never
 * runs for an empty id.
 */
function BalancePreview({ businessId }: { businessId: string }) {
  const { control } = useFormContext();
  const customerId = String(useWatch({ control, name: "customer_id" }) ?? "");
  const type = useWatch({ control, name: "type" }) as "charge" | "payment";
  const rawAmount = useWatch({ control, name: "amount" });
  const amount = typeof rawAmount === "number" ? rawAmount : 0;

  if (!customerId) return null;
  return (
    <LoadedPreview
      businessId={businessId}
      customerId={customerId}
      type={type}
      amount={amount}
    />
  );
}

function LoadedPreview({
  businessId,
  customerId,
  type,
  amount,
}: {
  businessId: string;
  customerId: string;
  type: "charge" | "payment";
  amount: number;
}) {
  const { data: current, isSuccess } = useCustomerBalance(
    customerId,
    businessId,
  );
  if (!isSuccess) return null;

  const balance = current ?? 0;
  const after = balance + (type === "charge" ? amount : -amount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
      <span className="text-muted-foreground">
        Current balance <BalanceBadge balance={balance} size="sm" />
      </span>
      {amount > 0 && (
        <span className="text-muted-foreground">
          Balance after <BalanceBadge balance={after} size="sm" />
        </span>
      )}
    </div>
  );
}
