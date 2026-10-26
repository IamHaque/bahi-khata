import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toast } from "sonner";
import { AppError } from "@/lib/AppError";
import { toastError } from "@/lib/toast";
import { paths } from "@/lib/paths";
import {
  useCustomerTransactionCount,
  useDeleteCustomerPermanently,
  useSetCustomerArchived,
} from "../hooks";
import { useRestoreDeleted } from "@/features/deleted-items/hooks";
import type { CustomerListRow } from "../api";

interface DeleteCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  /** The row being destroyed; null while closed. */
  customer: Pick<CustomerListRow, "id" | "name"> | null;
  /** The detail page passes navigate-to-list; the list page omits it. */
  onDeleted?: () => void;
}

/**
 * v3 (S-55) — the owner's hard delete for a customer, gentler than the
 * old S-30 dialog: the copy promises recovery instead of permanence,
 * and two softer paths sit right inside it (download the statement
 * first, or archive instead). Typing the exact name still gates the
 * confirm (ConfirmDialog's typingConfirmation); success toasts for 10
 * seconds with an Undo wired to restore_deleted, which brings the
 * customer and every transaction back in one step.
 */
export function DeleteCustomerDialog({
  open,
  onOpenChange,
  businessId,
  customer,
  onDeleted,
}: DeleteCustomerDialogProps) {
  const remove = useDeleteCustomerPermanently(businessId);
  const restore = useRestoreDeleted(businessId);
  const setArchived = useSetCustomerArchived(businessId);
  const { data: count } = useCustomerTransactionCount(
    customer?.id ?? "",
    businessId,
    open,
  );

  const description = !customer
    ? undefined
    : count === undefined
      ? `This removes ${customer.name} and every transaction from your ledger. You can restore them from Recently deleted.`
      : `This removes ${customer.name} and ${count} ${count === 1 ? "transaction" : "transactions"} from your ledger. You can restore them from Recently deleted.`;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={customer ? `Delete ${customer.name}?` : "Delete customer?"}
      description={description}
      confirmLabel="Delete customer"
      tone="destructive"
      typingConfirmation={customer?.name}
      onConfirm={() => {
        if (!customer) return;
        remove.mutate(
          { id: customer.id },
          {
            onSuccess: (logId) => {
              toast.success("Customer deleted", {
                duration: 10_000,
                action: {
                  label: "Undo",
                  onClick: () => {
                    restore.mutate(logId, {
                      onSuccess: () => toast.success("Restored"),
                      onError: () => toastError("restore the customer"),
                    });
                  },
                },
              });
              onDeleted?.();
            },
            onError: (err) => {
              // The database's own message wins; anything else gets the
              // shared fallback form.
              if (err instanceof AppError) toast.error(err.message);
              else toastError("delete the customer");
            },
          },
        );
      }}
    >
      {customer && (
        <div className="flex flex-wrap items-center gap-4">
          <a
            href={paths.statement(businessId, customer.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Download statement first
          </a>
          <button
            type="button"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => {
              // The gentler path: same archive the row menu offers.
              onOpenChange(false);
              setArchived.mutate(
                { id: customer.id, archived: true },
                {
                  onSuccess: () => toast.success("Customer archived"),
                  onError: () => toastError("archive the customer"),
                },
              );
            }}
          >
            Archive instead
          </button>
        </div>
      )}
    </ConfirmDialog>
  );
}
