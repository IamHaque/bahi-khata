import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { EditTransactionSheet } from "@/components/EditTransactionSheet";
import { useTransaction } from "@/features/transactions/hooks";
import { usePermissions } from "@/features/business/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { formatDate, formatTime } from "@/lib/format";
import { paths } from "@/lib/paths";
import type { TransactionWithCustomer } from "@/types";

export function TransactionDetailPage() {
  const { transactionId } = useParams<{ transactionId: string }>();
  const navigate = useNavigate();
  // "" only happens in tests that render the page outside /b/:businessId;
  // falsy businessId behaves unscoped (v1 transitional), same as undefined.
  const businessId = useScopedBusinessId() ?? "";
  const {
    data: transaction,
    isLoading,
    error,
    refetch,
  } = useTransaction(transactionId ?? "", businessId);
  const [editTx, setEditTx] = useState<TransactionWithCustomer | null>(null);
  // S-33: viewers have no edit action anywhere (S-34 will rework this
  // page's void/restore story around the same gate).
  const { can } = usePermissions();

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading transaction">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-12 w-32 animate-pulse rounded bg-muted" />
        <div className="h-10 w-36 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
        {error.message}
        <button
          type="button"
          onClick={() => refetch()}
          className="ml-3 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate(paths.transactions(businessId))}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Transactions
        </button>
        <div className="rounded-md border border-border bg-muted/50 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Transaction not found. It may have been deleted.
          </p>
          <Link
            to={paths.transactions(businessId)}
            className="mt-2 inline-block text-sm text-primary hover:underline"
          >
            Back to Transactions
          </Link>
        </div>
      </div>
    );
  }

  const formattedDate = formatDate(transaction.occurred_at);
  const formattedTime = formatTime(transaction.occurred_at);

  const statusLabel =
    transaction.status === "voided"
      ? "Voided"
      : transaction.status === "edited"
        ? "Edited"
        : "Active";

  const statusClass =
    transaction.status === "voided"
      ? "text-muted-foreground line-through"
      : transaction.status === "edited"
        ? "text-muted-foreground"
        : "text-foreground";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate(paths.transactions(businessId))}
            className="mb-2 text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Transactions
          </button>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Transaction Detail
          </h2>
        </div>
        {transaction.status !== "voided" && can("manageTransactions") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditTx(transaction)}
          >
            Edit
          </Button>
        )}
      </div>

      <div className="space-y-4 rounded-md border border-border p-4">
        <div>
          <p className="text-xs text-muted-foreground/70">Customer</p>
          <Link
            to={paths.customerDetail(businessId, transaction.customer_id)}
            className="text-sm font-medium text-foreground hover:underline"
          >
            {transaction.customer_name}
          </Link>
        </div>

        <div>
          <p className="text-xs text-muted-foreground/70">Type</p>
          <p className={`text-sm font-medium ${
            transaction.type === "charge" ? "text-receivable" : "text-credit"
          }`}>
            {transaction.type === "charge" ? "Charge" : "Payment"}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground/70">Amount</p>
          <p
            className={`text-4xl font-bold tabular-nums tracking-tight ${
              transaction.type === "charge" ? "text-receivable" : "text-credit"
            } ${transaction.status === "voided" ? "line-through opacity-50" : ""}`}
            style={{ letterSpacing: "-0.02em" }}
          >
            {transaction.type === "charge" ? "+" : "-"}₹
            {transaction.amount.toLocaleString("en-IN")}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground/70">Date and time</p>
          <p className="text-sm text-foreground">
            {formattedDate} at {formattedTime}
          </p>
        </div>

        {transaction.note && (
          <div>
            <p className="text-xs text-muted-foreground/70">Note</p>
            <p className="text-sm text-foreground">{transaction.note}</p>
          </div>
        )}

        <div>
          <p className="text-xs text-muted-foreground/70">Source</p>
          <p className="text-sm text-foreground">
            {transaction.source === "import" ? "Imported" : "Manual entry"}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground/70">Status</p>
          <p className={`text-sm font-medium ${statusClass}`}>{statusLabel}</p>
        </div>
      </div>

      {editTx && (
        <EditTransactionSheet
          open={!!editTx}
          onOpenChange={(open) => { if (!open) setEditTx(null); }}
          transaction={editTx}
        />
      )}
    </div>
  );
}
