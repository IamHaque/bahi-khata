import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

interface MoneyProps {
  amount: number;
  className?: string;
  signed?: boolean;
}

export function Money({ amount, className, signed }: MoneyProps) {
  return (
    <span
      className={cn("inline-block text-right tabular-nums", className)}
      aria-label={`₹${Math.abs(amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
    >
      {signed && amount > 0 ? "+" : ""}
      {formatMoney(amount)}
    </span>
  );
}
