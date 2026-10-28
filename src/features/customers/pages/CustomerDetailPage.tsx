import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Can } from "@/components/app/Can";
import type { RowActionItem } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { ErrorState } from "@/components/app/ErrorState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { usePermissions } from "@/features/business/hooks";
import { ArchiveCustomerDialog } from "@/features/customers/components/ArchiveCustomerDialog";
import { DeleteCustomerDialog } from "@/features/customers/components/DeleteCustomerDialog";
import { CustomerFormDialog } from "@/features/customers/components/CustomerFormDialog";
import { CustomerHeader } from "@/features/customers/components/CustomerHeader";
import { CustomerQuickAdd } from "@/features/customers/components/CustomerQuickAdd";
import { LedgerTable } from "@/features/customers/components/LedgerTable";
import { useCustomer, useSetCustomerArchived } from "@/features/customers/hooks";
import type { CustomerListRow } from "@/features/customers/api";
import { useLedgerRowActions } from "@/features/customers/useLedgerRowActions";
import { VoidTransactionDialog } from "@/features/transactions/components/VoidTransactionDialog";
import { DeleteTransactionDialog } from "@/features/transactions/components/DeleteTransactionDialog";
import { useCustomerBalance, useCustomerLedger } from "@/features/transactions/hooks";
import { openTransactionSheet } from "@/features/transactions/sheetStore";
import { formatDate } from "@/lib/format";
import { paths } from "@/lib/paths";
import type { Customer } from "@/types";

/**
 * S-30's archive column rides on the server row; the v1 `Customer`
 * type never grew it (kept optional, like CustomerListRow).
 */
type CustomerRecord = Customer & { archived_at?: string | null };

/** One profile field on the Details tab; every field is always shown,
 *  an empty one says so plainly. */
