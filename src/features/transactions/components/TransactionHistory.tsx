import { Pencil, Ban, RotateCcw, PlusCircle } from "lucide-react";
import { Money } from "@/components/app/Money";
import { formatDate, formatTime, formatRelative, formatDayMonth } from "@/lib/format";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { HISTORY_START_LABEL } from "../historyStart";
import { useTransactionHistory } from "../hooks";
import type { TransactionRevision, TransactionDetail } from "../api";
import type { Transaction } from "@/types";

export interface TransactionHistoryProps {
  businessId: string;
  transaction: (Transaction | TransactionDetail) & {
    creator_name?: string | null;
  };
  revisionsOverride?: TransactionRevision[];
}

function renderEditSentence(
  field: string,
  change: { from: unknown; to: unknown },
) {
  if (field === "amount") {
    return (
      <span key={field} className="inline-flex items-center gap-1">
        Changed amount <Money amount={Number(change.from)} /> &rarr;{" "}
        <Money amount={Number(change.to)} />
      </span>
    );
  }
  if (field === "type") {
    return (
      <span key={field}>
        Changed type {String(change.from)} &rarr; {String(change.to)}
      </span>
    );
  }
  if (field === "occurred_at") {
    return (
      <span key={field}>
        Moved date {formatDayMonth(String(change.from))} &rarr;{" "}
        {formatDayMonth(String(change.to))}
      </span>
    );
  }
  if (field === "note") {
    return <span key={field}>Changed note</span>;
  }
  if (field === "customer_id") {
    return <span key={field}>Changed customer</span>;
  }
  return (
    <span key={field}>
      Changed {field}
    </span>
  );
}

export function TransactionHistory({
  businessId,
  transaction,
  revisionsOverride,
}: TransactionHistoryProps) {
  const {
    data: queriedRevisions,
    isLoading,
    isError,
    error,
    refetch,
  } = useTransactionHistory(businessId, revisionsOverride ? "" : transaction.id);

  const revisions = revisionsOverride ?? queriedRevisions ?? [];

  return (
    <div id="history" className="space-y-4 rounded-md border border-border p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-lg font-semibold text-foreground">
          History
        </h3>
        <span className="text-xs text-muted-foreground">
          {HISTORY_START_LABEL}
        </span>
      </div>

      {isLoading && (
        <div
          role="status"
          aria-label="Loading history"
          className="space-y-3 py-2"
        >
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted" />
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded bg-destructive/10 p-3 text-xs text-destructive"
        >
          {error instanceof Error
            ? error.message
            : "Could not load revision history."}
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-2 font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && revisions.length === 0 && (
        <p className="text-sm text-muted-foreground">No changes recorded</p>
      )}

      {!isLoading && !isError && (
        <div className="space-y-3 divide-y divide-border/60">
          {/* Revisions: newest first */}
          {revisions.map((rev) => {
            const timestamp = `${formatDate(rev.changed_at)} at ${formatTime(
              rev.changed_at,
            )}`;
            const actor = rev.actor_name ?? "Former member";

            return (
              <div
                key={rev.id}
                className="flex items-start gap-3 pt-3 first:pt-0"
              >
                <div className="mt-0.5 shrink-0">
                  {rev.action === "edit" && (
                    <Pencil
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  {rev.action === "void" && (
                    <Ban className="h-4 w-4 text-warning" aria-hidden="true" />
                  )}
                  {rev.action === "restore" && (
                    <RotateCcw
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-foreground">{actor}</span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span
                            tabIndex={0}
                            className="cursor-default text-xs text-muted-foreground outline-none focus-visible:underline"
                            title={timestamp}
                          />
                        }
                      >
                        {formatRelative(rev.changed_at)}
                      </TooltipTrigger>
                      <TooltipContent side="top">{timestamp}</TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="mt-1 text-foreground">
                    {rev.action === "void" && (
                      <span>
                        Voided{rev.reason ? `: ${rev.reason}` : ""}
                      </span>
                    )}
                    {rev.action === "restore" && <span>Restored</span>}
                    {rev.action === "edit" && (
                      <div className="space-y-0.5">
                        {Object.entries(rev.changes).map(([field, chg]) =>
                          renderEditSentence(field, chg),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Oldest / bottom item: initial record */}
          <div className="flex items-start gap-3 pt-3">
            <div className="mt-0.5 shrink-0">
              <PlusCircle
                className="h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              Recorded by{" "}
              <span className="font-medium text-foreground">
                {transaction.creator_name ?? "Former member"}
              </span>{" "}
              on{" "}
              <span>
                {formatDate(transaction.created_at || transaction.occurred_at)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
