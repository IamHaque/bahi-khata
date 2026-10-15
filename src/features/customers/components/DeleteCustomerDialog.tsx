import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toast } from "sonner";
import { useCustomerTransactionCount, useDeleteCustomerPermanently } from "../hooks";
import type { CustomerListRow } from "../api";

interface DeleteCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  /** The archived row being destroyed; null while closed. */
  customer: CustomerListRow | null;
}

/**
 * S-30 — the only destructive customer dialog. Typing the customer's
 * exact name gates the confirm button (ConfirmDialog's
 * typingConfirmation), the copy says what one atomic step removes, and
 * the server refuses anyone but the owner (migration 0004's RPC) even
 * if this dialog were somehow reached.
 */
export function DeleteCustomerDialog({
  open,
  onOpenChange,
  businessId,
  customer,
}: DeleteCustomerDialogProps) {
  const remove = useDeleteCustomerPermanently(businessId);
  const { data: count } = useCustomerTransactionCount(
    customer?.id ?? "",
    businessId,
    open,
  );

  const handleDelete = async () => {
    if (!customer) return;
    try {
      await remove.mutateAsync({ id: customer.id });
    } catch {
      toast.error("Could not delete the customer. Try again.");
    }
  };

  const description = !customer
    ? undefined
    : count === undefined
      ? `${customer.name} and every transaction are permanently removed in one step. This cannot be undone.`
      : `${customer.name} and all ${count} ${count === 1 ? "transaction" : "transactions"} are permanently removed in one step. This cannot be undone.`;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? `Delete ${customer.name} permanently?` : "Delete permanently?"}
      description={description}
      confirmLabel="Delete permanently"
      tone="destructive"
      typingConfirmation={customer?.name}
      onConfirm={() => void handleDelete()}
    />
  );
}
