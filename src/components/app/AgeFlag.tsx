import { CHASE_AFTER_DAYS } from "@/features/dashboard/constants";

export function AgeFlag({ days }: { days: number | null }) {
  if (days === null || days < CHASE_AFTER_DAYS) return null;
  return (
    <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning dark:bg-warning/8">
      {Math.floor(days / 10) * 10}+ days
    </span>
  );
}
