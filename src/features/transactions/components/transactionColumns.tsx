import { Link, type NavigateFunction } from "react-router-dom";
import { Avatar } from "@/components/app/Avatar";
import type { Column } from "@/components/app/DataTable";
import { Money } from "@/components/app/Money";
import { Monogram } from "@/components/app/Monogram";
import { RowActions, type RowAction } from "@/components/app/RowActions";
import type { TableCardSpec } from "@/components/app/TableCard";
import { actionLabels } from "@/lib/actionLabels";
import { Ban, Pencil, RotateCcw, Trash2 } from "lucide-react";
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

export function transactionCustomerParticularsCell(
  row: TransactionListRow,
  businessId: string,
) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={paths.customerDetail(businessId, row.customer_id)}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex min-w-0 items-center gap-2 font-medium text-foreground hover:underline pointer-coarse:min-h-11"
        >
          <Monogram name={row.customer.name} />
          <span className="truncate">{row.customer.name}</span>
        </Link>
        {hasBadges(row) && transactionBadgesCell(row)}
      </div>
      {row.note && (
        <p className="truncate text-xs text-muted-foreground mt-0.5">
          {row.note}
        </p>
      )}
    </div>
  );
}

export function transactionMobileSpec(
  row: TransactionListRow,
  businessId: string,
): TableCardSpec {
  return {
    lead: <Monogram name={row.customer.name} />,
    title: (
      <Link
        to={paths.customerDetail(businessId, row.customer_id)}
        onClick={(event) => event.stopPropagation()}
        className="font-medium text-foreground hover:underline pointer-coarse:min-h-11 pointer-coarse:inline-flex pointer-coarse:items-center"
      >
        {row.customer.name}
      </Link>
    ),
    trailing: signedAmountCell(row, "font-heading text-base font-semibold"),
    subtitle: formatDate(row.occurred_at),
    meta: (
      <span className="flex items-center gap-1.5">
        {typeBadge(row)}
        {hasBadges(row) && transactionBadgesCell(row)}
        {row.note && <span>· {row.note}</span>}
      </span>
    ),
    lines: [`by ${row.created_by_name ?? "Former member"}`],
  };
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
        by {row.created_by_name ?? "Former member"}
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
      width: "fit",
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
      width: "fill",
      render: (row) => transactionCustomerParticularsCell(row, businessId),
    },
    {
      key: "charged",
      header: "Charged",
      width: "fit",
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
      width: "fit",
      align: "right",
      sortable: true,
      sortKey: "amount",
      sortValue: (row) => row.amount,
      render: (row) => moneyCell(row, "payment"),
    },
    {
      key: "recordedBy",
      header: "Recorded by",
      width: "fit",
      priority: 3,
      fold: (row) => `by ${row.created_by_name ?? "Former member"}`,
      render: (row) => recordedByCell(row),
    },
  ];

  const renderRowActions = (row: TransactionListRow) => {
    if (!can("manageTransactions")) return null;

    if (row.status === "voided") {
      const actions: RowAction[] = [
        {
          id: "restore",
          label: actionLabels.restore,
          ariaLabel: `Restore ${row.type} of ${formatMoney(row.amount)}`,
          icon: RotateCcw,
          onSelect: () => onRestore(row),
        },
      ];
      if (can("deleteTransaction")) {
        actions.push({
          id: "delete",
          label: actionLabels.delete,
          ariaLabel: `Delete ${row.type} of ${formatMoney(row.amount)}`,
          icon: Trash2,
          destructive: true,
          onSelect: () => onDelete(row),
        });
      }
      return (
        <RowActions
          actions={actions}
          triggerLabel="Transaction actions"
        />
      );
    }

    const actions: RowAction[] = [
      {
        id: "edit",
        label: actionLabels.edit,
        ariaLabel: `Edit ${row.type} of ${formatMoney(row.amount)}`,
        icon: Pencil,
        onSelect: () => onEdit(row),
      },
      {
        id: "void",
        label: actionLabels.void,
        ariaLabel: `Void ${row.type} of ${formatMoney(row.amount)}`,
        icon: Ban,
        onSelect: () => onVoid(row),
      },
    ];
    if (can("deleteTransaction")) {
      actions.push({
        id: "delete",
        label: actionLabels.delete,
        ariaLabel: `Delete ${row.type} of ${formatMoney(row.amount)}`,
        icon: Trash2,
        destructive: true,
        onSelect: () => onDelete(row),
      });
    }

    return (
      <RowActions
        actions={actions}
        triggerLabel="Transaction actions"
      />
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
      width: "fill",
      render: (row) => <span className="font-medium">{row.label}</span>,
    },
    {
      key: "entries",
      header: "Entries",
      width: "fit",
      align: "right",
      render: (row) => <span className="tabular-nums">{row.entries}</span>,
    },
    {
      key: "charged",
      header: "Charged",
      width: "fit",
      align: "right",
      render: (row) => (
        <Money amount={row.total_charged} className="text-receivable" />
      ),
    },
    {
      key: "paid",
      header: "Paid",
      width: "fit",
      align: "right",
      render: (row) => <Money amount={row.total_paid} className="text-credit" />,
    },
    {
      key: "net",
      header: "Net",
      width: "fit",
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
