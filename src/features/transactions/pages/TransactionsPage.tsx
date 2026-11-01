import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { DataTable } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import type { FilterChip } from "@/components/app/FilterBar";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ui/button";
import { useSort } from "@/hooks/useSort";
import { usePermissions } from "@/features/business/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { useCustomer, useCustomers } from "@/features/customers/hooks";
import { exportTransactionsCsv } from "@/features/import-export/exports";
import { useExportRunner } from "@/features/import-export/hooks";
import {
  buildDetailColumns,
  buildSummaryColumns,
  toPeriodRows,
  transactionMobileSpec,
} from "@/features/transactions/components/transactionColumns";
import {
  RANGE_LABELS,
  TransactionFilters,
  buildRange,
  type FilterType,
  type GroupBy,
  type RangePreset,
  type ViewMode,
} from "@/features/transactions/components/TransactionFilters";
import { TransactionTotals } from "@/features/transactions/components/TransactionTotals";
import { VoidTransactionDialog } from "@/features/transactions/components/VoidTransactionDialog";
import { DeleteTransactionDialog } from "@/features/transactions/components/DeleteTransactionDialog";
import {
  useBulkDeleteTransactions,
  useBulkSetTransactionsVoided,
  useRestoreTransaction,
  useTransactionList,
  useTransactionRollup,
} from "@/features/transactions/hooks";
import { useBulkRestoreDeleted } from "@/features/deleted-items/hooks";
import { BulkActionBar } from "@/components/app/BulkActionBar";
import { BulkConfirmDialog } from "@/components/app/BulkConfirmDialog";
import { formatMoney } from "@/lib/format";
import { toAppError } from "@/lib/AppError";
import { Ban, RotateCcw, Trash2 } from "lucide-react";
import type {
  TransactionListRow,
  TransactionListParams,
  TransactionRollupParams,
} from "@/features/transactions/api";
import {
  openTransactionEdit,
  openTransactionSheet,
} from "@/features/transactions/sheetStore";

/**
 * S-35/L-09 — the transactions page: every entry across customers,
 * scoped to the active business. Two views share one filter set:
 *
 * - Detailed — a server-paged DataTable (Date, linked Customer,
 *   Particulars, Charged, Paid, Recorded by) with role-following row
 *   actions; voided rows stay out unless included.
 * - Summarized — day/week/month rows computed BY THE DATABASE
 *   (migration 0006b's `transaction_rollup`), never reduced in the
 *   browser.
 *
 * The columns, filters and totals strip live in `transactionColumns`,
 * `TransactionFilters` and `TransactionTotals`; this file is state,
 * queries, URL handling and composition. The totals under both views
 * are the same RPC's ungrouped row, so they cover everything matching
 * the filter — not only the visible page. Every filter, the view, the
 * grouping and the page live in the query string: a link reproduces
 * the exact screen, and the dashboard's "Today" card can open this
 * page with `?range=today`.
 */

