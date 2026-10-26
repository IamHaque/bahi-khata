import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { toAppError } from "@/lib/AppError";
import { formatDate, formatMoney } from "@/lib/format";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";
import { useScopedBusinessId } from "@/features/business/useScopedBusinessId";
import { usePermissions } from "@/features/business/hooks";
import {
  useCustomerList,
  useSetCustomerArchived,
} from "@/features/customers/hooks";
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
import { StatCard } from "@/components/app/StatCard";
import { SearchInput } from "@/components/app/SearchInput";
import { FilterBar, type FilterChip } from "@/components/app/FilterBar";
import {
  DataTable,
  RowActionsMenu,
  type Column,
  type RowActionItem,
} from "@/components/app/DataTable";
import { EmptyState } from "@/components/app/EmptyState";
import { Avatar } from "@/components/app/Avatar";
import { BalanceBadge } from "@/components/app/BalanceBadge";
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

const columns: Array<Column<CustomerListRow>> = [
  {
    key: "name",
    header: "Customer",
    sortable: true,
    render: (row) => (
      <div className="flex items-center gap-3">
        <Avatar name={row.name} size="sm" />
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{row.name}</p>
          {row.archived_at ? (
            /* Archived rows say so where the tags usually sit, so the
               name cell's text (and tests that find rows by name) stay
               untouched. */
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
    render: (row) =>
      row.phone ?? <span className="text-muted-foreground">—</span>,
  },
  {
    key: "balance",
    header: "Balance",
    align: "right",
    sortable: true,
    render: (row) => <BalanceBadge balance={row.balance} />,
  },
  {
    key: "lastActivity",
    header: "Last activity",
    render: (row) =>
      row.last_activity ? (
        formatDate(row.last_activity)
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "created",
    header: "Added",
    sortable: true,
    render: (row) => formatDate(row.created_at),
  },
];

export function CustomersPage() {
  const navigate = useNavigate();
  const businessId = useScopedBusinessId() ?? "";
  const { can } = usePermissions();
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

  const rowMenuItems = (row: CustomerListRow): RowActionItem[] => {
    // Archived rows keep history but leave the working set: no edit, no
    // add-transaction — restore first. v3 (S-55): Delete is no longer
    // archived-only — every row offers it, last and behind a divider,
    // and only for the owner (the matrix, S-21).
    const archived = row.archived_at != null;
    const items: RowActionItem[] = [
      {
        label: "View",
        onSelect: () => navigate(paths.customerDetail(businessId, row.id)),
      },
    ];
    if (!archived && can("manageCustomers")) {
      items.push({
        label: "Edit",
        onSelect: () => setDialog({ kind: "form", mode: "edit", customer: row }),
      });
    }
    if (!archived && can("manageTransactions")) {
      // Live since S-32: opens the shared sheet with this row's
      // customer preselected.
      items.push({
        label: "Add transaction",
        onSelect: () =>
          openTransactionSheet({ id: row.id, name: row.name }),
      });
    }
    if (can("archiveCustomers")) {
      if (archived) {
        items.push({
          label: "Restore",
          onSelect: () => {
            void restoreCustomer
              .mutateAsync({ id: row.id, archived: false })
              .catch(() => {
                toast.error("Could not restore the customer. Try again.");
              });
          },
        });
      } else {
        items.push({
          label: "Archive",
          onSelect: () => setDialog({ kind: "archive", customer: row }),
          variant: "destructive",
        });
      }
    }
    if (can("deleteCustomer")) {
      items.push({
        label: "Delete",
        onSelect: () => setDialog({ kind: "delete", customer: row }),
        variant: "destructive",
        separator: true,
      });
    }
    return items;
  };

  const renderRowActions = (row: CustomerListRow) => (
    <RowActionsMenu
      triggerLabel={`Actions for ${row.name}`}
      items={rowMenuItems(row)}
    />
  );

  const renderMobileCard = (row: CustomerListRow) => (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => navigate(paths.customerDetail(businessId, row.id))}
      >
        <div className="flex items-center gap-2">
          <Avatar name={row.name} size="sm" />
          <span className="truncate font-medium text-foreground">{row.name}</span>
          {row.archived_at && (
            <span className="text-xs text-muted-foreground">Archived</span>
          )}
        </div>
        {row.phone && (
          <p className="mt-1 text-sm text-muted-foreground">{row.phone}</p>
        )}
        <div className="mt-2">
          <BalanceBadge balance={row.balance} />
        </div>
      </button>
      <div onClick={(event) => event.stopPropagation()}>{renderRowActions(row)}</div>
    </div>
  );

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
        {can("manageCustomers") && (
          <Button onClick={() => setDialog({ kind: "form", mode: "add", customer: null })}>
            <Plus className="size-4" /> Add customer
          </Button>
        )}
      </PageHeader>

      {/* Summary strip — over every customer, not just the filtered page. */}
      <section aria-label="Customer summary" className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Customers"
          value={data ? data.allTotal : "—"}
        />
        <StatCard
          label="Owes you"
          value={balancesLoaded ? formatMoney(owesYou) : "—"}
          valueClassName="text-receivable"
        />
        <StatCard
          label="You owe"
          value={balancesLoaded ? formatMoney(youOwe) : "—"}
          valueClassName="text-credit"
        />
      </section>

      <FilterBar chips={chips} onClearAll={clearFilters}>
        <SearchInput
          id="customer-search"
          label="Search customers by name or phone"
          placeholder="Search by name or phone…"
          value={q}
          onValueChange={(value) =>
            updateParams({ q: value || null }, { replace: true })
          }
        />
        <div
          role="group"
          aria-label="Filter customers by status"
          className="flex flex-wrap gap-1"
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
                "rounded-full border px-3 py-1 text-sm transition-colors",
                status === option.value
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent-wash hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </FilterBar>

      <DataTable
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
        renderMobileCard={renderMobileCard}
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
    </div>
  );
}
