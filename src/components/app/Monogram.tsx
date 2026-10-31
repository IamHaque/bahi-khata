import { cn } from "@/lib/utils";

type Tone = "receivable" | "credit" | "neutral";
const toneClass: Record<Tone, string> = {
  receivable: "bg-receivable/10 dark:bg-receivable/8 text-receivable",
  credit: "bg-credit/10 dark:bg-credit/8 text-credit",
  neutral: "bg-muted text-muted-foreground",
};
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}
export function Monogram({ name, tone = "neutral", size = "md", className }: { name: string; tone?: Tone; size?: "md" | "lg"; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center rounded-sm font-bold", size === "lg" ? "size-14 text-lg" : "size-8 text-xs", toneClass[tone], className)}>
      {initials(name)}
    </span>
  );
}
