import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeftRight, Loader2, Undo2, User } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { DataTable, type Column } from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { toast } from "sonner";
import { formatRelative } from "@/lib/format";
import { toAppError } from "@/lib/AppError";
import { usePermissions } from "@/features/business/hooks";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { useDeletionLog, useRestoreDeleted } from "../hooks";
import type { DeletionLogEntry, DeletedItemsFilter } from "../api";

/**
 * v3 (S-56) — the Owner's Recently deleted: everything hard-deleted in
 * this business, newest first, each row restorable in one atomic
 * server-side step. Reading is as sensitive as writing — the hook only
 * runs for a role that may (viewDeletedItems), and a member who types
 * the URL sees the no-access state instead of a broken table.
 */
export function DeletedItemsPage() {
  const businessId = useScopedBusinessId() ?? "";
  const { role, can } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  // One row's Restore in flight at a time (the spinner is per-button).
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const restore = useRestoreDeleted(businessId);

  // Filters live in the query string, like the other lists.
  const typeParam = searchParams.get("type");
  const entityType: DeletedItemsFilter | undefined =
    typeParam === "customer" || typeParam === "transaction"
      ? typeParam
      : undefined;
  const showRestored = searchParams.get("restored") === "1";
  const updateParams = (patch: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace: true });
  };

  const log = useDeletionLog(businessId, {
    entityType,
    restored: showRestored ? "include" : "exclude",
    limit: 200,
  });

  // S-21/S-51: a known non-owner who types the URL gets the standard
  // no-access state (role null = memberships still loading, so the
  // skeleton below shows instead of a flash of "no access").
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
      render: (entry) => (
        <div className="flex items-start gap-2">
          {entry.entity_type === "customer" ? (
            <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ArrowLeftRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <div>
            <span
              className={entry.restored_at ? "text-muted-foreground" : ""}
            >
              {entry.label}
            </span>
            {entry.entity_type === "customer" &&
              typeof entry.summary.transaction_count === "number" && (
                <p className="text-xs text-muted-foreground">
                  {entry.summary.transaction_count} transactions
                </p>
              )}
          </div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (entry) =>
        entry.entity_type === "customer" ? "Customer" : "Transaction",
    },
    {
      key: "deletedBy",
      header: "Deleted by",
      render: (entry) => entry.deleted_by_name ?? "Unknown",
    },
    {
      key: "deleted",
      header: "Deleted",
      render: (entry) => formatRelative(entry.deleted_at),
    },
    {
      key: "reason",
      header: "Reason",
      render: (entry) => entry.reason ?? "—",
    },
  ];

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
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => {
          // This query build has no per-call onMutate, so the spinner
          // starts synchronously; the settle callback clears it.
          setRestoringId(entry.id);
          restore.mutate(entry.id, {
            onSuccess: () => toast.success(`${entry.label} restored`),
            // The database's own message is the final copy (S-51's
            // 55000 conflicts say what to fix).
            onError: (error) => toast.error(error.message),
            onSettled: () => setRestoringId(null),
          });
        }}
      >
        {busy ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Undo2 className="mr-1 h-4 w-4" aria-hidden="true" />
        )}
        Restore
      </Button>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recently deleted"
        description="Items you deleted. Only owners can see and restore them."
      />

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
        <DataTable
          columns={columns}
          rows={entries}
          getRowKey={(row) => row.id}
          loading={role === null || log.isPending}
          error={log.error ? toAppError(log.error).message : null}
          onRetry={() => void log.refetch()}
          renderRowActions={renderRowActions}
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
    </div>
  );
}
