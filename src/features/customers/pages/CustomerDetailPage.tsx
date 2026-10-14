import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mail, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/app/Avatar";
import { BalanceBadge } from "@/components/app/BalanceBadge";
import {
  DataTable,
  RowActionsMenu,
  type Column,
} from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { StatCard } from "@/components/app/StatCard";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useSort } from "@/hooks/useSort";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { usePermissions } from "@/features/business/hooks";
import { ArchiveCustomerDialog } from "@/features/customers/components/ArchiveCustomerDialog";
import { CustomerFormDialog } from "@/features/customers/components/CustomerFormDialog";
import { useCustomer, useSetCustomerArchived } from "@/features/customers/hooks";
import type { CustomerListRow } from "@/features/customers/api";
import { EditedBadge } from "@/features/transactions/components/EditedBadge";
import { VoidTransactionDialog } from "@/features/transactions/components/VoidTransactionDialog";
import {
  useCustomerBalance,
  useCustomerLedger,
  useRestoreTransaction,
} from "@/features/transactions/hooks";
import type { CustomerLedgerRow } from "@/features/transactions/api";
import {
  openTransactionEdit,
  openTransactionSheet,
} from "@/features/transactions/sheetStore";
import { formatDate, formatMoney } from "@/lib/format";
import { paths } from "@/lib/paths";
import type { Customer } from "@/types";

/**
 * S-30's archive column rides on the server row; the v1 `Customer`
 * type never grew it (kept optional, like CustomerListRow).
 */
type CustomerRecord = Customer & { archived_at?: string | null };

/** A ledger row keyed for the client-side sort affordance. The figures
 *  themselves (balance_after) come from the customer_ledger RPC. */
