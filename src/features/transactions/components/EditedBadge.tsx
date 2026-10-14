import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/StatusBadge";
import { formatDate, formatTime } from "@/lib/format";

/**
 * S-33 — the audit marker: a stored entry that was corrected keeps an
 * "Edited" pill on its ledger row. Hovering or focusing it reads who
 * edited and when — "Edited by Eli on 12 Oct 2026, 14:05". The name
 * was resolved against profiles by the transactions api; an editor
 * whose profile is no longer readable (they left the business) falls
 * back to "Former member", matching the creator fallback direction
 * planned for S-35.
 */
export function EditedBadge({
  editorName,
  updatedAt,
  className,
}: {
  editorName?: string | null;
  updatedAt?: string | null;
  className?: string;
}) {
  if (!updatedAt) return null;

  const detail = `Edited by ${editorName ?? "Former member"} on ${formatDate(
    updatedAt,
  )}, ${formatTime(updatedAt)}`;

  return (
    <span
      tabIndex={0}
      title={detail}
      className={cn(
        "inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <StatusBadge label="Edited" tone="muted" />
      {/* Focus (and screen readers) get the full who-and-when even
          where the native tooltip would not appear. */}
      <span className="sr-only"> {detail}</span>
    </span>
  );
}
