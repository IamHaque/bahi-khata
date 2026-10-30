import { useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { EntityDialog } from '@/components/app/EntityDialog';
import { MoneyField } from '@/components/app/fields/MoneyField';
import { DateField } from '@/components/app/fields/DateField';
import { TextField } from '@/components/app/fields/TextField';
import { TextAreaField } from '@/components/app/fields/TextAreaField';
import { Label } from '@/components/ui/label';
import { CustomerCombobox } from '@/components/CustomerCombobox';
import { CustomerFormDialog } from '@/features/customers/components/CustomerFormDialog';
import { useCustomer } from '@/features/customers/hooks';
import { formatMoney } from '@/lib/format';
import { toastSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import {
  useCreateTransaction,
  useCustomerBalance,
  useUpdateTransaction,
} from '../hooks';
import {
  transactionEditFormValues,
  transactionFormValues,
  transactionSchema,
  todayISO,
  yesterdayISO,
  type TransactionForm,
} from '../schemas';
import type { SheetCustomer } from '../sheetStore';
import { getTransactionSheetState } from '../sheetStore';
import type { Transaction } from '@/types';

interface TransactionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  /**
   * Preselected customer (ledger, row menu, the "Customer added" toast
   * action); null = the searchable picker appears first (top bar).
   */
  customer?: SheetCustomer | null;
  /**
   * S-33: "edit" corrects `transaction` in this same sheet — the
   * customer is shown but cannot change. Defaults to add.
   */
  mode?: 'add' | 'edit';
  transaction?: Transaction | null;
  /**
   * S-31: Add charge / Add payment both open this sheet with the type
   * already selected. Ignored in edit mode (the row's own type wins).
   */
  presetType?: 'charge' | 'payment' | null;
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
  mode = 'add',
  transaction = null,
  presetType = null,
}: TransactionSheetProps) {
  const create = useCreateTransaction(businessId);
  const update = useUpdateTransaction(businessId);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [newCustomerQuery, setNewCustomerQuery] = useState('');

  const isEdit = mode === 'edit' && transaction != null;
  const edited = isEdit ? transaction : null;

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
    // Date and Time are the user's local wall clock — parsed WITHOUT a
    // timezone marker, so JS builds the local instant. An empty time
    // means the start of the picked day.
    const occurredAt = new Date(
      `${form.occurred_on}T${form.occurred_at_time || '00:00'}`,
    ).toISOString();

    if (edited) {
      // S-33 — same sheet, same rules; the row keeps its provenance
      // and gains the audit marker. `null` clears a cleared note (the
      // v1 sheet left the old note behind).
      await update.mutateAsync({
        id: edited.id,
        input: {
          type: form.type,
          amount: form.amount,
          occurred_at: occurredAt,
          note: form.note.trim() || null,
        },
      });
      toastSuccess('Transaction updated.');
      return;
    }

    await create.mutateAsync({
      customer_id: form.customer_id,
      type: form.type,
      amount: form.amount,
      occurred_at: occurredAt,
      note: form.note.trim() || undefined,
    });
    // EntityDialog closes itself once this resolves; a throw lands as
    // the sheet's root error with every value intact.
    toastSuccess(form.type === 'charge' ? 'Charge added' : 'Payment recorded');
  };

  return (
    <>
      <EntityDialog
        open={open}
        onOpenChange={onOpenChange}
        title={edited ? 'Edit transaction' : 'Add transaction'}
        schema={transactionSchema}
        defaultValues={
          edited
            ? transactionEditFormValues(edited)
            : transactionFormValues(customer?.id, presetType)
        }
        submitLabel={edited ? 'Save changes' : <SubmitLabel />}
        onSubmit={handleSubmit}
      >
        {edited ? (
          <FixedCustomer customer={customer ?? null} />
        ) : (
          <CustomerField
            customer={customer ?? null}
            onAddNew={(query) => {
              setNewCustomerQuery(query);
              setAddCustomerOpen(true);
            }}
          />
        )}
        {/* L-10 (a): the two-choice type control — the words a
            bookkeeper uses, at thumb size. */}
        <TypeChoice />
        {/* L-10 (b): the amount is the hero of this form. */}
        <MoneyField
          name="amount"
          label="Amount"
          autoFocus
          inputClassName="font-display text-3xl font-bold tabular-nums"
        />
        {/* L-10 (c): what this entry makes the balance, before saving. */}
        <BalancePreview
          businessId={businessId}
          replaceOf={
            edited ? { type: edited.type, amount: edited.amount } : null
          }
        />
        {/* L-10 (d): quick date chips over the untouched Date field. */}
        <DateChips />
        <div className="grid grid-cols-2 gap-3">
          <DateField name="occurred_on" label="Date" />
          <TextField name="occurred_at_time" label="Time" type="time" />
        </div>
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
  return <>{watch('type') === 'payment' ? 'Add payment' : 'Add charge'}</>;
}

/**
 * S-33 — the customer of a stored entry never changes: shown, not
 * picked (the same rule the v1 sheet had).
 */
function FixedCustomer({ customer }: { customer: SheetCustomer | null }) {
  return (
    <div className="space-y-1.5">
      <Label>Customer</Label>
      <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
        {customer?.name ?? '—'}
      </p>
    </div>
  );
}