type LedgerRow = CustomerLedgerRow & { occurredAtMs: number };

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
  const restore = useRestoreTransaction(businessId);
  const setArchived = useSetCustomerArchived(businessId);
  const { can } = usePermissions();

  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // S-34: the void confirmation for one row at a time; Restore on the
  // ledger mutates directly (it only ever adds history back).
  const [voidTx, setVoidTx] = useState<LedgerRow | null>(null);
  // S-31: ledger filters — All / Charges / Payments, Show voided on by
  // default (voided history stays part of the story unless you hide it).
  const [typeFilter, setTypeFilter] = useState<"all" | "charge" | "payment">(
    "all",
  );
  const [showVoided, setShowVoided] = useState(true);
  const balanceRef = useRef<HTMLParagraphElement>(null);
  const { sortBy, sortDir, toggleSort } = useSort("occurredAtMs", "desc");

  useEffect(() => {
    if (balanceRef.current) {
      balanceRef.current.classList.remove("balance-flash");
      void balanceRef.current.offsetWidth;
      balanceRef.current.classList.add("balance-flash");
    }
  }, [balance]);

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

  const record = customer as CustomerRecord;
  const archived = record.archived_at != null;
  const canManageCustomers = can("manageCustomers");
  const canArchive = can("archiveCustomers");
  // Archived customers keep their history but leave the working set
  // (S-30): no writes of any kind until restored.
  const canWriteTransactions = can("manageTransactions") && !archived;

  const sheetCustomer = { id: customer.id, name: customer.name };
  const addCharge = () => openTransactionSheet(sheetCustomer, "charge");
  const addPayment = () => openTransactionSheet(sheetCustomer, "payment");

  const handleRestoreCustomer = () => {
    void setArchived
      .mutateAsync({ id: customer.id, archived: false })
      .catch(() => {
        toast.error("Could not restore the customer. Try again.");
      });
  };

  // The S-31 figures: everything below reads the same server rows the
  // ledger shows — voided entries leave the totals exactly as they
  // leave the balance view.
  const rows: LedgerRow[] = ledger.map((row) => ({
    ...row,
    occurredAtMs: new Date(row.occurred_at).getTime(),
  }));
  const totalCharged = rows
    .filter((row) => row.type === "charge" && row.status !== "voided")
    .reduce((sum, row) => sum + row.amount, 0);
  const totalPaid = rows
    .filter((row) => row.type === "payment" && row.status !== "voided")
    .reduce((sum, row) => sum + row.amount, 0);
  const lastActivityMs = rows.reduce(
    (max, row) => Math.max(max, row.occurredAtMs),
    0,
  );
  const lastActivityLabel = lastActivityMs
    ? formatDate(new Date(lastActivityMs))
    : "No activity yet";
  const lastActivityIso = lastActivityMs
    ? new Date(lastActivityMs).toISOString()
    : null;

  const filtered = rows.filter((row) => {
    if (!showVoided && row.status === "voided") return false;
    return typeFilter === "all" || row.type === typeFilter;
  });
  const sorted = [...filtered].sort((a, b) => {
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

  // S-33/S-34: the pencil edits in the shared sheet, Void opens the
  // confirmation with an optional reason, and a voided row offers
  // Restore (it only ever adds history back, so it confirms nothing).
  // Viewers and archived customers have no actions at all.
  const renderRowActions = (row: LedgerRow) => {
    if (!canWriteTransactions) return null;

    if (row.status === "voided") {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            restore.mutate(
              { id: row.id },
              {
                onSuccess: () => toast.success("Transaction restored."),
                onError: () =>
                  toast.error(
                    "Could not restore the transaction. Try again.",
                  ),
              },
            );
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Restore ${row.type} of ₹${row.amount}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </button>
      );
    }

    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openTransactionEdit(row, sheetCustomer);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Edit ${row.type} of ₹${row.amount}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setVoidTx(row);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Void ${row.type} of ₹${row.amount}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </button>
      </div>
    );
  };

  const typeCell = (row: LedgerRow) => (
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
        <EditedBadge editorName={row.updated_by_name} updatedAt={row.updated_at} />
      )}
      {/* S-34: a voided row stays visible, muted. */}
      {row.status === "voided" && <StatusBadge label="Voided" tone="muted" />}
    </div>
  );

  const amountCell = (row: LedgerRow) => (
    <span
      className={`tabular-nums ${
        row.type === "charge" ? "text-receivable" : "text-credit"
      } ${row.status === "voided" ? "line-through opacity-50" : ""}`}
    >
      {row.type === "charge" ? "+" : "-"}₹
      {row.amount.toLocaleString("en-IN")}
    </span>
  );

  const columns: Column<LedgerRow>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (row) => (
        <span className="tabular-nums">{formatDate(row.occurred_at)}</span>
      ),
      sortValue: (row) => row.occurredAtMs,
    },
    {
      key: "type",
      header: "Type",
      render: (row) => typeCell(row),
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
      key: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      render: (row) => amountCell(row),
      sortValue: (row) => row.amount,
    },
    {
      // S-31: the running balance — computed per row by the
      // customer_ledger RPC (migration 0006), never in the browser.
      key: "balanceAfter",
      header: "Balance after",
      align: "right",
      render: (row) => (
        <span
          className={`tabular-nums ${
            row.status === "voided"
              ? "text-muted-foreground"
              : "text-foreground"
          }`}
        >
          {formatMoney(row.balance_after)}
        </span>
      ),
    },
  ];

  const balanceClass =
    balance > 0
      ? "text-receivable"
      : balance < 0
        ? "text-credit"
        : "text-muted-foreground";

  const archiveRow: CustomerListRow | null = {
    ...customer,
    balance,
    last_activity: lastActivityIso,
  };

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

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={customer.name} />
          <div>
            <button
              type="button"
              onClick={() => navigate(paths.customers(businessId))}
              className="mb-1 text-sm text-muted-foreground hover:text-foreground"
            >
              &larr; Customers
            </button>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {customer.name}
            </h2>

            {customer.tags && customer.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {customer.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="mt-1.5 block text-sm text-muted-foreground hover:text-foreground"
              >
                <Phone className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                {customer.phone}
              </a>
            )}
            {customer.email && (
              <a
                href={`mailto:${customer.email}`}
                className="mt-1 block text-sm text-muted-foreground hover:text-foreground"
              >
                <Mail className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                {customer.email}
              </a>
            )}
            {customer.address && (
              <p className="mt-1 text-sm text-muted-foreground">
                <MapPin className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                {customer.address}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* S-39: every member — Viewers included — may open and print
              a statement. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate(paths.statement(businessId, customerId ?? ""))
            }
          >
            Statement
          </Button>
          {canManageCustomers && !archived && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
          )}
          {canArchive && !archived && (
            <RowActionsMenu
              triggerLabel="Customer actions"
              items={[
                {
                  label: "Archive",
                  onSelect: () => setArchiveOpen(true),
                  variant: "destructive",
                },
              ]}
            />
          )}
        </div>
      </div>

      {/* S-31: the balance is the hero. */}
      <section className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Current Balance</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <p
            ref={balanceRef}
            className={`text-5xl font-bold tabular-nums tracking-tight ${balanceClass}`}
            style={{ letterSpacing: "-0.02em" }}
          >
            ₹{Math.abs(balance).toLocaleString("en-IN")}
          </p>
          <BalanceBadge balance={balance} size="lg" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Total charged" value={formatMoney(totalCharged)} />
          <StatCard label="Total paid" value={formatMoney(totalPaid)} />
          <StatCard label="Last activity" value={lastActivityLabel} />
        </div>

        {/* S-31: the two primary actions — same shared sheet, the type
            already picked. Viewers and archived customers see none. */}
        {canWriteTransactions && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={addCharge}>Add charge</Button>
            <Button variant="outline" onClick={addPayment}>
              Add payment
            </Button>
          </div>
        )}
      </section>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
            loading={ledgerLoading}
            error={ledgerError ? ledgerError.message : null}
            onRetry={() => refetchLedger()}
            renderRowActions={renderRowActions}
            renderMobileCard={(row) => {
              const actions = renderRowActions(row);
              return (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {formatDate(row.occurred_at)}
                    </span>
                    {typeCell(row)}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {amountCell(row)}
                    <span className="text-sm tabular-nums text-muted-foreground">
                      Balance after {formatMoney(row.balance_after)}
                    </span>
                  </div>
                  {row.note && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {row.note}
                    </p>
                  )}
                  {actions && (
                    <div className="mt-2 flex justify-end gap-1">{actions}</div>
                  )}
                </div>
              );
            }}
            emptyState={
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
            }
          />
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

      {/* S-34: the void confirmation; its own toast carries Undo. */}
      <VoidTransactionDialog
        open={!!voidTx}
        onOpenChange={(open) => {
          if (!open) setVoidTx(null);
        }}
        businessId={businessId}
        transaction={voidTx}
      />
    </div>
  );
}
