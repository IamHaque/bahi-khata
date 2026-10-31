import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ErrorState } from "@/components/app/ErrorState";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDayMonth, formatMoney } from "@/lib/format";
import { useDailyActivity } from "../hooks";

const WINDOWS = [7, 30, 90] as const;
type Window = (typeof WINDOWS)[number];

/**
 * The date-only strings arrive as "YYYY-MM-DD" wall-clock days (cut in
 * the caller's timezone by the RPC); parse them as LOCAL dates so the
 * axis never shifts a day in a negative-offset zone.
 */
function toLocalDate(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

interface TooltipPayloadItem {
  dataKey?: string;
  value?: number;
  payload?: {
    activity_date: string;
    charges: number;
    payments: number;
  };
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null;
  }
  const date = toLocalDate(label);
  const row = payload[0]?.payload;
  const charges =
    row?.charges ?? (payload.find((p) => p.dataKey === "charges")?.value ?? 0);
  const payments =
    row?.payments ?? (payload.find((p) => p.dataKey === "payments")?.value ?? 0);

  return (
    <div className="rounded border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground">
      <p className="font-semibold text-foreground">{formatDayMonth(date)}</p>
      <div className="mt-1 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <i aria-hidden className="inline-block size-2 shrink-0 bg-receivable" />
          <span className="text-muted-foreground">Charged:</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatMoney(charges)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <i aria-hidden className="inline-block size-2 shrink-0 bg-credit" />
          <span className="text-muted-foreground">Paid:</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatMoney(payments)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * S-37 / L-06 / V-HV1 — the trend chart: charges and payments per day,
 * aggregated SERVER-side by migration 0007's daily_activity RPC
 * (zero-filled, voided out, archived customers out, days cut in the
 * caller's own timezone). L-06: the bars are filled with the ledger
 * tones (receivable / credit), the tops are square, the baseline is a
 * ruled foreground line and the gridlines are dashed. The chart
 * carries a visible text summary and an equivalent visually hidden
 * data table, and the 7/30/90 selector re-reads per window. Empty and
 * failing states are this section's own.
 * V-HV1: fills its container via ResponsiveContainer without horizontal
 * scroll, has custom token-styled hover and keyboard tooltip.
 */
export function TrendChart({ businessId }: { businessId: string }) {
  const [days, setDays] = useState<Window>(7);
  const query = useDailyActivity(businessId, days);
  const rows = query.data;

  const totalCharged = (rows ?? []).reduce((sum, row) => sum + row.charges, 0);
  const totalPaid = (rows ?? []).reduce((sum, row) => sum + row.payments, 0);
  const isEmpty =
    rows !== undefined &&
    rows.every((row) => row.charges === 0 && row.payments === 0);

  return (
    <Card className="p-6 min-w-0" role="region" aria-label="Charges and payments per day">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-sm font-medium text-foreground">Daily activity</h3>
        {/* L-06: the 7/30/90 control as text tabs (L-04 style); labels
            and aria-pressed unchanged. */}
        <div role="group" aria-label="Chart range" className="flex gap-1">
          {WINDOWS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
              className={cn(
                "border-b-2 px-2 py-1.5 text-sm transition-colors pointer-coarse:min-h-11",
                days === option
                  ? "border-foreground text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {option} days
            </button>
          ))}
        </div>
      </div>

      {query.isPending && (
        <div
          role="status"
          aria-label="Loading daily activity"
          className="mt-3 h-56 animate-pulse rounded bg-muted"
        />
      )}

      {query.isError && (
        <div className="mt-3">
          <ErrorState
            message={
              query.error instanceof Error
                ? query.error.message
                : "The daily activity could not be loaded."
            }
            onRetry={() => void query.refetch()}
          />
        </div>
      )}

      {rows !== undefined && isEmpty && (
        <p className="mt-3 text-sm text-muted-foreground">
          No charges or payments in the last {days} days yet.
        </p>
      )}

      {rows !== undefined && !isEmpty && (
        <>
          {/* The text summary the accessibility scenario asks for, with
              decorative swatches before "charged" and "paid". */}
          <p className="mt-3 text-sm text-muted-foreground">
            Last {days} days:{" "}
            <i aria-hidden className="mr-1.5 inline-block size-2.5 bg-receivable align-middle" />
            charged {formatMoney(totalCharged)},{" "}
            <i aria-hidden className="mr-1.5 inline-block size-2.5 bg-credit align-middle" />
            paid {formatMoney(totalPaid)}.
          </p>
          <div className="mt-2 min-w-0">
            <ResponsiveContainer
              width="100%"
              height={240}
              initialDimension={{ width: 720, height: 240 }}
            >
              <BarChart
                data={rows}
                margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                barCategoryGap={days > 30 ? 1 : days > 7 ? "10%" : "20%"}
                barGap={days > 30 ? 0 : 2}
                maxBarSize={days === 7 ? 24 : days === 30 ? 8 : 4}
              >
                <CartesianGrid
                  vertical={false}
                  stroke="var(--border)"
                  strokeDasharray="2 5"
                />
                <XAxis
                  dataKey="activity_date"
                  tickFormatter={(day: string) => formatDayMonth(toLocalDate(day))}
                  tickLine={false}
                  axisLine={{ stroke: "var(--foreground)", strokeWidth: 1.5 }}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  interval="preserveStartEnd"
                  minTickGap={days > 30 ? 28 : days > 7 ? 18 : 8}
                />
                <YAxis
                  width={56}
                  tickFormatter={(value: number) =>
                    value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
                  }
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                />
                <Tooltip
                  content={<TrendTooltip />}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="charges"
                  name="Charges"
                  fill="var(--receivable)"
                  radius={0}
                  // The bars render their final geometry immediately: no
                  // entrance animation on a ledger figure (and the fills
                  // are assertable without waiting on rAF timing).
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="payments"
                  name="Payments"
                  fill="var(--credit)"
                  radius={0}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* The same numbers, every day, for screen readers. */}
          <table className="sr-only">
            <caption>Daily charges and payments, last {days} days</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Charges</th>
                <th scope="col">Payments</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.activity_date}>
                  <th scope="row">{row.activity_date}</th>
                  <td>{formatMoney(row.charges)}</td>
                  <td>{formatMoney(row.payments)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
