import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Money } from "@/components/app/Money";

type Tone = "receivable" | "credit" | "neutral";
const toneClass: Record<Tone, string> = { receivable: "text-receivable", credit: "text-credit", neutral: "text-foreground" };

interface LeaderRowProps {
  label: ReactNode;
  sub?: ReactNode;
  amount: number;
  tone?: Tone;
  leading?: ReactNode;      // usually a <Monogram />
  trailing?: ReactNode;     // for example an <AgeFlag />
  size?: "md" | "lg";
  className?: string;
}

// The leader dots are decorative; reading order is label, sub-line, amount.
export function LeaderRow({ label, sub, amount, tone = "neutral", leading, trailing, size = "md", className }: LeaderRowProps) {
  return (
    <div role="listitem" className={cn("leader items-center py-3", className)}>
      {leading}
      <div className="min-w-0">
        <div className={cn("truncate", size === "lg" ? "font-heading text-xl font-bold" : "font-semibold")}>{label}</div>
        {sub && <div className="text-sm text-muted-foreground">{sub}</div>}
      </div>
      {trailing}
      <i className="leader-dots" aria-hidden="true" />
      <Money amount={amount} className={cn("font-semibold", size === "lg" && "font-display text-xl", toneClass[tone])} />
    </div>
  );
}