export function TransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // "" only happens in tests that render the page outside /b/:businessId;
  // falsy businessId behaves unscoped (v1 transitional), same as undefined.
  const businessId = useScopedBusinessId() ?? "";
  const { can } = usePermissions();
  // S-39: exporting is every member's right — no role gate here.
  const { progress, run } = useExportRunner((message) =>
    toast.error(message),
  );

  // ---- URL state (the whole scenario "State in the URL") ----
  const view: ViewMode =
    searchParams.get("view") === "summarized" ? "summarized" : "detailed";
  const rangeParam = searchParams.get("range");
  const customFrom = searchParams.get("from") ?? "";
  const customTo = searchParams.get("to") ?? "";
  const rangePreset: RangePreset =
    rangeParam === "today" ||
    rangeParam === "this-week" ||
    rangeParam === "last-30-days" ||
    rangeParam === "custom"
      ? rangeParam
      : customFrom || customTo
        ? "custom"
        : "this-month"; // the default range
  const typeParam = searchParams.get("type");
  const type: FilterType =
    typeParam === "charge" || typeParam === "payment" ? typeParam : "all";
  const customerId = searchParams.get("customer");
  const q = searchParams.get("q") ?? "";
  const includeVoided = searchParams.get("voided") === "1";
  const groupParam = searchParams.get("group");
  const groupBy: GroupBy =
    groupParam === "week" || groupParam === "month" ? groupParam : "day";
  const pageParam = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;
  const [pageSize, setPageSize] = useState(25);

  // Local affordances the PRD does not put in the URL. Both money
  // columns hand the DataTable the one amount sort key (L-09).
  const { sortBy, sortDir, toggleSort } = useSort("date", "desc");

  // SearchInput debounces its own callback (300 ms), so `q` is already
  // the settled value by the time it reaches the URL.
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

  const range = useMemo(
    () => buildRange(rangePreset, customFrom, customTo),
    [rangePreset, customFrom, customTo],
  );

  const listParams: TransactionListParams = useMemo(
    () => ({
      range,
      type,
      customerId: customerId || null,
      search: q,
      includeVoided,
      sort: sortBy === "amount" ? "amount" : "occurred_at",
      dir: sortDir,
      page,
      pageSize,
    }),
    [
      range,
      type,
      customerId,
      q,
      includeVoided,
      sortBy,
      sortDir,
      page,
      pageSize,
    ],
  );
  const rollupBase: Omit<TransactionRollupParams, "granularity"> = useMemo(
    () => ({
      range,
      type,
      customerId: customerId || null,
      search: q,
      includeVoided,
    }),
    [range, type, customerId, q, includeVoided],
  );

  const list = useTransactionList(businessId, listParams);
  // The totals strip is the RPC's ungrouped row — everything matching
  // the filter, not only the visible page. In the detailed view the
  // period query below IS this same query (identical key, deduped).
  const totals = useTransactionRollup(businessId, {
    ...rollupBase,
    granularity: null,
  });
  const periods = useTransactionRollup(businessId, {
    ...rollupBase,
    granularity: view === "summarized" ? groupBy : null,
  });

  // The chip and the picker speak the live name, not a URL fossil.
  const filterCustomer = useCustomer(customerId ?? "", businessId);
  const customerFeed = useCustomers(businessId);

  const restore = useRestoreTransaction(businessId);
  const [voidTx, setVoidTx] = useState<TransactionListRow | null>(null);
  // v3 (S-54): the owner's hard delete — same shape of state as Void.
  const [deleteTx, setDeleteTx] = useState<TransactionListRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  useEffect(() => {
    setSelectedIds([]);
  }, [
    rangePreset,
    customFrom,
    customTo,
    type,
    customerId,
    q,
    includeVoided,
    sortBy,
    sortDir,
    page,
    pageSize,
    view,
  ]);

  const bulkVoid = useBulkSetTransactionsVoided(businessId);
  const bulkDelete = useBulkDeleteTransactions(businessId);
  const bulkRestore = useBulkRestoreDeleted(businessId);

  const rows = list.data?.rows ?? [];
  const selectedRows = rows.filter((r) => selectedIds.includes(r.id));
  const hasActiveSelected = selectedRows.some((r) => r.status !== "voided");
  const hasVoidedSelected = selectedRows.some((r) => r.status === "voided");
  const canVoid = can("manageTransactions");
  const canDelete = can("deleteTransaction");
  const canSelect = view === "detailed" && (canVoid || canDelete);

  const chargedSum = selectedRows
    .filter((r) => r.type === "charge")
    .reduce((sum, r) => sum + r.amount, 0);
  const paidSum = selectedRows
    .filter((r) => r.type === "payment")
    .reduce((sum, r) => sum + r.amount, 0);

  const handleBulkVoid = async () => {
    try {
      const idsToVoid = selectedRows.filter((r) => r.status !== "voided").map((r) => r.id);
      const count = await bulkVoid.mutateAsync({ ids: idsToVoid, voided: true });
      setSelectedIds([]);
      toast.success(`Voided ${count} ${count === 1 ? "transaction" : "transactions"}`);
    } catch (err) {
      toast.error(toAppError(err).message);
    }
  };

  const handleBulkRestore = async () => {
    try {
      const idsToRestore = selectedRows.filter((r) => r.status === "voided").map((r) => r.id);
      const count = await bulkVoid.mutateAsync({ ids: idsToRestore, voided: false });
      setSelectedIds([]);
      toast.success(`Restored ${count} ${count === 1 ? "transaction" : "transactions"}`);
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
      toast.success(`Deleted ${deletedCount} ${deletedCount === 1 ? "transaction" : "transactions"}`, {
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
  // An old shared link with ?page= beyond the count lands on page 1
  // instead of a phantom empty page. During a page change list.data is
  // undefined (fresh key), so this cannot fire mid-load.
  useEffect(() => {
    if (list.data && rows.length === 0 && page > 1) {
      updateParams({ page: null });
    }
  }, [list.data, rows.length, page, updateParams]);

  const hasFilters =
    rangePreset !== "this-month" ||
    type !== "all" ||
    customerId !== null ||
    q !== "" ||
    includeVoided;

  const chips: FilterChip[] = [];
  if (rangePreset !== "this-month") {
    chips.push({
      label:
        rangePreset === "custom" && customFrom && customTo
          ? `Range: ${customFrom} → ${customTo}`
          : `Range: ${RANGE_LABELS[rangePreset]}`,
      onRemove: () => updateParams({ range: null, from: null, to: null }),
    });
  }
  if (type !== "all") {
    chips.push({
      label: `Type: ${type === "charge" ? "Charge" : "Payment"}`,
      onRemove: () => updateParams({ type: null }),
    });
  }
  if (customerId) {
    chips.push({
      label: `Customer: ${filterCustomer.data?.name ?? "…"}`,
      onRemove: () => updateParams({ customer: null }),
    });
  }
  if (q !== "") {
    chips.push({
      label: `Search: ${q}`,
      onRemove: () => updateParams({ q: null }),
    });
  }
  if (includeVoided) {
    chips.push({
      label: "Including voided",
      onRemove: () => updateParams({ voided: null }),
    });
  }
  const clearFilters = () =>
    updateParams({
      range: null,
      from: null,
      to: null,
      type: null,
      customer: null,
      q: null,
      voided: null,
    });

  // The row actions live in transactionColumns; the page owns what
  // they DO — the shared sheet, the confirmations, the toasts.
  const { columns: detailColumns, renderRowActions, onRowClick } =
    buildDetailColumns({
      can,
      businessId,
      onEdit: (row) =>
        openTransactionEdit(row, {
          id: row.customer_id,
          name: row.customer.name,
        }),
      onVoid: (row) => setVoidTx(row),
      onRestore: (row) =>
        restore.mutate(
          { id: row.id },
          {
            onSuccess: () => toast.success("Transaction restored."),
            onError: () =>
              toast.error("Could not restore the transaction. Try again."),
          },
        ),
      onDelete: (row) => setDeleteTx(row),
      navigate,
    });

  const periodRows = toPeriodRows(periods.data, groupBy);
  const totalRow = totals.data?.[0];

  // "true empty" is the honest empty business; a filtered-out set is
  // "no results" and keeps its active filters visible above (the kit
  // renders its Clear filters action under the no-results node only).
  const trueEmptyNode = (
    <EmptyState
      title="No transactions yet"
      description="Record a charge or a payment and it will appear here."
    >
      {can("manageTransactions") && (
        <Button onClick={() => openTransactionSheet()}>Add Transaction</Button>
      )}
    </EmptyState>
  );
  const noResultsNode = (
    <EmptyState
      title="No transactions match these filters"
      description="Adjust or clear the filters above to widen the search."
    />
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Transactions" description="Every entry across customers">
        {can("manageTransactions") && (
          <Button onClick={() => openTransactionSheet()}>Add Transaction</Button>
        )}
        <Button
          variant="outline"
          disabled={Boolean(progress)}
          onClick={() =>
            void run((onProgress) =>
              exportTransactionsCsv(
                businessId,
                {
                  range,
                  type,
                  customerId: customerId || null,
                  search: q,
                  includeVoided,
                  sort: sortBy === "amount" ? "amount" : "occurred_at",
                  dir: sortDir,
                },
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
      </PageHeader>

      <TransactionFilters
        view={view}
        rangePreset={rangePreset}
        customFrom={customFrom}
        customTo={customTo}
        type={type}
        q={q}
        customerId={customerId}
        customerName={filterCustomer.data?.name ?? null}
        customers={customerFeed.data ?? []}
        customersLoading={customerFeed.isLoading}
        includeVoided={includeVoided}
        groupBy={groupBy}
        chips={chips}
        onClearAll={clearFilters}
        updateParams={updateParams}
      />

      {view === "detailed" ? (
        <>
          {canSelect && (
            <BulkActionBar
              selectedCount={selectedIds.length}
              onClear={() => setSelectedIds([])}
            >
              {canVoid && hasActiveSelected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkVoid}
                  disabled={bulkVoid.isPending}
                >
                  <Ban className="size-4" />
                  Void ({selectedRows.filter((r) => r.status !== "voided").length})
                </Button>
              )}
              {canVoid && hasVoidedSelected && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkRestore}
                  disabled={bulkVoid.isPending}
                >
                  <RotateCcw className="size-4" />
                  Restore ({selectedRows.filter((r) => r.status === "voided").length})
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
                    getRowLabel: (row) =>
                      `${row.customer.name} - ${row.type === "charge" ? "Charged" : "Paid"} ${formatMoney(row.amount)}`,
                  }
                : undefined
            }
            columns={detailColumns}
            rows={rows}
            getRowKey={(row) => row.id}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={toggleSort}
            onRowClick={onRowClick}
            loading={list.isPending}
            error={list.error ? list.error.message : null}
            onRetry={() => list.refetch()}
            renderRowActions={renderRowActions}
            mobile={(row) => transactionMobileSpec(row, businessId)}
            footer={<TransactionTotals total={totalRow} />}
            emptyState={hasFilters ? undefined : trueEmptyNode}
            noResultsState={hasFilters ? noResultsNode : undefined}
            onClearFilters={clearFilters}
            page={page}
            pageSize={pageSize}
            totalCount={list.data?.total}
            onPageChange={(next) => updateParams({ page: String(next) })}
            onPageSizeChange={(size) => setPageSize(size)}
          />
        </>
      ) : (
        <DataTable
          columns={buildSummaryColumns()}
          rows={periodRows}
          getRowKey={(row) => row.key}
          loading={periods.isPending}
          error={periods.error ? periods.error.message : null}
          onRetry={() => periods.refetch()}
          footer={<TransactionTotals total={totalRow} />}
          emptyState={hasFilters ? undefined : trueEmptyNode}
          noResultsState={hasFilters ? noResultsNode : undefined}
          onClearFilters={clearFilters}
        />
      )}

      {/* S-34: the void confirmation; its own toast carries Undo. */}
      <VoidTransactionDialog
        open={!!voidTx}
        onOpenChange={(open) => {
          if (!open) setVoidTx(null);
        }}
        businessId={businessId}
        transaction={voidTx}
      />

      {/* v3 (S-54): the owner's hard delete. This page has no customer
          balance column, so the dialog's balance sentence is omitted. */}
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
            customer_name: deleteTx.customer.name,
            balance_before: null,
            balance_after: null,
          }
        }
        onVoidInstead={(id) => {
          const row = list.data?.rows.find((r) => r.id === id);
          if (row) setVoidTx(row);
        }}
      />

      <BulkConfirmDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        title={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? "transaction" : "transactions"} permanently?`}
        description="This will permanently delete the selected entries."
        items={selectedRows.map(
          (r) =>
            `${r.customer.name}: ${r.type === "charge" ? "Charged" : "Paid"} ${formatMoney(r.amount)}`,
        )}
        totalSummary={`Total: Charged ${formatMoney(chargedSum)}, Paid ${formatMoney(paidSum)}`}
        recoveryNotice="They go to Recently deleted. You can restore them from there within 30 days."
        confirmLabel={`Delete ${selectedIds.length} ${selectedIds.length === 1 ? "transaction" : "transactions"}`}
        tone="destructive"
        requireTypedConfirmation={true}
        expectedConfirmation={`DELETE ${selectedIds.length}`}
        isPending={bulkDelete.isPending}
        onConfirm={handleConfirmBulkDelete}
      />
    </div>
  );
}
