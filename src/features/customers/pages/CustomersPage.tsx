import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Archive, Download, Pencil, Plus, RotateCcw, Trash2, Upload } from "lucide-react";
import { RowActions, type RowAction } from "@/components/app/RowActions";
import { actionLabels } from "@/lib/actionLabels";
import { toast } from "sonner";
import { toAppError } from "@/lib/AppError";
import { formatDate, formatRelative } from "@/lib/format";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { usePermissions } from "@/features/business/hooks";
import {
  useBulkDeleteCustomers,
  useBulkSetCustomersArchived,
  useCustomerList,
  useSetCustomerArchived,
} from "@/features/customers/hooks";
import { useBulkRestoreDeleted } from "@/features/deleted-items/hooks";
import { BulkActionBar } from "@/components/app/BulkActionBar";
import { BulkConfirmDialog } from "@/components/app/BulkConfirmDialog";
import { useAllCustomerBalances } from "@/features/transactions/hooks";
import { openTransactionSheet } from "@/features/transactions/sheetStore";
import { exportCustomersCsv } from "@/features/import-export/exports";
import { useExportRunner } from "@/features/import-export/hooks";
import type {
  CustomerListParams,
  CustomerListRow,
  CustomerStatusFilter,
} from "@/features/customers/api";
import { CustomerFormDialog } from "@/features/customers/components/CustomerFormDialog";
import { ArchiveCustomerDialog } from "@/features/customers/components/ArchiveCustomerDialog";
import { DeleteCustomerDialog } from "@/features/customers/components/DeleteCustomerDialog";
import { PageHeader } from "@/components/app/PageHeader";
import { SearchInput } from "@/components/app/SearchInput";
import { FilterBar, type FilterChip } from "@/components/app/FilterBar";
import {
  DataTable,
  type Column,
} from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { LeaderRow } from "@/components/app/LeaderRow";
import { Monogram } from "@/components/app/Monogram";
import { Money } from "@/components/app/Money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Customer } from "@/types";

/**
 * S-28 — the customers list for one business, on the shared data table.
 *
 * All list state (search, balance filter, sort, page) lives in the URL:
 * reloading or sharing the link restores the exact view, and the back
 * button steps through earlier views. Searching, filtering, sorting and
 * paging are applied by the database (one query in api.ts) — the table
 * never refilters a full download.
 */

const STATUS_OPTIONS: Array<{ value: CustomerStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "owes", label: "Owes you" },
  { value: "credit", label: "You owe" },
  { value: "settled", label: "Settled" },
  { value: "archived", label: "Archived" },
];

function statusLabel(value: CustomerStatusFilter): string {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? "All";
}

/** `?sort=balance-desc` → field + direction; anything else → Name A→Z. */
function parseSort(raw: string | null): {
  sort: "name" | "balance" | "created";
  dir: "asc" | "desc";
} {
  const parts = (raw ?? "").split("-");
  const field = parts[0];
  const dir = parts[1];
  if (
    (field === "name" || field === "balance" || field === "created") &&
    (dir === "asc" || dir === "desc")
  ) {
    return { sort: field, dir };
  }
  return { sort: "name", dir: "asc" };
}

/** The direction a balance points — the monogram tone and the amount
 *  colour both follow it (D-24). */
function balanceTone(balance: number): "receivable" | "credit" | "neutral" {
  return balance > 0 ? "receivable" : balance < 0 ? "credit" : "neutral";
}

const toneClass = {
  receivable: "text-receivable",
  credit: "text-credit",
  neutral: "text-foreground",
} as const;

/** The words under the amount: the colour already says it, the words
 *  make it explicit for everyone. */
function balanceWords(balance: number): string {
  return balance > 0 ? "owes you" : balance < 0 ? "you owe" : "Settled";
}

