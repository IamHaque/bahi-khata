import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function TotalsRule({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("totals-rule py-3", className)}>{children}</div>;
}
