import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { EditTransactionSheet } from "@/components/EditTransactionSheet";
import { DataTable, type Column } from "@/components/DataTable";
import { useSort } from "@/hooks/useSort";
import { getCustomer, updateCustomer } from "@/lib/customers";
import {
  listTransactionsByCustomer,
  getCustomerBalance,
} from "@/lib/transactions";
import type { Customer, Transaction } from "@/types";

type TransactionWithSort = Transaction & { occurredAtMs: number };

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addTxOpen, setAddTxOpen] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const balanceRef = useRef<HTMLParagraphElement>(null);
  const { sortBy, sortDir, toggleSort } = useSort("occurredAtMs", "desc");

  const fetchData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const [cust, txs, bal] = await Promise.all([
        getCustomer(id),
        listTransactionsByCustomer(id),
        getCustomerBalance(id),
      ]);
      setCustomer(cust);
      setTransactions(txs);
      setBalance(bal);

      if (balanceRef.current) {
        balanceRef.current.classList.remove("balance-flash");
        void balanceRef.current.offsetWidth;
        balanceRef.current.classList.add("balance-flash");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => void fetchData();
    window.addEventListener("transaction-saved", handler);
    return () => window.removeEventListener("transaction-saved", handler);
  }, [fetchData]);

  const handleEdit = async (data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
  }) => {
    if (!id) return;
    const updated = await updateCustomer(id, data);
    setCustomer(updated);
  };

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
          {new Date(row.occurred_at).toLocaleDateString("en-IN")}
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

  if (loading) {
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
        {error}
        <button
          type="button"
          onClick={() => void fetchData()}
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
        loading={loading}
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
          onTransactionAdded={() => void fetchData()}
        />
      )}

      {editTx && (
        <EditTransactionSheet
          open={!!editTx}
          onOpenChange={(open) => { if (!open) setEditTx(null); }}
          transaction={editTx}
          onTransactionUpdated={() => { setEditTx(null); void fetchData(); }}
        />
      )}
    </div>
  );
}
