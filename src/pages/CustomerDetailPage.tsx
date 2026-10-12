import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { EditTransactionSheet } from "@/components/EditTransactionSheet";
import { DataTable, type Column } from "@/components/DataTable";
import { useSort } from "@/hooks/useSort";
import { useCustomer, useUpdateCustomer } from "@/features/customers/hooks";
import {
  useCustomerBalance,
  useCustomerTransactions,
} from "@/features/transactions/hooks";
import { formatDate } from "@/lib/format";
import type { Transaction } from "@/types";

type TransactionWithSort = Transaction & { occurredAtMs: number };

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    data: customer,
    isLoading,
    error,
    refetch: refetchCustomer,
  } = useCustomer(id ?? "");
  const { data: transactions = [] } = useCustomerTransactions(id ?? "");
  const { data: balance = 0 } = useCustomerBalance(id ?? "");
  const updateCustomer = useUpdateCustomer();
  const [editOpen, setEditOpen] = useState(false);
  const [addTxOpen, setAddTxOpen] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
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
  }) => updateCustomer.mutate({ id: id ?? "", input: data });

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
          {row.status === "edited" && (
            <span className="text-xs text-muted-foreground">(edited)</span>
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
        row.status !== "voided" ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditTx(row);
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
            onClick={() => navigate("/customers")}
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

      <Button
        variant="outline"
        onClick={() => setAddTxOpen(true)}
      >
        Add Transaction
      </Button>

      <DataTable
        columns={columns}
        rows={sorted}
        getRowKey={(row) => row.id}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={toggleSort}
        onRowClick={(row) => navigate(`/transactions/${row.id}`)}
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

      {id && (
        <AddTransactionSheet
          open={addTxOpen}
          onOpenChange={setAddTxOpen}
          customerId={id}
          currentBalance={balance}
        />
      )}

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
