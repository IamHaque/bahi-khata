import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TransactionType } from "@/types";

// Colour meaning is unchanged from v2 (D-10): charge = receivable (green), payment = credit (red-orange).
const styles = {
  charge: { label: "Charge", tone: "bg-receivable/10 dark:bg-receivable/8 text-receivable", Icon: ArrowUpRight },
  payment: { label: "Payment", tone: "bg-credit/10 dark:bg-credit/8 text-credit", Icon: ArrowDownLeft },
} as const;

export function TypeBadge({ type, className }: { type: TransactionType; className?: string }) {
  const { label, tone, Icon } = styles[type];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium", tone, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}
