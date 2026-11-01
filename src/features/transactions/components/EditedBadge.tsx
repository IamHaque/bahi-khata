import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/app/StatusBadge";
import { formatDate, formatTime } from "@/lib/format";
import { paths } from "@/lib/paths";
import { isBeforeHistoryStart } from "../historyStart";

/**
 * S-33 / S-72 — the audit marker: a stored entry that was corrected keeps an
 * "Edited" pill on its ledger row. Hovering or focusing it reads who
 * edited and when — "Edited by Eli on 12 Oct 2026, 14:05".
 * S-72 links it to the detail page's #history hash.
 * Rows edited before the v3.2 migration state "Edited (earlier changes were not recorded)".
 */
export function EditedBadge({
  editorName,
  updatedAt,
  businessId,
  transactionId,
  className,
}: {
  editorName?: string | null;
  updatedAt?: string | null;
  businessId?: string;
  transactionId?: string;
  className?: string;
}) {
  if (!updatedAt) return null;

  const isBefore = isBeforeHistoryStart(updatedAt);
  const detail = isBefore
    ? "Edited (earlier changes were not recorded)"
    : `Edited by ${editorName ?? "Former member"} on ${formatDate(
        updatedAt,
      )}, ${formatTime(updatedAt)}`;

  if (businessId && transactionId) {
    return (
      <span
        tabIndex={0}
        title={detail}
        className={cn(
          "inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Link
          to={`${paths.transactionDetail(businessId, transactionId)}#history`}
          className="inline-flex rounded-full hover:opacity-80"
          tabIndex={-1}
        >
          <StatusBadge label="Edited" tone="muted" />
          <span className="sr-only"> {detail}</span>
        </Link>
      </span>
    );
  }

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
      <span className="sr-only"> {detail}</span>
    </span>
  );
}
