import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { AddTransactionSheet } from "@/components/AddTransactionSheet";
import { EditTransactionSheet } from "@/components/EditTransactionSheet";
import { getCustomer, updateCustomer } from "@/lib/customers";
import {
  listTransactionsByCustomer,
  getCustomerBalance,
} from "@/lib/transactions";
import type { Customer, Transaction } from "@/types";

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

      {transactions.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/50 px-6 py-8 text-center text-sm text-muted-foreground">
          No transactions yet. Add a charge or payment to get started.
        </div>
      ) : (
        <div className="space-y-0" role="list" aria-label="Transaction history">
          {transactions.map((tx) => (
            <div
              key={tx.id}
              role="listitem"
              className="flex items-center justify-between border-b border-border px-4 py-3 transition-colors hover:bg-muted"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
                      tx.type === "charge"
                        ? "bg-receivable/10 text-receivable"
                        : "bg-credit/10 text-credit"
                    }`}
                  >
                    {tx.type === "charge" ? "Charge" : "Payment"}
                  </span>
                  {tx.status === "edited" && (
                    <span className="text-xs text-muted-foreground">
                      (edited)
                    </span>
                  )}
                  {tx.status === "voided" && (
                    <span className="text-xs text-muted-foreground line-through">
                      (voided)
                    </span>
                  )}
                </div>
                {tx.note && (
                  <p className="mt-1 text-sm text-muted-foreground truncate">
                    {tx.note}
                  </p>
                )}
              </div>
              <div className="ml-4 text-right">
                <p
                  className={`text-sm tabular-nums ${
                    tx.type === "charge" ? "text-receivable" : "text-credit"
                  } ${tx.status === "voided" ? "line-through opacity-50" : ""}`}
                >
                  {tx.type === "charge" ? "+" : "-"}₹
                  {tx.amount.toLocaleString("en-IN")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(tx.occurred_at).toLocaleDateString("en-IN")}
                </p>
              </div>
              {tx.status !== "voided" && (
                <button
                  type="button"
                  onClick={() => setEditTx(tx)}
                  className="ml-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Edit ${tx.type} of ₹${tx.amount}`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

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
