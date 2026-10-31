import { Link, type NavigateFunction } from "react-router-dom";
import { Avatar } from "@/components/app/Avatar";
import type { Column } from "@/components/app/DataTable";
import { Money } from "@/components/app/Money";
import { Monogram } from "@/components/app/Monogram";
import { RowActionCluster } from "@/components/app/DataTable";
import type { RowActionItem } from "@/components/app/DataTable";
import { StatusBadge } from "@/components/app/StatusBadge";
import { TypeBadge } from "@/components/app/TypeBadge";
import { EditedBadge } from "@/features/transactions/components/EditedBadge";
import type { GroupBy } from "@/features/transactions/components/TransactionFilters";
import type { TransactionListRow } from "@/features/transactions/api";
import type { PermissionAction } from "@/lib/permissions";
import { formatDate, formatDayMonth, formatMoney, formatMonthYear } from "@/lib/format";
import { paths } from "@/lib/paths";
import { cn } from "@/lib/utils";

/**
 * L-09 — the transactions tables' columns and row actions, split out
 * of the page so the day book stays readable. The detailed view is
 * Date · Customer · Particulars · Charged · Paid · Recorded by: the
 * two money columns share the ONE stored amount's sort key, a charge
 * fills Charged and leaves Paid an em dash (and vice versa), and the
 * status/source badges plus the below-xl "by {name}" fold into
 * Particulars so the table never scrolls sideways.
 */

/** The muted, struck-through look of a voided row's figures (S-34). */
const VOIDED = "line-through opacity-50";

export interface DetailColumnsInput {
  can: (action: PermissionAction) => boolean;
  businessId: string;
  onEdit: (row: TransactionListRow) => void;
  onVoid: (row: TransactionListRow) => void;
  onRestore: (row: TransactionListRow) => void;
  onDelete: (row: TransactionListRow) => void;
  navigate: NavigateFunction;
}

/** The customer cell: a Monogram and the live name, linked to the
 *  customer's ledger. The phone never blocks the name (L-08's lesson). */
export function transactionCustomerCell(
  row: TransactionListRow,
  businessId: string,
) {
  return (
    <Link
      to={paths.customerDetail(businessId, row.customer_id)}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground hover:underline pointer-coarse:min-h-11"
    >
      <Monogram name={row.customer.name} />
      <span className="truncate">{row.customer.name}</span>
    </Link>
  );
}

export function typeBadge(row: TransactionListRow) {
  return <TypeBadge type={row.type} />;
}

/** The signed amount the mobile card keeps: a charge is money the
 *  business is owed, a payment money it has received (S-35). */
export function signedAmountCell(
  row: TransactionListRow,
  className?: string,
) {
  return (
    <Money
      signed
      amount={row.type === "charge" ? row.amount : -row.amount}
      className={cn(
        row.type === "charge" ? "text-receivable" : "text-credit",
        row.status === "voided" && VOIDED,
        className,
      )}
    />
  );
}

// "status or source badges": the S-33 edit marker, the S-34 void
// marker and the import provenance in one cell.
export function transactionBadgesCell(row: TransactionListRow) {
  return (
    <div className="flex items-center gap-1.5">
      {row.status === "edited" && (
        <EditedBadge
          editorName={row.updated_by_name ?? null}
          updatedAt={row.updated_at}
        />
      )}
      {row.status === "voided" && <StatusBadge label="Voided" tone="muted" />}
      {row.source === "import" && <StatusBadge label="Import" tone="muted" />}
    </div>
  );
}

// The S-35 "Recorded by": the creator's avatar and name, or the
// S-25/0002c fallback when the profile is gone.
export function recordedByCell(row: TransactionListRow) {
  return (
    <div className="flex items-center gap-2">
      <Avatar name={row.created_by_name ?? "Former member"} size="sm" />
      <span className="truncate text-sm text-muted-foreground">
        {row.created_by_name ?? "Former member"}
      </span>
    </div>
  );
}

function hasBadges(row: TransactionListRow) {
  return row.status !== "active" || row.source === "import";
}

