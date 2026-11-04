import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRight, Download, Info, Loader2, Trash2, Undo2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { csvNumber, toCsv, downloadCsv } from "@/features/import-export/csv";
import { exportDeletionLog } from "../api";
import { CleanUpDialog } from "../components/CleanUpDialog";
import { DataTable, type Column } from "@/components/app/DataTable";
import { RowActions, type RowAction } from "@/components/app/RowActions";
import { EmptyState } from "@/components/app/EmptyState";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";
import { toAppError } from "@/lib/AppError";
import { usePermissions } from "@/features/business/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { useDeletionLog, useRestoreDeleted, useLastPurge, useBulkRestoreDeleted } from "../hooks";
import { BulkActionBar } from "@/components/app/BulkActionBar";
import type { DeletionLogEntry, DeletedItemsFilter } from "../api";

/**
 * v3 (S-56) / U-04 — Recently deleted on the shared table system.
 * Item (fill: label, reason folded), Type (fit), Deleted by (fit, priority 2), Deleted (fit).
 * Action Restore as the first inline action (with tooltip) and View details in the menu.
 */
export function DeletedItemsPage() {
  const businessId = useScopedBusinessId() ?? "";
  const { role, can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const restore = useRestoreDeleted(businessId);
  const bulkRestore = useBulkRestoreDeleted(businessId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [cleanUpOpen, setCleanUpOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const lastPurgeQuery = useLastPurge(businessId);
  const lastPurge = lastPurgeQuery.data;

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const rows = await exportDeletionLog(businessId);
      const headers = [
        "Deleted at",
        "Type",
        "Item",
        "Deleted by",
        "Reason",
        "Restored at",
        "Restored by",
        "Amount",
      ];
      const dataRows = rows.map((r) => [
        r.deleted_at,
        r.entity_type === "customer" ? "Customer" : "Transaction",
        r.label,
        r.deleter_name ?? "",
        r.reason ?? "",
        r.restored_at ?? "",
        r.restorer_name ?? "",
        r.amount !== null && r.amount !== undefined ? csvNumber(r.amount) : "",
      ]);
      const csv = toCsv(headers, dataRows);
      const today = new Date().toISOString().slice(0, 10);
      downloadCsv(`deleted-items-${businessId}-${today}.csv`, csv);
      toast.success("Deletion log exported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export CSV");
    } finally {
      setExporting(false);
    }
  };

  const typeParam = searchParams.get("type");
  const entityType: DeletedItemsFilter | undefined =
    typeParam === "customer" || typeParam === "transaction"
      ? typeParam
      : undefined;
  const showRestored = searchParams.get("restored") === "1";

  // S-75: clear selection on filter / tab change
  const canRestore = can("restoreDeleted");

  const handleBulkRestore = async () => {
    try {
      const count = await bulkRestore.mutateAsync(selectedIds);
      setSelectedIds([]);
      toast.success(`Restored ${count} ${count === 1 ? "item" : "items"}`);
    } catch (err) {
      toast.error(toAppError(err).message);
    }
  };
  const updateParams = (patch: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(patch)) {
          if (value === null || value === "") next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  const log = useDeletionLog(businessId, {
    entityType,
    restored: showRestored ? "include" : "exclude",
    limit: 200,
  });

  if (role !== null && !can("viewDeletedItems")) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Recently deleted"
          description="Items you deleted. Only owners can see and restore them."
        />
        <EmptyState
          title="You don't have access"
          description="Only owners can see and restore deleted items."
        />
      </div>
    );
  }

  const entries = log.data ?? [];
  const columns: Array<Column<DeletionLogEntry>> = [
    {
      key: "item",
      header: "Item",
      width: "fill",
      render: (entry) => (
        <div className="flex items-start gap-2">
          {entry.entity_type === "customer" ? (
            <User
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <ArrowLeftRight
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <div>
            <span className="line-through text-muted-foreground">
              {entry.label}
            </span>
            {entry.entity_type === "customer" &&
              typeof entry.summary.transaction_count === "number" && (
                <p className="text-xs text-muted-foreground">
                  {entry.summary.transaction_count} transactions
                </p>
              )}
            <p className="text-xs text-muted-foreground">
              {entry.reason ?? "—"}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: "fit",
      render: (entry) =>
        entry.entity_type === "customer" ? "Customer" : "Transaction",
    },
    {
      key: "deletedBy",
      header: "Deleted by",
      width: "fit",
      priority: 2,
      render: (entry) => entry.deleted_by_name ?? "Unknown",
    },
    {
      key: "deleted",
      header: "Deleted",
      width: "fit",
      render: (entry) => formatRelative(entry.deleted_at),
    },
  ];

  const handleRestore = (entry: DeletionLogEntry) => {
    setRestoringId(entry.id);
    restore.mutate(entry.id, {
      onSuccess: () => toast.success(`${entry.label} restored`),
      onError: (error) => toast.error(error.message),
      onSettled: () => setRestoringId(null),
    });
  };

  const renderRowActions = (entry: DeletionLogEntry) => {
    if (entry.restored_at) {
      return (
        <span className="text-sm text-muted-foreground">
          Restored {formatRelative(entry.restored_at)}
          {entry.restored_by_name ? ` by ${entry.restored_by_name}` : ""}
        </span>
      );
    }
    const busy = restoringId === entry.id;
    const actions: RowAction[] = [
      {
        id: "restore",
        label: `Restore ${entry.label}`,
        ariaLabel: `Restore ${entry.label}`,
        icon: busy ? Loader2 : Undo2,
        disabled: busy,
        onSelect: () => handleRestore(entry),
      },
      {
        id: "details",
        label: "View details",
        icon: Info,
        onSelect: () => {
          toast.info(
            `Deleted by ${entry.deleted_by_name ?? "Unknown"} on ${formatRelative(entry.deleted_at)}`,
          );
        },
      },
    ];

    return (
      <RowActions
        actions={actions}
        triggerLabel={`Actions for ${entry.label}`}
      />
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recently deleted"
        description="Items you deleted. Only owners can see and restore them."
      >
        {can("exportDeletionLog") && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={exporting}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        )}
        {can("purgeDeletionLog") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCleanUpOpen(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4 text-destructive" />
            Clean up…
          </Button>
        )}
      </PageHeader>

      {lastPurge && (
        <p className="text-xs text-muted-foreground">
          Last cleaned up {formatRelative(lastPurge.purged_at)} by {lastPurge.purger_name}: {lastPurge.entries_removed} entries removed.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={entityType ?? "all"}
          onValueChange={(value) =>
            updateParams({
              type: value === "all" ? null : (value as DeletedItemsFilter),
            })
          }
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="customer">Customers</TabsTrigger>
            <TabsTrigger value="transaction">Transactions</TabsTrigger>
          </TabsList>
        </Tabs>
        <Toggle
          variant="outline"
          pressed={showRestored}
          onPressedChange={(next) =>
            updateParams({ restored: next ? "1" : null })
          }
        >
          Show restored
        </Toggle>
      </div>

      <div className="space-y-3">
        {canRestore && (
          <BulkActionBar
            selectedCount={selectedIds.length}
            onClear={() => setSelectedIds([])}
          >
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkRestore}
              disabled={bulkRestore.isPending}
            >
              <Undo2 className="size-4" />
              Restore ({selectedIds.length})
            </Button>
          </BulkActionBar>
        )}
        <DataTable
          selectable={
            canRestore
              ? {
                  getId: (row) => row.id,
                  selected: selectedIds,
                  onChange: setSelectedIds,
                  getRowLabel: (row) => row.label,
                  canSelect: (row) => !row.restored_at,
                }
              : undefined
          }
          columns={columns}
          rows={entries}
          getRowKey={(row) => row.id}
          loading={role === null || log.isPending}
          error={log.error ? toAppError(log.error).message : null}
          onRetry={() => void log.refetch()}
          renderRowActions={renderRowActions}
          mobile={(entry) => ({
            title: entry.label,
            subtitle: entry.reason ?? undefined,
            trailing:
              entry.entity_type === "customer" ? "Customer" : "Transaction",
            meta: `Deleted ${formatRelative(entry.deleted_at)} by ${
              entry.deleted_by_name ?? "Unknown"
            }`,
          })}
          emptyState={
            <EmptyState
              title="Nothing deleted"
              description="Deleted customers and transactions appear here so you can restore them."
            />
          }
        />
        {entries.length === 200 && (
          <p className="text-sm text-muted-foreground">
            Showing the 200 most recent.
          </p>
        )}
      </div>

      <CleanUpDialog
        open={cleanUpOpen}
        onOpenChange={setCleanUpOpen}
        businessId={businessId}
        onExportFirst={handleExportCsv}
      />
    </div>
  );
}