function buildColumns(businessId: string): Array<Column<CustomerListRow>> {
  return [
    {
      key: "name",
      header: "Customer",
      width: "fill",
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <Monogram name={row.name} tone={balanceTone(row.balance)} />
          <div className="min-w-0">
            <Link
              to={paths.customerDetail(businessId, row.id)}
              onClick={(e) => e.stopPropagation()}
              className="truncate font-medium text-foreground hover:underline"
            >
              {row.name}
            </Link>
            {row.archived_at ? (
              <p className="truncate text-xs text-muted-foreground">Archived</p>
            ) : (
              row.tags &&
              row.tags.length > 0 && (
                <p className="truncate text-xs text-muted-foreground">
                  {row.tags.join(", ")}
                </p>
              )
            )}
          </div>
        </div>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      width: "fit",
      priority: 2,
      fold: (row) => row.phone,
      render: (row) =>
        row.phone ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      width: "fit",
      sortable: true,
      render: (row) => (
        <div className="flex flex-col items-end">
          <Money
            amount={Math.abs(row.balance)}
            className={toneClass[balanceTone(row.balance)]}
          />
          <span className="text-xs text-muted-foreground">
            {balanceWords(row.balance)}
          </span>
        </div>
      ),
    },
    {
      key: "lastActivity",
      header: "Last activity",
      width: "fit",
      priority: 2,
      render: (row) =>
        row.last_activity ? (
          formatRelative(row.last_activity)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "created",
      header: "Added",
      width: "fit",
      priority: 3,
      sortable: true,
      render: (row) =>
        row.last_activity &&
        formatDate(row.last_activity) === formatDate(row.created_at) ? null : (
          formatDate(row.created_at)
        ),
    },
  ];
}

export function CustomersPage() {
  const navigate = useNavigate();
  const businessId = useScopedBusinessId() ?? "";
  const { can } = usePermissions();
  const columns = useMemo(() => buildColumns(businessId), [businessId]);
  // S-39: exporting is every member's right — no role gate here.
  const { progress, run } = useExportRunner((message) =>
    toast.error(message),
  );
  const [searchParams, setSearchParams] = useSearchParams();

  // --- URL state (the single source of truth for the view) --------------
  const q = searchParams.get("q") ?? "";
  const statusParam = searchParams.get("status");
  const status: CustomerStatusFilter =
    statusParam === "owes" ||
    statusParam === "credit" ||
    statusParam === "settled" ||
    statusParam === "archived"
      ? statusParam
      : "all";
  const { sort, dir } = parseSort(searchParams.get("sort"));
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setSelectedIds([]);
  }, [q, status, sort, dir, page, pageSize]);

  const bulkArchive = useBulkSetCustomersArchived(businessId);
  const bulkDelete = useBulkDeleteCustomers(businessId);
  const bulkRestore = useBulkRestoreDeleted(businessId);

  const updateParams = useCallback(
    (
      patch: Record<string, string | null>,
      options?: { replace?: boolean },
    ) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          // Any change that is not itself a page change restarts at page 1.
          if (!("page" in patch)) next.delete("page");
          return next;
        },
        { replace: options?.replace ?? false },
      );
    },
    [setSearchParams],
  );

  const params: CustomerListParams = useMemo(
    () => ({ search: q, status, sort, dir, page, pageSize }),
    [q, status, sort, dir, page, pageSize],
  );

  const { data, isPending, error, refetch } = useCustomerList(businessId, params);
  const { data: balances, isSuccess: balancesLoaded } =
    useAllCustomerBalances(businessId);
  // Restore has no dialog — the menu acts directly (S-30).
  const restoreCustomer = useSetCustomerArchived(businessId);

  // One dialog serves the form (Add header/empty state, Edit row menu)
  // plus the S-30 archive and delete confirmations.
  type DialogState =
    | { kind: "form"; mode: "add" | "edit"; customer: Customer | null }
    | { kind: "archive"; customer: CustomerListRow }
    | { kind: "delete"; customer: CustomerListRow }
    | null;
  const [dialog, setDialog] = useState<DialogState>(null);
  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null);
  };

  const rows = data?.items ?? [];
  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
  const hasArchivedSelected = selectedRows.some((r) => r.archived_at != null);
  const hasUnarchivedSelected = selectedRows.some((r) => r.archived_at == null);
  const canArchive = can("archiveCustomers");
  const canDelete = can("deleteCustomer");
  const canSelect = canArchive || canDelete;

  const handleBulkArchive = async () => {
    try {
      const idsToArchive = selectedRows.filter((r) => !r.archived_at).map((r) => r.id);
      const count = await bulkArchive.mutateAsync({ ids: idsToArchive, archived: true });
      setSelectedIds([]);
      toast.success(`Archived ${count} ${count === 1 ? "customer" : "customers"}`);
    } catch (err) {
      toast.error(toAppError(err).message);
    }
  };

  const handleBulkUnarchive = async () => {
    try {
      const idsToRestore = selectedRows.filter((r) => r.archived_at).map((r) => r.id);
      const count = await bulkArchive.mutateAsync({ ids: idsToRestore, archived: false });
      setSelectedIds([]);
      toast.success(`Restored ${count} ${count === 1 ? "customer" : "customers"}`);
    } catch (err) {
      toast.error(toAppError(err).message);
    }
  };

  const handleConfirmBulkDelete = async () => {
    try {
      const result = await bulkDelete.mutateAsync({ ids: selectedIds });
      setBulkDeleteDialogOpen(false);
      const deletedCount = result.count;
      const logIds = result.log_ids;
      setSelectedIds([]);
      toast.success(`Deleted ${deletedCount} ${deletedCount === 1 ? "customer" : "customers"}`, {
        duration: 10000,
        action: {
          label: "Undo",
          onClick: () => {
            bulkRestore.mutate(logIds, {
              onSuccess: (cnt) => {
                toast.success(`Restored ${cnt} items`);
              },
              onError: (err) => {
                toast.error(toAppError(err).message);
              },
            });
          },
        },
      });
    } catch (err) {
      toast.error(toAppError(err).message);
    }
  };
  const owesYou = Object.values(balances ?? {}).reduce(
    (sum, balance) => (balance > 0 ? sum + balance : sum),
    0,
  );
  const youOwe = Object.values(balances ?? {}).reduce(
    (sum, balance) => (balance < 0 ? sum - balance : sum),
    0,
  );

  // An old shared link with ?page= beyond the result count lands on
  // page 1 instead of a phantom empty page.
  useEffect(() => {
    if (
      data &&
      data.total > 0 &&
      rows.length === 0 &&
      page > 1 &&
      (page - 1) * pageSize >= data.total
    ) {
      updateParams({ page: null });
    }
  }, [data, rows.length, page, pageSize, updateParams]);

  const renderRowActions = (row: CustomerListRow) => {
    const archived = row.archived_at != null;
    const actions: RowAction[] = [];

    if (!archived && can("manageCustomers")) {
      actions.push({
        id: "edit",
        label: actionLabels.edit,
        icon: Pencil,
        onSelect: () => setDialog({ kind: "form", mode: "edit", customer: row }),
      });
    }

    if (!archived && can("manageTransactions")) {
      actions.push({
        id: "add-transaction",
        label: actionLabels.addTransaction,
        icon: Plus,
        onSelect: () => openTransactionSheet({ id: row.id, name: row.name }),
      });
    }

    if (can("archiveCustomers")) {
      if (archived) {
        actions.push({
          id: "restore",
          label: actionLabels.restore,
          icon: RotateCcw,
          onSelect: () => {
            void restoreCustomer
              .mutateAsync({ id: row.id, archived: false })
              .catch(() => {
                toast.error("Could not restore the customer. Try again.");
              });
          },
        });
      } else {
        actions.push({
          id: "archive",
          label: actionLabels.archive,
          icon: Archive,
          onSelect: () => setDialog({ kind: "archive", customer: row }),
        });
      }
    }

    if (can("deleteCustomer")) {
      actions.push({
        id: "delete",
        label: actionLabels.delete,
        icon: Trash2,
        destructive: true,
        onSelect: () => setDialog({ kind: "delete", customer: row }),
      });
    }

    if (actions.length === 0) return null;

    return (
      <RowActions
        actions={actions}
        triggerLabel={`Actions for ${row.name}`}
      />
    );
  };

  const hasFilters = q !== "" || status !== "all";
  // A stale URL page beyond the count (before the clamp effect above
  // corrects it) is a no-results situation, not "there are no customers".
  const showNoResults =
    hasFilters || (data !== undefined && data.allTotal > 0 && rows.length === 0);

  const chips: FilterChip[] = [];
  if (q !== "") {
    chips.push({ label: `Search: ${q}`, onRemove: () => updateParams({ q: null }) });
  }
  if (status !== "all") {
    chips.push({
      label: `Status: ${statusLabel(status)}`,
      onRemove: () => updateParams({ status: null }),
    });
  }

  const clearFilters = () => updateParams({ q: null, status: null });

  return (
    <div className="space-y-4">
      <PageHeader title="Customers" description="Everyone in this business">
        {can("manageCustomers") && (
          <Button onClick={() => setDialog({ kind: "form", mode: "add", customer: null })}>
            <Plus className="size-4" /> Add customer
          </Button>
        )}
        <Button
          variant="outline"
          disabled={Boolean(progress)}
          onClick={() =>
            void run((onProgress) =>
              exportCustomersCsv(
                businessId,
                { search: q, status, sort, dir },
                onProgress,
              ),
            )
          }
        >
          <Download className="size-4" />
          {progress
            ? `Exporting… ${progress.done}/${progress.total}`
            : "Export CSV"}
        </Button>
        {can("importTransactions") && (
          <Button
            variant="outline"
            onClick={() => navigate(paths.importCustomers(businessId))}
          >
            <Upload className="size-4" /> Import CSV
          </Button>
        )}
      </PageHeader>

      {/* The position sheet — over every customer, not just the
          filtered page (L-08: one sheet, two leader rows). */}
      <Card role="region" aria-label="Customer summary" className="p-6">
        <p className="text-sm text-muted-foreground">
          Customers {data ? data.allTotal : "—"}
        </p>
        {balancesLoaded ? (
          <div className="mt-1" role="list">
            <LeaderRow
              size="lg"
              tone="receivable"
              label="Owes you"
              amount={owesYou}
            />
            <LeaderRow size="lg" tone="credit" label="You owe" amount={youOwe} />
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">—</p>
        )}
      </Card>

      <FilterBar chips={chips} onClearAll={clearFilters}>
        <SearchInput
          id="customer-search"
          label="Search customers by name or phone"
          placeholder="Search name or phone"
          className="w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-sm"
          value={q}
          onValueChange={(value) =>
            updateParams({ q: value || null }, { replace: true })
          }
        />
        <div
          role="group"
          aria-label="Filter customers by status"
          className="flex w-full flex-wrap gap-1 sm:w-auto"
        >
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={status === option.value}
              onClick={() =>
                updateParams({
                  status: option.value === "all" ? null : option.value,
                })
              }
              className={cn(
                "border-b-2 px-2 py-1.5 text-sm transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11",
                status === option.value
                  ? "border-foreground text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FilterBar>

      {canSelect && (
        <BulkActionBar
          selectedCount={selectedIds.length}
          onClear={() => setSelectedIds([])}
        >
          {canArchive && hasUnarchivedSelected && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkArchive}
              disabled={bulkArchive.isPending}
            >
              <Archive className="size-4" />
              Archive ({selectedRows.filter((r) => !r.archived_at).length})
            </Button>
          )}
          {canArchive && hasArchivedSelected && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkUnarchive}
              disabled={bulkArchive.isPending}
            >
              <RotateCcw className="size-4" />
              Restore ({selectedRows.filter((r) => r.archived_at).length})
            </Button>
          )}
          {canDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setBulkDeleteDialogOpen(true)}
              disabled={bulkDelete.isPending}
            >
              <Trash2 className="size-4" />
              Delete ({selectedIds.length})
            </Button>
          )}
        </BulkActionBar>
      )}

      <DataTable
        selectable={
          canSelect
            ? {
                getId: (row) => row.id,
                selected: selectedIds,
                onChange: setSelectedIds,
                getRowLabel: (row) => row.name,
              }
            : undefined
        }
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        loading={isPending}
        error={error ? toAppError(error).message : null}
        onRetry={() => void refetch()}
        emptyState={
          !showNoResults ? (
            <EmptyState
              title="No customers yet"
              description="Add your first customer to get started."
            >
              {can("manageCustomers") && (
                <Button onClick={() => setDialog({ kind: "form", mode: "add", customer: null })}>
                  <Plus className="size-4" /> Add your first customer
                </Button>
              )}
            </EmptyState>
          ) : undefined
        }
        noResultsState={
          showNoResults ? (
            <EmptyState
              title="No customers match"
              description="Try a different search or clear the filters."
            />
          ) : undefined
        }
        onClearFilters={clearFilters}
        sortBy={sort}
        sortDir={dir}
        onSortChange={(key, nextDir) => updateParams({ sort: `${key}-${nextDir}` })}
        page={page}
        pageSize={pageSize}
        totalCount={data?.total}
        onPageChange={(next) => updateParams({ page: String(next) })}
        onPageSizeChange={(size) => {
          setPageSize(size);
          updateParams({ page: null });
        }}
        onRowClick={(row) => navigate(paths.customerDetail(businessId, row.id))}
        renderRowActions={renderRowActions}
        mobile={(row) => ({
          lead: <Monogram name={row.name} tone={balanceTone(row.balance)} />,
          title: row.name,
          subtitle: row.phone ?? undefined,
          meta: row.archived_at ? "Archived" : undefined,
          trailing: (
            <Money
              amount={Math.abs(row.balance)}
              className={toneClass[balanceTone(row.balance)]}
            />
          ),
        })}
      />

      <CustomerFormDialog
        open={dialog?.kind === "form"}
        onOpenChange={closeDialog}
        businessId={businessId}
        mode={dialog?.kind === "form" ? dialog.mode : "add"}
        customer={dialog?.kind === "form" ? dialog.customer : null}
      />
      <ArchiveCustomerDialog
        open={dialog?.kind === "archive"}
        onOpenChange={closeDialog}
        businessId={businessId}
        customer={dialog?.kind === "archive" ? dialog.customer : null}
      />
      <DeleteCustomerDialog
        open={dialog?.kind === "delete"}
        onOpenChange={closeDialog}
        businessId={businessId}
        customer={dialog?.kind === "delete" ? dialog.customer : null}
      />
      <BulkConfirmDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        title={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? "customer" : "customers"} permanently?`}
        description="This will delete the selected customers and all their transaction history."
        items={selectedRows.map((r) => r.name)}
        recoveryNotice="They go to Recently deleted. You can restore them from there within 30 days."
        confirmLabel={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? "customer" : "customers"}`}
        tone="destructive"
        requireTypedConfirmation={true}
        expectedConfirmation={`DELETE ${selectedIds.length}`}
        isPending={bulkDelete.isPending}
        onConfirm={handleConfirmBulkDelete}
      />
    </div>
  );
}