/** Particulars: the badges, the note (em dash when empty) and — below
 *  xl, where the Recorded by column hides — the author's name. */
function particularsCell(row: TransactionListRow) {
  return (
    <div className="min-w-0">
      {hasBadges(row) && (
        <div className="mb-0.5">{transactionBadgesCell(row)}</div>
      )}
      <span className="block max-w-[220px] truncate text-muted-foreground">
        {row.note ?? "—"}
      </span>
      <span className="block text-xs text-muted-foreground xl:hidden">
        by {row.created_by_name ?? "Former member"}
      </span>
    </div>
  );
}

/** The detailed view's mobile card: money-first ledger card (V-HV3).
 *  Amounts are never truncated (S-35) and the signed amount stays. */
export function transactionMobileCard(
  row: TransactionListRow,
  businessId: string,
  actions: React.ReactNode,
) {
  const isVoided = row.status === "voided";

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3",
        isVoided && "opacity-75",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {transactionCustomerCell(row, businessId)}
        <span className="shrink-0">{typeBadge(row)}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span className="tabular-nums">{formatDate(row.occurred_at)}</span>
        {hasBadges(row) && transactionBadgesCell(row)}
        {row.note && (
          <>
            <span aria-hidden="true">·</span>
            <span className="break-words text-foreground">{row.note}</span>
          </>
        )}
      </div>

      <p className="mt-0.5 text-xs text-muted-foreground">
        by <span>{row.created_by_name ?? "Former member"}</span>
      </p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="font-heading text-xl font-semibold tabular-nums">
          {signedAmountCell(row, "font-heading text-xl font-semibold")}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

/** One money cell of the detailed view: only the matching type fills
 *  it — the other side is an em dash, so the two columns read as one
 *  ledger (PRD L-09: a charge of ₹249.50 shows in Charged only). */
function moneyCell(row: TransactionListRow, forType: "charge" | "payment") {
  if (row.type !== forType) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <Money
      amount={row.amount}
      className={cn(
        forType === "charge" ? "text-receivable" : "text-credit",
        row.status === "voided" && VOIDED,
      )}
    />
  );
}

export function buildDetailColumns({
  can,
  businessId,
  onEdit,
  onVoid,
  onRestore,
  onDelete,
  navigate,
}: DetailColumnsInput): {
  columns: Column<TransactionListRow>[];
  renderRowActions: (row: TransactionListRow) => React.ReactNode;
  onRowClick: (row: TransactionListRow) => void;
} {
  const columns: Column<TransactionListRow>[] = [
    {
      key: "date",
      header: "Date",
      sortable: true,
      render: (row) => (
        <span
          className={cn(
            "tabular-nums",
            row.status === "voided" && "text-muted-foreground",
          )}
        >
          {formatDate(row.occurred_at)}
        </span>
      ),
      sortValue: (row) => new Date(row.occurred_at).getTime(),
    },
    {
      key: "customer",
      header: "Customer",
      render: (row) => transactionCustomerCell(row, businessId),
    },
    {
      key: "particulars",
      header: "Particulars",
      render: (row) => particularsCell(row),
    },
    {
      key: "charged",
      header: "Charged",
      align: "right",
      sortable: true,
      // Both money columns sort by the one stored amount (L-09).
      sortKey: "amount",
      sortValue: (row) => row.amount,
      render: (row) => moneyCell(row, "charge"),
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      sortable: true,
      sortKey: "amount",
      sortValue: (row) => row.amount,
      render: (row) => moneyCell(row, "payment"),
    },
    {
      key: "recordedBy",
      header: "Recorded by",
      // Below xl the name folds into Particulars' "by {name}" line.
      className: "hidden xl:table-cell",
      render: (row) => recordedByCell(row),
    },
  ];

  // S-33/S-34 row actions, role-aware: the pencil edits in the shared
  // sheet, Void opens the confirmation, and a voided row offers
  // Restore. Viewers see none of them. L-14 (F2): on a coarse pointer
  // the icons collapse into ONE "Transaction actions" menu so the row
  // never carries several 44px targets.
  const renderRowActions = (row: TransactionListRow) => {
    if (!can("manageTransactions")) return null;

    if (row.status === "voided") {
      const items: RowActionItem[] = [
        {
          label: `Restore ${row.type} of ${formatMoney(row.amount)}`,
          onSelect: () => onRestore(row),
        },
      ];
      return (
        <RowActionCluster items={items} triggerLabel="Transaction actions">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRestore(row);
            }}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Restore ${row.type} of ${formatMoney(row.amount)}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          </button>
        </RowActionCluster>
      );
    }

    const items: RowActionItem[] = [
      {
        label: `Edit ${row.type} of ${formatMoney(row.amount)}`,
        onSelect: () => onEdit(row),
      },
      {
        label: `Void ${row.type} of ${formatMoney(row.amount)}`,
        onSelect: () => onVoid(row),
      },
    ];
    if (can("deleteTransaction")) {
      items.push({
        label: `Delete ${row.type} of ${formatMoney(row.amount)}`,
        onSelect: () => onDelete(row),
        variant: "destructive",
        separator: true,
      });
    }

    return (
      <RowActionCluster items={items} triggerLabel="Transaction actions">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(row);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Edit ${row.type} of ${formatMoney(row.amount)}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onVoid(row);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`Void ${row.type} of ${formatMoney(row.amount)}`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </button>
        {/* v3 (S-54): after a divider — destructive, owner-only. */}
        {can("deleteTransaction") && (
          <>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(row);
              }}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={`Delete ${row.type} of ${formatMoney(row.amount)}`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6" />
              </svg>
            </button>
          </>
        )}
      </RowActionCluster>
    );
  };

  return {
    columns,
    renderRowActions,
    onRowClick: (row) =>
      navigate(paths.transactionDetail(businessId, row.id)),
  };
}

