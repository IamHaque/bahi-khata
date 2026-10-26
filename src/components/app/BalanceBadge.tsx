import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

export type BalanceStatus = "owes" | "credit" | "settled";

export function getBalanceStatus(balance: number): BalanceStatus {
  if (balance > 0) return "owes";
  if (balance < 0) return "credit";
  return "settled";
}

const statusStyles: Record<BalanceStatus, string> = {
  owes: "bg-receivable/10 dark:bg-receivable/8 text-receivable",
  credit: "bg-credit/10 dark:bg-credit/8 text-credit",
  settled: "bg-muted text-muted-foreground",
};

const statusLabels: Record<BalanceStatus, string> = {
  owes: "Owes you",
  credit: "You owe",
  settled: "Settled",
};

interface BalanceBadgeProps {
  balance: number;
  size?: "sm" | "lg";
  className?: string;
}

export function BalanceBadge({ balance, size = "sm", className }: BalanceBadgeProps) {
  const status = getBalanceStatus(balance);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
        statusStyles[status],
        className,
      )}
    >
      <span aria-hidden="true">{statusLabels[status]}</span>
      <span className="sr-only">{statusLabels[status]}:</span>
      <span className="tabular-nums">{status === "settled" ? "" : formatMoney(Math.abs(balance))}</span>
    </span>
  );
}
