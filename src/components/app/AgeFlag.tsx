export function AgeFlag({ days }: { days: number | null }) {
  if (days === null || days < 30) return null;
  return (
    <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning dark:bg-warning/8">
      {Math.floor(days / 10) * 10}+ days
    </span>
  );
}
