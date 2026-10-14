import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toast } from "sonner";
import { useCustomerTransactionCount, useSetCustomerArchived } from "../hooks";
import type { CustomerListRow } from "../api";

interface ArchiveCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  /** The row being archived; null while the dialog is closed. */
  customer: CustomerListRow | null;
}

/**
 * S-30 — the archive warning. ConfirmDialog closes itself the moment
 * confirm is pressed, so the mutation resolves behind the scenes: a
 * success shows the "Customer archived" toast with an Undo action for
 * 8 seconds, a failure shows an error toast and the row simply stays
 * where it was. The copy promises what actually happens — history is
 * kept — and warns about the totals only when the balance is not zero,
 * because that is when leaving the totals changes them.
 */
export function ArchiveCustomerDialog({
  open,
  onOpenChange,
  businessId,
  customer,
}: ArchiveCustomerDialogProps) {
  const archive = useSetCustomerArchived(businessId);
  const { data: count } = useCustomerTransactionCount(
    customer?.id ?? "",
    businessId,
    open,
  );

  const handleArchive = async () => {
    if (!customer) return;
    try {
      await archive.mutateAsync({ id: customer.id, archived: true });
      toast.success("Customer archived", {
        duration: 8000,
        action: {
          label: "Undo",
          onClick: () =>
            void archive
              .mutateAsync({ id: customer.id, archived: false })
              .catch(() => {
                toast.error("Could not restore the customer. Try again.");
              }),
        },
      });
    } catch {
      toast.error("Could not archive the customer. Try again.");
    }
  };

  const countLine =
    count === undefined
      ? "Nothing is deleted — every transaction is kept and the customer can be restored at any time."
      : customer
        ? `${customer.name} has ${count} ${count === 1 ? "transaction" : "transactions"} — nothing is deleted and they can be restored at any time.`
        : "";
  const balanceLine =
    customer && customer.balance !== 0
      ? " Their balance is not zero: archived customers are left out of lists and dashboard totals."
      : "";

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? `Archive ${customer.name}?` : "Archive customer?"}
      description={`${countLine}${balanceLine}`}
      confirmLabel="Archive customer"
      tone="default"
      onConfirm={() => void handleArchive()}
    />
  );
}