function CustomerField({
  customer,
  onAddNew,
}: {
  customer: SheetCustomer | null;
  onAddNew: (query: string) => void;
}) {
  const { control, setValue, formState } = useFormContext();
  const customerId = String(useWatch({ control, name: 'customer_id' }) ?? '');
  const error = formState.errors.customer_id?.message as string | undefined;

  // The sheet can be handed a customer while it is already open (the
  // "Customer added" toast action) — the form value follows the prop.
  useEffect(() => {
    if (customer && customer.id !== customerId) {
      setValue('customer_id', customer.id);
    }
  }, [customer, customerId, setValue]);

  return (
    <div className="space-y-1.5">
      <Label>Customer</Label>
      <CustomerCombobox
        value={customerId || null}
        onSelect={(selected) => setValue('customer_id', selected.id)}
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
 * L-10 (a) — a two-choice radiogroup, not a segmented field: the same
 * pattern the L-07 quick-add card proved, at h-11 so it is thumb-sized
 * on a phone. The words are "Charged" and "Paid" — what the entry does
 * — not the stored enum.
 */
const TYPE_OPTIONS = [
  { value: 'charge', label: 'Charged' },
  { value: 'payment', label: 'Paid' },
] as const;

function TypeChoice() {
  const { control, setValue } = useFormContext();
  const type = useWatch({ control, name: 'type' }) as 'charge' | 'payment';

  return (
    <div className="space-y-1.5">
      <span id="type-label" className="text-sm font-medium text-foreground">
        Type
      </span>
      <div role="radiogroup" aria-labelledby="type-label" className="flex gap-2">
        {TYPE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={type === option.value}
            onClick={() =>
              setValue('type', option.value, { shouldDirty: true })
            }
            className={cn(
              'h-11 flex-1 rounded-sm text-sm font-medium transition-colors',
              type === option.value
                ? 'bg-primary text-primary-foreground'
                : 'border border-input bg-card text-foreground hover:bg-muted',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * L-10 (d) — Today / Yesterday set the untouched Date field's value;
 * Pick date drops focus into it (the native picker opens). The chips
 * dirty the form, so closing afterwards asks before discarding — an
 * accidental tap cannot silently discard either.
 */
function DateChips() {
  const { setValue } = useFormContext();
  const chip =
    'rounded-sm border border-input bg-card px-2.5 py-1 text-sm text-foreground transition-colors hover:bg-muted pointer-coarse:min-h-11';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Date:</span>
      <button
        type="button"
        className={chip}
        onClick={() =>
          setValue('occurred_on', todayISO(), { shouldDirty: true })
        }
      >
        Today
      </button>
      <button
        type="button"
        className={chip}
        onClick={() =>
          setValue('occurred_on', yesterdayISO(), { shouldDirty: true })
        }
      >
        Yesterday
      </button>
      <button
        type="button"
        className={cn(chip, 'border-transparent bg-transparent hover:bg-muted')}
        onClick={() => document.getElementById('occurred_on-date')?.focus()}
      >
        Pick date
      </button>
    </div>
  );
}

/**
 * L-10 (c) — the safety net against a wrong extra zero: one live line,
 * "New balance for {customer}: ₹X", announced politely so a screen
 * reader hears it change while typing. Mounted only once a customer is
 * chosen AND a valid amount typed, so the balance query never runs for
 * an empty id or a half-typed figure. In edit mode (`replaceOf`) the
 * balance already contains the entry being corrected, so "after"
 * removes its old effect and adds the new one — the recalculated
 * number is honest before saving.
 */
function BalancePreview({
  businessId,
  replaceOf = null,
}: {
  businessId: string;
  replaceOf?: { type: 'charge' | 'payment'; amount: number } | null;
}) {
  const { control } = useFormContext();
  const customerId = String(useWatch({ control, name: 'customer_id' }) ?? '');
  const type = useWatch({ control, name: 'type' }) as 'charge' | 'payment';
  const rawAmount = useWatch({ control, name: 'amount' });
  const amount = typeof rawAmount === 'number' ? rawAmount : 0;

  if (!customerId || amount <= 0) return null;
  return (
    <PreviewLine
      businessId={businessId}
      customerId={customerId}
      type={type}
      amount={amount}
      replaceOf={replaceOf}
    />
  );
}

/**
 * The half that needs data, in its own component so the two queries
 * (the name, the balance) only mount for a real customer with a real
 * amount. The name comes from the sheet's open request when it is the
 * same customer; otherwise it is fetched by id.
 */
function PreviewLine({
  businessId,
  customerId,
  type,
  amount,
  replaceOf,
}: {
  businessId: string;
  customerId: string;
  type: 'charge' | 'payment';
  amount: number;
  replaceOf: { type: 'charge' | 'payment'; amount: number } | null;
}) {
  const { data: customer } = useCustomer(customerId, businessId);
  const { data: current } = useCustomerBalance(customerId, businessId);
  if (current === undefined || !customer) return null;

  const balance = current;
  const oldEffect = replaceOf
    ? replaceOf.type === 'charge'
      ? replaceOf.amount
      : -replaceOf.amount
    : 0;
  const after = balance - oldEffect + (type === 'charge' ? amount : -amount);

  return (
    <p
      aria-live="polite"
      className="text-sm tabular-nums text-muted-foreground"
    >
      New balance for {customer.name}: {formatMoney(after)}
    </p>
  );
}
