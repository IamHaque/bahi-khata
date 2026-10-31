import { cn } from "@/lib/utils";

type StatusTone = "neutral" | "receivable" | "credit" | "warning" | "muted";

const toneStyles: Record<StatusTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  receivable: "bg-receivable/10 dark:bg-receivable/8 text-receivable",
  credit: "bg-credit/10 dark:bg-credit/8 text-credit",
  warning: "bg-warning/10 dark:bg-warning/8 text-warning",
  muted: "bg-muted text-muted-foreground",
};

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  className?: string;
}

export function StatusBadge({ label, tone = "neutral", className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        toneStyles[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}
