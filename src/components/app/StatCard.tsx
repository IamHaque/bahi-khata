import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  className?: string;
  valueClassName?: string;
}

export function StatCard({ label, value, hint, className, valueClassName }: StatCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums text-foreground",
          valueClassName,
        )}
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
