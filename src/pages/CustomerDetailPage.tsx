import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CustomerFormDialog } from "@/components/CustomerFormDialog";
import { getCustomer, updateCustomer } from "@/lib/customers";
import type { Customer } from "@/types";

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const fetchCustomer = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getCustomer(id);
      setCustomer(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customer");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCustomer();
  }, [id]);

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
          onClick={() => void fetchCustomer()}
          className="ml-3 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!customer) return null;

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
            <p className="mt-1 text-sm text-muted-foreground">{customer.phone}</p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
      </div>

      <div>
        <p className="text-sm text-muted-foreground">Current Balance</p>
        <p className="text-4xl font-semibold tabular-nums text-foreground">
          ₹0
        </p>
        <p className="text-xs text-muted-foreground">Settled</p>
      </div>

      <div className="rounded-md border border-border bg-muted/50 px-6 py-8 text-center text-sm text-muted-foreground">
        No transactions yet. Add a charge or payment to get started.
      </div>

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