/** One summarized row of the database-computed rollup. */
export interface PeriodRow {
  key: string;
  label: string;
  entries: number;
  total_charged: number;
  total_paid: number;
  net: number;
}

/** The rollup hands back wall-clock dates cut in the browser's
 *  timezone; these are the same local formatters that label every
 *  other date in the app. */
export function periodLabel(periodStart: string, groupBy: GroupBy): string {
  const date = new Date(periodStart);
  if (groupBy === "day") return formatDate(date);
  if (groupBy === "week") return `Week of ${formatDayMonth(date)}`;
  return formatMonthYear(date);
}

/** The rollup rows as the summarized table's rows — never reduced in
 *  the browser, only labelled (S-36: the database computes). */
export function toPeriodRows(
  data:
    | Array<{
        period_start: string | null;
        entries: number;
        total_charged: number;
        total_paid: number;
        net: number;
      }>
    | undefined,
  groupBy: GroupBy,
): PeriodRow[] {
  return (data ?? []).map((row) => ({
    key: row.period_start ?? "all",
    label: row.period_start
      ? periodLabel(row.period_start, groupBy)
      : "All matching",
    entries: row.entries,
    total_charged: row.total_charged,
    total_paid: row.total_paid,
    net: row.net,
  }));
}

/** Summarized columns: same data as S-36, restyled to the day book —
 *  every figure a Money, labels Charged/Paid/Net (L-09). */
export function buildSummaryColumns(): Column<PeriodRow>[] {
  return [
    {
      key: "period",
      header: "Period",
      render: (row) => <span className="font-medium">{row.label}</span>,
    },
    {
      key: "entries",
      header: "Entries",
      align: "right",
      render: (row) => <span className="tabular-nums">{row.entries}</span>,
    },
    {
      key: "charged",
      header: "Charged",
      align: "right",
      render: (row) => (
        <Money amount={row.total_charged} className="text-receivable" />
      ),
    },
    {
      key: "paid",
      header: "Paid",
      align: "right",
      render: (row) => <Money amount={row.total_paid} className="text-credit" />,
    },
    {
      key: "net",
      header: "Net",
      align: "right",
      render: (row) => (
        <Money
          signed
          amount={row.net}
          className={cn(row.net >= 0 ? "text-receivable" : "text-credit")}
        />
      ),
    },
  ];
}
