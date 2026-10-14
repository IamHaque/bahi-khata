import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { DataTable, type Column } from "@/components/DataTable";
import { useSort } from "@/hooks/useSort";
import { useCustomer, useUpdateCustomer } from "@/features/customers/hooks";
import { usePermissions } from "@/features/business/hooks";
import {
  useCustomerBalance,
  useCustomerTransactions,
} from "@/features/transactions/hooks";
import type { TransactionWithEditor } from "@/features/transactions/api";
import { EditedBadge } from "@/features/transactions/components/EditedBadge";
import {
  openTransactionEdit,
  openTransactionSheet,
} from "@/features/transactions/sheetStore";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { formatDate } from "@/lib/format";
import { paths } from "@/lib/paths";

// S-33: the ledger rows carry the audit data the Edited badge reads.
type TransactionWithSort = TransactionWithEditor & { occurredAtMs: number };

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  // "" only happens in tests that render the page outside /b/:businessId;
  // falsy businessId behaves unscoped (v1 transitional), same as undefined.
  const businessId = useScopedBusinessId() ?? "";
  const {
    data: customer,
    isLoading,
    error,
    refetch: refetchCustomer,
  } = useCustomer(customerId ?? "", businessId);
  const { data: transactions = [] } = useCustomerTransactions(
    customerId ?? "",
    businessId,
  );
  const { data: balance = 0 } = useCustomerBalance(customerId ?? "", businessId);
  const updateCustomer = useUpdateCustomer(businessId);
  const { can } = usePermissions();
  const [editOpen, setEditOpen] = useState(false);
  const balanceRef = useRef<HTMLParagraphElement>(null);
  const { sortBy, sortDir, toggleSort } = useSort("occurredAtMs", "desc");

  useEffect(() => {
    if (balanceRef.current) {
      balanceRef.current.classList.remove("balance-flash");
      void balanceRef.current.offsetWidth;
      balanceRef.current.classList.add("balance-flash");
    }
  }, [balance]);

  const handleEdit = async (data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  }) => updateCustomer.mutate({ id: customerId ?? "", input: data });

  const txsWithSort: TransactionWithSort[] = transactions.map((tx) => ({
    ...tx,
    occurredAtMs: new Date(tx.occurred_at).getTime(),
  }));

  const sorted = [...txsWithSort].sort((a, b) => {
    if (sortBy === "occurredAtMs") {
      return sortDir === "asc"
        ? a.occurredAtMs - b.occurredAtMs
        : b.occurredAtMs - a.occurredAtMs;
    }
    if (sortBy === "amount") {
      return sortDir === "asc" ? a.amount - b.amount : b.amount - a.amount;
    }
    return 0;
  });

  const columns: Column<TransactionWithSort>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (row) => (
        <span className="tabular-nums">
          {formatDate(row.occurred_at)}
        </span>
      ),
      sortValue: (row) => row.occurredAtMs,
    },
    {
      key: "type",
      header: "Type",
      render: (row) => (
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
              row.type === "charge"
                ? "bg-receivable/10 text-receivable"
                : "bg-credit/10 text-credit"
            }`}
          >
            {row.type === "charge" ? "Charge" : "Payment"}
          </span>
          {/* S-33: the audit marker — who edited, when, on hover/focus. */}
          {row.status === "edited" && (
            <EditedBadge
              editorName={row.updated_by_name}
              updatedAt={row.updated_at}
            />
          )}
          {row.status === "voided" && (
            <span className="text-xs text-muted-foreground line-through">(voided)</span>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      render: (row) => (
        <span
          className={`tabular-nums ${
            row.type === "charge" ? "text-receivable" : "text-credit"
          } ${row.status === "voided" ? "line-through opacity-50" : ""}`}
        >
          {row.type === "charge" ? "+" : "-"}₹
          {row.amount.toLocaleString("en-IN")}
        </span>
      ),
      sortValue: (row) => row.amount,
    },
    {
      key: "note",
      header: "Note",
      render: (row) =>
        row.note ? (
          <span className="truncate text-muted-foreground">{row.note}</span>
        ) : null,
    },
    {
      key: "actions",
      header: "",
      render: (row) =>
        // S-33: editing opens the shared sheet in edit mode; viewers
        // have no edit action at all (voided rows keep their S-34
        // restore story instead).
        row.status !== "voided" && customer && can("manageTransactions") ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openTransactionEdit(row, {
                id: customer.id,
                name: customer.name,
              });
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Edit ${row.type} of ₹${row.amount}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        ) : null,
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading customer">
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
          onClick={() => refetchCustomer()}
          className="ml-3 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!customer) return null;

  const balanceClass =
    balance > 0
      ? "text-receivable"
      : balance < 0
        ? "text-credit"
        : "text-muted-foreground";
  const balanceLabel =
    balance > 0 ? "Owes" : balance < 0 ? "In credit" : "Settled";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate(paths.customers(businessId))}
            className="mb-2 text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Customers
          </button>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {customer.name}
          </h2>
          {customer.phone && (
            <p className="mt-1 text-sm text-muted-foreground">
              {customer.phone}
            </p>
          )}
          {customer.email && (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="text-xs text-muted-foreground/70">Email: </span>
              {customer.email}
            </p>
          )}
          {customer.address && (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="text-xs text-muted-foreground/70">Address: </span>
              {customer.address}
            </p>
          )}
          {(customer.alternate_contact_name || customer.alternate_contact_phone) && (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="text-xs text-muted-foreground/70">Alt contact: </span>
              {[customer.alternate_contact_name, customer.alternate_contact_phone].filter(Boolean).join(", ")}
            </p>
          )}
          {customer.tags && customer.tags.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="text-xs text-muted-foreground/70">Tags: </span>
              {customer.tags.join(", ")}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">Current Balance</p>
        <p
          ref={balanceRef}
          className={`text-4xl font-bold tabular-nums tracking-tight ${balanceClass}`}
          style={{ letterSpacing: "-0.02em" }}
        >
          ₹{Math.abs(balance).toLocaleString("en-IN")}
        </p>
        <p className={`text-xs ${balanceClass}`}>{balanceLabel}</p>
      </div>

      {/* S-32: the shared transaction sheet opens with this customer
          preselected; the balance flashes when it lands. Viewers see no
          Add action at all. */}
      {customer && can("manageTransactions") && (
        <Button
          variant="outline"
          onClick={() =>
            openTransactionSheet({ id: customer.id, name: customer.name })
          }
        >
          Add Transaction
        </Button>
      )}

      <DataTable
        columns={columns}
        rows={sorted}
        getRowKey={(row) => row.id}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={toggleSort}
        onRowClick={(row) =>
          navigate(paths.transactionDetail(businessId, row.id))
        }
        loading={isLoading}
        emptyState={
          <p className="text-sm text-muted-foreground">
            No transactions yet. Add a charge or payment to get started.
          </p>
        }
      />

      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        onSubmit={handleEdit}
        initialData={customer}
        mode="edit"
      />
    </div>
  );
}
