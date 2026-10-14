import { useNavigate } from "react-router-dom";
import { useFormContext, useWatch } from "react-hook-form";
import { EntityDialog } from "@/components/app/EntityDialog";
import { TextField } from "@/components/app/fields/TextField";
import { TextAreaField } from "@/components/app/fields/TextAreaField";
import { TagsField } from "@/components/app/fields/TagsField";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { paths } from "@/lib/paths";
import { toastSuccess } from "@/lib/toast";
import { openTransactionSheet } from "@/features/transactions/sheetStore";
import { useCreateCustomer, useCustomerList, useUpdateCustomer } from "../hooks";
import {
  customerFormValues,
  customerSchema,
  splitTags,
  type CustomerForm,
} from "../schemas";
import type { CustomerInput } from "../api";
import type { Customer } from "@/types";

interface CustomerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  mode: "add" | "edit";
  /** The row being edited; null/undefined for Add. */
  customer?: Customer | null;
  /**
   * S-32: prefill the Name field for the inline "Add <query> as a new
   * customer" entry inside the transaction sheet's picker.
   */
  defaultName?: string;
}

/**
 * S-29 — add and edit customers in one dialog, on the shared form kit
 * (EntityDialog + zod schema + field components).
 *
 * Validation runs before the network; a failed save keeps the dialog
 * open with every keystroke intact (EntityDialog's contract). The
 * duplicate check is a hint, never a block: same name AND phone as an
 * existing customer shows a notice with a way to open that customer,
 * while saving stays available the whole time.
 */
export function CustomerFormDialog({
  open,
  onOpenChange,
  businessId,
  mode,
  customer,
  defaultName,
}: CustomerFormDialogProps) {
  const navigate = useNavigate();
  const createCustomer = useCreateCustomer(businessId);
  const updateCustomer = useUpdateCustomer(businessId);

  const openExisting = (customerId: string) => {
    // Deliberate navigation: leaving for that customer's page discards
    // this draft without the "unsaved changes?" step.
    onOpenChange(false);
    navigate(paths.customerDetail(businessId, customerId));
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    const form = values as unknown as CustomerForm;
    const input: CustomerInput = {
      name: form.name,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      alternate_contact_name: form.alternate_contact_name || undefined,
      alternate_contact_phone: form.alternate_contact_phone || undefined,
      tags: splitTags(form.tags),
      notes: form.notes || undefined,
    };

    if (mode === "edit" && customer) {
      await updateCustomer.mutateAsync({ id: customer.id, input });
      toastSuccess("Customer updated");
    } else {
      const created = await createCustomer.mutateAsync(input);
      // S-32 closed B-04: the action opens the transaction sheet with
      // this brand-new customer preselected — it adds the first entry.
      toastSuccess("Customer added", {
        label: "Add transaction",
        onClick: () =>
          openTransactionSheet({ id: created.id, name: created.name }),
      });
    }
  };

  return (
    <EntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "add" ? "Add Customer" : "Edit Customer"}
      schema={customerSchema}
      defaultValues={customerFormValues(customer, defaultName)}
      submitLabel={mode === "add" ? "Add customer" : "Save changes"}
      onSubmit={handleSubmit}
    >
      <TextField
        name="name"
        label="Name"
        placeholder="Customer name"
        autoFocus
      />

      <DuplicateHint
        businessId={businessId}
        editingId={customer?.id ?? null}
        onOpenExisting={openExisting}
      />

      <details className="rounded-md border border-border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Additional details
        </summary>
        <div className="mt-3 space-y-4">
          <TextField name="phone" label="Phone" placeholder="01711 000000" />
          <TextField
            name="email"
            label="Email"
            type="email"
            placeholder="asha@example.com"
          />
          <TextField
            name="address"
            label="Address"
            placeholder="Where they usually are"
          />
          <TextField
            name="alternate_contact_name"
            label="Alternate contact name"
          />
          <TextField
            name="alternate_contact_phone"
            label="Alternate contact phone"
          />
          <TagsField
            name="tags"
            label="Tags"
            placeholder="wholesale, regular"
            hint="Up to 10 tags, 24 characters each"
          />
          <TextAreaField
            name="notes"
            label="Notes"
            placeholder="Anything worth remembering"
          />
        </div>
      </details>
    </EntityDialog>
  );
}

/**
 * S-29 "duplicate hint, not a block": when the name and phone being
 * typed both match an existing customer (other than the one being
 * edited), a notice offers to open that customer. The query only runs
 * once a match is even possible (name of 2+ characters and a phone
 * entered) and compares the live field values, so a stale notice can
 * never outlive the keystrokes that produced it.
 */
function DuplicateHint({
  businessId,
  editingId,
  onOpenExisting,
}: {
  businessId: string;
  editingId: string | null;
  onOpenExisting: (customerId: string) => void;
}) {
  const { control } = useFormContext();
  const name = String(useWatch({ control, name: "name" }) ?? "");
  const phone = String(useWatch({ control, name: "phone" }) ?? "");
  const debouncedName = useDebouncedValue(name.trim(), 300);

  const canMatch = debouncedName.length >= 2 && phone.trim() !== "";
  const { data } = useCustomerList(
    businessId,
    { search: debouncedName, pageSize: 5 },
    { enabled: canMatch },
  );

  const match = !canMatch
    ? undefined
    : data?.items.find(
        (candidate) =>
          candidate.id !== editingId &&
          candidate.name.trim().toLowerCase() === name.trim().toLowerCase() &&
          (candidate.phone ?? "").trim() === phone.trim(),
      );

  if (!match) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm"
    >
      <p className="text-muted-foreground">
        A customer with this name and phone already exists.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onOpenExisting(match.id)}
      >
        Open existing customer
      </Button>
    </div>
  );
}