function DetailField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground/70">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value || "—"}</dd>
    </div>
  );
}

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
  const {
    data: ledger = [],
    isLoading: ledgerLoading,
    error: ledgerError,
    refetch: refetchLedger,
  } = useCustomerLedger(customerId ?? "", businessId);
  const { data: balance = 0 } = useCustomerBalance(customerId ?? "", businessId);
  const setArchived = useSetCustomerArchived(businessId);
  const { can } = usePermissions();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // v3 (S-55): the owner's hard delete for the whole customer.
  const [deleteCustomerOpen, setDeleteCustomerOpen] = useState(false);
  // S-31: ledger filters — All / Charges / Payments, Show voided on by
  // default (voided history stays part of the story unless you hide it).
  const [typeFilter, setTypeFilter] = useState<"all" | "charge" | "payment">(
    "all",
  );
  const [showVoided, setShowVoided] = useState(true);

  // Derived before the early returns: the row-actions hook must run on
  // every render (React's hook order), and every value it reads is
  // safe while `customer` is still undefined.
  const record = customer as CustomerRecord | undefined;
  const archived = record?.archived_at != null;
  const canManageCustomers = can("manageCustomers");
  const canArchive = can("archiveCustomers");
  // Archived customers keep their history but leave the working set
  // (S-30): no writes of any kind until restored.
  const canWriteTransactions = can("manageTransactions") && !archived;
  const sheetCustomer = { id: customer?.id ?? "", name: customer?.name ?? "" };

  // S-33/S-34/S-54: the row actions live in their own small hook
  // (L-07 Do.1 keeps this page under 450 lines); its state feeds the
  // two dialogs rendered below.
  const {
    renderLedgerActions,
    voidTx,
    setVoidTx,
    deleteTx,
    setDeleteTx,
  } = useLedgerRowActions({
    businessId,
    sheetCustomer,
    canWrite: canWriteTransactions,
    canDelete: can("deleteTransaction"),
    archived,
  });

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

  const addCharge = () => openTransactionSheet(sheetCustomer, "charge");
  const addPayment = () => openTransactionSheet(sheetCustomer, "payment");

  const handleRestoreCustomer = () => {
    void setArchived
      .mutateAsync({ id: customer.id, archived: false })
      .catch(() => {
        toast.error("Could not restore the customer. Try again.");
      });
  };

  // The customer_ledger RPC returns newest first; the header line reads
  // the newest entry's instant off the same rows.
  const lastActivityMs = ledger.reduce(
    (max, row) => Math.max(max, new Date(row.occurred_at).getTime()),
    0,
  );
  const lastActivityIso = lastActivityMs
    ? new Date(lastActivityMs).toISOString()
    : null;

  const filtered = ledger.filter((row) => {
    if (!showVoided && row.status === "voided") return false;
    return typeFilter === "all" || row.type === typeFilter;
  });

  const archiveRow: CustomerListRow | null = {
    ...customer,
    balance,
    last_activity: lastActivityIso,
  };

  // v3 (S-55): Archive stays for active customers; Delete customer
  // joins it next to Archive and also stands alone on archived ones
  // (destroying works either way), always owner-only.
  const customerMenuItems: RowActionItem[] = [];
  if (canArchive && !archived) {
    customerMenuItems.push({
      label: "Archive",
      onSelect: () => setArchiveOpen(true),
      variant: "destructive",
    });
  }
  if (can("deleteCustomer")) {
    customerMenuItems.push({
      label: "Delete customer",
      onSelect: () => setDeleteCustomerOpen(true),
      variant: "destructive",
      separator: customerMenuItems.length > 0,
    });
  }

  return (
    <div className="space-y-6">
      {/* S-30/S-31: an archived customer keeps everything but writes. */}
      {archived && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3"
          role="status"
        >
          <p className="text-sm text-foreground">
            <span className="font-medium">This customer is archived.</span>{" "}
            History and totals are kept; writing actions stay hidden until
            she is restored.
          </p>
          {canArchive && (
            <Button variant="outline" size="sm" onClick={handleRestoreCustomer}>
              Restore
            </Button>
          )}
        </div>
      )}

      <CustomerHeader
        customer={customer}
        balance={balance}
        lastActivityIso={lastActivityIso}
        statementHref={paths.statement(businessId, customerId ?? "")}
        canEdit={canManageCustomers && !archived}
        canWrite={canWriteTransactions}
        menuItems={customerMenuItems}
        onBack={() => navigate(paths.customers(businessId))}
        onEdit={() => setEditOpen(true)}
        onAddCharge={addCharge}
        onAddPayment={addPayment}
      />

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="space-y-3">
          {/* G-A2 is pending, so the baseline quick-add card ships
              here; L-12's entry row takes the slot when the gate
              approves (the card stays on as the mobile control). */}
          <Can action="manageTransactions">
            {!archived && (
              <CustomerQuickAdd
                customerId={customer.id}
                businessId={businessId}
              />
            )}
          </Can>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <ToggleGroup
              // base-ui's group value is always an array of pressed
              // values; nothing pressed = "All".
              value={[typeFilter]}
              onValueChange={(next) => {
                const first = next[0];
                setTypeFilter(
                  first === "charge" || first === "payment" ? first : "all",
                );
              }}
              aria-label="Filter the ledger by type"
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="charge">Charges</ToggleGroupItem>
              <ToggleGroupItem value="payment">Payments</ToggleGroupItem>
            </ToggleGroup>

            <Toggle
              variant="outline"
              pressed={showVoided}
              onPressedChange={(next) => setShowVoided(Boolean(next))}
            >
              Show voided
            </Toggle>
          </div>

          {ledgerLoading ? (
            <div
              role="status"
              aria-label="Loading ledger"
              className="h-56 animate-pulse rounded-lg border border-border bg-card"
            />
          ) : ledgerError ? (
            <ErrorState
              message={ledgerError.message}
              onRetry={() => refetchLedger()}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No transactions yet"
              description="Add a charge or a payment to start this ledger."
            >
              {canWriteTransactions && (
                <>
                  <Button onClick={addCharge}>Add charge</Button>
                  <Button variant="outline" onClick={addPayment}>
                    Add payment
                  </Button>
                </>
              )}
            </EmptyState>
          ) : (
            <LedgerTable
              entries={filtered}
              renderActions={renderLedgerActions}
            />
          )}
        </TabsContent>

        {/* S-31: every profile field, notes included. */}
        <TabsContent value="details">
          <dl className="grid gap-4 sm:grid-cols-2">
            <DetailField label="Phone" value={customer.phone} />
            <DetailField label="Email" value={customer.email} />
            <DetailField label="Address" value={customer.address} wide />
            <DetailField
              label="Alternate contact name"
              value={customer.alternate_contact_name}
            />
            <DetailField
              label="Alternate contact phone"
              value={customer.alternate_contact_phone}
            />
            <DetailField
              label="Tags"
              value={customer.tags?.length ? customer.tags.join(", ") : null}
            />
            <DetailField label="Notes" value={customer.notes} wide />
            <DetailField label="Created" value={formatDate(customer.created_at)} />
            <DetailField label="Last updated" value={formatDate(customer.updated_at)} />
          </dl>
        </TabsContent>
      </Tabs>

      {/* S-29: edit runs through the feature dialog (this page owns no
          form logic). */}
      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        businessId={businessId}
        mode="edit"
        customer={customer}
      />

      {/* S-30: archive with its count copy and Undo toast. */}
      <ArchiveCustomerDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        businessId={businessId}
        customer={archiveRow}
      />

      {/* v3 (S-55): the owner's hard delete — after success the page
          returns to the customers list (the customer is gone). */}
      <DeleteCustomerDialog
        open={deleteCustomerOpen}
        onOpenChange={setDeleteCustomerOpen}
        businessId={businessId}
        customer={archiveRow}
        onDeleted={() => navigate(paths.customers(businessId))}
      />

      {/* S-34: the void confirmation; its own toast carries Undo. */}
      <VoidTransactionDialog
        open={!!voidTx}
        onOpenChange={(open) => {
          if (!open) setVoidTx(null);
        }}
        businessId={businessId}
        transaction={voidTx}
      />

      {/* v3 (S-54): the owner's hard delete. The ledger row is at hand,
          so the dialog carries the balance sentence. */}
      <DeleteTransactionDialog
        open={!!deleteTx}
        onOpenChange={(open) => {
          if (!open) setDeleteTx(null);
        }}
        businessId={businessId}
        transaction={
          deleteTx && {
            id: deleteTx.id,
            type: deleteTx.type,
            amount: deleteTx.amount,
            occurred_at: deleteTx.occurred_at,
            customer_name: customer.name,
            // balance_after is the running balance INCLUDING this row,
            // so "before" is it with this row's effect taken back out.
            balance_before:
              deleteTx.type === "charge"
                ? deleteTx.balance_after - deleteTx.amount
                : deleteTx.balance_after + deleteTx.amount,
            balance_after: deleteTx.balance_after,
          }
        }
        onVoidInstead={() => {
          if (deleteTx) setVoidTx(deleteTx);
        }}
      />
    </div>
  );
}
